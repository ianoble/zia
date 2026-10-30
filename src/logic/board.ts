import { EDGE_SYMBOL_ANCHOR, EDGE_SYMBOLS, NYR_SECTOR, SECTOR_TILES, SECTORS_BY_ID, STARTING_CANDIDATES, type EdgeSymbol, type SectorSpace, type SpaceKind } from '../data/sectors';
import {
	addHex,
	HEX_DIRECTIONS,
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
	/** The space's main role for the rules so far: star, spawn point or exploration space. */
	kind: PrimaryKind | null;
	/** Everything on the space (planet, asteroid, mission point, buy space, …). */
	kinds: SpaceKind[];
	/** Spawn point number, for spawn spaces that have one. */
	spawnNumber?: number;
}

/**
 * Neighbour slots around a sector, by compass direction on screen, as indexes into
 * SECTOR_NEIGHBOR_OFFSETS: E 0, SE 1, SW 2, W 3, NW 4, NE 5.
 */
export const SECTOR_SLOT = { E: 0, SE: 1, SW: 2, W: 3, NW: 4, NE: 5 } as const;

/** Compass names of the neighbour slots, by index. */
export const SLOT_NAMES = ['E', 'SE', 'SW', 'W', 'NW', 'NE'] as const;

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
 * Deal starting sectors (rulebook p3): one per captain from the shuffled deck, re-drawing
 * any tile without a spawn point, which comes to a random pick among tiles with one.
 * `die(n)` returns 1..n.
 */
export function dealStartingTiles(count: number, die: (sides: number) => number): string[] {
	const pool = STARTING_CANDIDATES.map((t) => t.id);
	return Array.from({ length: count }, () => pool.splice(die(pool.length) - 1, 1)[0]);
}

/**
 * Starting layout (Embers): Nyr in the centre, then one starting sector per captain in
 * the rulebook's positions, each rotated so its edge symbol matches Nyr's.
 * Captains get `tileIds` in seat order; by default the lowest-numbered spawn tiles.
 */
export function startingBoard(seats: string[], tileIds: string[] = STARTING_CANDIDATES.map((t) => t.id)): BoardState {
	const slots = NYR_STARTING_SLOTS[seats.length] ?? NYR_STARTING_SLOTS[5];
	const nyrRotation = 0;
	return {
		sectors: [
			{ tileId: NYR_SECTOR.id, center: { q: 0, r: 0 }, rotation: nyrRotation },
			...seats.map((seat, i) => ({
				tileId: tileIds[i],
				center: SECTOR_NEIGHBOR_OFFSETS[slots[i]],
				rotation: rotationShowing(edgeSymbolFacing(nyrRotation, slots[i]), (slots[i] + 3) % 6),
				ownerSeat: seat,
			})),
		],
	};
}

/** The Tigris gate is damaged: it sends ships to a random spawn point and can't be a destination. */
export const TIGRIS_GATE = 'tigris-gate';

/**
 * Gate spaces a ship on `from` can travel to with Use Gate (rulebook p10): any space on
 * another gate (not the Tigris gate). Empty if `from` isn't a gate space.
 */
export function gateDestinations(board: BoardState, from: string): string[] {
	const hexes = boardHexes(board);
	const here = hexes.get(from);
	if (!here?.kinds.includes('gate')) return [];
	return [...hexes.values()]
		.filter((h) => h.kinds.includes('gate') && h.sectorIndex !== here.sectorIndex && board.sectors[h.sectorIndex].tileId !== TIGRIS_GATE)
		.map((h) => h.key);
}

/** Whether `hex` is a space of the Tigris gate. */
export function onTigrisGate(board: BoardState, hex: string): boolean {
	const h = boardHexes(board).get(hex);
	return !!h?.kinds.includes('gate') && board.sectors[h.sectorIndex].tileId === TIGRIS_GATE;
}

