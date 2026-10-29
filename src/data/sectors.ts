/**
 * Sector tile catalog. Each tile is 19 hexes (radius 2), addressed by local axial
 * coordinates relative to the tile's centre hex.
 *
 * Tile names, types, spawn points, counts and features come from the tile listing.
 * Hex layouts (where planets, borders, exploration spaces and mission points sit) are
 * still placeholders. Edge symbols are the same on every tile (EDGE_SYMBOLS below).
 */
import { hexesInRange, type Axial } from '../logic/hex';

export type SpaceKind = 'spawn' | 'star' | 'exploration';

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

export type SectorType =
	| 'Lawful'
	| 'Neutral'
	| 'Outlaw'
	| 'Asteroid'
	| 'Ice Asteroid'
	| 'Gate'
	| 'Nebula'
	| 'Debris'
	| 'Star'
	| 'Anomaly'
	| 'Dead World'
	| 'Void';

export interface SectorTileDef {
	id: string;
	/** Number in the tile listing (1-32). */
	number: number;
	name: string;
	/** Abbreviation from the tile listing. */
	shortName: string;
	expansion: 'base' | 'embers';
	types: SectorType[];
	/** Spawn point number (1-19), if the tile has one. Only these can be starting sectors. */
	spawnPoint?: number;
	/** Number of exploration spaces. */
	explorationSpaces: number;
	/** Number of mission points. */
	missionPoints: number;
	/** Features as printed in the listing, e.g. "Buy P", "Merchant 4", "Mine S". Not encoded as rules yet. */
	features: string[];
	/** Special spaces; every other hex is open space. */
	spaces: SectorSpace[];
	/** True until the tile's real hex layout (where each feature sits) is entered. */
	layoutPlaceholder: boolean;
}

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

type TileRow = [
	number: number,
	name: string,
	shortName: string,
	types: string,
	spawnPoint: number | null,
	explorationSpaces: number,
	missionPoints: number,
	features: string,
];

/**
 * The sector tile listing: base game 1-21 (#24 Lost Sector is the base game's 21st
 * tile) and Embers of a Forsaken Star 21-32. Types are "/"-separated, features ";"-separated.
 */
const TILE_ROWS: TileRow[] = [
	[1, 'Neo Damascus', 'NDa', 'Neutral', 1, 1, 1, 'Buy P; Sell S; Merchant 4'],
	[2, 'Kemplar II', 'Kem', 'Lawful', 2, 1, 1, 'Buy S; Sell H; Merchant 3'],
	[3, 'Azure', 'Azu', 'Neutral', 3, 1, 1, 'Buy H; Sell T; Merchant 2'],
	[4, 'Doravin V', 'Dor', 'Neutral', 4, 1, 1, 'Buy T; Sell C; Merchant 1'],
	[5, 'Loath', 'Loa', 'Outlaw', 5, 1, 1, 'Sell Any'],
	[6, 'Lunari', 'Lun', 'Lawful', 6, 1, 1, 'Buy C; Sell P; Merchant 5'],
	[7, 'TK-421', 'TK', 'Asteroid', 7, 1, 1, ''],
	[8, 'Outpost 338', 'Out', 'Asteroid', 8, 1, 1, 'Mine S'],
	[9, 'Red Gulch', 'Red', 'Asteroid', 9, 1, 1, 'Mine T'],
	[10, 'Expedior Gate', 'Exp', 'Gate', 10, 0, 1, ''],
	[11, 'Deltus Gate', 'Del', 'Gate', 11, 0, 1, ''],
	[12, 'Vortex 86', 'Vor', 'Nebula', 12, 1, 1, ''],
	[13, 'Burning Horse', 'Bur', 'Nebula', 13, 1, 1, 'Harvest H'],
	[14, 'Lower Stratus', 'Low', 'Nebula', 14, 1, 1, 'Harvest P'],
	[15, 'Pelmont', 'Pel', 'Debris', 15, 1, 1, 'Salvage C'],
	[16, 'The Keep', 'Kee', 'Debris', 16, 1, 1, ''],
	[17, 'Kreller IV', 'Kre', 'Debris', 17, 1, 1, 'Salvage C'],
	[18, "Smugglers' Den", 'Smu', 'Outlaw', 18, 1, 1, 'Buy Any'],
	[19, 'Tigris Gate', 'Tgr', 'Gate', 19, 0, 1, 'Malfunctioning'],
	[20, 'Xia', 'Xia', 'Star', null, 0, 0, ''],
	[21, 'Tig / The Brink', 'Tig', 'Neutral/Anomaly', null, 1, 1, 'Anomaly'],
	[22, 'Kei / The Chasm', 'Kei', 'Outlaw/Anomaly', null, 1, 1, 'Trade; Anomaly'],
	[23, 'Blench', 'Ble', 'Ice Asteroid', null, 1, 1, 'Quarry E; Comet'],
	[24, 'Lost Sector', 'Los', 'Void', null, 0, 0, ''],
	[25, 'The Grinder', 'Gri', 'Ice Asteroid', null, 1, 1, 'Quarry E; Comet'],
	[26, 'Neo Vostok', 'NVo', 'Ice Asteroid', null, 1, 1, 'Comet'],
	[27, 'Calakus', 'Cal', 'Dead World', null, 1, 1, 'Excavate Relic (3)'],
	[28, 'Nyr', 'Nyr', 'Star', null, 0, 0, ''],
	[29, 'Tafjur', 'Taf', 'Dead World', null, 1, 1, 'Excavate Relic (3)'],
	[30, 'Ruins of Drelmoth', 'Rui', 'Dead World', null, 1, 1, 'Excavate Relic (4)'],
	[31, 'Samara Gate', 'Sam', 'Gate', null, 0, 1, ''],
	[32, "Ferren's Call", 'Fer', 'Anomaly', null, 2, 1, 'Anomaly'],
];

