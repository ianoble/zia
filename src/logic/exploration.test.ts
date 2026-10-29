import { describe, expect, it } from 'vitest';
import { Client } from 'boardgame.io/client';
import type { Ctx } from 'boardgame.io';
import { createInitialState, gameDef } from './index';
import type { ZiaState } from './types';
import { boardHexes, startingSpawnFor } from './board';
import { EMBERS_EXPLORATION_TOKENS, type ExplorationToken } from '../data/exploration';
import { SECTORS_BY_ID } from '../data/sectors';
import { SHIPS_BY_ID } from '../data/ships';

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

	it('ice damage goes in the hold', () => {
		const c = playClient(['ice-damage']);
		c.act('useImpulse');
		c.act('moveShip', up(c.spawn));
		expect(c.G().players[c.seat].ship!.iceDamage).toHaveLength(1);
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

	it('Captain in Need stays on the mat and does not count toward a pair', () => {
		const c = playClient(['captain-in-need', 'movement']);
		c.act('useImpulse');
		c.act('moveShip', up(c.spawn));
		c.act('moveShip', up(c.spawn, 2));
		expect(c.G().players[c.seat].explorationTokens).toHaveLength(2);
		expect(c.G().turn.explorationPairPending).toBeFalsy();
	});
});