/** Planetary entrances on the board: board hex and HEX_DIRECTIONS side, keyed "q,r:dir". */
export function planetEntrances(board: BoardState): Set<string> {
	const out = new Set<string>();
	for (const s of board.sectors) {
		const e = SECTORS_BY_ID[s.tileId]?.entrance;
		if (!e) continue;
		const hex = addHex(s.center, rotateHex(e.at, s.rotation));
		out.add(`${hexKey(hex)}:${(e.direction + s.rotation) % 6}`);
	}
	return out;
}

/** Kinds the rules act on so far, in priority order, for BoardHex.kind. */
const PRIMARY_KINDS = ['star', 'spawn', 'exploration'] as const;
export type PrimaryKind = (typeof PRIMARY_KINDS)[number];

/** Every hex on the board, keyed "q,r". */
export function boardHexes(board: BoardState): Map<string, BoardHex> {
	const map = new Map<string, BoardHex>();
	board.sectors.forEach((s, sectorIndex) => {
		const def = SECTORS_BY_ID[s.tileId];
		const special = new Map<string, SectorSpace[]>();
		for (const sp of def?.spaces ?? []) {
			const key = hexKey(addHex(s.center, rotateHex(sp.at, s.rotation)));
			special.set(key, [...(special.get(key) ?? []), sp]);
		}
		for (const hex of sectorHexes(s.center)) {
			const key = hexKey(hex);
			const spaces = special.get(key) ?? [];
			const kinds = spaces.map((sp) => sp.kind);
			const kind = PRIMARY_KINDS.find((k) => kinds.includes(k)) ?? null;
			const spawnNumber = spaces.find((sp) => sp.kind === 'spawn')?.number;
			map.set(key, { key, hex, sectorIndex, kind, kinds, ...(spawnNumber != null ? { spawnNumber } : {}) });
		}
	});
	return map;
}

/** Sector tiles left to explore: every tile not on the board (Nyr is always placed). */
export function startingDeck(board: BoardState): string[] {
	const placed = new Set(board.sectors.map((s) => s.tileId));
	return SECTOR_TILES.map((t) => t.id).filter((id) => !placed.has(id));
}

export interface UnexploredEdge {
	/** Index of the sector the ship is in. */
	sectorIndex: number;
	/** Side of that sector the edge is on (neighbour slot). */
	slot: number;
	/** The off-board hex across the edge (a Blind Jump destination). */
	target: string;
}

/**
 * Unexplored edges next to a hex: each neighbouring space that isn't on the board yet.
 * A ship here can Scan through any of their sides or Blind Jump into any target.
 */
export function unexploredEdges(board: BoardState, fromKey: string): UnexploredEdge[] {
	const hexes = boardHexes(board);
	if (!hexes.has(fromKey)) return [];
	const out: UnexploredEdge[] = [];
	for (const n of hexNeighbors(parseHexKey(fromKey))) {
		const target = hexKey(n);
		if (hexes.has(target)) continue;
		const crossed = slotCrossed(board, fromKey, target);
		if (crossed) out.push({ ...crossed, target });
	}
	return out;
}

/** Numbered spawn points on the board, keyed by hex. */
export function spawnPoints(board: BoardState): { key: string; number: number }[] {
	return [...boardHexes(board).values()].filter((h) => h.kind === 'spawn' && h.spawnNumber != null).map((h) => ({ key: h.key, number: h.spawnNumber! }));
}

/**
 * Respawn hex for a d20 roll (rulebook p15): the unoccupied spawn point whose number is
 * closest to the roll; ties go to the higher number. (On a 20 the captain may choose;
 * for now that also takes the closest.)
 */
