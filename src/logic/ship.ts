import { SHIPS_BY_ID, type ShipDef } from '../data/ships';
import { OUTFITS_BY_ID } from '../data/outfits';
import { cellKey, hullCells, occupancy, placedCells } from './holdGeometry';
import { MARKERS_PER_SHIP, type DamageKind, type ShipState } from './types';

/** A freshly launched ship: full energy, all markers armed, impulse ready, empty hold. */
export function createShipState(shipId: string, abilityIndex = 0): ShipState {
	const def = SHIPS_BY_ID[shipId];
	if (!def) throw new Error(`Unknown ship ${shipId}`);
	return {
		shipId,
		abilityIndex,
		abilityExhausted: false,
		energy: def.energy,
		armedMarkers: MARKERS_PER_SHIP,
		disarmedMarkers: 0,
		impulseReady: true,
		outfits: [],
		damage: [],
		iceDamage: [],
		cargo: [],
	};
}

export function shipDef(state: ShipState): ShipDef {
	return SHIPS_BY_ID[state.shipId];
}

/** Markers currently sitting on outfit use spaces. */
export function markersOnOutfits(state: ShipState): number {
	return state.outfits.reduce((n, o) => n + o.usedSpaces.length, 0);
}

/** Normal + ice damage; the ship is destroyed when this reaches maxDamage (rulebook p14). */
export function totalDamage(state: ShipState): number {
	return state.damage.length + state.iceDamage.length;
}

/** Damage that destroys the ship: its hold size, +3 per Armor Plating (rulebook p27). */
export function maxDamage(state: ShipState): number {
	const plating = state.outfits.filter((o) => OUTFITS_BY_ID[o.outfitId]?.type === 'armor-plating').length;
	return shipDef(state).holdSize + 3 * plating;
}

export function isDestroyed(state: ShipState): boolean {
	return totalDamage(state) >= maxDamage(state);
}

/**
 * Where a cargo cube can go: empty hold spaces (no outfit, damage or cube) and any
 * Cargo Pod section (they hold cubes only) without damage or a cube.
 */
export function cargoTargets(state: ShipState): string[] {
	const occupied = occupancy(state.outfits);
	const keys = new Set([...hullCells(shipDef(state))].filter((k) => !occupied.has(k)));
	for (const o of state.outfits) {
		if (OUTFITS_BY_ID[o.outfitId]?.type === 'cargo-pod') for (const c of placedCells(o)) keys.add(cellKey(c.x, c.y));
	}
	const blocked = new Set([...state.damage, ...state.iceDamage, ...state.cargo.map((c) => c.cell)]);
	return [...keys].filter((k) => !blocked.has(k));
}

/**
 * Where damage can go (rulebook p14): any hold space or outfit/mod section (exterior
 * sections included) without damage on it yet.
 */
export function damageTargets(state: ShipState): string[] {
	const keys = new Set(hullCells(shipDef(state)));
	for (const o of state.outfits) for (const c of placedCells(o)) keys.add(cellKey(c.x, c.y));
	const hit = new Set([...state.damage, ...state.iceDamage]);
	return [...keys].filter((k) => !hit.has(k));
}

/**
 * Put one damage on `cell`: a cargo cube there is jettisoned, and a marker on a use
 * space there moves to the Disarmed area. Returns the jettisoned cube's colour, if any.
 */
export function applyDamage(state: ShipState, kind: DamageKind, cell: string): string | null {
	(kind === 'ice' ? state.iceDamage : state.damage).push(cell);
	const cube = state.cargo.find((c) => c.cell === cell);
	state.cargo = state.cargo.filter((c) => c.cell !== cell);
	for (const o of state.outfits) {
		const use = placedCells(o).find((c) => c.kind === 'U' && cellKey(c.x, c.y) === cell);
		if (use && o.usedSpaces.includes(use.useIndex)) {
			o.usedSpaces = o.usedSpaces.filter((u) => u !== use.useIndex);
			state.disarmedMarkers++;
		}
	}
	return cube?.color ?? null;
}

/** Cells with damage of either kind (ice damage has the same effects, rulebook p14). */
export function damagedCells(state: ShipState): Set<string> {
	return new Set([...state.damage, ...state.iceDamage]);
}

/**
 * Engine roll (rulebook p8, p28): the die result, -1 per damage on the engine (never
 * below 1), then +2 for each undamaged GTS mod orthogonally next to the engine, but
 * never above the die's maximum.
 */
export function engineRollResult(state: ShipState, uid: string, roll: number, dieMax: number): { result: number; penalty: number; gts: number } {
	const engine = state.outfits.find((o) => o.uid === uid);
	if (!engine) return { result: roll, penalty: 0, gts: 0 };
	const damaged = damagedCells(state);
	const cells = placedCells(engine);
	const penalty = cells.filter((c) => damaged.has(cellKey(c.x, c.y))).length;
	const engineKeys = new Set(cells.map((c) => cellKey(c.x, c.y)));
	const gts = state.outfits.filter((o) => {
		if (o.outfitId !== 'gts') return false;
		const [cell] = placedCells(o);
		const key = cellKey(cell.x, cell.y);
		if (damaged.has(key)) return false;
		return [
			[1, 0],
			[-1, 0],
			[0, 1],
			[0, -1],
		].some(([dx, dy]) => engineKeys.has(cellKey(cell.x + dx, cell.y + dy)));
	}).length;
	const result = Math.min(dieMax, Math.max(1, roll - penalty) + 2 * gts);
	return { result, penalty, gts };
}

/** Active Mission Limit (rulebook p12, p28): 1, +2 for each undamaged M-Comp mod. */
export function missionLimit(state: ShipState): number {
	const damaged = new Set([...state.damage, ...state.iceDamage]);
	const mcomps = state.outfits.filter((o) => o.outfitId === 'm-comp' && !placedCells(o).some((c) => damaged.has(cellKey(c.x, c.y))));
	return 1 + 2 * mcomps.length;
}

/** Stranded: no energy and no armed markers (rulebook p4). */
export function isStranded(state: ShipState): boolean {
	return state.energy <= 0 && state.armedMarkers <= 0;
}
