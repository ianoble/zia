/**
 * Hex maths for the drift system board. Flat-top hexes in axial coordinates (q = column, r).
 * Matches the sector SVGs: hex circumradius 100, columns 150 apart.
 * Hex keys are "q,r".
 */

export interface Axial {
	q: number;
	r: number;
}

export const hexKey = (h: Axial): string => `${h.q},${h.r}`;

export function parseHexKey(key: string): Axial {
	const [q, r] = key.split(',').map(Number);
	return { q, r };
}

export const addHex = (a: Axial, b: Axial): Axial => ({ q: a.q + b.q, r: a.r + b.r });

/** The six neighbour directions, clockwise from "down-right" for flat-top hexes. */
export const HEX_DIRECTIONS: Axial[] = [
	{ q: 1, r: 0 },
	{ q: 0, r: 1 },
	{ q: -1, r: 1 },
	{ q: -1, r: 0 },
	{ q: 0, r: -1 },
	{ q: 1, r: -1 },
];

export const hexNeighbors = (h: Axial): Axial[] => HEX_DIRECTIONS.map((d) => addHex(h, d));

export function hexDistance(a: Axial, b: Axial): number {
	const dq = a.q - b.q;
	const dr = a.r - b.r;
	return Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr));
}

/** Rotate around the origin by 60° clockwise, `times` times. */
export function rotateHex(h: Axial, times: number): Axial {
	let q = h.q;
	let r = h.r;
	for (let i = 0; i < ((times % 6) + 6) % 6; i++) {
		const s = -q - r;
		[q, r] = [-r, -s];
	}
	// `|| 0` turns -0 into 0 so keys and equality stay clean.
	return { q: q || 0, r: r || 0 };
}

/** All hexes within `radius` of `center`. */
export function hexesInRange(center: Axial, radius: number): Axial[] {
	const out: Axial[] = [];
	for (let q = -radius; q <= radius; q++) {
		for (let r = Math.max(-radius, -q - radius); r <= Math.min(radius, -q + radius); r++) {
			out.push({ q: center.q + q, r: center.r + r });
		}
	}
	return out;
}

/** Pixel centre of a hex (flat-top), for hex circumradius `size`. */
export function hexToPixel(h: Axial, size: number): { x: number; y: number } {
	return { x: size * 1.5 * h.q, y: size * Math.sqrt(3) * (h.r + h.q / 2) };
}

/** Corner points of a flat-top hex at pixel centre (x, y). */
export function hexCorners(x: number, y: number, size: number): { x: number; y: number }[] {
	return Array.from({ length: 6 }, (_, i) => {
		const a = (Math.PI / 180) * (60 * i);
		return { x: x + size * Math.cos(a), y: y + size * Math.sin(a) };
	});
}

// ---------------------------------------------------------------------------
// Sectors: 19-hex tiles (radius 2), as in sector_19_spaces.svg
// ---------------------------------------------------------------------------

export const SECTOR_RADIUS = 2;

/**
 * Offsets from one sector's centre hex to each of its six neighbouring sectors' centres.
 * Radius-2 hexagons tile the plane with centres 5 apart, e.g. (q 5, r -2).
 */
export const SECTOR_NEIGHBOR_OFFSETS: Axial[] = Array.from({ length: 6 }, (_, i) => rotateHex({ q: 5, r: -2 }, i));

export const sectorHexes = (center: Axial): Axial[] => hexesInRange(center, SECTOR_RADIUS);