export function respawnHex(board: BoardState, roll: number, occupied: Set<string>): string | null {
	const free = spawnPoints(board).filter((p) => !occupied.has(p.key));
	if (!free.length) return null;
	free.sort((a, b) => Math.abs(a.number - roll) - Math.abs(b.number - roll) || b.number - a.number);
	return free[0].key;
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

/** A border that makes a ship roll a d20 when crossed (rulebook p10, p20). */
export type BorderKind = 'shield' | 'asteroid' | 'debris' | 'nebula';

export interface StepCrossing {
	/** Borders crossed by this one-space step, in the order they're resolved. */
	borders: BorderKind[];
	/** An innocent ship using an Outlaw planet's entrance gets +1,000 bounty. */
	entranceBounty: boolean;
}

/** Planet alignment from the tile's types. */
function planetAlignment(board: BoardState, sectorIndex: number): 'lawful' | 'outlaw' | 'neutral' {
	const types = SECTORS_BY_ID[board.sectors[sectorIndex]?.tileId]?.types ?? [];
	return types.includes('Lawful') ? 'lawful' : types.includes('Outlaw') ? 'outlaw' : 'neutral';
}

/**
 * The borders a ship crosses stepping from `from` to the adjacent `to` (rulebook p10, p20):
 * - Planetary shield, entering or exiting, unless through the entrance. Outlaws can't use
 *   a Lawful planet's entrance to get in (they may leave by it).
 * - Asteroid and debris: entering any asteroid / debris space (each space has its own border).
 * - Nebula: entering it from outside; moving around inside is free.
 * Exiting an asteroid, debris field or nebula needs no roll.
 */
export function stepCrossing(board: BoardState, from: string, to: string, outlaw: boolean, hexes = boardHexes(board)): StepCrossing {
	const a = hexes.get(from);
	const b = hexes.get(to);
	const out: StepCrossing = { borders: [], entranceBounty: false };
	if (!a || !b) return out;
	const dir = HEX_DIRECTIONS.findIndex((d) => hexKey(addHex(a.hex, d)) === to);
	const entrances = planetEntrances(board);
	const aPlanet = a.kinds.includes('planet');
	const bPlanet = b.kinds.includes('planet');
	const samePlanet = aPlanet && bPlanet && a.sectorIndex === b.sectorIndex;

	const shieldCrossing = (planetHex: BoardHex, side: number, entering: boolean) => {
		if (!entrances.has(`${planetHex.key}:${side}`)) return out.borders.push('shield');
		const alignment = planetAlignment(board, planetHex.sectorIndex);
		if (alignment === 'lawful' && outlaw && entering) return out.borders.push('shield');
		if (alignment === 'outlaw' && !outlaw) out.entranceBounty = true;
	};
	if (aPlanet && !samePlanet) shieldCrossing(a, dir, false);
	if (bPlanet && !samePlanet) shieldCrossing(b, (dir + 3) % 6, true);
	if (b.kinds.includes('asteroid')) out.borders.push('asteroid');
	if (b.kinds.includes('debris')) out.borders.push('debris');
	if (b.kinds.includes('nebula') && !(a.kinds.includes('nebula') && a.sectorIndex === b.sectorIndex)) out.borders.push('nebula');
	return out;
}

/**
 * The hexes a ship flies through from `from` to `to` (excluding `from`, including `to`),
 * along a shortest path. Among equally short paths it takes the one crossing the fewest
 * borders (see stepCrossing), then the one through the most `prefer` hexes (face-down
 * exploration tokens, which are collected on the way). Returns null if out of reach.
 */
export function movePath(
	board: BoardState,
	from: string,
	to: string,
	maxCost: number,
	prefer: Set<string> = new Set(),
	outlaw = false,
): string[] | null {
	const costs = movementCosts(board, from, maxCost);
	if (costs.get(to) == null) return null;
	const hexes = boardHexes(board);
	const stepScore = (a: string, b: string) => 1000 * stepCrossing(board, a, b, outlaw, hexes).borders.length - (prefer.has(b) ? 1 : 0);
	// Lowest score (borders first, then fewest tokens missed) on a shortest path to each hex.
	const best = new Map<string, number>([[from, 0]]);
	const byCost = [...costs.entries()].sort((a, b) => a[1] - b[1]);
	const preds = (key: string, cost: number) =>
		hexNeighbors(parseHexKey(key))
			.map(hexKey)
			.filter((nk) => costs.get(nk) === cost - 1);
	for (const [key, cost] of byCost) {
		if (key === from) continue;
		best.set(key, Math.min(...preds(key, cost).map((nk) => best.get(nk)! + stepScore(nk, key))));
	}
	// Walk back from the target, always to a predecessor that keeps the best score.
	const path = [to];
	let key = to;
	while (key !== from) {
		const cost = costs.get(key)!;
		const prev = preds(key, cost).find((nk) => best.get(nk)! + stepScore(nk, key) === best.get(key))!;
		if (prev !== from) path.unshift(prev);
		key = prev;
	}
	return path;
}

/** How many border rolls the route to `to` would take (0 if none or out of reach). */
export function routeBorders(board: BoardState, from: string, to: string, maxCost: number, prefer: Set<string>, outlaw: boolean): number {
	const path = movePath(board, from, to, maxCost, prefer, outlaw);
	if (!path) return 0;
	const hexes = boardHexes(board);
	let at = from;
	let n = 0;
	for (const h of path) {
		n += stepCrossing(board, at, h, outlaw, hexes).borders.length;
		at = h;
	}
	return n;
}

/** Hexes a ship can end its move on: within movement, not its own hex, not occupied. */
export function reachableHexes(board: BoardState, from: string, movement: number, occupied: Set<string>): Map<string, number> {
	const out = new Map<string, number>();
	for (const [key, cost] of movementCosts(board, from, movement)) {
		if (key !== from && !occupied.has(key)) out.set(key, cost);
	}
	return out;
}

/** The entrance of the planet the ship is on: the planet hex it's on, and the board hex just outside. */
export function planetEntranceOf(board: BoardState, at: string, hexes = boardHexes(board)): { inside: string; outside: string } | null {
	const h = hexes.get(at);
	if (!h?.kinds.includes('planet')) return null;
	for (const e of planetEntrances(board)) {
		const [key, dir] = e.split(':');
		const inner = hexes.get(key);
		if (!inner || inner.sectorIndex !== h.sectorIndex) continue;
		const outside = hexKey(addHex(inner.hex, HEX_DIRECTIONS[Number(dir)]));
		const o = hexes.get(outside);
		return o && o.kind !== 'star' ? { inside: key, outside } : null;
	}
	return null;
}

/**
 * Would the usual route (movePath) from a planet to `to` leave it through the planetary
 * shield rather than the entrance? Then the captain is asked which way to go.
 */
export function leavesThroughShield(board: BoardState, from: string, to: string, maxCost: number, prefer: Set<string>, outlaw: boolean): boolean {
	const hexes = boardHexes(board);
	const start = hexes.get(from);
	if (!start?.kinds.includes('planet')) return false;
	const path = movePath(board, from, to, maxCost, prefer, outlaw);
	if (!path) return false;
	const entrances = planetEntrances(board);
	let at = from;
	for (const k of path) {
		const b = hexes.get(k);
		if (!(b?.kinds.includes('planet') && b.sectorIndex === start.sectorIndex)) {
			const dir = HEX_DIRECTIONS.findIndex((d) => hexKey(addHex(parseHexKey(at), d)) === k);
			return !entrances.has(`${at}:${dir}`);
		}
		at = k;
	}
	return false;
}

/**
 * Leave the planet by its entrance: fly to the entrance, out through it, then on to `to`
 * along a shortest path from there. Null if there's no usable entrance or it's out of reach.
 */
export function entrancePath(
	board: BoardState,
	from: string,
	to: string,
	maxCost: number,
	prefer: Set<string> = new Set(),
	outlaw = false,
): string[] | null {
	const e = planetEntranceOf(board, from);
	if (!e) return null;
	const inside = e.inside === from ? [] : movePath(board, from, e.inside, maxCost, prefer, outlaw);
	if (!inside) return null;
	const used = inside.length + 1;
	if (used > maxCost) return null;
	if (to === e.outside) return [...inside, e.outside];
	const rest = movePath(board, e.outside, to, maxCost - used, prefer, outlaw);
	return rest ? [...inside, e.outside, ...rest] : null;
}
