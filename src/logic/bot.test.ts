import { describe, expect, it } from 'vitest';
import { Client } from 'boardgame.io/client';
import { gameDef } from './index';
import { botDecision } from './bot';
import type { ZiaState } from './types';

describe('bot captains', () => {
	it.each([2, 3, 5])('can play a %i-captain game through setup and several turns on their own', (n) => {
		const client = Client({ game: { ...gameDef.game, seed: `bots-${n}` }, numPlayers: n });
		client.start();
		let moves = 0;
		let turnsInPlay = 0;
		while (moves < 400) {
			const s = client.getState()!;
			const G = s.G as ZiaState;
			if (G.stage === 'play' && turnsInPlay >= n * 3) break;
			const seat = s.ctx.currentPlayer;
			const d = botDecision(G, seat, seat);
			expect(d).not.toBeNull();
			client.updatePlayerID(seat);
			const before = s._stateID;
			(client.moves[d!.move] as (...a: unknown[]) => void)(...d!.args);
			expect(client.getState()!._stateID).not.toBe(before); // every bot move is legal
			if (G.stage === 'play' && d!.move === 'endTurn') turnsInPlay++;
			moves++;
		}
		const G = client.getState()!.G as ZiaState;
		expect(G.stage).toBe('play');
		expect(turnsInPlay).toBe(n * 3);
		for (const p of Object.values(G.players)) {
			expect(p.ship).not.toBeNull();
			expect(p.ship!.outfits.length).toBeGreaterThan(0);
		}
	});
});
