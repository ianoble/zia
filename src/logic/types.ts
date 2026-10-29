import type { BaseGameState } from '@engine/client';
import type { BoardState } from './board';

// ---------------------------------------------------------------------------
// Player colours (placeholder set — revisit once components are modelled)
// ---------------------------------------------------------------------------

export type PlayerColor = 'red' | 'blue' | 'green' | 'yellow' | 'purple';

export const PLAYER_COLORS: PlayerColor[] = ['red', 'blue', 'green', 'yellow', 'purple'];

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Ship mat
// ---------------------------------------------------------------------------

export type CubeColor = 'spice' | 'holo' | 'terra' | 'plasma' | 'cyber' | 'ember';

/** Markers per captain that move between armed, outfit use spaces and disarmed. */
export const MARKERS_PER_SHIP = 4;

export type Rotation = 0 | 1 | 2 | 3;

/** An outfit or mod placed in (or, for pods/plating, partly outside) the hold. */
export interface PlacedOutfit {
	/** Unique per ship, e.g. "o1". */
	uid: string;
	outfitId: string;
	/** Hold-grid position of the transformed shape's top-left corner. Negative values allowed for exterior sections. */
	x: number;
	y: number;
	/** Quarter turns clockwise. */
	rotation: Rotation;
	/** Mirrored left-right before rotating (outfits are double-sided). */
	flipped: boolean;
	/** Use-space indices (in shape reading order) that currently hold a marker. */
	usedSpaces: number[];
}

export interface CargoInHold {
	/** Cell key "x,y". */
	cell: string;
	color: CubeColor;
}

export interface ShipState {
	shipId: string;
	/** Which of the ship card's abilities was chosen. */
	abilityIndex: number;
	abilityExhausted: boolean;
	energy: number;
	armedMarkers: number;
	disarmedMarkers: number;
	impulseReady: boolean;
	outfits: PlacedOutfit[];
	/** Cell keys "x,y" holding a normal (orange) damage marker. */
	damage: string[];
	/** [Embers] Cell keys holding an ice damage gem. */
	iceDamage: string[];
	cargo: CargoInHold[];
}

export interface ZiaPlayer {
	id: string;
	color: PlayerColor;
	/** Credits (money). */
	credits: number;
	/** Fame points — first to the target wins. */
	fame: number;
	/** Current bounty in credits; > 0 means the ship is an outlaw. */
	bounty: number;
	/** null until the captain picks a starting ship. */
	ship: ShipState | null;
	/** Board hex key "q,r" of the ship, or null before it launches. */
	position: string | null;
	/** Setup: d20 roll that set the ship-pick order. */
	initiativeRoll: number;
	/** Setup: finished buying starting outfits. */
	outfittingDone: boolean;
}

export interface ZiaSetupData {
	/** Fame needed to win. */
	fameTarget?: number;
}

/** Which part of the game is running (mirrors the boardgame.io phase, readable by validators). */
export type ZiaStage = 'pickShip' | 'outfit' | 'play';

export interface LogLine {
	/** Seat the line is about, rendered as the captain's name; null for game messages. */
	seat: string | null;
	text: string;
}

/** Per-turn state for the active captain. */
export interface TurnState {
	/** Unspent movement points. */
	movement: number;
}

export interface ZiaState extends BaseGameState {
	stage: ZiaStage;
	players: Record<string, ZiaPlayer>;
	fameTarget: number;
	board: BoardState;
	/** Setup ship-pick (and outfitting) order: highest d20 first, then counter-clockwise. */
	pickOrder: string[];
	/** Play order: the last captain to pick goes first, then clockwise. */
	turnOrder: string[];
	/** Outfits left in the supply (missing = unlimited). */
	supply: Record<string, number>;
	turn: TurnState;
	log: LogLine[];
}

export interface ZiaGameOver {
	winner?: string;
	isDraw?: boolean;
}
