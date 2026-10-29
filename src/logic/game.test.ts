import { describe, expect, it } from 'vitest';
import { Client } from 'boardgame.io/client';
import { gameDef, createInitialState, PLAYER_COLORS } from './index';

describe('zia game scaffold', () => {
	it('creates one player per seat with distinct colours', () => {
		const G = createInitialState({ numPlayers: 3, playOrder: ['0', '1', '2'] });
		expect(Object.keys(G.players)).toEqual(['0', '1', '2']);
		expect(G.players['2'].color).toBe(PLAYER_COLORS[2]);
		expect(G.history).toEqual([]);
	});

	it('endTurn passes play to the next seat', () => {
		const client = Client({ game: gameDef.game, numPlayers: 3 });
		client.start();
		expect(client.getState()!.ctx.currentPlayer).toBe('0');
		client.moves.endTurn();
		expect(client.getState()!.ctx.currentPlayer).toBe('1');
		client.stop();
	});

	it('is registered as zia', () => {
		expect(gameDef.id).toBe('zia');
		expect(gameDef.minPlayers).toBe(2);
		expect(gameDef.maxPlayers).toBe(5);
	});
});
