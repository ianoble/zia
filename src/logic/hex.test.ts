import { describe, expect, it } from 'vitest';
import { addHex, HEX_DIRECTIONS, hexDistance, parseHexKey, hexKey, hexToPixel, rotateHex, SECTOR_NEIGHBOR_OFFSETS, sectorHexes, sectorSlotOf } from './hex';
import { EDGE_SYMBOL_ANCHOR, EDGE_SYMBOLS } from '../data/sectors';
import {
	boardHexes,
	edgeSymbolFacing,
	edgeSymbolMarks,
	explorePlacement,
	matchedRotation,
	movementCosts,
	reachableHexes,
	SECTOR_SLOT,
	slotCrossed,
	startingBoard,
	startingSpawnFor,
	type BoardState,
} from './board';

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
		// Matches the printed tile: E is slightly above horizontal, then every 60° clockwise.
		expect(angle(SECTOR_SLOT.E)).toBeCloseTo(353.4, 0);
		expect(angle(SECTOR_SLOT.SE)).toBeCloseTo(53.4, 0);
		expect(angle(SECTOR_SLOT.W)).toBeCloseTo(173.4, 0);
		expect(angle(SECTOR_SLOT.NE)).toBeCloseTo(293.4, 0);
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
		const spawn = startingSpawnFor(board, '1')!; // seat 1 starts east of Nyr
		const costs = movementCosts(board, spawn, 10);
		// Nyr's east orbit hex, reached by the direct route (nothing in the way).
		expect(costs.get('2,-1')).toBe(hexDistance(parseHexKey(spawn), { q: 2, r: -1 }));
	});

	it('cannot end on an occupied hex but can pass through', () => {
		const board = startingBoard(['0', '1']);
		const r = reachableHexes(board, '5,-3', 2, new Set(['4,-3']));
		expect(r.has('4,-3')).toBe(false);
		expect(r.get('3,-3')).toBe(2);
	});
});

describe('edge symbols', () => {
	const sameEdge = (a: { hex: { q: number; r: number }; direction: number }, b: typeof a) =>
		hexKey(addHex(a.hex, HEX_DIRECTIONS[a.direction])) === hexKey(b.hex) && (a.direction + 3) % 6 === b.direction;

	it('six different symbols per tile', () => {
		expect(new Set(EDGE_SYMBOLS).size).toBe(6);
	});

	it('each symbol sits on the middle edge of its side', () => {
		for (let slot = 0; slot < 6; slot++) {
			const hex = rotateHex(EDGE_SYMBOL_ANCHOR.hex, slot);
			const across = addHex(hex, HEX_DIRECTIONS[(EDGE_SYMBOL_ANCHOR.direction + slot) % 6]);
			expect(sectorSlotOf({ q: 0, r: 0 }, across)).toBe(slot);
			// Middle of the side: the edge lies on the line between the two sector centres.
			const mid = hexToPixel(SECTOR_NEIGHBOR_OFFSETS[slot], 1);
			const a = hexToPixel(hex, 1);
			const b = hexToPixel(across, 1);
			const cross = (a.x + b.x) / 2 * mid.y - (a.y + b.y) / 2 * mid.x;
			expect(Math.abs(cross)).toBeLessThan(1e-9);
		}
	});

	it("starting sectors' symbols meet Nyr's on the same edge, and match", () => {
		const board = startingBoard(['0', '1', '2', '3', '4']);
		const marks = edgeSymbolMarks(board);
		for (let i = 1; i < board.sectors.length; i++) {
			const mine = marks.find((m) => m.sectorIndex === i && sectorSlotOf(board.sectors[i].center, { q: 0, r: 0 }) === m.slot)!;
			const nyr = marks.find((m) => m.sectorIndex === 0 && m.slot === (mine.slot + 3) % 6)!;
			expect(mine.symbol).toBe(nyr.symbol);
			expect(sameEdge(mine, nyr)).toBe(true);
		}
	});

	it.each([0, 1, 2, 3, 4, 5])('exploring from a tile turned %i matches the symbol on every side', (rotation) => {
		const board: BoardState = { sectors: [{ tileId: 'neo-damascus', center: { q: 0, r: 0 }, rotation }] };
		for (let slot = 0; slot < 6; slot++) {
			const placed = explorePlacement(board, 0, slot)!;
			expect(placed.center).toEqual(SECTOR_NEIGHBOR_OFFSETS[slot]);
			expect(placed.rotation).toBe(matchedRotation(rotation));
			expect(edgeSymbolFacing(placed.rotation, (slot + 3) % 6)).toBe(edgeSymbolFacing(rotation, slot));
			const marks = edgeSymbolMarks({ sectors: [...board.sectors, { tileId: 'kemplar-ii', ...placed }] });
			const a = marks.find((m) => m.sectorIndex === 0 && m.slot === slot)!;
			const b = marks.find((m) => m.sectorIndex === 1 && m.slot === (slot + 3) % 6)!;
			expect(sameEdge(a, b)).toBe(true);
		}
	});

	it("can't explore where a sector already is", () => {
		const board = startingBoard(['0', '1']);
		expect(explorePlacement(board, 0, SECTOR_SLOT.E)).toBeNull();
		expect(explorePlacement(board, 0, SECTOR_SLOT.NE)).not.toBeNull();
	});

	it('finds the side a step crosses', () => {
		const board = startingBoard(['0', '1']);
		// From Nyr's east orbit hex into the east starting sector.
		expect(slotCrossed(board, '2,-1', '3,-2')).toEqual({ sectorIndex: 0, slot: SECTOR_SLOT.E });
		expect(slotCrossed(board, '2,-1', '2,0')).toBeNull();
		// Off the board to the north-east of the east starting sector.
		const ne = addHex(board.sectors[2].center, { q: 1, r: -3 });
		expect(slotCrossed(board, hexKey(addHex(board.sectors[2].center, { q: 1, r: -2 })), hexKey(ne))).toEqual({
			sectorIndex: 2,
			slot: SECTOR_SLOT.NE,
		});
	});
});
