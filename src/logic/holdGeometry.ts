/**
 * Hold-grid geometry: outfit shapes, rotation/flip, and placement checks.
 * Coordinates: x = column (right), y = row (down). Cell keys are "x,y".
 */
import { OUTFITS_BY_ID, type OutfitDef } from '../data/outfits';
import type { ShipDef } from '../data/ships';
import type { PlacedOutfit, Rotation } from './types';

export type SectionKind = '#' | 'U' | 'C' | 'x';

export interface ShapeCell {
	x: number;
	y: number;
	kind: SectionKind;
	/** Index among the shape's use spaces (reading order of the printed shape), or -1. */
	useIndex: number;
}

export interface OccupiedCell extends ShapeCell {
	uid: string;
	outfitId: string;
}

export const cellKey = (x: number, y: number): string => `${x},${y}`;

export function parseCellKey(key: string): { x: number; y: number } {
	const [x, y] = key.split(',').map(Number);
	return { x, y };
}

/** Parse a text-grid shape into cells (reading order, so use-space indices are stable). */
export function parseShape(rows: string[]): ShapeCell[] {
	const cells: ShapeCell[] = [];
	let useIndex = 0;
	rows.forEach((row, y) => {
		[...row].forEach((ch, x) => {
			if (ch === '.' || ch === ' ') return;
			const kind = ch as SectionKind;
			cells.push({ x, y, kind, useIndex: kind === 'U' ? useIndex++ : -1 });
		});
	});
	return cells;
}

/** Flip (mirror left-right) then rotate clockwise; result is normalised to start at 0,0. */
export function transformCells(cells: ShapeCell[], rotation: Rotation, flipped: boolean): ShapeCell[] {
	let out = cells.map((c) => ({ ...c }));
	if (flipped) {
		const maxX = Math.max(...out.map((c) => c.x));
		out = out.map((c) => ({ ...c, x: maxX - c.x }));
	}
	for (let i = 0; i < rotation; i++) {
		const maxY = Math.max(...out.map((c) => c.y));
		out = out.map((c) => ({ ...c, x: maxY - c.y, y: c.x }));
	}
	const minX = Math.min(...out.map((c) => c.x));
	const minY = Math.min(...out.map((c) => c.y));
	return out.map((c) => ({ ...c, x: c.x - minX, y: c.y - minY }));
}

/** Absolute hold-grid cells covered by a placed outfit. */
export function placedCells(p: PlacedOutfit, def: OutfitDef = OUTFITS_BY_ID[p.outfitId]): OccupiedCell[] {
	return transformCells(parseShape(def.shape), p.rotation, p.flipped).map((c) => ({
		...c,
		x: c.x + p.x,
		y: c.y + p.y,
		uid: p.uid,
		outfitId: p.outfitId,
	}));
}

/** Set of hold cell keys for a ship. */
export function hullCells(ship: ShipDef): Set<string> {
	const set = new Set<string>();
	for (const c of parseShape(ship.hold)) set.add(cellKey(c.x, c.y));
	return set;
}

/**
 * Map cell key → cells occupying it. Mods that overlay a use space share the cell with
 * the outfit underneath, so a cell can have two entries.
 */
export function occupancy(outfits: PlacedOutfit[]): Map<string, OccupiedCell[]> {
	const map = new Map<string, OccupiedCell[]>();
	for (const p of outfits) {
		for (const c of placedCells(p)) {
			const k = cellKey(c.x, c.y);
			const list = map.get(k);
			if (list) list.push(c);
			else map.set(k, [c]);
		}
	}
	return map;
}

const OVERLAY_TARGET_TYPES: Record<NonNullable<OutfitDef['overlays']>, string[]> = {
	'weapon-use': ['blaster', 'missile'],
	'shield-use': ['shield'],
};

/** Check whether `candidate` can be placed alongside `others`. Returns true or a reason. */
export function canPlaceOutfit(ship: ShipDef, others: PlacedOutfit[], candidate: PlacedOutfit): true | string {
	const def = OUTFITS_BY_ID[candidate.outfitId];
	if (!def) return `Unknown outfit ${candidate.outfitId}`;
	const hull = hullCells(ship);
	const occ = occupancy(others.filter((o) => o.uid !== candidate.uid));

	for (const c of placedCells(candidate, def)) {
		const k = cellKey(c.x, c.y);
		const inHull = hull.has(k);
		const below = occ.get(k) ?? [];
		if (c.kind === 'x') {
			if (inHull) return `${def.name}: exterior sections must be outside the hold`;
			if (below.length) return `${def.name}: overlaps another outfit`;
			continue;
		}
		if (!inHull) return `${def.name}: must be placed inside the hold`;
		if (def.overlays) {
			const target = below.find(
				(b) => b.kind === 'U' && OVERLAY_TARGET_TYPES[def.overlays!].includes(OUTFITS_BY_ID[b.outfitId]?.type),
			);
			if (!target || below.length > 1) {
				return def.overlays === 'weapon-use'
					? `${def.name} must be placed on a blaster or missile use space`
					: `${def.name} must be placed on a shield use space`;
			}
			continue;
		}
		if (below.length) return `${def.name}: overlaps another outfit`;
	}
	return true;
}

/** Find the first valid placement for an outfit (any position, rotation, flip), or null. */
export function autoPlace(ship: ShipDef, others: PlacedOutfit[], outfitId: string, uid: string): PlacedOutfit | null {
	const width = Math.max(...ship.hold.map((r) => r.length));
	const height = ship.hold.length;
	for (let y = -3; y < height + 3; y++) {
		for (let x = -3; x < width + 3; x++) {
			for (const flipped of [false, true]) {
				for (const rotation of [0, 1, 2, 3] as Rotation[]) {
					const candidate: PlacedOutfit = { uid, outfitId, x, y, rotation, flipped, usedSpaces: [] };
					if (canPlaceOutfit(ship, others, candidate) === true) return candidate;
				}
			}
		}
	}
	return null;
}
