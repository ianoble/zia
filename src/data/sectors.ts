/**
 * Sector tile catalog. Each tile is 19 hexes (radius 2), addressed by local axial
 * coordinates relative to the tile's centre hex.
 *
 * Only blank placeholder tiles exist for now; real tiles (planets, borders,
 * exploration spaces, mission points) will be added once the tile data arrives.
 * Edge symbols are the same on every tile, so they live in EDGE_SYMBOLS below.
 */
import { hexesInRange, type Axial } from '../logic/hex';

export type SpaceKind = 'spawn' | 'star';

/**
 * Edge symbols printed in the middle of each side of a sector tile. Each is a short
 * line crossing the tile edge with a shape on its inner end ('line' has no shape).
 */
export type EdgeSymbol = 'bar' | 'square' | 'circle' | 'arrow' | 'cup' | 'line';

/**
 * The symbol on each side of an unrotated tile, clockwise from E (same order as
 * SECTOR_NEIGHBOR_OFFSETS / SECTOR_SLOT): E bar, SE square, SW circle, W arrow, NW cup,
 * NE line. Every tile, Nyr included, has these symbols in this order.
 */
export const EDGE_SYMBOLS: readonly EdgeSymbol[] = ['bar', 'square', 'circle', 'arrow', 'cup', 'line'];

/**
 * Where the E-side symbol sits on an unrotated tile: on the up-right edge (HEX_DIRECTIONS
 * index 5) of local hex (2, -1), the middle of the five hex edges on that side. Other
 * sides are this turned by 60° per slot.
 */
export const EDGE_SYMBOL_ANCHOR = { hex: { q: 2, r: -1 } as Axial, direction: 5 };

export interface SectorSpace {
	at: Axial;
	kind: SpaceKind;
	/** Spawn point number (1-20), used to pick where destroyed ships respawn. */
	number?: number;
}

export interface SectorTileDef {
	id: string;
	name: string;
	/** Special spaces; every other hex is open space. */
	spaces: SectorSpace[];
	placeholder?: boolean;
}

/** All 19 hexes of a tile (local coordinates). */
const ALL_HEXES: Axial[] = hexesInRange({ q: 0, r: 0 }, 2);

/** How many placeholder tiles exist. 1-5 are the starting sectors (seat order). */
export const PLACEHOLDER_COUNT = 20;

/**
 * Placeholder sectors until the real tile data arrives:
 * - 1-10: a spawn point (numbered like the tile) in the centre. 1-5 are the starting sectors.
 * - 11-17: empty space.
 * - 18-20: all star, so a Blind Jump can go wrong (a jump always lands on the new tile's
 *   rim, so a star only in the centre could never be hit).
 */
export const PLACEHOLDER_SECTORS: SectorTileDef[] = Array.from({ length: PLACEHOLDER_COUNT }, (_, i) => {
	const n = i + 1;
	const spaces: SectorSpace[] =
		n <= 10 ? [{ at: { q: 0, r: 0 }, kind: 'spawn', number: n }] : n >= 18 ? ALL_HEXES.map((at) => ({ at, kind: 'star' as const })) : [];
	return { id: `blank-${n}`, name: n >= 18 ? `Sector ${n} (star)` : `Sector ${n}`, spaces, placeholder: true };
});

/** Centre hex plus its six neighbours (local coordinates). */
const INNER_SEVEN: Axial[] = [
	{ q: 0, r: 0 },
	{ q: 1, r: 0 },
	{ q: 0, r: 1 },
	{ q: -1, r: 1 },
	{ q: -1, r: 0 },
	{ q: 0, r: -1 },
	{ q: 1, r: -1 },
];

/**
 * [Embers] Nyr: always placed in the centre of the table at setup; every captain's
 * starting sector connects to it. The inner 7 hexes are the star (can't be entered
 * or crossed). The outer ring of 12 is The Kiln's orbit path, travelled clockwise
 * (The Kiln token, docking and orbit movement come later).
 */
export const NYR_SECTOR: SectorTileDef = {
	id: 'nyr',
	name: 'Nyr',
	spaces: INNER_SEVEN.map((at) => ({ at, kind: 'star' as const })),
	placeholder: true,
};

export const SECTORS_BY_ID: Record<string, SectorTileDef> = Object.fromEntries(
	[NYR_SECTOR, ...PLACEHOLDER_SECTORS].map((s) => [s.id, s]),
);
