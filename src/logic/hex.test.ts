import { describe, expect, it } from 'vitest';
import { hexDistance, hexKey, hexToPixel, rotateHex, SECTOR_NEIGHBOR_OFFSETS, sectorHexes } from './hex';
import { boardHexes, matchedRotation, movementCosts, reachableHexes, SECTOR_SLOT, startingBoard, startingSpawnFor } from './board';

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
	it('puts Nyr in the centre with one starting sector per captain around it', () => {
		const board = startingBoard(['0', '1', '2', '3', '4']);
		expect(board.sectors).toHaveLength(6);
		expect(board.sectors[0]).toMatchObject({ tileId: 'nyr', center: { q: 0, r: 0 } });
		expect(board.sectors[0].ownerSeat).toBeUndefined();
		expect(boardHexes(board).size).toBe(6 * 19);
		for (const s of board.sectors.slice(1)) expect(hexDistance({ q: 0, r: 0 }, s.center)).toBe(5);
	});

	it.each([
		[3, ['W', 'NE', 'SE']],
		[4, ['W', 'NW', 'E', 'SE']],
		[5, ['W', 'NW', 'NE', 'E', 'SE']],
	] as const)('%i captains use the rulebook positions around Nyr', (n, dirs) => {
		const board = startingBoard(Array.from({ length: n }, (_, i) => String(i)));
		const centers = board.sectors.slice(1).map((s) => s.center);
		expect(centers).toEqual(dirs.map((d) => SECTOR_NEIGHBOR_OFFSETS[SECTOR_SLOT[d]]));
	});

	it('starting sectors are turned to match Nyr (180°)', () => {
		const board = startingBoard(['0', '1', '2']);
		expect(board.sectors[0].rotation).toBe(0);
		for (const s of board.sectors.slice(1)) expect(s.rotation).toBe(3);
		expect(matchedRotation(3)).toBe(0);
	});

	it('screen directions of the neighbour slots', () => {
		const angle = (i: number) => {
			const p = hexToPixel(SECTOR_NEIGHBOR_OFFSETS[i], 1);
			return ((Math.atan2(p.y, p.x) * 180) / Math.PI + 360) % 360;
		};
		expect(angle(SECTOR_SLOT.E)).toBeLessThan(15);
		expect(angle(SECTOR_SLOT.W)).toBeCloseTo(186.6, 0);
		expect(angle(SECTOR_SLOT.NE)).toBeGreaterThan(270);
		expect(angle(SECTOR_SLOT.SE)).toBeLessThan(90);
	});

	it('each captain has their own spawn point, none on Nyr', () => {
		const board = startingBoard(['0', '1', '2', '3', '4']);
		const spawns = ['0', '1', '2', '3', '4'].map((s) => startingSpawnFor(board, s));
		expect(new Set(spawns).size).toBe(5);
		expect(spawns.every(Boolean)).toBe(true);
		expect(spawns).not.toContain('0,0');
	});

	it("Nyr's inner 7 hexes are star and can't be entered or crossed", () => {
		const board = startingBoard(['0', '1']);
		const hexes = boardHexes(board);
		const stars = [...hexes.values()].filter((h) => h.kind === 'star').map((h) => h.key);
		expect(stars.sort()).toEqual(['-1,0', '-1,1', '0,-1', '0,0', '0,1', '1,-1', '1,0'].sort());
		const costs = movementCosts(board, '2,0', 8);
		for (const k of stars) expect(costs.has(k)).toBe(false);
		// Opposite side of the orbit ring: 4 straight through, 6 around the ring.
		expect(costs.get('-2,0')).toBe(6);
	});

	it('movement crosses from a starting sector into Nyr', () => {
		const board = startingBoard(['0', '1']);
		const spawn = startingSpawnFor(board, '1')!; // seat 1 starts east of Nyr, centre (5,-2)
		expect(spawn).toBe('5,-2');
		const costs = movementCosts(board, spawn, 5);
		expect(costs.get('2,-1')).toBe(3);
	});

	it('cannot end on an occupied hex but can pass through', () => {
		const board = startingBoard(['0', '1']);
		const r = reachableHexes(board, '5,-2', 2, new Set(['4,-2']));
		expect(r.has('4,-2')).toBe(false);
		expect(r.get('3,-2')).toBe(2);
	});
});
