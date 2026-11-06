import { describe, expect, it } from 'vitest';
import { Client } from 'boardgame.io/client';
import type { Ctx } from 'boardgame.io';
import { gameDef } from './index';
import type { ZiaState } from './types';
import { boardHexes, startingBoard } from './board';
import { autoPlace } from './holdGeometry';
import { SHIPS_BY_ID } from '../data/ships';

/**
 * Two captains past setup on Burning Horse (Harvest holo) and Pelmont (Salvage cyber),
 * the active ship (Easy Tiger) put straight onto the space with a test-only move.
 * `shield` gives it a d6 shield.
 */
function extractGame(seed: string, kind: 'harvest' | 'salvage', shield = false) {
	const game = {
		...gameDef.game,
		seed,
		setup: (c: { ctx: Ctx }, data?: unknown) => {
			const G = (gameDef.game.setup as (c: unknown, d?: unknown) => ZiaState)(c, data);
			G.board = startingBoard(c.ctx.playOrder, ['burning-horse', 'pelmont']);
			G.explorationSpaces = [];
			return G;
		},
		moves: {
			...gameDef.game.moves,
			teleport: ({ G, playerID }: { G: ZiaState; playerID: string }, hex: string) => {
				G.players[playerID].position = hex;
			},
		},
	};
	const client = Client({ game, numPlayers: 2 });
	client.start();
	const state = () => client.getState()!;
	const G = () => state().G as ZiaState;
	const act = (name: string, ...args: unknown[]) => {
		client.updatePlayerID(state().ctx.currentPlayer);
		const before = state()._stateID;
		(client.moves[name] as (...a: unknown[]) => void)(...args);
		return state()._stateID !== before;
	};
	act('pickShip', 'swamp-rat', 0);
	act('pickShip', 'easy-tiger', 0);
	act('finishOutfitting');
	if (shield) {
		const spot = autoPlace(SHIPS_BY_ID['easy-tiger'], [], 'shield-d6', 'x')!;
		act('buyOutfit', 'shield-d6', spot.x, spot.y, spot.rotation, spot.flipped);
	}
	act('finishOutfitting');
	const seat = state().ctx.currentPlayer;
	const space = [...boardHexes(G().board).values()].find((h) => h.kinds.includes(kind))!.key;
	act('teleport', space);
	const me = () => G().players[seat];
	/** The d20 roll from the last "rolled N ..." log line. */
	const lastRoll = () => Number(/rolled (\d+) (harvesting|salvaging)/.exec(G().log.map((l) => l.text).reverse().find((t) => /rolled \d+ (harvesting|salvaging)/.test(t)) ?? '')?.[1]);
	return { G, act, seat, me, lastRoll, space };
}

/** Try seeds until `want(roll)` holds for the first roll, so each outcome gets tested. */
function findSeed(kind: 'harvest' | 'salvage', want: (roll: number) => boolean, shield = false) {
	for (let i = 0; i < 200; i++) {
		const c = extractGame(`extract-${kind}-${i}`, kind, shield);
		const energy = c.me().ship!.energy;
		c.act('useImpulse');
		expect(c.act('extract')).toBe(true);
		if (want(c.lastRoll())) return { ...c, energyBefore: energy };
	}
	throw new Error('no seed found');
}

describe('Harvest', () => {
	it('11-20: one cube of the space type to place, and movement ends', () => {
		const c = findSeed('harvest', (r) => r >= 11);
		expect(c.me().pendingCargo).toEqual(['holo']);
		expect(c.G().turn.movement).toBe(0);
		// Recorded for the dice dialog.
		expect(c.G().rolls!.at(-1)).toMatchObject({ seat: c.seat, sides: 20, label: 'Harvest holo', outcome: 'good', detail: 'You get a holo cube' });
		expect(c.me().position).toBe(c.space);
	});

	it('1-10 with no shield: lose that much energy, then armed markers', () => {
		const c = findSeed('harvest', (r) => r <= 10);
		const roll = c.lastRoll();
		expect(c.me().pendingCargo).toEqual([]);
		expect(c.G().turn.hazard ?? null).toBeNull();
		const ship = c.me().ship!;
		expect(ship.energy).toBe(Math.max(0, c.energyBefore - roll));
	});

	it('1-10 with a shield: waits for the captain, who can take it', () => {
		const c = findSeed('harvest', (r) => r <= 10, true);
		const roll = c.lastRoll();
		expect(c.G().turn.hazard).toMatchObject({ kind: 'harvest', amount: roll });
		expect(c.act('extract')).toBe(false); // blocked until it's resolved
		expect(c.act('acceptBorderEffect')).toBe(true);
		expect(c.G().turn.hazard).toBeNull();
		expect(c.me().ship!.energy).toBe(Math.max(0, c.energyBefore - roll));
	});

	it('1-10 with a shield: firing it cuts the loss down', () => {
		const c = findSeed('harvest', (r) => r <= 10, true);
		const uid = c.me().ship!.outfits.find((o) => o.outfitId === 'shield-d6')!.uid;
		expect(c.act('useShield', uid)).toBe(true);
		expect(c.G().turn.hazard ?? null).toBeNull(); // only one shield use space to fire
		expect(c.me().ship!.energy).toBeGreaterThanOrEqual(Math.max(0, c.energyBefore - c.lastRoll()));
	});

	it('needs a free hold space, and a Harvest space', () => {
		const c = extractGame('extract-elsewhere', 'harvest');
		c.act('teleport', [...boardHexes(c.G().board).values()].find((h) => h.kinds.includes('spawn'))!.key);
		expect(c.act('extract')).toBe(false);
	});
});

describe('Salvage', () => {
	it('4-20: one cube', () => {
		const c = findSeed('salvage', (r) => r >= 4);
		expect(c.me().pendingCargo).toEqual(['cyber']);
	});

	it('1-3: the ship is destroyed, shield or not', () => {
		const c = findSeed('salvage', (r) => r <= 3, true);
		expect(c.me().position).toBeNull();
		expect(c.G().turn.hazard ?? null).toBeNull();
	});
});
