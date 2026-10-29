import { NYR_SECTOR, SECTORS_BY_ID, type SpaceKind } from '../data/sectors';
import { addHex, hexKey, hexNeighbors, parseHexKey, rotateHex, SECTOR_NEIGHBOR_OFFSETS, sectorHexes, type Axial } from './hex';

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

/**
 * Rotation for a tile placed against another. Every tile carries the same edge symbols
 * in the same order, and only the shared edge has to match (same symbol on both sides),
 * so the new tile always sits turned 180° from the tile it attaches to.
 */
export const matchedRotation = (neighbourRotation: number): number => (neighbourRotation + 3) % 6;

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
				rotation: matchedRotation(nyrRotation),
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
