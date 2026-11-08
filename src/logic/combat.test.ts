import { describe, expect, it } from 'vitest';
import { Client } from 'boardgame.io/client';
import { gameDef } from './index';
import { actingSeat, attackTargets } from './game';
import { botDecision } from './bot';
import { autoPlace } from './holdGeometry';
import { maxDamage } from './ship';
import type { ZiaState } from './types';
import { SHIPS_BY_ID } from '../data/ships';

/**
 * A 2-captain game past setup, both ships moved onto one open tile (Lost Sector) at
 * `at`. The first captain to play is the attacker. Outfits are bought per captain.
 */
function combatGame(seed: string, opts: { attacker: string[]; defender: string[]; at?: [string, string] }) {
	const game = {
		...gameDef.game,
		seed,
		moves: {
			...gameDef.game.moves,
			// Test-only: change the state directly.
			tweak: ({ G }: { G: ZiaState }, fn: (G: ZiaState) => void) => fn(G),
		},
	};
	const client = Client({ game, numPlayers: 2 });
	client.start();
	const state = () => client.getState()!;
	const G = () => state().G as ZiaState;
	const act = (name: string, ...args: unknown[]) => {
		client.updatePlayerID(actingSeat(G(), state().ctx.currentPlayer));
		const before = state()._stateID;
		(client.moves[name] as (...a: unknown[]) => void)(...args);
		return state()._stateID !== before;
	};
	/** A move by a given seat, even if it isn't theirs to make. */
	const actAs = (seat: string, name: string, ...args: unknown[]) => {
		client.updatePlayerID(seat);
		const before = state()._stateID;
		(client.moves[name] as (...a: unknown[]) => void)(...args);
		return state()._stateID !== before;
	};
	const buy = (outfits: string[]) => {
		const seat = state().ctx.currentPlayer;
		for (const id of outfits) {
			const ship = G().players[seat].ship!;
			const spot = autoPlace(SHIPS_BY_ID[ship.shipId], ship.outfits, id, 'x')!;
			act('buyOutfit', id, spot.x, spot.y, spot.rotation, spot.flipped);
		}
		act('finishOutfitting');
	};
	act('pickShip', 'swamp-rat', 0);
	act('pickShip', 'easy-tiger', 0);
	// Outfitting goes in pick order; play starts with the last to pick.
	const [first, second] = G().pickOrder;
	const attacker = G().turnOrder[0];
	const defender = attacker === first ? second : first;
	buy(first === attacker ? opts.attacker : opts.defender);
	buy(second === attacker ? opts.attacker : opts.defender);
	expect(state().ctx.currentPlayer).toBe(attacker);
	const [a, d] = opts.at ?? ['0,0', '1,0'];
	act('tweak', (g: ZiaState) => {
		g.board = { sectors: [{ tileId: 'lost-sector', center: { q: 0, r: 0 }, rotation: 0 }] };
		g.explorationSpaces = [];
		g.players[attacker].position = a;
		g.players[defender].position = d;
	});
	const uid = (seat: string, outfitId: string) => G().players[seat].ship!.outfits.find((o) => o.outfitId === outfitId)!.uid;
	return { client, state, G, act, actAs, attacker, defender, uid };
}

describe('choosing a target', () => {
	it('blasters reach range 1, missiles 2-6', () => {
		const near = combatGame('targets-near', { attacker: ['blaster-d6', 'missile-d8'], defender: [] });
		expect(attackTargets(near.G(), near.attacker)).toEqual([
			{ seat: near.defender, range: 1, weapons: [{ uid: near.uid(near.attacker, 'blaster-d6'), free: 2 }] },
		]);
		const far = combatGame('targets-far', { attacker: ['blaster-d6', 'missile-d8'], defender: [], at: ['-2,0', '2,0'] });
		expect(attackTargets(far.G(), far.attacker)).toEqual([
			{ seat: far.defender, range: 4, weapons: [{ uid: far.uid(far.attacker, 'missile-d8'), free: 1 }] },
		]);
		// A blaster can't fire at range 4.
		expect(far.act('attack', far.defender, [{ uid: far.uid(far.attacker, 'blaster-d6'), count: 1 }])).toBe(false);
	});

	it('needs line of sight', () => {
		// TK-421: (0,-2) and (0,2) are 4 apart with an asteroid between them.
		const c = combatGame('targets-sight', { attacker: ['missile-d8'], defender: [], at: ['0,-2', '0,2'] });
		c.act('tweak', (g: ZiaState) => {
			g.board = { sectors: [{ tileId: 'tk-421', center: { q: 0, r: 0 }, rotation: 0 }] };
		});
		expect(attackTargets(c.G(), c.attacker)).toEqual([]);
		expect(c.act('attack', c.defender, [{ uid: c.uid(c.attacker, 'missile-d8'), count: 1 }])).toBe(false);
	});

	it("can't use more markers than the weapon has use spaces or the ship has armed", () => {
		const c = combatGame('targets-markers', { attacker: ['blaster-d6'], defender: [] });
		const blaster = c.uid(c.attacker, 'blaster-d6');
		expect(c.act('attack', c.defender, [{ uid: blaster, count: 3 }])).toBe(false);
		c.act('tweak', (g: ZiaState) => {
			g.players[c.attacker].ship!.armedMarkers = 1;
		});
		expect(c.act('attack', c.defender, [{ uid: blaster, count: 2 }])).toBe(false);
		expect(c.act('attack', c.defender, [{ uid: blaster, count: 1 }])).toBe(true);
	});
});

