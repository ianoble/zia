import { describe, expect, it } from 'vitest';
import { Client } from 'boardgame.io/client';
import type { Ctx } from 'boardgame.io';
import { gameDef } from './index';
import type { ZiaState } from './types';
import { boardHexes, gateDestinations, spawnPoints, startingBoard } from './board';

/** Two captains past setup on the given starting tiles; a test-only move puts the ship anywhere. */
function gateGame(tiles: [string, string]) {
	const game = {
		...gameDef.game,
		seed: 'gates',
		setup: (c: { ctx: Ctx }, data?: unknown) => {
			const G = (gameDef.game.setup as (c: unknown, d?: unknown) => ZiaState)(c, data);
			G.board = startingBoard(c.ctx.playOrder, tiles);
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
	act('finishOutfitting');
	const seat = state().ctx.currentPlayer;
	const gates = (tileId: string) =>
		[...boardHexes(G().board).values()].filter((h) => h.kinds.includes('gate') && G().board.sectors[h.sectorIndex].tileId === tileId).map((h) => h.key);
	return { G, act, me: () => G().players[seat], gates };
}

describe('Use Gate', () => {
	it('from a gate, 1 movement jumps to any space on another gate; movement carries on; first use earns 1 fame', () => {
		const c = gateGame(['expedior-gate', 'deltus-gate']);
		const [from] = c.gates('expedior-gate');
		const to = c.gates('deltus-gate')[1];
		expect(gateDestinations(c.G().board, from).sort()).toEqual(c.gates('deltus-gate').sort());
		c.act('teleport', from);
		expect(c.act('useGate', to)).toBe(false); // needs 1 movement
		c.act('useImpulse');
		expect(c.act('useGate', c.gates('expedior-gate')[1])).toBe(false); // same gate
		const fame = c.me().fame;
		expect(c.act('useGate', to)).toBe(true);
		expect(c.me().position).toBe(to);
		expect(c.G().turn.movement).toBe(2);
		expect(c.me().fame).toBe(fame + 1);
		// Back again: no more fame.
		expect(c.act('useGate', from)).toBe(true);
		expect(c.me().fame).toBe(fame + 1);
	});

	it('only from a gate space', () => {
		const c = gateGame(['expedior-gate', 'deltus-gate']);
		c.act('useImpulse');
		const open = [...boardHexes(c.G().board).values()].find((h) => !h.kinds.length)!.key;
		c.act('teleport', open);
		expect(c.act('useGate', c.gates('deltus-gate')[0])).toBe(false);
	});

	it('the Tigris gate sends the ship to a spawn point and is never a destination; first use earns 1 fame', () => {
		const c = gateGame(['tigris-gate', 'expedior-gate']);
		expect(gateDestinations(c.G().board, c.gates('expedior-gate')[0])).toEqual([]);
		c.act('teleport', c.gates('tigris-gate')[0]);
		c.act('useImpulse');
		const fame = c.me().fame;
		expect(c.act('useGate')).toBe(true);
		expect(spawnPoints(c.G().board).map((s) => s.key)).toContain(c.me().position);
		expect(c.G().turn.movement).toBe(2);
		expect(c.me().fame).toBeGreaterThanOrEqual(fame + 1); // +1 for Tigris (and maybe Luck on a 20)
	});
});