const slug = (name: string) =>
	name
		.toLowerCase()
		.replace(/^the /, '')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');

/**
 * Placeholder layout until the real one is entered: a spawn point in the centre for
 * tiles that have one, exploration spaces next to it, and the inner 7 hexes as star for
 * star tiles.
 */
function placeholderSpaces(types: SectorType[], spawnPoint: number | undefined, explorationSpaces: number): SectorSpace[] {
	if (types.includes('Star')) return INNER_SEVEN.map((at) => ({ at, kind: 'star' as const }));
	const spaces: SectorSpace[] = [];
	if (spawnPoint != null) spaces.push({ at: { q: 0, r: 0 }, kind: 'spawn', number: spawnPoint });
	PLACEHOLDER_EXPLORATION_HEXES.slice(0, explorationSpaces).forEach((at) => spaces.push({ at, kind: 'exploration' }));
	return spaces;
}

/**
 * Real tile layouts, by tile number, as they're entered.
 * - 20 Xia: the whole tile is the star. No space can be entered; a ship that Blind Jumps
 *   into it is destroyed.
 * - 28 Nyr: the inner 7 hexes are the star; the outer ring is The Kiln's orbit path.
 */
const KNOWN_LAYOUTS: Record<number, SectorSpace[]> = {
	20: hexesInRange({ q: 0, r: 0 }, 2).map((at) => ({ at, kind: 'star' })),
	28: INNER_SEVEN.map((at) => ({ at, kind: 'star' })),
};

/** Where placeholder exploration spaces go: just above, then just below, the centre. */
const PLACEHOLDER_EXPLORATION_HEXES: Axial[] = [
	{ q: 0, r: -1 },
	{ q: 0, r: 1 },
];

export const SECTOR_TILES: SectorTileDef[] = TILE_ROWS.map(([number, name, shortName, types, spawn, exploration, missions, features]) => {
	const typeList = types.split('/') as SectorType[];
	const spawnPoint = spawn ?? undefined;
	return {
		id: number === 28 ? 'nyr' : slug(name.split(' / ')[0]),
		number,
		name,
		shortName,
		expansion: number >= 21 && number !== 24 ? 'embers' : 'base',
		types: typeList,
		...(spawnPoint != null ? { spawnPoint } : {}),
		explorationSpaces: exploration,
		missionPoints: missions,
		features: features ? features.split(';').map((f) => f.trim()) : [],
		spaces: KNOWN_LAYOUTS[number] ?? placeholderSpaces(typeList, spawnPoint, exploration),
		layoutPlaceholder: !(number in KNOWN_LAYOUTS),
	};
});

/**
 * [Embers] Nyr: always placed in the centre of the table at setup; every captain's
 * starting sector connects to it. The inner 7 hexes are the star (can't be entered
 * or crossed). The outer ring of 12 is The Kiln's orbit path, travelled clockwise
 * (The Kiln token, docking and orbit movement come later).
 */
export const NYR_SECTOR: SectorTileDef = SECTOR_TILES.find((t) => t.id === 'nyr')!;

/** Tiles that can be starting sectors (they have a spawn point). */
export const STARTING_CANDIDATES: SectorTileDef[] = SECTOR_TILES.filter((t) => t.spawnPoint != null);

export const SECTORS_BY_ID: Record<string, SectorTileDef> = Object.fromEntries(SECTOR_TILES.map((s) => [s.id, s]));