describe('an attack', () => {
	it('waits for the defender to choose shields; nobody else can move meanwhile', () => {
		const c = combatGame('attack-wait', { attacker: ['blaster-d6'], defender: ['shield-d6'] });
		c.act('useImpulse');
		expect(c.act('attack', c.defender, [{ uid: c.uid(c.attacker, 'blaster-d6'), count: 2 }])).toBe(true);
		expect(c.G().turn.movement).toBe(0); // a standard action ends movement
		expect(c.G().combat).toMatchObject({ attacker: c.attacker, defender: c.defender, stage: 'defend' });
		expect(c.G().players[c.attacker].ship!.armedMarkers).toBe(2);
		expect(c.state().ctx.activePlayers).toEqual({ [c.defender]: 'defend' });
		expect(c.actAs(c.attacker, 'endTurn', 0)).toBe(false);
		// The defender can't do anything but answer.
		expect(c.actAs(c.defender, 'useImpulse')).toBe(false);
		expect(c.actAs(c.defender, 'defend', [{ uid: c.uid(c.defender, 'shield-d6'), count: 1 }])).toBe(true);
		const combat = c.G().combat;
		const rolls = c.G().rolls!.slice(-3);
		expect(rolls.map((r) => r.seat)).toEqual([c.attacker, c.attacker, c.defender]);
		expect(rolls.map((r) => r.viewers)).toEqual([[c.defender], [c.defender], [c.attacker]]);
		const attack = rolls[0].roll + rolls[1].roll;
		const damage = Math.max(0, attack - rolls[2].roll);
		expect(c.G().players[c.defender].pendingDamage).toHaveLength(damage);
		// Then the defender places damage (if any) and chooses whether to re-arm the shield.
		if (damage) expect(combat?.stage).toBe('damage');
		else expect(combat?.stage).toBe('rearm');
	});

	it('without shields, the dice roll straight away and the defender places the damage', () => {
		const c = combatGame('attack-no-shield', { attacker: ['blaster-d6'], defender: [] });
		expect(c.act('attack', c.defender, [{ uid: c.uid(c.attacker, 'blaster-d6'), count: 1 }])).toBe(true);
		const roll = c.G().rolls!.at(-1)!.roll;
		const d = c.G().players[c.defender];
		expect(d.pendingDamage).toHaveLength(roll);
		expect(c.G().combat?.stage).toBe('damage');
		expect(c.state().ctx.activePlayers).toEqual({ [c.defender]: 'defend' });
		for (let i = 0; i < roll; i++) {
			const cell = botDecision(c.G(), c.defender, c.state().ctx.currentPlayer)!;
			expect(cell.move).toBe('placeDamage');
			expect(c.act('placeDamage', ...cell.args)).toBe(true);
		}
		expect(c.G().players[c.defender].ship!.damage).toHaveLength(roll);
		// Over: back to the attacker.
		expect(c.G().combat).toBeNull();
		expect(c.state().ctx.activePlayers).toBeNull();
		expect(c.act('endTurn', 0)).toBe(true);
		expect(c.state().ctx.currentPlayer).toBe(c.defender);
	});

	it('re-arming: 1 energy per shield marker; markers not re-armed go to Disarmed', () => {
		for (const n of [0, 1]) {
			// Find a seed where the shield stops it all, to get straight to re-arming.
			for (let i = 0; i < 60; i++) {
				const c = combatGame(`rearm-${n}-${i}`, { attacker: ['blaster-d6'], defender: ['shield-d8'] });
				c.act('attack', c.defender, [{ uid: c.uid(c.attacker, 'blaster-d6'), count: 1 }]);
				const shield = c.uid(c.defender, 'shield-d8');
				c.act('defend', [{ uid: shield, count: 1 }]);
				if (c.G().combat?.stage !== 'rearm') continue;
				const before = c.G().players[c.defender].ship!;
				expect(before.armedMarkers).toBe(3);
				expect(c.act('rearmShields', 2)).toBe(false);
				expect(c.act('rearmShields', n)).toBe(true);
				const ship = c.G().players[c.defender].ship!;
				expect(ship.armedMarkers).toBe(3 + n);
				expect(ship.disarmedMarkers).toBe(1 - n);
				expect(ship.energy).toBe(before.energy - n);
				expect(ship.outfits.find((o) => o.uid === shield)!.usedSpaces).toEqual([]);
				expect(c.G().combat).toBeNull();
				break;
			}
		}
	});

	it("a defender shot down leaves the attacker's turn alone", () => {
		const c = combatGame('attack-kill', { attacker: ['blaster-d6'], defender: [] });
		c.act('tweak', (g: ZiaState) => {
			const ship = g.players[c.defender].ship!;
			ship.damage = Array.from({ length: maxDamage(ship) - 1 }, (_, i) => `${i},99`);
			g.turn.missionDraws = ['5,5'];
		});
		expect(c.act('attack', c.defender, [{ uid: c.uid(c.attacker, 'blaster-d6'), count: 1 }])).toBe(true);
		expect(c.G().players[c.defender].position).toBeNull();
		expect(c.G().combat).toBeNull();
		expect(c.G().turn.missionDraws).toEqual(['5,5']);
		expect(c.G().log.at(-1)!.text).toBe(`was destroyed: shot down by {@${c.attacker}}`);
		expect(c.state().ctx.activePlayers).toBeNull();
		expect(c.act('endTurn', 0)).toBe(true);
	});
});

