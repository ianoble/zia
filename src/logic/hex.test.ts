import { describe, expect, it } from 'vitest';
import { hexDistance, hexKey, hexToPixel, rotateHex, SECTOR_NEIGHBOR_OFFSETS, sectorHexes } from './hex';
import { boardHexes, movementCosts, reachableHexes, startingBoard, startingSpawnFor } from './board';

describe('hex maths', () => {
	it('a sector has 19 hexes', () => {
		expect(sectorHexes({ q: 0, r: 0 })).toHaveLength(19);
	});

	it('neighbouring sectors tile without overlap', () => {
		const a = new Set(sectorHexes({ q: 0, r: 0 }).map(hexKey));
		for (const off of SECTOR_NEIGHBOR_OFFSETS) {
			expect(hexDistance({ q: 0, r: 0 }, off)).toBe(5);
			expect(sectorHexes(off).map(hexKey).some((k) => a.has(k))).toBe(false);
		}
		const all = new Set([{ q: 0, r: 0 }, ...SECTOR_NEIGHBOR_OFFSETS].flatMap((c) => sectorHexes(c).map(hexKey)));
		expect(all.size).toBe(7 * 19);
	});

	it('neighbouring sectors touch (some hexes are adjacent across the edge)', () => {
		const a = sectorHexes({ q: 0, r: 0 });
		for (const off of SECTOR_NEIGHBOR_OFFSETS) {
			const b = sectorHexes(off);
			expect(a.some((h) => b.some((k) => hexDistance(h, k) === 1))).toBe(true);
		}
	});

	it('rotates six times back to the start', () => {
		expect(rotateHex({ q: 2, r: -1 }, 6)).toEqual({ q: 2, r: -1 });
		expect(rotateHex({ q: 1, r: 0 }, 1)).toEqual({ q: 0, r: 1 });
	});

	it('matches the SVG spacing (flat-top, 150 px columns for radius 100)', () => {
		expect(hexToPixel({ q: 1, r: 0 }, 100).x).toBeCloseTo(150);
		expect(hexToPixel({ q: 0, r: 1 }, 100).y).toBeCloseTo(173.2, 1);
	});
});

describe('board', () => {
	it('starting sectors each have their own spawn point', () => {
		const board = startingBoard(['0', '1', '2', '3', '4']);
		expect(boardHexes(board).size).toBe(5 * 19);
		const spawns = ['0', '1', '2', '3', '4'].map((s) => startingSpawnFor(board, s));
		expect(new Set(spawns).size).toBe(5);
		expect(spawns.every(Boolean)).toBe(true);
	});

	it('starting sectors are all adjacent to the first', () => {
		const board = startingBoard(['0', '1', '2', '3', '4']);
		for (const s of board.sectors.slice(1)) expect(hexDistance(board.sectors[0].center, s.center)).toBe(5);
	});

	it('movement crosses into a neighbouring sector', () => {
		const board = startingBoard(['0', '1']);
		const costs = movementCosts(board, '0,0', 5);
		expect(costs.get('5,-2')).toBe(5);
		expect(costs.get('2,0')).toBe(2);
	});

	it('cannot end on an occupied hex but can pass through', () => {
		const board = startingBoard(['0', '1']);
		const r = reachableHexes(board, '0,0', 2, new Set(['1,0']));
		expect(r.has('1,0')).toBe(false);
		expect(r.get('2,0')).toBe(2);
	});
});
