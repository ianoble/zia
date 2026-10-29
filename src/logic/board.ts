import { EDGE_SYMBOL_ANCHOR, EDGE_SYMBOLS, NYR_SECTOR, SECTORS_BY_ID, type EdgeSymbol, type SpaceKind } from '../data/sectors';
import {
	addHex,
	hexKey,
	hexNeighbors,
	parseHexKey,
	rotateHex,
	SECTOR_NEIGHBOR_OFFSETS,
	sectorHexes,
	sectorSlotOf,
	type Axial,
} from './hex';

export interface PlacedSector {
	tileId: string;
	/** Board hex of the tile's centre. */
	center: Axial;
	/** 60° clockwise turns. */
	rotation: number;
	/** Seat whose starting sector this is (setup only). */
	ownerSeat?: string;
}

export interface BoardState {
	sectors: PlacedSector[];
}

export interface BoardHex {
	key: string;
	hex: Axial;
	sectorIndex: number;
	kind: SpaceKind | null;
}

/**
 * Neighbour slots around a sector, by compass direction on screen, as indexes into
 * SECTOR_NEIGHBOR_OFFSETS: E 0, SE 1, SW 2, W 3, NW 4, NE 5.
 */
export const SECTOR_SLOT = { E: 0, SE: 1, SW: 2, W: 3, NW: 4, NE: 5 } as const;

/**
 * Where the starting sectors go around Nyr, in placement order, from the rulebook's
 * "Setup using Nyr" diagrams (p3). The rulebook has no 2-player diagram; opposite
 * sides are used for now.
 */
export const NYR_STARTING_SLOTS: Record<number, number[]> = {
	2: [SECTOR_SLOT.W, SECTOR_SLOT.E],
	3: [SECTOR_SLOT.W, SECTOR_SLOT.NE, SECTOR_SLOT.SE],
	4: [SECTOR_SLOT.W, SECTOR_SLOT.NW, SECTOR_SLOT.E, SECTOR_SLOT.SE],
	5: [SECTOR_SLOT.W, SECTOR_SLOT.NW, SECTOR_SLOT.NE, SECTOR_SLOT.E, SECTOR_SLOT.SE],
};

const mod6 = (n: number) => ((n % 6) + 6) % 6;

/** The symbol a sector with `rotation` shows on its side facing neighbour slot `slot`. */
export const edgeSymbolFacing = (rotation: number, slot: number): EdgeSymbol => EDGE_SYMBOLS[mod6(slot - rotation)];

/**
 * Rotation for a new tile so that its side facing `facingSlot` shows `symbol`
 * (the symbol on the explorer's side of the shared edge).
 */
export function rotationShowing(symbol: EdgeSymbol, facingSlot: number): number {
	const local = EDGE_SYMBOLS.indexOf(symbol);
	if (local < 0) throw new Error(`Unknown edge symbol ${symbol}`);
	return mod6(facingSlot - local);
}

/**
 * Rotation for a tile placed against a tile with `neighbourRotation`. Every tile carries
 * the same edge symbols in the same order, so matching the shared edge always turns the
 * new tile 180° from its neighbour, whichever side it goes on.
 */
export const matchedRotation = (neighbourRotation: number): number => mod6(neighbourRotation + 3);

/**
 * Where a newly explored tile goes when a ship leaves sector `fromIndex` through its side
 * facing `slot`: the neighbouring position, turned so its edge symbol matches.
 * Returns null if a sector is already there.
 */
export function explorePlacement(board: BoardState, fromIndex: number, slot: number): { center: Axial; rotation: number } | null {
	const from = board.sectors[fromIndex];
	const center = addHex(from.center, SECTOR_NEIGHBOR_OFFSETS[mod6(slot)]);
	if (board.sectors.some((s) => s.center.q === center.q && s.center.r === center.r)) return null;
	const symbol = edgeSymbolFacing(from.rotation, slot);
	return { center, rotation: rotationShowing(symbol, mod6(slot + 3)) };
}

/**
 * The side of `fromKey`'s sector that a step from `fromKey` to the adjacent `toKey`
 * crosses, as a neighbour slot, or null if both hexes are in the same sector.
 */
export function slotCrossed(board: BoardState, fromKey: string, toKey: string): { sectorIndex: number; slot: number } | null {
	const from = boardHexes(board).get(fromKey);
	if (!from) return null;
	const center = board.sectors[from.sectorIndex].center;
	const slot = sectorSlotOf(center, parseHexKey(toKey));
	return slot < 0 ? null : { sectorIndex: from.sectorIndex, slot };
}

