/**
 * Hex layouts of the base game sector tiles, transcribed from photos of the printed
 * tiles (tile upright, name at the top, arrow symbol on the left = rotation 0).
 *
 * Each layout is five columns, left to right (q = -2 … 2), each listing its hexes top
 * to bottom (3, 4, 5, 4, 3 hexes). A hex is a run of codes ('.' for open space):
 *   S spawn point   E exploration space   M mission point
 *   P planet (inside the planetary shield)   B buy space   L sell space
 *   A asteroid   D debris   N nebula   G gate
 *   H harvest   V salvage   X mining
 *
 * Planetary entrances (the dashed part of a shield) are in PLANET_ENTRANCES.
 */
import type { Axial } from '../logic/hex';

export type LayoutCode = 'S' | 'E' | 'M' | 'P' | 'B' | 'L' | 'A' | 'D' | 'N' | 'G' | 'H' | 'V' | 'X';

/** By tile number. */
export const TILE_LAYOUTS: Record<number, [string, string, string, string, string]> = {
	1: ['. . S', '. P PB .', '. PM P P .', '. P PL .', '. . E'], // Neo Damascus
	2: ['. . S', '. P P .', '. PB P PL .', 'PM P P P', 'P P PE'], // Kemplar II
	3: ['PM P PE', 'P PB P P', '. P P PL .', '. P P S', '. . .'], // Azure
	4: ['. . .', '. P P .', '. PB P P .', 'S PM PL .', '. . E'], // Doravin V
	5: ['. . .', '. P P .', '. P P PL S', 'P P P PE', 'PM P P'], // Loath
	6: ['P P PE', 'P P PL P', '. PB P PM .', '. P P .', '. . S'], // Lunari
	7: ['. AE .', '. . A S', '. A M A .', 'A . A .', 'A . .'], // TK-421
	8: ['A . .', 'A X A A', '. A . M A', '. . A .', 'AE A S'], // Outpost 338
	9: ['S . .', '. A A .', 'AE . X A A', '. A A .', '. . M'], // Red Gulch
	10: ['. . .', '. M . .', '. G G . .', '. G . .', '. . S'], // Expedior Gate
	11: ['. . S', '. . . .', '. . G G .', '. M G .', '. . .'], // Deltus Gate
	12: ['. . .', 'N N N N', '. N NM N .', '. N N .', 'S NE .'], // Vortex 86
	13: ['S . .', 'N N . N', 'N N N N .', 'N NH N NE', 'NM N N'], // Burning Horse
	14: ['NM N N', 'N N NE N', 'N N NH N .', 'N N N .', '. . S'], // Lower Stratus
	15: ['D . D', 'D S D DE', '. D . M .', '. V D D', 'D . D'], // Pelmont
	16: ['D . .', 'D M D .', '. . D . D', '. DE S D', 'D D .'], // The Keep
	17: ['. . D', '. D M D', '. D V . S', '. D . D', 'D . DE'], // Kreller IV
	18: ['AE A S', '. . A .', '. A P PM A', '. P P A', 'A PB A'], // Smugglers' Den
	19: ['D D D', 'D . . .', '. . G G S', '. D G .', 'D M D'], // Tigris Gate
	24: ['. . .', '. . . .', '. . . . .', '. . . .', '. . .'], // Lost Sector (void)
};

/** Hex sides of a flat-top hex, as HEX_DIRECTIONS indexes. */
export const HEX_SIDE = { SE: 0, S: 1, SW: 2, NW: 3, N: 4, NE: 5 } as const;
export type HexSide = keyof typeof HEX_SIDE;

/**
 * Which way each planet's entrance faces, by tile number (tile upright). The entrance is
 * the single shield edge furthest out that way (see entranceEdge in sectors.ts).
 * From the captain's notes; Loath's matches the photo. Smugglers' Den: not known yet.
 */
export const PLANET_ENTRANCES: Record<number, HexSide> = {
	1: 'NW', // Neo Damascus
	2: 'NW', // Kemplar II
	3: 'NE', // Azure
	4: 'NW', // Doravin V
	5: 'NW', // Loath
	6: 'NE', // Lunari
};

/** The hexes of a layout with their codes, in local coordinates. */
export function parseLayout(columns: readonly string[]): { at: Axial; codes: LayoutCode[] }[] {
	const out: { at: Axial; codes: LayoutCode[] }[] = [];
	columns.forEach((col, i) => {
		const q = i - 2;
		const top = Math.max(-2, -2 - q);
		col.trim()
			.split(/\s+/)
			.forEach((cell, j) => {
				const codes = cell === '.' ? [] : ([...cell] as LayoutCode[]);
				out.push({ at: { q, r: top + j }, codes });
			});
	});
	return out;
}