describe('bot defenders', () => {
	it('raise every shield they can, then re-arm what they can afford', () => {
		const c = combatGame('bot-defend', { attacker: ['blaster-d6'], defender: ['shield-d6'] });
		c.act('attack', c.defender, [{ uid: c.uid(c.attacker, 'blaster-d6'), count: 2 }]);
		const cur = () => c.state().ctx.currentPlayer;
		expect(botDecision(c.G(), c.attacker, cur())).toBeNull();
		expect(botDecision(c.G(), c.defender, cur())).toEqual({ move: 'defend', args: [[{ uid: c.uid(c.defender, 'shield-d6'), count: 2 }]] });
		for (let i = 0; i < 20 && c.G().combat; i++) {
			const d = botDecision(c.G(), c.defender, cur())!;
			expect(c.act(d.move, ...d.args)).toBe(true);
		}
		expect(c.G().combat).toBeNull();
		expect(cur()).toBe(c.attacker);
	});
});

describe('over the multiplayer path', () => {
	it("the defender's own client can answer during the attacker's turn", async () => {
		const { Local } = await import('boardgame.io/multiplayer');
		const game = {
			...gameDef.game,
			seed: 'multiplayer',
			moves: { ...gameDef.game.moves, tweak: ({ G }: { G: ZiaState }, fn: (G: ZiaState) => void) => fn(G) },
		};
		const multiplayer = Local();
		const clients = ['0', '1'].map((playerID) => Client({ game, numPlayers: 2, multiplayer, playerID }));
		clients.forEach((c) => c.start());
		const state = () => clients[0].getState()!;
		const G = () => state().G as ZiaState;
		const send = (seat: string, name: string, ...args: unknown[]) => {
			const before = state()._stateID;
			(clients[Number(seat)].moves[name] as (...a: unknown[]) => void)(...args);
			return state()._stateID !== before;
		};
		const cur = () => state().ctx.currentPlayer;
		send(cur(), 'pickShip', 'swamp-rat', 0);
		send(cur(), 'pickShip', 'easy-tiger', 0);
		for (const _ of [0, 1]) {
			const seat = cur();
			const id = seat === G().turnOrder[0] ? 'blaster-d6' : 'shield-d6';
			const spot = autoPlace(SHIPS_BY_ID[G().players[seat].ship!.shipId], [], id, 'x')!;
			send(seat, 'buyOutfit', id, spot.x, spot.y, spot.rotation, spot.flipped);
			send(seat, 'finishOutfitting');
		}
		const attacker = cur();
		const defender = attacker === '0' ? '1' : '0';
		send(attacker, 'tweak', (g: ZiaState) => {
			g.board = { sectors: [{ tileId: 'lost-sector', center: { q: 0, r: 0 }, rotation: 0 }] };
			g.players[attacker].position = '0,0';
			g.players[defender].position = '1,0';
		});
		const blaster = G().players[attacker].ship!.outfits[0].uid;
		expect(send(attacker, 'attack', defender, [{ uid: blaster, count: 1 }])).toBe(true);
		// Both clients see the defender as the one to act.
		for (const c of clients) expect(c.getState()!.ctx.activePlayers).toEqual({ [defender]: 'defend' });
		expect(send(attacker, 'endTurn', 0)).toBe(false);
		for (let i = 0; i < 20 && G().combat; i++) {
			const d = botDecision(G(), defender, cur())!;
			expect(send(defender, d.move, ...d.args)).toBe(true);
		}
		expect(G().combat).toBeNull();
		for (const c of clients) expect(c.getState()!.ctx.activePlayers).toBeNull();
		expect(send(attacker, 'endTurn', 0)).toBe(true);
		expect(cur()).toBe(defender);
		clients.forEach((c) => c.stop());
	});
});
