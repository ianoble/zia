import { SECTORS_BY_ID, type SpaceKind } from '../data/sectors';
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
 * Starting layout: one sector per captain in a compact cluster (centre, then
 * consecutive neighbours, which also touch each other).
 * TODO (real tiles): rotate each surrounding tile so the symbol on its shared edge
 * matches the centre tile's symbol on that edge.
 */
export function startingBoard(seats: string[]): BoardState {
	const centers: Axial[] = [{ q: 0, r: 0 }, ...SECTOR_NEIGHBOR_OFFSETS.slice(0, 4)];
	return {
		sectors: seats.map((seat, i) => ({
			tileId: `blank-${i + 1}`,
			center: centers[i],
			rotation: 0,
			ownerSeat: seat,
		})),
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
 * Ships may pass through other ships, so nothing blocks the search yet.
 * TODO: borders, stars, planetary shields once real tiles exist.
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
				if (!hexes.has(nk) || costs.has(nk)) continue;
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
