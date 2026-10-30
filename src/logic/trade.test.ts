import { describe, expect, it } from 'vitest';
import { Client } from 'boardgame.io/client';
import type { Ctx } from 'boardgame.io';
import { createInitialState, gameDef } from './index';
import type { EconomyCube, ZiaState } from './types';
import { ECONOMY_CUBES } from './types';
import { boardHexes, startingBoard } from './board';
import { cargoTargets } from './ship';

/**
 * Two captains past setup on Neo Damascus (buys spice from captains, sells plasma) and
 * Loath (buys any cube). Test-only moves put the ship anywhere and set the Economy Board.
 */
function tradeGame() {
	const game = {
		...gameDef.game,
		seed: 'trade',
		setup: (c: { ctx: Ctx }, data?: unknown) => {
			const G = (gameDef.game.setup as (c: unknown, d?: unknown) => ZiaState)(c, data);
			G.board = startingBoard(c.ctx.playOrder, ['neo-damascus', 'loath']);
			G.explorationSpaces = [];
			return G;
		},
		moves: {
			...gameDef.game.moves,
			teleport: ({ G, playerID }: { G: ZiaState; playerID: string }, hex: string) => {
				G.players[playerID].position = hex;
			},
			setEconomy: ({ G }: { G: ZiaState }, color: EconomyCube, cubes: number, demand: number) => {
				G.economy[color] = { cubes, demand };
			},
			giveCubes: ({ G, playerID }: { G: ZiaState; playerID: string }, color: EconomyCube, n: number) => {
				for (let i = 0; i < n; i++) G.players[playerID].pendingCargo.push(color);
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
	const hex = (tileId: string, kind: string) =>
		[...boardHexes(G().board).values()].find((h) => G().board.sectors[h.sectorIndex].tileId === tileId && h.kinds.includes(kind as never))!.key;
	const me = () => G().players[seat];
	/** Put every cube waiting to be placed into the hold. */
	const stowAll = () => {
		while (me().pendingCargo.length) act('placeCargo', cargoTargets(me().ship!)[0]);
	};
	return { G, act, seat, hex, me, stowAll };
}

describe('Economy Board', () => {
	it('starts with a d6 of each cube type and no demand', () => {
		const G = createInitialState({ numPlayers: 2, playOrder: ['0', '1'] });
		for (const c of ECONOMY_CUBES) {
			expect(G.economy[c].cubes).toBeGreaterThanOrEqual(1);
			expect(G.economy[c].cubes).toBeLessThanOrEqual(6);
			expect(G.economy[c].demand).toBe(0);
		}
	});
});

describe('buying cubes', () => {
	it("buys up to 2 of the planet's cube for 1,000 from the Economy Board, then places them", () => {
		const c = tradeGame();
		c.act('setEconomy', 'plasma', 3, 0);
		c.act('teleport', c.hex('neo-damascus', 'buy'));
		const credits = c.me().credits;
		expect(c.act('buyCargo', 'spice', 1)).toBe(false); // Neo Damascus sells plasma
		expect(c.act('buyCargo', 'plasma', 3)).toBe(false);
		expect(c.act('buyCargo', 'plasma', 2)).toBe(true);
		expect(c.me().credits).toBe(credits - 1000);
		expect(c.G().economy.plasma.cubes).toBe(1);
		expect(c.me().pendingCargo).toEqual(['plasma', 'plasma']);
		c.stowAll();
		expect(c.me().ship!.cargo).toHaveLength(2);
		expect(c.act('buyCargo', 'plasma', 2)).toBe(false); // only 1 left
		expect(c.act('buyCargo', 'plasma', 1)).toBe(true);
	});

	it('needs to be on the Buy space', () => {
		const c = tradeGame();
		c.act('teleport', c.hex('neo-damascus', 'sell'));
		expect(c.act('buyCargo', 'plasma', 1)).toBe(false);
	});
});

describe('selling cubes', () => {
	/** A captain holding `n` plasma cubes, on Loath's Sell space (buys any colour). */
	function withPlasma(n: number) {
		const c = tradeGame();
		c.act('setEconomy', 'plasma', 6, 0);
		c.act('teleport', c.hex('neo-damascus', 'buy'));
		c.act('buyCargo', 'plasma', 2);
		c.stowAll(); // cubes are placed before anything else
		if (n > 2) expect(c.act('buyCargo', 'plasma', n - 2)).toBe(true);
		c.stowAll();
		expect(c.me().ship!.cargo).toHaveLength(n);
		return c;
	}

	it('a Big Shipment (2+, every cube it buys) earns 1,000 each and 1 fame; Loath produces nothing', () => {
		const c = withPlasma(2);
		c.act('teleport', c.hex('loath', 'sell'));
		const credits = c.me().credits;
		const fame = c.me().fame;
		const before = JSON.stringify(c.G().economy);
		expect(c.act('sellCargo', c.me().ship!.cargo.map((x) => x.cell))).toBe(true);
		expect(c.me().credits).toBe(credits + 2000);
		expect(c.me().fame).toBe(fame + 1);
		expect(c.me().ship!.cargo).toEqual([]);
		expect(JSON.stringify(c.G().economy)).toBe(before);
	});

	it('selling fewer than all earns no fame', () => {
		const c = withPlasma(3);
		c.act('teleport', c.hex('loath', 'sell'));
		const fame = c.me().fame;
		c.act('sellCargo', c.me().ship!.cargo.slice(0, 2).map((x) => x.cell));
		expect(c.me().fame).toBe(fame);
	});

	it('a planet that buys the cube consumes it and produces its own type, claiming In Demand credits', () => {
		// Neo Damascus buys spice from captains and produces plasma.
		const c = tradeGame();
		c.act('giveCubes', 'spice', 3);
		c.stowAll();
		c.act('setEconomy', 'plasma', 0, 1000);
		c.act('teleport', c.hex('neo-damascus', 'sell'));
		const credits = c.me().credits;
		expect(c.act('sellCargo', c.me().ship!.cargo.map((x) => x.cell))).toBe(true);
		expect(c.me().credits).toBe(credits + 3000 + 1000);
		expect(c.G().economy.plasma).toEqual({ cubes: 3, demand: 0 });
	});

	it('production stops at 6 cubes', () => {
		const c = tradeGame();
		c.act('giveCubes', 'spice', 3);
		c.stowAll();
		c.act('setEconomy', 'plasma', 5, 0);
		c.act('teleport', c.hex('neo-damascus', 'sell'));
		c.act('sellCargo', c.me().ship!.cargo.map((x) => x.cell));
		expect(c.G().economy.plasma.cubes).toBe(6);
	});

	it('In Demand: at the end of a turn, empty sections get 1,000 credits', () => {
		const c = tradeGame();
		c.act('setEconomy', 'cyber', 0, 0);
		c.act('endTurn', 0);
		expect(c.G().economy.cyber.demand).toBe(1000);
	});

	it('needs cubes the planet buys', () => {
		const c = withPlasma(2);
		c.act('teleport', c.hex('neo-damascus', 'sell')); // buys spice only
		expect(c.act('sellCargo', [c.me().ship!.cargo[0].cell])).toBe(false);
	});
});
