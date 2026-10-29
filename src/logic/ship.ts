import { SHIPS_BY_ID, type ShipDef } from '../data/ships';
import { MARKERS_PER_SHIP, type ShipState } from './types';

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

/** Normal + ice damage; the ship is destroyed when this reaches its hold size (rulebook p14). */
export function totalDamage(state: ShipState): number {
	return state.damage.length + state.iceDamage.length;
}

export function isDestroyed(state: ShipState): boolean {
	return totalDamage(state) >= shipDef(state).holdSize;
}

/** Stranded: no energy and no armed markers (rulebook p4). */
export function isStranded(state: ShipState): boolean {
	return state.energy <= 0 && state.armedMarkers <= 0;
}
