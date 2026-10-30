import { describe, expect, it } from 'vitest';
import { Client } from 'boardgame.io/client';
import { gameDef, createInitialState, PLAYER_COLORS, STARTING_CREDITS, freeEngineUseSpaces, movePath, reachableHexes, routeBorders } from './index';
import type { ZiaState } from './types';
import { autoPlace } from './holdGeometry';
import { SHIPS_BY_ID } from '../data/ships';

function newClient(numPlayers = 2) {
	const client = Client({ game: { ...gameDef.game, seed: 'zia-test' }, numPlayers });
	client.start();
	const state = () => client.getState()!;
	const G = () => state().G as ZiaState;
	const act = (name: string, ...args: unknown[]) => {
		client.updatePlayerID(state().ctx.currentPlayer);
		const before = state()._stateID;
		(client.moves[name] as (...a: unknown[]) => void)(...args);
		return state()._stateID !== before;
	};
	return { client, state, G, act };
}

describe('setup state', () => {
	it('gives each captain credits, a colour and a distinct initiative roll', () => {
		const G = createInitialState({ numPlayers: 3, playOrder: ['0', '1', '2'] });
		expect(Object.keys(G.players)).toEqual(['0', '1', '2']);
		expect(G.players['2'].color).toBe(PLAYER_COLORS[2]);
		expect(G.players['0'].credits).toBe(STARTING_CREDITS);
		const rolls = Object.values(G.players).map((p) => p.initiativeRoll);
		expect(new Set(rolls).size).toBe(3);
		expect(G.board.sectors).toHaveLength(4); // Nyr + one per captain
		expect(G.board.sectors[0].tileId).toBe('nyr');
	});

	it('orders picks highest first, counter-clockwise; last picker plays first, clockwise', () => {
		const G = createInitialState({ numPlayers: 4, playOrder: ['0', '1', '2', '3'] });
		const rolls = G.pickOrder.map((s) => G.players[s].initiativeRoll);
		expect(rolls[0]).toBe(Math.max(...rolls));
		const hi = Number(G.pickOrder[0]);
		expect(G.pickOrder).toEqual([0, 1, 2, 3].map((i) => String((hi - i + 4) % 4)));
		expect(G.turnOrder[0]).toBe(G.pickOrder[3]);
		const lp = Number(G.turnOrder[0]);
		expect(G.turnOrder).toEqual([0, 1, 2, 3].map((i) => String((lp + i) % 4)));
	});

	it('is registered as zia for 2-5 players', () => {
		expect(gameDef.id).toBe('zia');
		expect(gameDef.minPlayers).toBe(2);
		expect(gameDef.maxPlayers).toBe(5);
	});
});

describe('setup walkthrough and a first turn', () => {
	it('pick ships, outfit, then move', () => {
		const { G, state, act } = newClient(2);
		const [first, second] = G().pickOrder;
		expect(state().ctx.currentPlayer).toBe(first);

		// Ship pick
		expect(act('pickShip', 'bitter-karma', 0)).toBe(false); // tier II not allowed
		expect(act('pickShip', 'easy-tiger', 1)).toBe(true);
		expect(state().ctx.currentPlayer).toBe(second);
		expect(act('pickShip', 'easy-tiger', 0)).toBe(false); // taken
		expect(act('pickShip', 'swamp-rat', 0)).toBe(true);
		expect(G().stage).toBe('outfit');
		expect(G().players[first].position).not.toBeNull();
		expect(G().players[first].position).not.toBe(G().players[second].position);

		// Outfitting, in pick order
		expect(state().ctx.currentPlayer).toBe(first);
		const tiger = SHIPS_BY_ID['easy-tiger'];
		const spot = autoPlace(tiger, [], 'engine-d6', 'x')!;
		expect(act('buyOutfit', 'engine-d6', spot.x, spot.y, spot.rotation, spot.flipped)).toBe(true);
		expect(G().players[first].credits).toBe(STARTING_CREDITS - 1000);
		expect(G().supply['engine-d6']).toBe(6);
		expect(act('buyOutfit', 'shield-d6', spot.x, spot.y, 0, false)).toBe(false); // overlaps
		expect(act('finishOutfitting')).toBe(true);
		expect(act('finishOutfitting')).toBe(true);
		expect(G().stage).toBe('play');

		// Play: last picker starts
		expect(state().ctx.currentPlayer).toBe(second);
		expect(act('moveShip', '0,0')).toBe(false); // no movement yet
		expect(act('useImpulse')).toBe(true);
		expect(G().turn.movement).toBe(3);
		expect(act('useImpulse')).toBe(false); // once per turn
		const from = G().players[second].position!;
		const [q, r] = from.split(',').map(Number);
		// A space 2 away whose route has no exploration token or border (those stop for a choice).
		const tokens = new Set(G().explorationSpaces);
		const target = [...reachableHexes(G().board, from, 2, new Set())]
			.filter(([, cost]) => cost === 2)
			.map(([k]) => k)
			.find((k) => !movePath(G().board, from, k, 2, tokens)!.some((h) => tokens.has(h)) && routeBorders(G().board, from, k, 2, tokens, false) === 0)!;
		expect(act('moveShip', target)).toBe(true);
		expect(G().players[second].position).toBe(target);
		expect(G().turn.movement).toBe(1);
		expect(act('moveShip', `${q + 10},${r}`)).toBe(false); // off the board / too far
		expect(act('endTurn', 0)).toBe(true);

		// First picker: fire the engine
		expect(state().ctx.currentPlayer).toBe(first);
		expect(G().turn.movement).toBe(0);
		const ship = G().players[first].ship!;
		const uid = ship.outfits[0].uid;
		expect(freeEngineUseSpaces(ship, uid)).toHaveLength(3);
		expect(act('fireEngine', uid)).toBe(true);
		expect(G().turn.movement).toBeGreaterThanOrEqual(1);
		expect(G().turn.movement).toBeLessThanOrEqual(6);
		expect(G().players[first].ship!.armedMarkers).toBe(3);
		expect(act('endTurn', 2)).toBe(false); // only 1 marker to arm
		expect(act('endTurn', 1)).toBe(true);
		const after = G().players[first].ship!;
		expect(after.armedMarkers).toBe(4);
		expect(after.energy).toBe(tiger.energy - 1);
		expect(after.outfits[0].usedSpaces).toEqual([]);
		expect(G().players[second].ship!.impulseReady).toBe(true);
	});

	it('returning an outfit during setup refunds it', () => {
		const { G, act } = newClient(2);
		act('pickShip', 'easy-tiger', 0);
		act('pickShip', 'swamp-rat', 0);
		const [first] = G().pickOrder;
		const spot = autoPlace(SHIPS_BY_ID['easy-tiger'], [], 'missile-d8', 'x')!;
		act('buyOutfit', 'missile-d8', spot.x, spot.y, spot.rotation, spot.flipped);
		const uid = G().players[first].ship!.outfits[0].uid;
		expect(act('returnOutfit', uid)).toBe(true);
		expect(G().players[first].credits).toBe(STARTING_CREDITS);
		expect(G().supply['missile-d8']).toBe(7);
	});
});
