import { describe, expect, it } from 'vitest';
import { SHIPS, IN_SCOPE_SHIPS } from './ships';
import { OUTFITS } from './outfits';
import { parseShape } from '../logic/holdGeometry';

describe('ship catalog', () => {
	it('has unique ids', () => {
		expect(new Set(SHIPS.map((s) => s.id)).size).toBe(SHIPS.length);
	});

	it.each(SHIPS.map((s) => [s.name, s] as const))('%s hold layout matches its hold size', (_name, ship) => {
		expect(parseShape(ship.hold).length).toBe(ship.holdSize);
	});

	it('prices follow tier (I 1,000 / II 5,000 / III 8,000)', () => {
		const price = { 1: 1000, 2: 5000, 3: 8000 } as const;
		for (const s of SHIPS) expect(s.price).toBe(price[s.tier]);
	});

	it('base + Embers has 7 ships per tier', () => {
		for (const tier of [1, 2, 3]) {
			expect(IN_SCOPE_SHIPS.filter((s) => s.tier === tier)).toHaveLength(7);
		}
	});
});

describe('outfit catalog', () => {
	it.each(OUTFITS.map((o) => [o.name, o] as const))('%s shape matches sections and use spaces', (_name, o) => {
		const cells = parseShape(o.shape);
		const inside = cells.filter((c) => c.kind !== 'x');
		expect(inside.length).toBe(o.sections);
		expect(cells.filter((c) => c.kind === 'U').length).toBe(o.useSpaces);
	});
});
