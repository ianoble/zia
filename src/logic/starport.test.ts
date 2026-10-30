import { describe, expect, it } from 'vitest';
import { Client } from 'boardgame.io/client';
import type { Ctx } from 'boardgame.io';
import { gameDef } from './index';
import type { ZiaState } from './types';
import { boardHexes, startingBoard } from './board';
import { outfitSellPrice } from './game';
import { autoPlace, cellKey, placedCells } from './holdGeometry';
import { cargoTargets } from './ship';
import { SHIPS_BY_ID } from '../data/ships';

/**
 * Two captains past setup on Neo Damascus; Easy Tiger (moves first) bought a d6 engine.
 * Test-only moves put the ship anywhere and change its state.
 */
function portGame() {
	const game = {
		...gameDef.game,
		seed: 'starport',
		setup: (c: { ctx: Ctx }, data?: unknown) => {
			const G = (gameDef.game.setup as (c: unknown, d?: unknown) => ZiaState)(c, data);
			G.board = startingBoard(c.ctx.playOrder, ['neo-damascus', 'kemplar-ii']);
			G.explorationSpaces = [];
			return G;
		},
		moves: {
			...gameDef.game.moves,
			teleport: ({ G, playerID }: { G: ZiaState; playerID: string }, hex: string) => {
				G.players[playerID].position = hex;
			},
			hurt: ({ G, playerID }: { G: ZiaState; playerID: string }, damage: string[], ice: string[], energy: number) => {
				const ship = G.players[playerID].ship!;
				ship.damage.push(...damage);
				ship.iceDamage.push(...ice);
				ship.energy = energy;
			},
			give: ({ G, playerID }: { G: ZiaState; playerID: string }, credits: number, fame: number, cube?: string) => {
				const p = G.players[playerID];
				p.credits = credits;
				p.fame = fame;
				if (cube) p.ship!.cargo.push({ cell: cube, color: 'spice' });
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
	act('finishOutfitting'); // swamp rat
	const spot = autoPlace(SHIPS_BY_ID['easy-tiger'], [], 'engine-d6', 'x')!;
	act('buyOutfit', 'engine-d6', spot.x, spot.y, spot.rotation, spot.flipped);
	act('finishOutfitting');
	const seat = state().ctx.currentPlayer;
	const me = () => G().players[seat];
	const planet = [...boardHexes(G().board).values()].find((h) => h.kinds.includes('planet'))!.key;
	const open = [...boardHexes(G().board).values()].find((h) => !h.kinds.length)!.key;
	return { G, act, me, planet, open };
}

describe('docking', () => {
	it('only at a starport (inside a planetary shield), and it ends the Action Phase', () => {
		const c = portGame();
		c.act('teleport', c.open);
		expect(c.act('enterStarport')).toBe(false);
		c.act('teleport', c.planet);
		c.act('useImpulse');
		expect(c.act('enterStarport')).toBe(true);
		expect(c.G().turn.starport).toBe(true);
		expect(c.G().turn.movement).toBe(0);
		expect(c.act('useImpulse')).toBe(false);
		expect(c.act('fireEngine', c.me().ship!.outfits[0].uid)).toBe(false);
	});

	it('outfits can only be bought while docked', () => {
		const c = portGame();
		c.act('teleport', c.planet);
		const spot = autoPlace(SHIPS_BY_ID['easy-tiger'], c.me().ship!.outfits, 'shield-d6', 'y')!;
		expect(c.act('buyOutfit', 'shield-d6', spot.x, spot.y, spot.rotation, spot.flipped)).toBe(false);
		c.act('enterStarport');
		expect(c.act('buyOutfit', 'shield-d6', spot.x, spot.y, spot.rotation, spot.flipped)).toBe(true);
	});
});

describe('starport services', () => {
	function docked() {
		const c = portGame();
		c.act('teleport', c.planet);
		c.act('enterStarport');
		return c;
	}

	it('recharge energy (free), repair normal damage (1,000 at Tier I), thaw ice (free)', () => {
		const c = docked();
		c.act('hurt', ['0,0', '1,0'], ['2,0'], 2);
		const credits = c.me().credits;
		expect(c.act('rechargeEnergy')).toBe(true);
		expect(c.me().ship!.energy).toBe(SHIPS_BY_ID['easy-tiger'].energy);
		expect(c.act('rechargeEnergy')).toBe(false); // already full
		expect(c.act('repairDamage')).toBe(true);
		expect(c.me().credits).toBe(credits - 1000);
		expect(c.me().ship!.damage).toEqual([]);
		expect(c.me().ship!.iceDamage).toEqual(['2,0']);
		expect(c.act('thawIce')).toBe(true);
		expect(c.me().ship!.iceDamage).toEqual([]);
		expect(c.me().credits).toBe(credits - 1000);
	});

	it('5,000 credits for 1 fame, but never the winning point', () => {
		const c = docked();
		c.act('give', 12000, 3);
		expect(c.act('buyFame')).toBe(true);
		expect(c.me().fame).toBe(4);
		expect(c.me().credits).toBe(7000);
		c.act('give', 12000, c.G().fameTarget - 1);
		expect(c.act('buyFame')).toBe(false);
	});

	it('outfits sell for half, rounded up to the next 1,000; damaged ones can’t be sold or moved', () => {
		expect(outfitSellPrice('engine-d6')).toBe(1000); // tier I, 1,000
		expect(outfitSellPrice('engine-d8')).toBe(1000); // tier II, 2,000
		expect(outfitSellPrice('engine-d12')).toBe(2000); // tier III, 3,000
		const c = docked();
		const engine = c.me().ship!.outfits[0];
		const cell = placedCells(engine)[0];
		c.act('hurt', [cellKey(cell.x, cell.y)], [], 8);
		expect(c.act('returnOutfit', engine.uid)).toBe(false);
		c.act('repairDamage');
		const credits = c.me().credits;
		expect(c.act('returnOutfit', engine.uid)).toBe(true);
		expect(c.me().credits).toBe(credits + 1000);
	});

	it('outfits can’t be placed on cargo; cubes can be moved out of the way', () => {
		const c = docked();
		const free = cargoTargets(c.me().ship!);
		c.act('give', 5000, 0, free[0]);
		const spot = { x: Number(free[0].split(',')[0]), y: Number(free[0].split(',')[1]) };
		// A 1x1 mod on the cube's space is refused, then allowed once the cube moves.
		expect(c.act('buyOutfit', 'gts', spot.x, spot.y, 0, false)).toBe(false);
		expect(c.act('moveCargo', free[0], free[1])).toBe(true);
		expect(c.me().ship!.cargo[0].cell).toBe(free[1]);
		expect(c.act('buyOutfit', 'gts', spot.x, spot.y, 0, false)).toBe(true);
	});

	it('arming markers is free at a starport', () => {
		const c = portGame();
		c.act('teleport', c.planet);
		c.act('fireEngine', c.me().ship!.outfits[0].uid); // uses an armed marker
		c.act('enterStarport');
		c.act('hurt', [], [], 0); // no energy left
		const ship = () => c.me().ship!;
		expect(ship().armedMarkers).toBe(3);
		const seat = Object.values(c.G().players).find((p) => p.ship?.shipId === 'easy-tiger')!.id;
		expect(c.act('endTurn', 1)).toBe(true);
		expect(c.G().players[seat].ship!.armedMarkers).toBe(4);
		expect(c.G().players[seat].ship!.energy).toBe(0);
	});
});
