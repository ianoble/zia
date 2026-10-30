import type { BaseGameState } from '@engine/client';
import type { BoardState, BorderKind } from './board';
import type { ExplorationToken } from '../data/exploration';

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

/** Cube types on the Economy Board. */
export type EconomyCube = 'spice' | 'holo' | 'terra' | 'plasma' | 'cyber';
export const ECONOMY_CUBES: EconomyCube[] = ['spice', 'holo', 'terra', 'plasma', 'cyber'];
export const ECONOMY_MAX = 6;

/** Normal damage or [Embers] ice damage. */
export type DamageKind = 'damage' | 'ice';

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
	/** Ship ability cards kept from earlier ships (all of them transfer when buying a new ship). */
	keptAbilities?: { shipId: string; abilityIndex: number }[];
}

/** A ship being bought at a starport: the new ship and the outfits placed in its hold so far. */
export interface ShipUpgrade {
	shipId: string;
	abilityIndex: number;
	/** Outfits (same uids as on the current ship) placed in the new hold. */
	layout: PlacedOutfit[];
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
	/** Face-up exploration tokens on the ship mat. */
	explorationTokens: ExplorationToken[];
	/** Damage taken but not yet placed in the hold; the captain places each one before doing anything else. */
	pendingDamage: DamageKind[];
	/** Cargo cubes gained but not yet placed (or jettisoned); handled before doing anything else. */
	pendingCargo: CubeColor[];
	/** Active mission card ids (kept face down until revealed; hidden from others in the UI). */
	activeMissions: string[];
	/** Mission cards drawn at the end of the turn, waiting for the captain to choose which to keep. */
	drawnMissions: string[];
	/** Buying a new ship at a starport: fitting the outfits into its hold. */
	upgrade?: ShipUpgrade | null;
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
	/** Two face-up exploration tokens: the captain must choose 1 fame or 2,000 credits before anything else. */
	explorationPairPending?: boolean;
	/**
	 * Mission points the ship flew onto or over this turn (once per point): each lets them
	 * draw 3 mission cards at the end of the turn (rulebook p12).
	 */
	missionDraws?: string[];
	/** In the Starport Phase (docked at a planet): no more actions, only starport services. */
	starport?: boolean;
	/** Luck (a natural 20 on a d20) has paid out this turn; it pays at most once per turn. */
	luckUsed?: boolean;
	/** A move stopped at a border, waiting for the captain (see BorderCrossing). */
	crossing?: BorderCrossing | null;
}

/**
 * A move paused at a border (rulebook p10, p20). 'confirm': the captain rolls or stops
 * short. 'shield': the roll came up 1-10 against an asteroid or nebula and the captain
 * may fire shields to cut `amount` down before taking it.
 */
export interface BorderCrossing {
	/** The space across the border(s). */
	to: string;
	/** Spaces left to fly after `to`. */
	rest: string[];
	/** Borders still to resolve for this step, in order. */
	borders: BorderKind[];
	entranceBounty: boolean;
	stage: 'confirm' | 'shield';
	/** Blind Jump: the ship must go in, so there's no stopping short. */
	forced: boolean;
	roll?: number;
	/** Damage (asteroid) or energy loss (nebula) still to take. */
	amount?: number;
}

export interface ZiaState extends BaseGameState {
	stage: ZiaStage;
	players: Record<string, ZiaPlayer>;
	fameTarget: number;
	board: BoardState;
	/** Sector tile ids not yet explored; a random one is drawn for each Scan / Blind Jump. */
	sectorDeck: string[];
	/**
	 * Exploration tokens not yet revealed (face-down on the board or still in the pile).
	 * A token's face is drawn at random from here when it's flipped, so face-down tokens
	 * don't leak their value in the shared game state.
	 */
	explorationPool: ExplorationToken[];
	/** Board hexes holding a face-down exploration token. */
	explorationSpaces: string[];
	/**
	 * [Embers] Economy Board (rulebook p15-16): cubes available to buy per type (0-6), and
	 * In Demand credits (0 or 1,000) waiting on empty sections.
	 */
	economy: Record<EconomyCube, { cubes: number; demand: number }>;
	/** Fame for the first captain to use a gate, and for the first to use the Tigris gate, once each. */
	gateFameTaken?: { gates?: boolean; tigris?: boolean };
	/** Ships traded in for a better one: removed from the game (rulebook p18). */
	retiredShips?: string[];
	/** Mission cards left to draw (a random one is drawn each time) and the discard pile. */
	missionDeck: string[];
	missionDiscard: string[];
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
