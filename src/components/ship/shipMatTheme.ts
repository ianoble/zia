import type { OutfitType } from '../../data/outfits';
import type { ShipTier } from '../../data/ships';
import type { CubeColor, PlayerColor } from '../../logic/types';

/** Mat chrome colour per tier (matches the coloured bars on the reference sheet). */
export const TIER_THEME: Record<ShipTier, { base: string; light: string; dark: string }> = {
	1: { base: '#2f7fd8', light: '#7fb6f0', dark: '#163f6e' },
	2: { base: '#5b9a26', light: '#9fd16a', dark: '#2c4d12' },
	3: { base: '#8e5cb8', light: '#c39be6', dark: '#45275e' },
};

export const PLAYER_HEX: Record<PlayerColor, string> = {
	red: '#e0393e',
	blue: '#2f74e0',
	green: '#2fae4e',
	yellow: '#f2c230',
	purple: '#9b4fe0',
};

export const OUTFIT_FILL: Record<OutfitType, string> = {
	engine: '#a3a8ae',
	shield: '#2f7fe0',
	blaster: '#c8661c',
	missile: '#e6dc2a',
	'cargo-pod': '#d02ad6',
	'armor-plating': '#22c7d6',
	mod: '#cfd3d8',
};

/** Connector section colour on Cargo Pod / Armor Plating. */
export const CONNECTOR_FILL = '#5ccf2c';

export const CUBE_FILL: Record<CubeColor, string> = {
	spice: '#f28c28',
	holo: '#ec4fa0',
	terra: '#3fae49',
	plasma: '#2bb5b0',
	cyber: '#8b4fd6',
	ember: '#f4f1ea',
};

/** Energy track gradient endpoints (pink → cyan, like the printed meter). */
export const ENERGY_FROM = [255, 63, 164];
export const ENERGY_TO = [51, 200, 255];

export function energyColor(i: number, max: number): string {
	const t = max <= 0 ? 0 : i / max;
	const c = ENERGY_FROM.map((a, k) => Math.round(a + (ENERGY_TO[k] - a) * t));
	return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}
