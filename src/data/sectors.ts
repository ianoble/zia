/**
 * Sector tile catalog. Each tile is 19 hexes (radius 2), addressed by local axial
 * coordinates relative to the tile's centre hex.
 *
 * Only blank placeholder tiles exist for now; real tiles (planets, borders, edge
 * symbols, exploration spaces, mission points) will be added once the tile data arrives.
 */
import type { Axial } from '../logic/hex';

export type SpaceKind = 'spawn';

export interface SectorSpace {
	at: Axial;
	kind: SpaceKind;
}

export interface SectorTileDef {
	id: string;
	name: string;
	/** Special spaces; every other hex is open space. */
	spaces: SectorSpace[];
	placeholder?: boolean;
}

/** Blank sectors with a single spawn point in the centre (placeholders). */
export const PLACEHOLDER_SECTORS: SectorTileDef[] = [1, 2, 3, 4, 5].map((n) => ({
	id: `blank-${n}`,
	name: `Sector ${n}`,
	spaces: [{ at: { q: 0, r: 0 }, kind: 'spawn' }],
	placeholder: true,
}));

export const SECTORS_BY_ID: Record<string, SectorTileDef> = Object.fromEntries(PLACEHOLDER_SECTORS.map((s) => [s.id, s]));
