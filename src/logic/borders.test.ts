import { describe, expect, it } from 'vitest';
import { Client } from 'boardgame.io/client';
import type { Ctx } from 'boardgame.io';
import { gameDef } from './index';
import type { ZiaState } from './types';
import { boardHexes, entrancePath, leavesThroughShield, movePath, planetEntranceOf, startingBoard, startingSpawnFor, stepCrossing, type BoardState } from './board';
import { hexKey, hexNeighbors, parseHexKey } from './hex';
import { autoPlace } from './holdGeometry';
import { SHIPS_BY_ID } from '../data/ships';

/** One upright tile at the origin, so local hex = board hex. */
const tile = (tileId: string): BoardState => ({ sectors: [{ tileId, center: { q: 0, r: 0 }, rotation: 0 }] });
const cross = (tileId: string, from: string, to: string, outlaw = false) => stepCrossing(tile(tileId), from, to, outlaw);

describe('which borders a step crosses', () => {
	it('asteroids: entering each asteroid space, not leaving', () => {
		expect(cross('tk-421', '0,0', '0,-1').borders).toEqual(['asteroid']);
		expect(cross('tk-421', '0,-1', '1,-2').borders).toEqual(['asteroid']); // asteroid to asteroid
		expect(cross('tk-421', '0,-1', '0,0').borders).toEqual([]);
	});

	it('debris: entering each debris space', () => {
		expect(cross('pelmont', '0,0', '0,-1').borders).toEqual(['debris']);
		expect(cross('pelmont', '0,-1', '0,0').borders).toEqual([]);
	});

	it('nebula: only crossing in from outside', () => {
		expect(cross('vortex-86', '0,-2', '0,-1').borders).toEqual(['nebula']);
		expect(cross('vortex-86', '0,-1', '0,0').borders).toEqual([]);
		expect(cross('vortex-86', '0,0', '0,1').borders).toEqual([]);
		expect(cross('vortex-86', '0,-1', '0,-2').borders).toEqual([]);
	});

	it('planetary shields: entering or leaving, except through the entrance', () => {
		// Neo Damascus: entrance on the upper-left side of (-1,0), facing (-2,0).
		expect(cross('neo-damascus', '-2,0', '-1,0').borders).toEqual([]);
		expect(cross('neo-damascus', '-1,0', '-2,0').borders).toEqual([]);
		expect(cross('neo-damascus', '-2,1', '-1,0').borders).toEqual(['shield']);
		expect(cross('neo-damascus', '0,-1', '0,-2').borders).toEqual(['shield']);
		expect(cross('neo-damascus', '0,0', '0,-1').borders).toEqual([]); // inside the planet
	});

	it("outlaws can't use a Lawful planet's entrance to get in, but may leave by it", () => {
		// Kemplar II (Lawful): entrance on the upper-left side of (-1,0).
		expect(cross('kemplar-ii', '-2,0', '-1,0', true).borders).toEqual(['shield']);
		expect(cross('kemplar-ii', '-2,0', '-1,0', false).borders).toEqual([]);
		expect(cross('kemplar-ii', '-1,0', '-2,0', true).borders).toEqual([]);
	});

	it("innocent ships using an Outlaw planet's entrance get a bounty", () => {
		// Loath (Outlaw): entrance on the upper-left side of (-1,0).
		expect(cross('loath', '-2,0', '-1,0', false)).toEqual({ borders: [], entranceBounty: true });
		expect(cross('loath', '-2,0', '-1,0', true)).toEqual({ borders: [], entranceBounty: false });
	});
});

describe('routes avoid borders when they can', () => {
	it('takes the equally short way round an asteroid', () => {
		// (-1,0) to (1,-1) on TK-421: via (0,0) (open) or via (0,-1) (asteroid).
		expect(movePath(tile('tk-421'), '-1,0', '1,-1', 5)).toEqual(['0,0', '1,-1']);
	});
});

describe('leaving a planet by its entrance', () => {
	// Neo Damascus: planet (-1,0), (0,0), (0,-1); entrance on (-1,0) facing (-2,0).
	const b = tile('neo-damascus');
	it('finds the entrance from any planet space', () => {
		expect(planetEntranceOf(b, '0,-1')).toEqual({ inside: '-1,0', outside: '-2,0' });
		expect(planetEntranceOf(b, '-2,0')).toBeNull();
	});

	it('knows when the usual route crosses the shield', () => {
		expect(leavesThroughShield(b, '0,-1', '0,-2', 5, new Set(), false)).toBe(true);
		expect(leavesThroughShield(b, '-1,0', '-2,0', 5, new Set(), false)).toBe(false);
		expect(leavesThroughShield(b, '-2,0', '-3,0', 5, new Set(), false)).toBe(false); // not on a planet
	});

	it('routes out through the entrance, with no shield crossed', () => {
		const path = entrancePath(b, '0,-1', '0,-2', 5)!;
		expect(path.slice(0, 2)).toEqual(['-1,0', '-2,0']);
		expect(path.at(-1)).toBe('0,-2');
		let at = '0,-1';
		for (const h of path) {
			expect(stepCrossing(b, at, h, false).borders).not.toContain('shield');
			at = h;
		}
		expect(entrancePath(b, '0,-1', '0,-2', path.length - 1)).toBeNull(); // out of reach that way
	});
});

