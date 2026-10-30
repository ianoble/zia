import { describe, expect, it } from 'vitest';
import { NYR_SECTOR, SECTOR_TILES, SECTORS_BY_ID, STARTING_CANDIDATES } from './sectors';
import { parseLayout, PLANET_ENTRANCES, TILE_LAYOUTS } from './tileLayouts';
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

describe('transcribed tile layouts', () => {
	const numbers = Object.keys(TILE_LAYOUTS).map(Number);

	it('cover all 21 base game tiles except Xia (whole tile star, set separately)', () => {
		const base = SECTOR_TILES.filter((t) => t.expansion === 'base' && t.number !== 20).map((t) => t.number);
		expect(numbers.sort((a, b) => a - b)).toEqual(base);
	});

	it.each(numbers)('tile %i has 19 hexes and matches the tile listing', (n) => {
		expect(parseLayout(TILE_LAYOUTS[n])).toHaveLength(19);
		const tile = SECTOR_TILES.find((t) => t.number === n)!;
		const count = (kind: string) => tile.spaces.filter((s) => s.kind === kind).length;
		expect(count('exploration')).toBe(tile.explorationSpaces);
		expect(count('mission')).toBe(tile.missionPoints);
		expect(count('spawn')).toBe(tile.spawnPoint != null ? 1 : 0);
		expect(tile.layoutPlaceholder).toBe(false);
		const spawn = tile.spaces.find((s) => s.kind === 'spawn');
		if (spawn) expect(spawn.number).toBe(tile.spawnPoint);
		// Buy / sell spaces are on the planet.
		for (const s of tile.spaces.filter((x) => x.kind === 'buy' || x.kind === 'sell')) {
			expect(tile.spaces.some((x) => x.kind === 'planet' && x.at.q === s.at.q && x.at.r === s.at.r)).toBe(true);
		}
	});
});

describe('planetary entrances', () => {
	it.each(Object.keys(PLANET_ENTRANCES).map(Number))('tile %i has one on its shield', (n) => {
		const tile = SECTOR_TILES.find((t) => t.number === n)!;
		const e = tile.entrance!;
		expect(e).toBeDefined();
		const isPlanet = (q: number, r: number) => tile.spaces.some((s) => s.kind === 'planet' && s.at.q === q && s.at.r === r);
		const d = [
			[1, 0],
			[0, 1],
			[-1, 1],
			[-1, 0],
			[0, -1],
			[1, -1],
		][e.direction];
		expect(isPlanet(e.at.q, e.at.r)).toBe(true);
		expect(isPlanet(e.at.q + d[0], e.at.r + d[1])).toBe(false);
	});

	it("Loath's is the upper-left side of the planet hex left of centre (as in the photo); Azure's is up-right", () => {
		expect(SECTORS_BY_ID['loath'].entrance).toEqual({ at: { q: -1, r: 0 }, direction: 3 });
		expect(SECTORS_BY_ID['azure'].entrance).toEqual({ at: { q: 1, r: -1 }, direction: 5 });
		// Smugglers' Den: the upper-left side of its centre hex (the base's furthest north-west edge).
		expect(SECTORS_BY_ID['smugglers-den'].entrance).toEqual({ at: { q: 0, r: 0 }, direction: 3 });
	});
});
