import { describe, expect, it } from 'vitest';
import type { BoardState } from './board';
import { hexKey, SECTOR_NEIGHBOR_OFFSETS } from './hex';
import { canTarget, lineOfSight, shipsAdjacent, visibleHexes } from './sight';

/** One upright tile at the origin, so local hex = board hex. */
const tile = (tileId: string): BoardState => ({ sectors: [{ tileId, center: { q: 0, r: 0 }, rotation: 0 }] });

describe('line of sight', () => {
	// TK-421: asteroids at (0,-1), (0,1), (-1,1), (1,0), (1,-2), (2,-2); open (0,0), (-1,0), (1,-1), (0,-2), (0,2).
	const tk = tile('tk-421');

	it('open space next door is in sight', () => {
		expect(lineOfSight(tk, '0,0', '-1,0')).toBe(true);
	});

	it('an asteroid in the way blocks it', () => {
		expect(lineOfSight(tk, '0,-2', '0,2')).toBe(false);
	});

	it("a ship inside an asteroid can't see or be seen, even next door, but is still adjacent", () => {
		expect(lineOfSight(tk, '0,0', '0,-1')).toBe(false);
		expect(lineOfSight(tk, '0,-1', '0,0')).toBe(false);
		expect(shipsAdjacent(tk, '0,0', '0,-1')).toBe(true);
	});

	it('a line along the edge of an asteroid is clear if the other side is open', () => {
		// (-1,0) → (1,-1) runs along the edge between (0,0) (open) and (0,-1) (asteroid).
		expect(lineOfSight(tk, '-1,0', '1,-1')).toBe(true);
	});

	it('is blocked only when both sides of an edge line are blocked', () => {
		// (0,0) → (1,1) runs along the edge between (1,0) and (0,1), both asteroids.
		expect(lineOfSight(tk, '0,0', '1,1')).toBe(false);
	});

	it("nebulae and gates don't block it", () => {
		// Vortex 86 is mostly nebula; Expedior Gate has gates in the middle.
		expect(lineOfSight(tile('vortex-86'), '0,-2', '0,2')).toBe(true);
		expect(lineOfSight(tile('expedior-gate'), '-2,0', '2,0')).toBe(true);
	});

	it('stars block it', () => {
		// Nyr: the inner 7 hexes are star.
		expect(lineOfSight(tile('nyr'), '0,-2', '0,2')).toBe(false);
		expect(lineOfSight(tile('nyr'), '-2,0', '-2,2')).toBe(true);
	});
});

describe('planetary shields', () => {
	// Neo Damascus: planet (-1,0), (-1,1), (0,-1), (0,0), (0,1), (1,-1), (1,0); entrance on (-1,0) facing (-2,0).
	const nd = tile('neo-damascus');

	it('ships inside the same planet see each other', () => {
		expect(lineOfSight(nd, '-1,0', '1,0')).toBe(true);
		expect(shipsAdjacent(nd, '0,0', '0,1')).toBe(true);
	});

	it('the shield blocks sight between inside and outside, entrance included', () => {
		expect(lineOfSight(nd, '0,0', '0,-2')).toBe(false);
		expect(lineOfSight(nd, '-2,0', '-1,0')).toBe(false); // through the entrance
		expect(shipsAdjacent(nd, '-2,0', '-1,0')).toBe(false);
	});

	it('a line across the planet from outside is blocked; around it is clear', () => {
		expect(lineOfSight(nd, '0,-2', '0,2')).toBe(false);
		expect(lineOfSight(nd, '-2,0', '-2,2')).toBe(true);
	});
});

describe('unexplored space', () => {
	it('blocks a line across a gap in the board', () => {
		const [e, se, sw] = SECTOR_NEIGHBOR_OFFSETS;
		// Tiles E and SW of an empty middle: the line between their centres crosses the gap.
		const gap: BoardState = {
			sectors: [
				{ tileId: 'lost-sector', center: e, rotation: 0 },
				{ tileId: 'lost-sector', center: sw, rotation: 0 },
			],
		};
		expect(lineOfSight(gap, hexKey(e), hexKey(sw))).toBe(false);
		// Fill the middle and the space between: clear.
		const filled: BoardState = {
			sectors: [...gap.sectors, { tileId: 'lost-sector', center: { q: 0, r: 0 }, rotation: 0 }, { tileId: 'lost-sector', center: se, rotation: 0 }],
		};
		expect(lineOfSight(filled, hexKey(e), hexKey(sw))).toBe(true);
	});

	it('off-board spaces are never in sight', () => {
		expect(lineOfSight(tile('lost-sector'), '0,0', '9,9')).toBe(false);
	});
});

describe('targeting', () => {
	const open = tile('lost-sector');

	it('checks range and sight together', () => {
		expect(canTarget(open, '0,0', '1,0', 1, 1)).toBe(true); // blaster
		expect(canTarget(open, '0,0', '2,0', 1, 1)).toBe(false);
		expect(canTarget(open, '0,0', '1,0', 2, 6)).toBe(false); // missile, too close
		expect(canTarget(open, '-2,0', '2,0', 2, 6)).toBe(true);
		expect(canTarget(tile('tk-421'), '0,-2', '0,2', 2, 6)).toBe(false); // in range, no sight
	});

	it('lists every visible space with its range', () => {
		const seen = visibleHexes(open, '0,0', 6);
		expect(seen.size).toBe(18); // the rest of the tile
		expect(seen.get('2,0')).toBe(2);
		expect(seen.has('0,0')).toBe(false);
	});
});