/**
 * A 2-captain game past setup on asteroid starting tiles (TK-421, Red Gulch), with an
 * asteroid next to every spawn point. Easy Tiger (impulse 3) moves first; `shield` gives
 * it a d6 shield.
 */
function asteroidGame(seed: string, shield: boolean) {
	const game = {
		...gameDef.game,
		seed,
		setup: (c: { ctx: Ctx }, data?: unknown) => {
			const G = (gameDef.game.setup as (c: unknown, d?: unknown) => ZiaState)(c, data);
			G.board = startingBoard(c.ctx.playOrder, ['tk-421', 'red-gulch']);
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
	if (shield) {
		act('finishOutfitting'); // swamp rat
		const spot = autoPlace(SHIPS_BY_ID['easy-tiger'], [], 'shield-d6', 'x')!;
		act('buyOutfit', 'shield-d6', spot.x, spot.y, spot.rotation, spot.flipped);
		act('finishOutfitting');
	} else {
		act('finishOutfitting');
		act('finishOutfitting');
	}
	const seat = state().ctx.currentPlayer;
	const spawn = G().players[seat].position!;
	const hexes = boardHexes(G().board);
	const asteroid = hexNeighbors(parseHexKey(spawn))
		.map(hexKey)
		.find((k) => hexes.get(k)?.kinds.includes('asteroid'))!;
	return { G, act, seat, spawn, asteroid };
}

describe('crossing a border during a move', () => {
	it('stops at the border; the captain can stop short and keep the movement', () => {
		const c = asteroidGame('borders-stop', false);
		expect(c.G().players[c.seat].ship!.shipId).toBe('easy-tiger');
		expect(startingSpawnFor(c.G().board, c.seat)).toBe(c.spawn);
		c.act('useImpulse');
		expect(c.act('moveShip', c.asteroid)).toBe(true);
		expect(c.G().turn.crossing).toMatchObject({ to: c.asteroid, borders: ['asteroid'], stage: 'confirm' });
		expect(c.G().players[c.seat].position).toBe(c.spawn);
		expect(c.act('endTurn', 0)).toBe(false); // finish the crossing first
		expect(c.act('stopMove')).toBe(true);
		expect(c.G().turn.crossing).toBeNull();
		expect(c.G().turn.movement).toBe(3);
	});

	it('rolling: 11-20 flies in safely, 1-10 is damage to place', () => {
		const outcomes = new Set<string>();
		for (let i = 0; i < 30 && outcomes.size < 2; i++) {
			const c = asteroidGame(`borders-roll-${i}`, false);
			c.act('useImpulse');
			c.act('moveShip', c.asteroid);
			expect(c.act('crossBorder')).toBe(true);
			const me = c.G().players[c.seat];
			expect(c.G().turn.crossing).toBeNull();
			expect(me.position).toBe(c.asteroid);
			expect(c.G().turn.movement).toBe(2);
			const dmg = me.pendingDamage.length;
			expect(dmg).toBeLessThanOrEqual(10);
			outcomes.add(dmg ? 'hit' : 'safe');
		}
		expect([...outcomes].sort()).toEqual(['hit', 'safe']);
	});

	it('after a hit the captain may fire a shield, then takes what is left', () => {
		let seen = false;
		for (let i = 0; i < 40 && !seen; i++) {
			const c = asteroidGame(`borders-shield-${i}`, true);
			c.act('useImpulse');
			c.act('moveShip', c.asteroid);
			c.act('crossBorder');
			const cross = c.G().turn.crossing;
			if (!cross) continue; // safe roll
			seen = true;
			expect(cross.stage).toBe('shield');
			expect(cross.amount).toBe(cross.roll);
			const ship = c.G().players[c.seat].ship!;
			const uid = ship.outfits[0].uid;
			const armed = ship.armedMarkers;
			expect(c.act('useShield', uid)).toBe(true);
			const after = c.G().players[c.seat];
			expect(after.ship!.armedMarkers).toBe(armed - 1);
			// Either the shield blocked it all and the ship flew in, or the captain still has to choose.
			if (c.G().turn.crossing) {
				const left = c.G().turn.crossing!.amount!;
				expect(left).toBeLessThan(cross.amount!);
				expect(c.act('acceptBorderEffect')).toBe(true);
				expect(c.G().players[c.seat].pendingDamage).toHaveLength(left);
			}
			expect(c.G().players[c.seat].position).toBe(c.asteroid);
		}
		expect(seen).toBe(true);
	});
});
