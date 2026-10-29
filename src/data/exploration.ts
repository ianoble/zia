/**
 * [Embers] Exploration tokens (rulebook p22). The game always uses the Embers set and
 * never the core tokens (credits / fame / nothing).
 */
import type { CubeColor } from '../logic/types';

export type ExplorationCube = Exclude<CubeColor, 'ember'>;

export type ExplorationToken = 'movement' | 'captain-in-need' | 'energy' | 'ice-damage' | `cargo-${ExplorationCube}`;

export const EXPLORATION_CUBES: ExplorationCube[] = ['holo', 'spice', 'terra', 'plasma', 'cyber'];

/** The 30 Embers tokens: 5 each of +5 movement, Captain in Need, Energy and Ice Damage; 2 of each cargo cube. */
export const EMBERS_EXPLORATION_TOKENS: ExplorationToken[] = [
	...(['movement', 'captain-in-need', 'energy', 'ice-damage'] as const).flatMap((t) => Array<ExplorationToken>(5).fill(t)),
	...EXPLORATION_CUBES.flatMap((c) => Array<ExplorationToken>(2).fill(`cargo-${c}`)),
];

export function explorationTokenLabel(token: ExplorationToken): string {
	switch (token) {
		case 'movement':
			return '+5 movement';
		case 'captain-in-need':
			return 'Captain in Need';
		case 'energy':
			return 'Energy refill';
		case 'ice-damage':
			return 'Ice damage';
		default:
			return `${token.slice('cargo-'.length)} cube`;
	}
}

/** Gained instead of a pair of face-up tokens on the ship mat (the captain chooses). */
export const EXPLORATION_PAIR_CREDITS = 2000;
export const EXPLORATION_PAIR_FAME = 1;
