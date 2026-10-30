import { describe, expect, it } from 'vitest';
import { createInitialState } from './index';
import { rollDie } from './game';

describe('Luck', () => {
	const setup = () => {
		const G = createInitialState({ numPlayers: 2, playOrder: ['0', '1'] });
		G.turn = { movement: 0 };
		return G;
	};
	const always = (n: number) => ({ D20: () => n, Die: () => n });

	it('a natural 20 on a d20 earns 1 fame, once per turn', () => {
		const G = setup();
		expect(rollDie(G, '0', always(20), 20)).toBe(20);
		expect(G.players['0'].fame).toBe(1);
		rollDie(G, '0', always(20), 20);
		expect(G.players['0'].fame).toBe(1);
		expect(G.log.filter((l) => l.text.includes('Luck'))).toHaveLength(1);
		G.turn = { movement: 0 }; // next turn
		rollDie(G, '0', always(20), 20);
		expect(G.players['0'].fame).toBe(2);
	});

	it('not on other rolls or other dice', () => {
		const G = setup();
		rollDie(G, '0', always(19), 20);
		rollDie(G, '0', always(12), 12);
		expect(G.players['0'].fame).toBe(0);
	});
});
