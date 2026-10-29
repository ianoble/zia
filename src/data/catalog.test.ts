import { describe, expect, it } from 'vitest';
import { NYR_SECTOR, SECTOR_TILES, SECTORS_BY_ID, STARTING_CANDIDATES } from './sectors';
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

describe('sector tiles', () => {
	it('has the 32 listed tiles with unique ids and numbers', () => {
		expect(SECTOR_TILES).toHaveLength(32);
		expect(new Set(SECTOR_TILES.map((t) => t.id)).size).toBe(32);
		expect(SECTOR_TILES.map((t) => t.number)).toEqual(Array.from({ length: 32 }, (_, i) => i + 1));
	});

	it('spawn points 1-19 are on tiles 1-19', () => {
		const spawns = SECTOR_TILES.filter((t) => t.spawnPoint != null);
		expect(spawns.map((t) => t.spawnPoint)).toEqual(Array.from({ length: 19 }, (_, i) => i + 1));
		expect(spawns.every((t) => t.number === t.spawnPoint)).toBe(true);
		expect(STARTING_CANDIDATES).toEqual(spawns);
	});

	it('marks Embers tiles (21+, except Lost Sector)', () => {
		const embers = SECTOR_TILES.filter((t) => t.expansion === 'embers').map((t) => t.number);
		expect(embers).toEqual([21, 22, 23, 25, 26, 27, 28, 29, 30, 31, 32]);
		expect(SECTORS_BY_ID['lost-sector'].expansion).toBe('base');
	});

	it('Nyr and Xia are stars; gates have no exploration space', () => {
		expect(NYR_SECTOR.number).toBe(28);
		expect(SECTORS_BY_ID['xia'].types).toEqual(['Star']);
		expect(SECTORS_BY_ID['xia'].spaces).toHaveLength(19); // the whole tile
		expect(SECTORS_BY_ID['xia'].spaces.every((s) => s.kind === 'star')).toBe(true);
		expect(SECTORS_BY_ID['xia'].layoutPlaceholder).toBe(false);
		expect(NYR_SECTOR.spaces).toHaveLength(7);
		for (const t of SECTOR_TILES.filter((x) => x.types.includes('Gate'))) expect(t.explorationSpaces).toBe(0);
		expect(SECTORS_BY_ID['ferren-s-call'].explorationSpaces).toBe(2);
		expect(SECTORS_BY_ID['tig'].types).toEqual(['Neutral', 'Anomaly']);
	});
});
