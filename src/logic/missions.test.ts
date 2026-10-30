import { describe, expect, it } from 'vitest';
import { Client } from 'boardgame.io/client';
import type { Ctx } from 'boardgame.io';
import { gameDef } from './index';
import type { ZiaState } from './types';
import { boardHexes, reachableHexes, startingBoard } from './board';
import { createShipState, missionLimit } from './ship';
import { hexDistance, parseHexKey } from './hex';

/**
 * Two captains past setup, both starting on Expedior Gate (no borders; its mission point
 * is 3 spaces from the spawn point). Easy Tiger (impulse 3) moves first.
 */
function gateGame() {
	const game = {
		...gameDef.game,
		seed: 'missions',
		setup: (c: { ctx: Ctx }, data?: unknown) => {
			const G = (gameDef.game.setup as (c: unknown, d?: unknown) => ZiaState)(c, data);
			G.board = startingBoard(c.ctx.playOrder, ['expedior-gate', 'expedior-gate']);
			G.explorationSpaces = [];
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
	const sector = G().board.sectors.findIndex((s) => s.ownerSeat === seat);
	const mission = [...boardHexes(G().board).values()].find((h) => h.sectorIndex === sector && h.kinds.includes('mission'))!.key;
	return { G, act, seat, mission, spawn: G().players[seat].position! };
}

describe('mission points', () => {
	it('stopping on one queues 3 mission cards for the end of the turn, without ending the move', () => {
		const c = gateGame();
		expect(hexDistance(parseHexKey(c.spawn), parseHexKey(c.mission))).toBe(3);
		c.act('useImpulse'); // +3
		expect(c.act('moveShip', c.mission)).toBe(true);
		expect(c.G().turn.missionDraws).toEqual([c.mission]);
		expect(c.G().log.at(-1)?.text).toContain('mission point');
		expect(c.act('endTurn', 0)).toBe(true);
		expect(c.G().log.some((l) => l.text.includes('drew 3 mission cards'))).toBe(true);
	});

	it('stopping short of it does not count; a later move that stops on it does', () => {
		const c = gateGame();
		c.act('useImpulse');
		// Stop 2 short of the mission point, then carry on onto it.
		const near = [...reachableHexes(c.G().board, c.spawn, 1, new Set())].map(([k]) => k).find((k) => hexDistance(parseHexKey(k), parseHexKey(c.mission)) === 2)!;
		c.act('moveShip', near);
		expect(c.G().turn.missionDraws).toEqual([]);
		c.act('moveShip', c.mission);
		expect(c.G().turn.missionDraws).toEqual([c.mission]);
		expect(c.G().turn.movement).toBe(0);
	});

	it('Active Mission Limit: 1, +2 per undamaged M-Comp', () => {
		const ship = createShipState('easy-tiger');
		expect(missionLimit(ship)).toBe(1);
		ship.outfits.push({ uid: 'm', outfitId: 'm-comp', x: 0, y: 0, rotation: 0, flipped: false, usedSpaces: [] });
		expect(missionLimit(ship)).toBe(3);
		ship.damage.push('0,0');
		expect(missionLimit(ship)).toBe(1);
	});
});