export interface EdgeSymbolMark {
	sectorIndex: number;
	/** Board-direction slot of the side it's on. */
	slot: number;
	symbol: EdgeSymbol;
	/** Board hex (inside the sector) whose edge carries the symbol. */
	hex: Axial;
	/** HEX_DIRECTIONS index of that edge, pointing out of the sector. */
	direction: number;
}

/** The six edge symbols of every placed sector, in board coordinates. */
export function edgeSymbolMarks(board: BoardState): EdgeSymbolMark[] {
	return board.sectors.flatMap((s, sectorIndex) =>
		EDGE_SYMBOLS.map((symbol, local) => {
			const turns = local + s.rotation;
			return {
				sectorIndex,
				slot: mod6(turns),
				symbol,
				hex: addHex(s.center, rotateHex(EDGE_SYMBOL_ANCHOR.hex, turns)),
				direction: mod6(EDGE_SYMBOL_ANCHOR.direction + turns),
			};
		}),
	);
}

/**
 * Starting layout (Embers): Nyr in the centre, then one starting sector per captain in
 * the rulebook's positions, each rotated so its edge symbol matches Nyr's.
 * Captains get sectors in seat order (seat 1 → sector 1, …).
 */
export function startingBoard(seats: string[]): BoardState {
	const slots = NYR_STARTING_SLOTS[seats.length] ?? NYR_STARTING_SLOTS[5];
	const nyrRotation = 0;
	return {
		sectors: [
			{ tileId: NYR_SECTOR.id, center: { q: 0, r: 0 }, rotation: nyrRotation },
			...seats.map((seat, i) => ({
				tileId: `blank-${i + 1}`,
				center: SECTOR_NEIGHBOR_OFFSETS[slots[i]],
				rotation: rotationShowing(edgeSymbolFacing(nyrRotation, slots[i]), (slots[i] + 3) % 6),
				ownerSeat: seat,
			})),
		],
	};
}

/** Every hex on the board, keyed "q,r". */
export function boardHexes(board: BoardState): Map<string, BoardHex> {
	const map = new Map<string, BoardHex>();
	board.sectors.forEach((s, sectorIndex) => {
		const def = SECTORS_BY_ID[s.tileId];
		const special = new Map<string, SpaceKind>();
		for (const sp of def?.spaces ?? []) special.set(hexKey(addHex(s.center, rotateHex(sp.at, s.rotation))), sp.kind);
		for (const hex of sectorHexes(s.center)) {
			const key = hexKey(hex);
			map.set(key, { key, hex, sectorIndex, kind: special.get(key) ?? null });
		}
	});
	return map;
}

/** The spawn hex of a seat's starting sector. */
export function startingSpawnFor(board: BoardState, seat: string): string | null {
	const index = board.sectors.findIndex((s) => s.ownerSeat === seat);
	if (index < 0) return null;
	for (const h of boardHexes(board).values()) {
		if (h.sectorIndex === index && h.kind === 'spawn') return h.key;
	}
	return null;
}

/**
 * Movement cost (1 per hex) from `from` to every board hex reachable within `maxCost`.
 * Ships may pass through other ships. Stars can't be entered for now (the real rule,
 * destruction, comes with the hazard rules).
 * TODO: borders and planetary shields once real tiles exist.
 */
export function movementCosts(board: BoardState, from: string, maxCost: number): Map<string, number> {
	const hexes = boardHexes(board);
	const costs = new Map<string, number>([[from, 0]]);
	let frontier = [from];
	for (let cost = 1; cost <= maxCost && frontier.length; cost++) {
		const next: string[] = [];
		for (const key of frontier) {
			for (const n of hexNeighbors(parseHexKey(key))) {
				const nk = hexKey(n);
				const target = hexes.get(nk);
				if (!target || target.kind === 'star' || costs.has(nk)) continue;
				costs.set(nk, cost);
				next.push(nk);
			}
		}
		frontier = next;
	}
	return costs;
}

/** Hexes a ship can end its move on: within movement, not its own hex, not occupied. */
export function reachableHexes(board: BoardState, from: string, movement: number, occupied: Set<string>): Map<string, number> {
	const out = new Map<string, number>();
	for (const [key, cost] of movementCosts(board, from, movement)) {
		if (key !== from && !occupied.has(key)) out.set(key, cost);
	}
	return out;
}
