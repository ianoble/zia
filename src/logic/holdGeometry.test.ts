import { describe, expect, it } from 'vitest';
import { SHIPS_BY_ID } from '../data/ships';
import { autoPlace, canPlaceOutfit, parseShape, placedCells, transformCells } from './holdGeometry';
import type { PlacedOutfit } from './types';

const swampRat = SHIPS_BY_ID['swamp-rat']; // 6x2 rectangle

const place = (outfitId: string, x: number, y: number, rotation: 0 | 1 | 2 | 3 = 0, flipped = false, uid = outfitId): PlacedOutfit => ({
	uid, outfitId, x, y, rotation, flipped, usedSpaces: [],
});

describe('transformCells', () => {
	it('rotates a straight piece from horizontal to vertical', () => {
		const cells = transformCells(parseShape(['##U']), 1, false);
		expect(cells.map((c) => [c.x, c.y])).toEqual([[0, 0], [0, 1], [0, 2]]);
		expect(cells[2].kind).toBe('U');
	});

	it('flips left-right and keeps use-space indices', () => {
		const cells = transformCells(parseShape(['#U', '.U']), 0, true);
		const uses = cells.filter((c) => c.kind === 'U').map((c) => [c.x, c.y, c.useIndex]);
		expect(uses).toEqual([[0, 0, 0], [0, 1, 1]]);
	});

	it('four rotations return to the original', () => {
		const orig = parseShape(['###', '..U', '..U']);
		const back = transformCells(transformCells(orig, 2, false), 2, false);
		expect(back).toEqual(orig);
	});
});

describe('canPlaceOutfit', () => {
	it('accepts an outfit inside the hold', () => {
		expect(canPlaceOutfit(swampRat, [], place('missile-d12', 0, 0))).toBe(true);
	});

	it('rejects an outfit hanging outside the hold', () => {
		expect(canPlaceOutfit(swampRat, [], place('missile-d12', 3, 0))).toMatch(/inside the hold/);
	});

	it('rejects overlaps', () => {
		const a = place('shield-d6', 0, 0, 0, false, 'a');
		expect(canPlaceOutfit(swampRat, [a], place('missile-d8', 1, 0, 0, false, 'b'))).toMatch(/overlaps/);
	});

	it('cargo pod needs its connector inside and the rest outside', () => {
		// Shape ['xxx', '.C.'] rotated 2 → ['.C.', 'xxx']: connector on bottom row of hold, exterior below.
		expect(canPlaceOutfit(swampRat, [], place('cargo-pod', 0, 1, 2))).toBe(true);
		expect(canPlaceOutfit(swampRat, [], place('cargo-pod', 0, 0, 2))).toMatch(/outside the hold/);
	});

	it('piercer must sit on a weapon use space', () => {
		const blaster = place('blaster-d6', 0, 0, 0, false, 'b'); // use spaces at (1,0) and (1,1)
		expect(canPlaceOutfit(swampRat, [blaster], place('piercer', 1, 0, 0, false, 'p'))).toBe(true);
		expect(canPlaceOutfit(swampRat, [blaster], place('piercer', 0, 0, 0, false, 'p'))).toMatch(/use space/);
		expect(canPlaceOutfit(swampRat, [], place('piercer', 3, 0, 0, false, 'p'))).toMatch(/use space/);
	});
});

describe('autoPlace', () => {
	it('fills a hold until nothing more fits', () => {
		const placed: PlacedOutfit[] = [];
		for (const id of ['engine-d8', 'shield-d8', 'blaster-d6']) {
			const p = autoPlace(swampRat, placed, id, `o${placed.length}`);
			expect(p).not.toBeNull();
			placed.push(p!);
		}
		const covered = placed.flatMap((p) => placedCells(p)).length;
		expect(covered).toBe(11);
		expect(autoPlace(swampRat, placed, 'missile-d8', 'x')).toBeNull();
	});
});
