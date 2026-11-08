import { boardHexes, type BoardHex, type BoardState } from './board';
import { hexCorners, hexDistance, hexesInRange, hexKey, hexToPixel, parseHexKey } from './hex';

/**
 * Range, line of sight and adjacency for attacks (rulebook p13).
 *
 * Line of sight: a straight line from the centre of one space to the centre of the
 * other, which mustn't cross a border that blocks sight: stars, asteroids, debris
 * fields and planetary shields (entrances included), and mustn't pass over unexplored
 * space. Nebulae, gates, ships and special spaces don't block it.
 *
 * Each asteroid and debris space has its own border, so a ship inside one can't see
 * or be seen at all (not even from next door). Everyone inside the same planet shield
 * can see each other; a line between inside and outside always crosses the shield.
 *
 * A line that runs exactly along the edge between two spaces (or through a corner)
 * counts as clear if either side of it is clear.
 */

/** Spaces a sight line can't pass through or start in. */
const BLOCKING = ['star', 'asteroid', 'debris'] as const;

/** Which planet shield a space is inside ('' for open space): its sector, as each tile has one planet. */
const planetOf = (h: BoardHex) => (h.kinds.includes('planet') ? `planet-${h.sectorIndex}` : '');

/**
 * The hexes whose interior the segment p→q passes through (keys, endpoints included).
 * `candidates` are the hex keys to test.
 */
function hexesOnSegment(p: { x: number; y: number }, q: { x: number; y: number }, candidates: string[]): string[] {
	const dx = q.x - p.x;
	const dy = q.y - p.y;
	return candidates.filter((key) => {
		const c = hexToPixel(parseHexKey(key), 1);
		const corners = hexCorners(c.x, c.y, 1);
		// Cyrus-Beck clip against the hex's six edges (corners run clockwise on screen).
		let t0 = 0;
		let t1 = 1;
		for (let i = 0; i < 6; i++) {
			const a = corners[i];
			const b = corners[(i + 1) % 6];
			// Inward normal of edge a→b.
			const nx = -(b.y - a.y);
			const ny = b.x - a.x;
			const num = nx * (p.x - a.x) + ny * (p.y - a.y);
			const den = nx * dx + ny * dy;
			if (Math.abs(den) < 1e-12) {
				if (num < 0) return false;
				continue;
			}
			const t = -num / den;
			if (den > 0) t0 = Math.max(t0, t);
			else t1 = Math.min(t1, t);
			if (t0 >= t1) return false;
		}
		return t1 - t0 > 1e-9;
	});
}

/** Whether the line through these spaces is clear: nothing blocking, all on the board, one side of every shield. */
function clearLine(keys: string[], hexes: Map<string, BoardHex>): boolean {
	const planets = new Set<string>();
	for (const key of keys) {
		const h = hexes.get(key);
		if (!h || BLOCKING.some((k) => h.kinds.includes(k))) return false;
		planets.add(planetOf(h));
	}
	return planets.size <= 1;
}

/** Whether a ship on `from` has line of sight to `to` (rulebook p13). */
export function lineOfSight(board: BoardState, from: string, to: string, hexes = boardHexes(board)): boolean {
	if (!hexes.has(from) || !hexes.has(to)) return false;
	const a = parseHexKey(from);
	const b = parseHexKey(to);
	const n = hexDistance(a, b);
	if (n === 0) return clearLine([from], hexes);
	const candidates = hexesInRange(a, n + 1)
		.filter((h) => hexDistance(h, b) <= n + 1)
		.map(hexKey);
	const p = hexToPixel(a, 1);
	const q = hexToPixel(b, 1);
	// Nudge the line a hair to each side, so lines along edges or through corners
	// see both neighbouring spaces; either side being clear is enough.
	const len = Math.hypot(q.x - p.x, q.y - p.y);
	const ox = (-(q.y - p.y) / len) * 1e-6;
	const oy = ((q.x - p.x) / len) * 1e-6;
	return [1, -1].some((s) => {
		const sp = { x: p.x + s * ox, y: p.y + s * oy };
		const sq = { x: q.x + s * ox, y: q.y + s * oy };
		return clearLine(hexesOnSegment(sp, sq, candidates), hexes);
	});
}

/** Range in spaces between two board hexes (gates don't count, rulebook p10). */
export const rangeBetween = (from: string, to: string): number => hexDistance(parseHexKey(from), parseHexKey(to));

/**
 * Whether ships on `a` and `b` are adjacent: next to each other and not separated by a
 * planetary shield or entrance (rulebook p13). Asteroids and the like don't matter here.
 */
export function shipsAdjacent(board: BoardState, a: string, b: string, hexes = boardHexes(board)): boolean {
	const ha = hexes.get(a);
	const hb = hexes.get(b);
	return !!ha && !!hb && rangeBetween(a, b) === 1 && planetOf(ha) === planetOf(hb);
}

/** Whether `to` is within `min`–`max` spaces of `from` and in line of sight (an attack's target check). */
export function canTarget(board: BoardState, from: string, to: string, min: number, max: number, hexes = boardHexes(board)): boolean {
	const range = rangeBetween(from, to);
	return range >= min && range <= max && lineOfSight(board, from, to, hexes);
}

/** Every board hex within `maxRange` of `from` that it has line of sight to, with its range. */
export function visibleHexes(board: BoardState, from: string, maxRange: number): Map<string, number> {
	const hexes = boardHexes(board);
	const out = new Map<string, number>();
	for (const h of hexesInRange(parseHexKey(from), maxRange)) {
		const key = hexKey(h);
		if (key !== from && hexes.has(key) && lineOfSight(board, from, key, hexes)) out.set(key, rangeBetween(from, key));
	}
	return out;
}
