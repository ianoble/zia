import { describe, expect, it } from 'vitest';
import { Client } from 'boardgame.io/client';
import type { Ctx } from 'boardgame.io';
import { createInitialState, gameDef } from './index';
import type { ZiaState } from './types';
import { boardHexes, movePath, startingBoard, startingSpawnFor } from './board';
import { EMBERS_EXPLORATION_TOKENS, type ExplorationToken } from '../data/exploration';
import { SECTORS_BY_ID } from '../data/sectors';
import { SHIPS_BY_ID } from '../data/ships';
import { applyDamage, createShipState, damageTargets } from './ship';
import { placedCells, cellKey } from './holdGeometry';

const up = (key: string, n = 1) => {
	const [q, r] = key.split(',').map(Number);
	return `${q},${r - n}`;
};

/**
 * A 2-captain game past setup. `pool` fixes the exploration tokens; face-down tokens are
 * put one and two spaces "up" from every captain's spawn point. Easy Tiger (impulse 3) moves first.
 */
function playClient(pool: ExplorationToken[]) {
	const game = {
		...gameDef.game,
		seed: 'zia-tokens',
		setup: (c: { ctx: Ctx }, data?: unknown) => {
			const G = (gameDef.game.setup as (c: unknown, d?: unknown) => ZiaState)(c, data);
			G.explorationPool = [...pool];
			G.explorationSpaces = c.ctx.playOrder.flatMap((seat) => {
				const spawn = startingSpawnFor(G.board, seat)!;
				return [up(spawn), up(spawn, 2)];
			}).slice(0, pool.length * 2);
			return G;
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
	act('finishOutfitting');
	const seat = state().ctx.currentPlayer;
	const spawn = G().players[seat].position!;
	return { G, act, seat, spawn };
}

describe('exploration token set', () => {
	it('is the 30 Embers tokens', () => {
		const count = (t: ExplorationToken) => EMBERS_EXPLORATION_TOKENS.filter((x) => x === t).length;
		expect(EMBERS_EXPLORATION_TOKENS).toHaveLength(30);
		for (const t of ['movement', 'captain-in-need', 'energy', 'ice-damage'] as const) expect(count(t)).toBe(5);
		for (const c of ['holo', 'spice', 'terra', 'plasma', 'cyber'] as const) expect(count(`cargo-${c}`)).toBe(2);
	});

	it('puts a face-down token on each exploration space of the starting tiles', () => {
		const G = createInitialState({ numPlayers: 3, playOrder: ['0', '1', '2'] });
		const expected = G.board.sectors.reduce((n, s) => n + SECTORS_BY_ID[s.tileId].explorationSpaces, 0);
		expect(G.explorationSpaces).toHaveLength(expected);
		const hexes = boardHexes(G.board);
		for (const k of G.explorationSpaces) expect(hexes.get(k)?.kind).toBe('exploration');
		expect(G.explorationPool).toHaveLength(30);
	});
});

describe('collecting exploration tokens', () => {
	it('+5 movement: flips on arrival and goes on the ship mat', () => {
		const c = playClient(['movement']);
		c.act('useImpulse');
		expect(c.act('moveShip', up(c.spawn))).toBe(true);
		expect(c.G().turn.movement).toBe(3 - 1 + 5);
		expect(c.G().players[c.seat].explorationTokens).toEqual(['movement']);
		expect(c.G().explorationSpaces).not.toContain(up(c.spawn));
		expect(c.G().explorationPool).toEqual([]);
	});

	it('ice damage waits for the captain to place it', () => {
		const c = playClient(['ice-damage']);
		c.act('useImpulse');
		c.act('moveShip', up(c.spawn));
		const me = () => c.G().players[c.seat];
		expect(me().pendingDamage).toEqual(['ice']);
		expect(me().ship!.iceDamage).toHaveLength(0);
		expect(c.act('endTurn', 0)).toBe(false); // must place it first
		const cell = damageTargets(me().ship!)[0];
		expect(c.act('placeDamage', cell)).toBe(true);
		expect(me().ship!.iceDamage).toEqual([cell]);
		expect(me().pendingDamage).toEqual([]);
		expect(c.act('placeDamage', cell)).toBe(false); // nothing left to place
	});

	it('two face-up tokens must be cashed in for fame or credits before anything else', () => {
		const c = playClient(['energy', 'cargo-holo']);
		const credits = c.G().players[c.seat].credits;
		c.act('useImpulse');
		c.act('moveShip', up(c.spawn));
		expect(c.G().turn.explorationPairPending).toBeFalsy();
		c.act('moveShip', up(c.spawn, 2));
		const me = c.G().players[c.seat];
		expect([...me.explorationTokens].sort()).toEqual(['cargo-holo', 'energy']);
		expect(me.ship!.cargo.map((x) => x.color)).toEqual(['holo']);
		expect(me.ship!.energy).toBe(SHIPS_BY_ID['easy-tiger'].energy);
		expect(c.G().turn.explorationPairPending).toBe(true);

		expect(c.act('endTurn', 0)).toBe(false); // must choose first
		expect(c.act('claimExplorationPair', 'gold')).toBe(false);
		expect(c.act('claimExplorationPair', 'credits')).toBe(true);
		expect(c.G().players[c.seat].credits).toBe(credits + 2000);
		expect(c.G().players[c.seat].explorationTokens).toEqual([]);
		expect(c.act('endTurn', 0)).toBe(true);
	});

	it('tokens on the way are collected without stopping, and the move carries on', () => {
		const c = playClient(['movement', 'cargo-holo']);
		c.act('useImpulse');
		expect(c.act('moveShip', up(c.spawn, 2))).toBe(true);
		const me = c.G().players[c.seat];
		expect(me.position).toBe(up(c.spawn, 2));
		expect(me.explorationTokens).toHaveLength(2);
		expect(c.G().explorationSpaces).not.toContain(up(c.spawn));
		expect(c.G().turn.movement).toBe(3 - 2 + 5);
		expect(c.G().turn.explorationPairPending).toBe(true);
	});

	it('Captain in Need stays on the mat and does not count toward a pair', () => {
		const c = playClient(['captain-in-need', 'movement']);
		c.act('useImpulse');
		c.act('moveShip', up(c.spawn));
		c.act('moveShip', up(c.spawn, 2));
		expect(c.G().players[c.seat].explorationTokens).toHaveLength(2);
		expect(c.G().turn.explorationPairPending).toBeFalsy();
	});
});

describe('move routes', () => {
	const board = startingBoard(['0', '1']);
	const spawn = startingSpawnFor(board, '0')!;
	const [q, r] = spawn.split(',').map(Number);

	it('takes a shortest path', () => {
		const path = movePath(board, spawn, `${q},${r - 2}`, 5)!;
		expect(path).toHaveLength(2);
		expect(path.at(-1)).toBe(`${q},${r - 2}`);
		expect(movePath(board, spawn, `${q + 9},${r}`, 3)).toBeNull();
	});

	it('goes through face-down tokens when an equally short path can', () => {
		// Two shortest paths to (q+1, r-2): via (q, r-1) or via (q+1, r-1).
		const to = `${q + 1},${r - 2}`;
		expect(movePath(board, spawn, to, 5, new Set([`${q},${r - 1}`]))).toEqual([`${q},${r - 1}`, to]);
		expect(movePath(board, spawn, to, 5, new Set([`${q + 1},${r - 1}`]))).toEqual([`${q + 1},${r - 1}`, to]);
	});
});

describe('placing damage', () => {
	it('can go on any undamaged hold space or outfit section', () => {
		const ship = createShipState('easy-tiger');
		const all = damageTargets(ship);
		expect(all).toHaveLength(SHIPS_BY_ID['easy-tiger'].holdSize);
		applyDamage(ship, 'damage', all[0]);
		expect(damageTargets(ship)).not.toContain(all[0]);
	});

	it('jettisons a cargo cube on that space', () => {
		const ship = createShipState('easy-tiger');
		const cell = damageTargets(ship)[0];
		ship.cargo.push({ cell, color: 'holo' });
		expect(applyDamage(ship, 'ice', cell)).toBe('holo');
		expect(ship.cargo).toEqual([]);
		expect(ship.iceDamage).toEqual([cell]);
	});

	it('moves a marker on a damaged use space to Disarmed', () => {
		const ship = createShipState('easy-tiger');
		ship.outfits.push({ uid: 'o1', outfitId: 'engine-d6', x: 0, y: 0, rotation: 0, flipped: false, usedSpaces: [0] });
		ship.armedMarkers--;
		const use = placedCells(ship.outfits[0]).find((c) => c.kind === 'U' && c.useIndex === 0)!;
		applyDamage(ship, 'damage', cellKey(use.x, use.y));
		expect(ship.outfits[0].usedSpaces).toEqual([]);
		expect(ship.disarmedMarkers).toBe(1);
	});
});
