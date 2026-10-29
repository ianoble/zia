import { describe, expect, it } from 'vitest';
import { Client } from 'boardgame.io/client';
import type { Ctx } from 'boardgame.io';
import { checkMove, gameDef } from './index';
import type { ZiaState } from './types';
import { boardHexes, dealStartingTiles, edgeSymbolFacing, reachableHexes, respawnHex, spawnPoints, startingBoard, startingDeck, unexploredEdges } from './board';
import { SHIPS_BY_ID } from '../data/ships';
import { SECTORS_BY_ID } from '../data/sectors';
import { hexesInRange } from './hex';

/** A 2-captain game past setup, with an optional fixed sector deck. Easy Tiger (impulse 3) moves first. */
function playClient(deck?: string[]) {
	const game = {
		...gameDef.game,
		seed: 'zia-explore',
		setup: (c: { ctx: Ctx }, data?: unknown) => {
			const G = (gameDef.game.setup as (c: unknown, d?: unknown) => ZiaState)(c, data);
			if (deck) G.sectorDeck = deck;
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
	expect(G().players[seat].ship!.shipId).toBe('easy-tiger');
	return { state, G, act, seat };
}

/** Flip impulse and fly to the nearest space next to an unexplored edge. */
function flyToRim(c: ReturnType<typeof playClient>) {
	expect(c.act('useImpulse')).toBe(true);
	const me = c.G().players[c.seat];
	const reach = [...reachableHexes(c.G().board, me.position!, c.G().turn.movement, new Set())]
		.filter(([key]) => unexploredEdges(c.G().board, key).length)
		.sort((a, b) => a[1] - b[1]);
	const [target] = reach[0];
	expect(c.act('moveShip', target)).toBe(true);
	return target;
}

describe('sector deck', () => {
	it('deals random starting sectors, all with a spawn point', () => {
		const rolls = [3, 1, 5];
		const tiles = dealStartingTiles(3, () => rolls.shift()!);
		expect(new Set(tiles).size).toBe(3);
		for (const id of tiles) expect(SECTORS_BY_ID[id].spawnPoint).toBeDefined();
	});

	it('holds every tile not on the board', () => {
		const board = startingBoard(['0', '1', '2']);
		const deck = startingDeck(board);
		expect(deck).toHaveLength(32 - 1 - 3); // all tiles minus Nyr and 3 starting sectors
		expect(deck).not.toContain('nyr');
		expect(deck).not.toContain('neo-damascus');
		expect(deck).toContain('doravin-v');
		expect(deck).toContain('xia');
	});

	it('starts each game with the unused tiles', () => {
		const { G } = playClient();
		expect(G().sectorDeck).toHaveLength(32 - 1 - 2);
	});
});

describe('Scan Sector', () => {
	it('needs an unexplored edge next to the ship', () => {
		const c = playClient();
		const spawn = c.G().players[c.seat].position!;
		expect(unexploredEdges(c.G().board, spawn)).toHaveLength(0);
		expect(c.act('scanSector', 0)).toBe(false);
	});

	it('costs 1 energy, ends movement and places a matching tile', () => {
		const c = playClient();
		const rim = flyToRim(c);
		const edge = unexploredEdges(c.G().board, rim)[0];
		const wrongSide = [0, 1, 2, 3, 4, 5].find((s) => !unexploredEdges(c.G().board, rim).some((e) => e.slot === s))!;
		expect(c.act('scanSector', wrongSide)).toBe(false);

		const energy = c.G().players[c.seat].ship!.energy;
		const sectors = c.G().board.sectors.length;
		expect(c.act('scanSector', edge.slot)).toBe(true);

		expect(c.G().players[c.seat].ship!.energy).toBe(energy - 1);
		expect(c.G().turn.movement).toBe(0);
		expect(c.G().sectorDeck).toHaveLength(32 - 1 - 2 - 1);
		expect(c.G().board.sectors).toHaveLength(sectors + 1);
		expect(c.G().players[c.seat].position).toBe(rim); // the ship stays put
		const from = c.G().board.sectors[edge.sectorIndex];
		const placed = c.G().board.sectors[sectors];
		expect(edgeSymbolFacing(placed.rotation, (edge.slot + 3) % 6)).toBe(edgeSymbolFacing(from.rotation, edge.slot));
		expect(boardHexes(c.G().board).has(edge.target)).toBe(true);
	});

	it('needs a tile left in the deck', () => {
		const c = playClient([]);
		const rim = flyToRim(c);
		expect(c.act('scanSector', unexploredEdges(c.G().board, rim)[0].slot)).toBe(false);
	});
});

describe('Blind Jump', () => {
	it('costs 1 movement, places the tile and moves the ship in, keeping the rest of its movement', () => {
		const c = playClient(['vortex-86']);
		const rim = flyToRim(c);
		const movement = c.G().turn.movement;
		expect(movement).toBeGreaterThanOrEqual(1);
		const { target } = unexploredEdges(c.G().board, rim)[0];

		expect(c.act('blindJump', '99,99')).toBe(false); // not next to the ship
		expect(c.act('blindJump', target)).toBe(true);
		expect(c.G().players[c.seat].position).toBe(target);
		expect(c.G().turn.movement).toBe(movement - 1);
		expect(c.G().sectorDeck).toEqual([]);
		expect(c.G().board.sectors.at(-1)!.tileId).toBe('vortex-86');
		expect(c.state().ctx.currentPlayer).toBe(c.seat); // minor action: the turn goes on
	});

	it('needs 1 movement', () => {
		const c = playClient();
		const rim = flyToRim(c);
		const { target } = unexploredEdges(c.G().board, rim)[0];
		const G = { ...c.G(), turn: { movement: 0 } };
		expect(checkMove(G, c.seat, c.seat, 'blindJump', [target])).toBe('A Blind Jump needs 1 movement');
		expect(checkMove(c.G(), c.seat, c.seat, 'blindJump', [target])).toBe(true);
	});

	it('into a star destroys the ship, ends the turn, and it respawns on its next turn', () => {
		// Placeholder layouts keep stars in the middle of a tile, out of a jump's reach, so use an all-star test tile.
		SECTORS_BY_ID['test-star'] = { ...SECTORS_BY_ID['xia'], id: 'test-star', spaces: hexesInRange({ q: 0, r: 0 }, 2).map((at) => ({ at, kind: 'star' as const })) };
		const c = playClient(['test-star']);
		const rim = flyToRim(c);
		const { target } = unexploredEdges(c.G().board, rim)[0];
		expect(c.act('blindJump', target)).toBe(true);

		expect(c.G().players[c.seat].position).toBeNull();
		expect(c.state().ctx.currentPlayer).not.toBe(c.seat);
		expect(c.G().log.some((l) => l.seat === c.seat && l.text.includes('destroyed'))).toBe(true);

		// The other captain ends their turn; ours begins with a respawn.
		expect(c.act('endTurn', 0)).toBe(true);
		expect(c.state().ctx.currentPlayer).toBe(c.seat);
		const me = c.G().players[c.seat];
		expect(me.position).not.toBeNull();
		expect(spawnPoints(c.G().board).map((p) => p.key)).toContain(me.position);
		expect(me.ship!.energy).toBe(SHIPS_BY_ID['easy-tiger'].energy);
		expect(me.ship!.impulseReady).toBe(true);
		// Embers: respawn damage equal to the ship's tier, placed by the captain.
		expect(me.pendingDamage).toEqual(Array(SHIPS_BY_ID['easy-tiger'].tier).fill('damage'));
	});
});

describe('respawn point', () => {
	const board = startingBoard(['0', '1', '2', '3', '4']);
	const at = (n: number) => spawnPoints(board).find((p) => p.number === n)!.key;

	it('takes the closest number to the roll, ties going higher', () => {
		expect(respawnHex(board, 2, new Set())).toBe(at(2));
		expect(respawnHex(board, 17, new Set())).toBe(at(5));
		expect(respawnHex(board, 3, new Set([at(3)]))).toBe(at(4));
	});

	it('skips occupied spawn points', () => {
		const all = new Set(spawnPoints(board).map((p) => p.key));
		expect(respawnHex(board, 1, all)).toBeNull();
	});
});
