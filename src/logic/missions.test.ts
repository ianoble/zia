import { describe, expect, it } from 'vitest';
import { Client } from 'boardgame.io/client';
import type { Ctx } from 'boardgame.io';
import { gameDef } from './index';
import type { ZiaState } from './types';
import { boardHexes, movePath, reachableHexes, startingBoard } from './board';
import { createShipState, missionLimit } from './ship';
import { addHex, hexDistance, hexKey, parseHexKey, rotateHex } from './hex';

/**
 * Two captains past setup, both starting on Expedior Gate (no borders; its mission point
 * is 3 spaces from the spawn point). Easy Tiger (impulse 3) moves first.
 */
function gateGame(tile = 'expedior-gate') {
	const game = {
		...gameDef.game,
		seed: 'missions',
		setup: (c: { ctx: Ctx }, data?: unknown) => {
			const G = (gameDef.game.setup as (c: unknown, d?: unknown) => ZiaState)(c, data);
			G.board = startingBoard(c.ctx.playOrder, [tile, tile]);
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
	return { G, act, seat, mission, spawn: G().players[seat].position!, sector };
}

describe('mission points', () => {
	it('reaching one queues 3 mission cards for the end of the turn, without ending the move', () => {
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

	it('flying over one without stopping counts too', () => {
		// Pelmont: spawn (-1,0), mission point (0,1); the only border-free route to (0,2) runs over it.
		const c = gateGame('pelmont');
		const s = c.G().board.sectors[c.sector];
		const at = (q: number, r: number) => hexKey(addHex(s.center, rotateHex({ q, r }, s.rotation)));
		expect(c.spawn).toBe(at(-1, 0));
		expect(c.mission).toBe(at(0, 1));
		c.act('useImpulse');
		expect(movePath(c.G().board, c.spawn, at(0, 2), 3)).toEqual([at(0, 0), at(0, 1), at(0, 2)]);
		expect(c.act('moveShip', at(0, 2))).toBe(true);
		expect(c.G().players[c.seat].position).toBe(at(0, 2));
		expect(c.G().turn.missionDraws).toEqual([c.mission]);
	});

	it('at the end of the turn: draw, keep 1 (up to the limit), discard the rest, then the turn passes', () => {
		const c = gateGame();
		c.act('useImpulse');
		c.act('moveShip', c.mission);
		const deck = c.G().missionDeck.length;
		expect(c.act('endTurn', 0)).toBe(true);
		const me = () => c.G().players[c.seat];
		expect(me().drawnMissions).toHaveLength(3);
		expect(c.G().missionDeck).toHaveLength(deck - 3);
		const [a, b] = me().drawnMissions;
		// Still this captain's turn, and nothing else until they choose.
		expect(c.act('endTurn', 0)).toBe(false);
		expect(c.act('chooseMissions', [])).toBe(false);
		expect(c.act('chooseMissions', ['not-a-card'])).toBe(false);
		expect(c.act('chooseMissions', [a, b])).toBe(false); // limit 1
		const seatBefore = c.seat;
		expect(c.act('chooseMissions', [a])).toBe(true);
		const after = c.G().players[seatBefore];
		expect(after.activeMissions).toEqual([a]);
		expect(after.drawnMissions).toEqual([]);
		expect(c.G().missionDiscard).toHaveLength(2);
		expect(c.G().turn.missionDraws).toEqual([]);
	});

	it('with a full mission slot, mission points give no draw; an active mission can be discarded', () => {
		const c = gateGame();
		c.act('useImpulse');
		c.act('moveShip', c.mission);
		c.act('endTurn', 0);
		const kept = c.G().players[c.seat].drawnMissions[0];
		c.act('chooseMissions', [kept]);
		c.act('endTurn', 0); // the other captain
		// Back to our captain, on the mission point with 1 active mission (limit 1).
		c.act('useImpulse');
		const off = [...reachableHexes(c.G().board, c.mission, 1, new Set())].map(([k]) => k)[0];
		c.act('moveShip', off);
		c.act('moveShip', c.mission);
		expect(c.G().turn.missionDraws).toEqual([]);
		expect(c.act('discardMission', 'nope')).toBe(false);
		expect(c.act('discardMission', kept)).toBe(true);
		expect(c.G().players[c.seat].activeMissions).toEqual([]);
		expect(c.G().missionDiscard).toContain(kept);
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
