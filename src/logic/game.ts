import type { Game, Ctx } from 'boardgame.io';
import { INVALID_MOVE, TurnOrder } from 'boardgame.io/core';
import { defineGame } from '@engine/client';
import { IN_SCOPE_SHIPS, SHIPS_BY_ID } from '../data/ships';
import { OUTFITS, OUTFITS_BY_ID, type Die } from '../data/outfits';
import { SECTORS_BY_ID } from '../data/sectors';
import {
	EMBERS_EXPLORATION_TOKENS,
	EXPLORATION_PAIR_CREDITS,
	EXPLORATION_PAIR_FAME,
	explorationTokenLabel,
	type ExplorationCube,
	type ExplorationToken,
} from '../data/exploration';
import {
	boardHexes,
	dealStartingTiles,
	explorePlacement,
	movePath,
	stepCrossing,
	type BorderKind,
	reachableHexes,
	respawnHex,
	SLOT_NAMES,
	startingBoard,
	startingDeck,
	startingSpawnFor,
	unexploredEdges,
} from './board';
import { canPlaceOutfit, cellKey, placedCells } from './holdGeometry';
import { applyDamage, cargoTargets, createShipState, damagedCells, damageTargets, engineRollResult, maxDamage, missionLimit, shipDef, totalDamage } from './ship';
import {
	MARKERS_PER_SHIP,
	PLAYER_COLORS,
	type CubeColor,
	type DamageKind,
	type PlacedOutfit,
	type Rotation,
	type ShipState,
	type ZiaPlayer,
	type ZiaSetupData,
	type ZiaState,
} from './types';

/** Each captain starts with 4,000 credits (rulebook p3). */
export const STARTING_CREDITS = 4000;
export const DEFAULT_FAME_TARGET = 10;
const MAX_LOG = 200;

const DIE_SIDES: Record<Die, number> = { d6: 6, d8: 8, d12: 12, d20: 20 };

interface RandomApi {
	D20: () => number;
	Die: (sides: number) => number;
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

/** Roll d20s until every captain has a different result (ties re-roll). */
function rollInitiative(seats: string[], d20: () => number): Record<string, number> {
	const rolls: Record<string, number> = {};
	let pending = [...seats];
	while (pending.length) {
		for (const s of pending) rolls[s] = d20();
		pending = pending.filter((s) => seats.some((o) => o !== s && rolls[o] === rolls[s]));
	}
	return rolls;
}

export function createInitialState(
	ctx: Pick<Ctx, 'numPlayers' | 'playOrder'>,
	setupData?: ZiaSetupData,
	random?: RandomApi,
): ZiaState {
	const seats = [...ctx.playOrder];
	const d20 = random?.D20 ?? (() => 1 + Math.floor(Math.random() * 20));
	const rolls = rollInitiative(seats, d20);

	// Highest roll picks first, then counter-clockwise (descending seat order).
	const highest = seats.reduce((a, b) => (rolls[b] > rolls[a] ? b : a));
	const hi = seats.indexOf(highest);
	const pickOrder = seats.map((_, i) => seats[(hi - i + seats.length) % seats.length]);
	// The captain who picked last goes first, then clockwise.
	const lastPicker = pickOrder[pickOrder.length - 1];
	const lp = seats.indexOf(lastPicker);
	const turnOrder = seats.map((_, i) => seats[(lp + i) % seats.length]);

	const players: Record<string, ZiaPlayer> = {};
	seats.forEach((id, i) => {
		players[id] = {
			id,
			color: PLAYER_COLORS[i % PLAYER_COLORS.length],
			credits: STARTING_CREDITS,
			fame: 0,
			bounty: 0,
			ship: null,
			position: null,
			initiativeRoll: rolls[id],
			outfittingDone: false,
			explorationTokens: [],
			pendingDamage: [],
			pendingCargo: [],
		};
	});

	const supply: Record<string, number> = {};
	for (const o of OUTFITS) if (o.copies != null) supply[o.id] = o.copies;
	const die = random?.Die ?? ((sides: number) => 1 + Math.floor(Math.random() * sides));
	const board = startingBoard(seats, dealStartingTiles(seats.length, die));

	const G: ZiaState = {
		history: [],
		stage: 'pickShip',
		players,
		fameTarget: setupData?.fameTarget ?? DEFAULT_FAME_TARGET,
		board,
		sectorDeck: startingDeck(board),
		explorationPool: [...EMBERS_EXPLORATION_TOKENS],
		explorationSpaces: [],
		pickOrder,
		turnOrder,
		supply,
		turn: { movement: 0 },
		log: [
			...pickOrder.map((s) => ({ seat: s, text: `rolled ${rolls[s]} for ship pick order` })),
			{ seat: null, text: 'Captains pick a Tier I ship, highest roll first.' },
		],
	};
	// Setup step 2: a face-down exploration token on each exploration space of the starting tiles.
	board.sectors.forEach((_, i) => placeExplorationTokens(G, i));
	return G;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function log(G: ZiaState, seat: string | null, text: string) {
	G.log.push({ seat, text });
	if (G.log.length > MAX_LOG) G.log.splice(0, G.log.length - MAX_LOG);
}

function nextOutfitUid(ship: ShipState): string {
	const n = ship.outfits.reduce((m, o) => Math.max(m, Number(o.uid.slice(1)) || 0), 0);
	return `o${n + 1}`;
}

/** Every mod that sits on another outfit must still be valid after a change. */
function modsStillValid(ship: ShipState, outfits: PlacedOutfit[]): boolean {
	const def = shipDef(ship);
	return outfits
		.filter((o) => OUTFITS_BY_ID[o.outfitId].overlays)
		.every((m) => canPlaceOutfit(def, outfits, m) === true);
}

function placementArgs(args: unknown[]): { x: number; y: number; rotation: Rotation; flipped: boolean } | null {
	const [x, y, rotation, flipped] = args;
	if (!Number.isInteger(x) || !Number.isInteger(y)) return null;
	if (rotation !== 0 && rotation !== 1 && rotation !== 2 && rotation !== 3) return null;
	if (typeof flipped !== 'boolean') return null;
	return { x: x as number, y: y as number, rotation, flipped };
}

/** Engine use spaces that are free (no marker) and undamaged. */
export function freeEngineUseSpaces(ship: ShipState, uid: string): number[] {
	return freeUseSpaces(ship, uid, 'engine');
}

/** Use spaces of an outfit of `type` that are free (no marker) and undamaged. */
export function freeUseSpaces(ship: ShipState, uid: string, type: string): number[] {
	const o = ship.outfits.find((x) => x.uid === uid);
	if (!o || OUTFITS_BY_ID[o.outfitId].type !== type) return [];
	const damaged = damagedCells(ship);
	return placedCells(o)
		.filter((c) => c.kind === 'U' && !o.usedSpaces.includes(c.useIndex) && !damaged.has(cellKey(c.x, c.y)))
		.map((c) => c.useIndex);
}

function occupiedHexes(G: ZiaState, except?: string): Set<string> {
	return new Set(
		Object.values(G.players)
			.filter((p) => p.id !== except && p.position)
			.map((p) => p.position!),
	);
}

/** Move markers to armed: disarmed ones first, then ones sitting on outfits. */
function armMarkers(ship: ShipState, n: number) {
	for (let i = 0; i < n; i++) {
		if (ship.disarmedMarkers > 0) ship.disarmedMarkers--;
		else {
			const o = ship.outfits.find((x) => x.usedSpaces.length > 0);
			if (!o) break;
			o.usedSpaces.pop();
		}
		ship.armedMarkers++;
	}
}

const markersAvailableToArm = (ship: ShipState) => MARKERS_PER_SHIP - ship.armedMarkers;

/**
 * Roll a die for a captain. Luck (rulebook p6): a natural 20 on a d20 earns 1 fame, at
 * most once per turn.
 */
export function rollDie(G: ZiaState, seat: string, random: RandomApi, sides: number): number {
	const roll = random.Die(sides);
	if (sides === 20 && roll === 20 && !G.turn.luckUsed) {
		G.turn.luckUsed = true;
		G.players[seat].fame++;
		log(G, seat, 'rolled a natural 20: +1 fame for Luck');
	}
	return roll;
}

/** Put a face-down exploration token on each exploration space of a newly placed sector, while tokens last. */
function placeExplorationTokens(G: ZiaState, sectorIndex: number) {
	for (const h of boardHexes(G.board).values()) {
		if (h.sectorIndex !== sectorIndex || h.kind !== 'exploration') continue;
		if (G.explorationSpaces.length >= G.explorationPool.length) return;
		G.explorationSpaces.push(h.key);
	}
}

/**
 * A ship takes damage: it waits for its captain to place it in the hold. If that much
 * damage would fill the hold, the ship is destroyed straight away (where it goes can't
 * change that). Returns true if the ship was destroyed.
 * TODO: shields can block damage (not respawn damage).
 */
function takeDamage(G: ZiaState, seat: string, kind: DamageKind, count: number, reason: string): boolean {
	const p = G.players[seat];
	const ship = p.ship!;
	for (let i = 0; i < count; i++) p.pendingDamage.push(kind);
	if (totalDamage(ship) + p.pendingDamage.length >= maxDamage(ship)) {
		destroyShip(G, seat, reason);
		return true;
	}
	return false;
}

/**
 * A captain gains a cargo cube: they choose where it goes (or jettison it). With no
 * space for it at all it's jettisoned straight away. Returns false if jettisoned.
 * Buying cubes at a planet will use this too.
 * TODO: jettisoned cubes are left on the board in the ship's hex.
 */
function gainCargo(G: ZiaState, seat: string, color: CubeColor): boolean {
	const p = G.players[seat];
	if (cargoTargets(p.ship!).length <= p.pendingCargo.length) return false;
	p.pendingCargo.push(color);
	return true;
}

/** Tokens on the mat that pair up for the fame/credits reward (Captain in Need stays until its mission is done). */
const pairableTokens = (tokens: ExplorationToken[]) => tokens.filter((t) => t !== 'captain-in-need');

/**
 * Exploration space (rulebook p22): the first ship to move onto it flips the token,
 * resolves it and keeps it face up on its mat. Returns true if the ship was destroyed.
 * TODO: also collect when passing through, not only when a move ends there.
 */
function collectExplorationToken(G: ZiaState, seat: string, hex: string, random: RandomApi): boolean {
	const at = G.explorationSpaces.indexOf(hex);
	if (at < 0 || !G.explorationPool.length) return false;
	G.explorationSpaces.splice(at, 1);
	const [token] = G.explorationPool.splice(random.Die(G.explorationPool.length) - 1, 1);
	const p = G.players[seat];
	const ship = p.ship!;
	p.explorationTokens.push(token);

	let text = `flipped an exploration token: ${explorationTokenLabel(token)}`;
	if (token === 'movement') {
		G.turn.movement += 5;
	} else if (token === 'energy') {
		ship.energy = shipDef(ship).energy;
	} else if (token === 'ice-damage') {
		text += ' (place it in your hold)';
	} else if (token === 'captain-in-need') {
		text += ' (missions come later)';
	} else {
		const color = token.slice('cargo-'.length) as ExplorationCube;
		text += gainCargo(G, seat, color) ? ' (place it in your hold)' : ', but the hold is full so it was jettisoned';
	}
	log(G, seat, text);

	if (token === 'ice-damage' && takeDamage(G, seat, 'ice', 1, 'ice damage filled the hold')) return true;
	if (pairableTokens(p.explorationTokens).length >= 2) G.turn.explorationPairPending = true;
	return false;
}

// ---------------------------------------------------------------------------
// Movement and borders (rulebook p8, p10, p20)
// ---------------------------------------------------------------------------

const BORDER_NAME: Record<BorderKind, string> = { shield: 'planetary shield', asteroid: 'asteroid', debris: 'debris field', nebula: 'nebula' };

/** Shields that can fire now: a free undamaged use space and an armed marker. */
export function usableShields(ship: ShipState): string[] {
	if (ship.armedMarkers <= 0) return [];
	return ship.outfits.filter((o) => freeUseSpaces(ship, o.uid, 'shield').length).map((o) => o.uid);
}

/**
 * Fly along `path` one space at a time. Exploration tokens on the way are collected;
 * at a border the move pauses (G.turn.crossing) until the captain rolls or stops short,
 * except on a Blind Jump (`forced`), where the roll happens straight away.
 */
function flyPath(c: MoveCtx, path: string[], forced = false) {
	const { G, playerID } = c;
	const p = G.players[playerID];
	let rest = path;
	while (rest.length && p.position) {
		const to = rest[0];
		const step = stepCrossing(G.board, p.position, to, p.bounty > 0);
		if (step.borders.length) {
			G.turn.crossing = { to, rest: rest.slice(1), borders: step.borders, entranceBounty: step.entranceBounty, stage: 'confirm', forced };
			log(G, playerID, `reached the ${step.borders.map((b) => BORDER_NAME[b]).join(' and ')} border`);
			if (forced) resolveBorders(c);
			return;
		}
		if (!enterSpace(c, to, step.entranceBounty)) return;
		rest = rest.slice(1);
	}
	stoppedAt(c);
}

/** Cards drawn per mission point (rulebook p12). */
export const MISSION_DRAW = 3;

/**
 * The ship's move ended where it is. On a mission point (once per point per turn, with a
 * free mission slot) the captain gets to draw 3 mission cards at the end of the turn.
 * It doesn't use up any movement: the captain can keep moving.
 * TODO: count active missions once mission cards exist (none can be held yet).
 */
function stoppedAt(c: MoveCtx) {
	const { G, playerID } = c;
	const p = G.players[playerID];
	if (!p.position || !p.ship) return;
	if (!boardHexes(G.board).get(p.position)?.kinds.includes('mission')) return;
	G.turn.missionDraws ??= [];
	if (G.turn.missionDraws.includes(p.position)) return;
	const activeMissions = 0;
	if (activeMissions >= missionLimit(p.ship)) return;
	G.turn.missionDraws.push(p.position);
	log(G, playerID, `stopped on a mission point: will draw ${MISSION_DRAW} mission cards at the end of the turn`);
}

/** Move into the next space (1 movement): entrance bounty, then any exploration token. False if the move must stop. */
function enterSpace(c: MoveCtx, to: string, entranceBounty: boolean): boolean {
	const { G, playerID, random, events } = c;
	const p = G.players[playerID];
	p.position = to;
	G.turn.movement = Math.max(0, G.turn.movement - 1);
	if (entranceBounty && p.bounty === 0) {
		p.bounty += 1000;
		log(G, playerID, "used an outlaw planet's entrance: +1,000 bounty");
	}
	if (collectExplorationToken(G, playerID, to, random)) {
		events.endTurn();
		return false;
	}
	return p.position != null;
}

/** Roll for each border of the paused step in turn; then fly on with the rest of the path. */
function resolveBorders(c: MoveCtx) {
	const { G, playerID, random, events } = c;
	const p = G.players[playerID];
	const cross = G.turn.crossing!;
	while (cross.borders.length) {
		const kind = cross.borders[0];
		const roll = rollDie(G, playerID, random, 20);
		if (kind === 'shield') {
			if (roll <= 10) {
				log(G, playerID, `rolled ${roll} crossing the planetary shield: ${roll} unblockable damage, and the ship stays put (−1 movement)`);
				G.turn.crossing = null;
				G.turn.movement = Math.max(0, G.turn.movement - 1);
				if (takeDamage(G, playerID, 'damage', roll, 'the planetary shield tore it apart')) events.endTurn();
				else stoppedAt(c);
				return;
			}
			if (roll <= 17) {
				p.bounty += 1000;
				log(G, playerID, `rolled ${roll} crossing the planetary shield: through, but detected (+1,000 bounty)`);
			} else log(G, playerID, `rolled ${roll} crossing the planetary shield: through undetected`);
		} else if (kind === 'debris') {
			if (roll <= 3) {
				log(G, playerID, `rolled ${roll} entering the debris field`);
				G.turn.crossing = null;
				destroyShip(G, playerID, 'smashed in a debris field');
				events.endTurn();
				return;
			}
			log(G, playerID, `rolled ${roll} entering the debris field: safely through`);
		} else if (roll <= 10) {
			// Asteroid damage or nebula energy loss; shields may cut it down first.
			const what = kind === 'asteroid' ? 'damage' : 'energy loss';
			log(G, playerID, `rolled ${roll} entering the ${BORDER_NAME[kind]}: ${roll} ${what}`);
			cross.roll = roll;
			cross.amount = roll;
			if (usableShields(p.ship!).length) {
				cross.stage = 'shield';
				return;
			}
			if (!takeBorderEffect(c)) return;
			continue;
		} else log(G, playerID, `rolled ${roll} entering the ${BORDER_NAME[kind]}: safely through`);
		cross.borders.shift();
	}
	finishCrossing(c);
}

/** The step's borders are all resolved: move into the space and carry on. */
function finishCrossing(c: MoveCtx, stopAfter = false) {
	const { G } = c;
	const cross = G.turn.crossing!;
	G.turn.crossing = null;
	if (!enterSpace(c, cross.to, cross.entranceBounty)) return;
	if (stopAfter) {
		G.turn.movement = 0;
		stoppedAt(c);
		return;
	}
	flyPath(c, cross.rest);
}

/**
 * Take what's left of an asteroid's damage or a nebula's energy loss, then carry on with
 * the step. Returns false if the move ended here.
 */
function takeBorderEffect(c: MoveCtx): boolean {
	const { G, playerID, events } = c;
	const p = G.players[playerID];
	const ship = p.ship!;
	const cross = G.turn.crossing!;
	const kind = cross.borders.shift()!;
	const amount = cross.amount ?? 0;
	cross.stage = 'confirm';
	cross.amount = undefined;
	if (kind === 'asteroid' && amount > 0) {
		if (takeDamage(G, playerID, 'damage', amount, 'an asteroid hit filled the hold')) {
			G.turn.crossing = null;
			events.endTurn();
			return false;
		}
	}
	if (kind === 'nebula' && amount > 0) {
		// Energy first, then armed markers (one per energy short). Impulse isn't affected.
		const fromEnergy = Math.min(ship.energy, amount);
		ship.energy -= fromEnergy;
		const disarm = Math.min(ship.armedMarkers, amount - fromEnergy);
		ship.armedMarkers -= disarm;
		ship.disarmedMarkers += disarm;
		log(G, playerID, `lost ${fromEnergy} energy${disarm ? ` and ${disarm} armed marker${disarm === 1 ? '' : 's'}` : ''} in the nebula`);
		if (ship.energy === 0 && ship.armedMarkers === 0) {
			log(G, playerID, 'is stranded: unspent movement is lost');
			finishCrossingAfterStranding(c);
			return false;
		}
	}
	return true;
}

/** Stranded in a nebula: the ship is inside it, but its movement is gone. */
function finishCrossingAfterStranding(c: MoveCtx) {
	const cross = c.G.turn.crossing!;
	// Any other borders of this step would already be resolved; just enter and stop.
	cross.borders = [];
	finishCrossing(c, true);
}

/** Draw a random tile from the sector deck and place it against `sectorIndex`'s `slot` side. */
function exploreSector(G: ZiaState, random: RandomApi, sectorIndex: number, slot: number): string {
	const [tileId] = G.sectorDeck.splice(random.Die(G.sectorDeck.length) - 1, 1);
	const placed = explorePlacement(G.board, sectorIndex, slot)!;
	G.board.sectors.push({ tileId, ...placed });
	placeExplorationTokens(G, G.board.sectors.length - 1);
	return SECTORS_BY_ID[tileId]?.name ?? tileId;
}

/**
 * Ship destroyed (rulebook p15): it leaves the board, loses its cargo and bounty, and
 * respawns at the start of its next turn. Outfits, credits and fame are kept.
 * TODO: jettison cargo into the hex, discard missions, rewards for the attacker.
 */
function destroyShip(G: ZiaState, seat: string, reason: string) {
	const p = G.players[seat];
	p.position = null;
	p.bounty = 0;
	p.pendingDamage = [];
	p.pendingCargo = [];
	if (p.ship) p.ship.cargo = [];
	G.turn.movement = 0;
	G.turn.missionDraws = [];
	log(G, seat, `was destroyed: ${reason}`);
}

/**
 * Respawn (rulebook p15, Embers: no lost turn): roll a d20 and go to the closest
 * unoccupied spawn point, with full energy, all markers armed, tokens refreshed and
 * damage cleared. A natural 20 is Luck: +1 fame.
 * TODO: the ship then takes damage equal to its tier, placed by its captain.
 */
function respawnShip(G: ZiaState, seat: string, random: RandomApi) {
	const p = G.players[seat];
	const ship = p.ship!;
	const roll = rollDie(G, seat, random, 20);
	const hex = respawnHex(G.board, roll, occupiedHexes(G, seat));
	if (!hex) {
		log(G, seat, `rolled ${roll} to respawn, but every spawn point is taken`);
		return;
	}
	p.position = hex;
	ship.energy = shipDef(ship).energy;
	ship.armedMarkers = MARKERS_PER_SHIP;
	ship.disarmedMarkers = 0;
	for (const o of ship.outfits) o.usedSpaces = [];
	ship.impulseReady = true;
	ship.abilityExhausted = false;
	ship.damage = [];
	ship.iceDamage = [];
	const spawn = boardHexes(G.board).get(hex)?.spawnNumber;
	log(G, seat, `rolled ${roll} and respawned at spawn point ${spawn}`);
	// Embers: respawned ships take unblockable damage equal to their tier, placed by the captain.
	takeDamage(G, seat, 'damage', shipDef(ship).tier, 'respawn damage filled the hold');
}

// ---------------------------------------------------------------------------
// Validation (shared by the client for instant feedback and by the moves)
// ---------------------------------------------------------------------------

export function checkMove(G: ZiaState, playerID: string, currentPlayer: string, moveName: string, args: unknown[]): true | string {
	if (playerID !== currentPlayer) return 'Not your turn';
	const p = G.players[playerID];
	if (!p) return 'Unknown captain';
	// A move paused at a border has to be finished (or stopped) first.
	if (G.turn.crossing && !RESOLVING_MOVES.has(moveName) && !CROSSING_MOVES.has(moveName)) {
		return 'Finish crossing the border first (roll, or stop short)';
	}
	// Damage and cubes to place and exploration pairs to cash in come before anything else.
	if (!RESOLVING_MOVES.has(moveName)) {
		if (p.pendingDamage?.length) return 'First place your damage: click a space in your hold';
		if (p.pendingCargo?.length) return 'First place your cargo cube in your hold, or jettison it';
		if (G.turn.explorationPairPending) return 'First choose 1 fame or 2,000 credits for your two exploration tokens';
	}

	switch (moveName) {
		case 'pickShip': {
			if (G.stage !== 'pickShip') return 'Ships have already been chosen';
			const [shipId, abilityIndex] = args;
			const def = SHIPS_BY_ID[shipId as string];
			if (!def || !IN_SCOPE_SHIPS.includes(def)) return 'Unknown ship';
			if (def.tier !== 1) return 'Pick a Tier I ship';
			if (Object.values(G.players).some((o) => o.ship?.shipId === def.id)) return `${def.name} is already taken`;
			if (!Number.isInteger(abilityIndex) || !def.abilities[abilityIndex as number]) return 'Choose one of the ship abilities';
			return true;
		}

		case 'buyOutfit':
		case 'moveOutfit':
		case 'returnOutfit': {
			if (G.stage !== 'outfit') return 'Outfits can only be bought during setup for now';
			if (!p.ship) return 'Pick a ship first';
			if (moveName === 'buyOutfit') {
				const def = OUTFITS_BY_ID[args[0] as string];
				if (!def) return 'Unknown outfit';
				if (p.credits < def.cost) return `Not enough credits for ${def.name}`;
				if (G.supply[def.id] === 0) return `No ${def.name} left in the supply`;
				const pos = placementArgs(args.slice(1));
				if (!pos) return 'Bad placement';
				return canPlaceOutfit(shipDef(p.ship), p.ship.outfits, { uid: '__new', outfitId: def.id, usedSpaces: [], ...pos });
			}
			const uid = args[0] as string;
			const existing = p.ship.outfits.find((o) => o.uid === uid);
			if (!existing) return 'That outfit is not in your hold';
			if (moveName === 'returnOutfit') {
				const rest = p.ship.outfits.filter((o) => o.uid !== uid);
				return modsStillValid(p.ship, rest) ? true : 'Remove the mod sitting on it first';
			}
			const pos = placementArgs(args.slice(1));
			if (!pos) return 'Bad placement';
			const moved = { ...existing, ...pos, usedSpaces: [] };
			const ok = canPlaceOutfit(shipDef(p.ship), p.ship.outfits, moved);
			if (ok !== true) return ok;
			const after = p.ship.outfits.map((o) => (o.uid === uid ? moved : o));
			return modsStillValid(p.ship, after) ? true : 'Remove the mod sitting on it first';
		}

		case 'finishOutfitting':
			if (G.stage !== 'outfit') return 'Not outfitting right now';
			return true;

		case 'useImpulse':
			if (G.stage !== 'play' || !p.ship) return 'Not during setup';
			if (!p.ship.impulseReady) return 'Impulse already used this turn';
			return true;

		case 'fireEngine': {
			if (G.stage !== 'play' || !p.ship) return 'Not during setup';
			if (p.ship.armedMarkers <= 0) return 'No armed markers — arm some at the end of your turn';
			if (!freeEngineUseSpaces(p.ship, args[0] as string).length) return 'That engine has no free use space';
			return true;
		}

		case 'moveShip': {
			if (G.stage !== 'play' || !p.ship || !p.position) return 'Not during setup';
			if (G.turn.movement <= 0) return 'No movement left — flip impulse or fire an engine';
			const target = args[0] as string;
			if (!boardHexes(G.board).has(target)) return 'That is not a space on the board';
			if (occupiedHexes(G, playerID).has(target)) return 'Another ship is there';
			if (!reachableHexes(G.board, p.position, G.turn.movement, occupiedHexes(G, playerID)).has(target)) {
				return 'Not enough movement to reach that space';
			}
			return true;
		}

		case 'scanSector': {
			if (G.stage !== 'play' || !p.ship || !p.position) return 'Not during setup';
			if (!G.sectorDeck.length) return 'No sector tiles left to explore';
			if (p.ship.energy < 1) return 'Scanning needs 1 energy';
			const slot = args[0];
			if (!unexploredEdges(G.board, p.position).some((e) => e.slot === slot)) {
				return 'Your ship must be next to an unexplored edge on that side';
			}
			return true;
		}

		case 'blindJump': {
			if (G.stage !== 'play' || !p.ship || !p.position) return 'Not during setup';
			if (!G.sectorDeck.length) return 'No sector tiles left to explore';
			if (G.turn.movement < 1) return 'A Blind Jump needs 1 movement';
			if (!unexploredEdges(G.board, p.position).some((e) => e.target === args[0])) {
				return 'Pick an unexplored space next to your ship';
			}
			return true;
		}

		case 'placeDamage':
			if (!p.ship || !p.pendingDamage?.length) return 'No damage to place';
			return damageTargets(p.ship).includes(args[0] as string) ? true : 'That space already has damage';

		case 'placeCargo':
			if (!p.ship || !p.pendingCargo?.length) return 'No cargo cube to place';
			return cargoTargets(p.ship).includes(args[0] as string) ? true : "A cube can't go there";

		case 'jettisonCargo':
			return p.pendingCargo?.length ? true : 'No cargo cube to jettison';

		case 'crossBorder':
			return G.turn.crossing?.stage === 'confirm' ? true : 'No border to cross';

		case 'stopMove':
			if (G.turn.crossing?.stage !== 'confirm') return 'No border to stop at';
			return G.turn.crossing.forced ? 'A Blind Jump has to go in' : true;

		case 'useShield':
			if (G.turn.crossing?.stage !== 'shield' || !p.ship) return 'No roll to shield against';
			return usableShields(p.ship).includes(args[0] as string) ? true : "That shield can't fire";

		case 'acceptBorderEffect':
			return G.turn.crossing?.stage === 'shield' ? true : 'Nothing to take';

		case 'claimExplorationPair':
			if (!G.turn.explorationPairPending) return 'No exploration tokens to cash in';
			return args[0] === 'fame' || args[0] === 'credits' ? true : 'Choose fame or credits';

		case 'endTurn': {
			if (G.stage !== 'play' || !p.ship) return 'Not during setup';
			const n = args[0] ?? 0;
			if (!Number.isInteger(n) || (n as number) < 0) return 'Bad number of markers';
			if ((n as number) > markersAvailableToArm(p.ship)) return 'Not that many markers to arm';
			if ((n as number) > p.ship.energy) return 'Not enough energy to arm that many markers';
			return true;
		}
	}
	return `Unknown move ${moveName}`;
}

/** Moves that resolve something the captain must deal with first (damage, cubes, token pairs). */
const RESOLVING_MOVES = new Set(['placeDamage', 'placeCargo', 'jettisonCargo', 'claimExplorationPair']);

/** Moves for a move paused at a border. */
const CROSSING_MOVES = new Set(['crossBorder', 'stopMove', 'useShield', 'acceptBorderEffect']);

type MoveCtx = { G: ZiaState; ctx: Ctx; playerID: string; events: { endTurn: () => void }; random: RandomApi };

function guarded(name: string, fn: (c: MoveCtx, ...args: never[]) => void) {
	return (c: MoveCtx, ...args: unknown[]) => {
		if (checkMove(c.G, c.playerID, c.ctx.currentPlayer, name, args) !== true) return INVALID_MOVE;
		fn(c, ...(args as never[]));
	};
}

// ---------------------------------------------------------------------------
// Moves
// ---------------------------------------------------------------------------

const moves = {
	pickShip: guarded('pickShip', ({ G, playerID, events }, shipId: string, abilityIndex: number) => {
		const p = G.players[playerID];
		const def = SHIPS_BY_ID[shipId];
		p.ship = createShipState(shipId, abilityIndex);
		p.position = startingSpawnFor(G.board, playerID);
		log(G, playerID, `launched the ${def.name} (${def.abilities[abilityIndex].name})`);
		events.endTurn();
	}),

	buyOutfit: guarded('buyOutfit', ({ G, playerID }, outfitId: string, x: number, y: number, rotation: Rotation, flipped: boolean) => {
		const p = G.players[playerID];
		const def = OUTFITS_BY_ID[outfitId];
		p.credits -= def.cost;
		if (G.supply[outfitId] != null) G.supply[outfitId]--;
		p.ship!.outfits.push({ uid: nextOutfitUid(p.ship!), outfitId, x, y, rotation, flipped, usedSpaces: [] });
		log(G, playerID, `bought a ${def.name}`);
	}),

	moveOutfit: guarded('moveOutfit', ({ G, playerID }, uid: string, x: number, y: number, rotation: Rotation, flipped: boolean) => {
		const o = G.players[playerID].ship!.outfits.find((x2) => x2.uid === uid)!;
		Object.assign(o, { x, y, rotation, flipped, usedSpaces: [] });
	}),

	/** Setup only: give an outfit back for a full refund. */
	returnOutfit: guarded('returnOutfit', ({ G, playerID }, uid: string) => {
		const p = G.players[playerID];
		const i = p.ship!.outfits.findIndex((o) => o.uid === uid);
		const [o] = p.ship!.outfits.splice(i, 1);
		const def = OUTFITS_BY_ID[o.outfitId];
		p.credits += def.cost;
		if (G.supply[o.outfitId] != null) G.supply[o.outfitId]++;
		log(G, playerID, `returned a ${def.name}`);
	}),

	finishOutfitting: guarded('finishOutfitting', ({ G, playerID, events }) => {
		G.players[playerID].outfittingDone = true;
		log(G, playerID, 'is ready to launch');
		events.endTurn();
	}),

	/** Minor action, once per turn: flip the impulse token for movement equal to the ship's impulse. */
	useImpulse: guarded('useImpulse', ({ G, playerID }) => {
		const ship = G.players[playerID].ship!;
		ship.impulseReady = false;
		G.turn.movement += shipDef(ship).impulse;
		log(G, playerID, `flipped impulse for +${shipDef(ship).impulse} movement`);
	}),

	/** Standard action: unspent movement is lost, then roll the engine die for new movement. */
	fireEngine: guarded('fireEngine', ({ G, playerID, random }, uid: string) => {
		const ship = G.players[playerID].ship!;
		const o = ship.outfits.find((x) => x.uid === uid)!;
		const def = OUTFITS_BY_ID[o.outfitId];
		o.usedSpaces.push(freeEngineUseSpaces(ship, uid)[0]);
		ship.armedMarkers--;
		const sides = DIE_SIDES[def.die!];
		const roll = rollDie(G, playerID, random, sides);
		const { result, penalty, gts } = engineRollResult(ship, uid, roll, sides);
		const lost = G.turn.movement;
		G.turn.movement = result;
		const mods = `${penalty ? ` −${penalty} damage` : ''}${gts ? ` +${2 * gts} GTS` : ''}`;
		log(G, playerID, `fired the ${def.name}: rolled ${roll}${mods} → ${result} movement${lost ? ` (${lost} unspent lost)` : ''}`);
	}),

	moveShip: guarded('moveShip', ({ G, playerID, random, events }, target: string) => {
		const p = G.players[playerID];
		const path = movePath(G.board, p.position!, target, G.turn.movement, new Set(G.explorationSpaces), p.bounty > 0)!;
		log(G, playerID, `moves ${path.length} space${path.length === 1 ? '' : 's'}`);
		// Collecting a token is a minor action: tokens on the way are flipped without stopping.
		flyPath({ G, playerID, random, events } as MoveCtx, path);
	}),

	/** At a border: roll the d20 and resolve it. */
	crossBorder: guarded('crossBorder', (c) => resolveBorders(c)),

	/** At a border: stop short instead (keeping the rest of the movement). */
	stopMove: guarded('stopMove', (c) => {
		c.G.turn.crossing = null;
		log(c.G, c.playerID, 'stopped short of the border');
		stoppedAt(c);
	}),

	/** After a bad asteroid / nebula roll: fire a shield to cut it down (Shields Up, a minor action). */
	useShield: guarded('useShield', (c, uid: string) => {
		const { G, playerID, random } = c;
		const ship = G.players[playerID].ship!;
		const cross = G.turn.crossing!;
		const o = ship.outfits.find((x) => x.uid === uid)!;
		const def = OUTFITS_BY_ID[o.outfitId];
		o.usedSpaces.push(freeUseSpaces(ship, uid, 'shield')[0]);
		ship.armedMarkers--;
		const sides = DIE_SIDES[def.die!];
		// Enviro-Shld on this shield: it rolls its maximum against board effects.
		const shieldKeys = new Set(placedCells(o).map((x) => cellKey(x.x, x.y)));
		const enviro = ship.outfits.some((m) => m.outfitId === 'enviro-shield' && placedCells(m).some((x) => shieldKeys.has(cellKey(x.x, x.y))));
		const roll = enviro ? sides : rollDie(G, playerID, random, sides);
		const damaged = damagedCells(ship);
		const penalty = placedCells(o).filter((x) => damaged.has(cellKey(x.x, x.y))).length;
		const block = Math.max(1, roll - penalty);
		cross.amount = Math.max(0, (cross.amount ?? 0) - block);
		log(G, playerID, `fired the ${def.name}: ${enviro ? `${sides} (Enviro-Shld)` : `rolled ${roll}`}${penalty ? ` −${penalty} damage` : ''}, blocking ${block}; ${cross.amount} left`);
		if (cross.amount === 0 || !usableShields(ship).length) {
			if (takeBorderEffect(c)) resolveBorders(c);
		}
	}),

	/** After a bad asteroid / nebula roll: take what's left and fly on. */
	acceptBorderEffect: guarded('acceptBorderEffect', (c) => {
		if (takeBorderEffect(c)) resolveBorders(c);
	}),

	/** Place one pending damage on a hold space or outfit section of the captain's choice. */
	placeDamage: guarded('placeDamage', ({ G, playerID }, cell: string) => {
		const p = G.players[playerID];
		const kind = p.pendingDamage.shift()!;
		const cube = applyDamage(p.ship!, kind, cell);
		log(G, playerID, `placed ${kind === 'ice' ? 'ice damage' : 'damage'} in their hold${cube ? ` (a ${cube} cube was jettisoned)` : ''}`);
	}),

	/** Put a gained cargo cube on an empty hold space or Cargo Pod section of the captain's choice. */
	placeCargo: guarded('placeCargo', ({ G, playerID }, cell: string) => {
		const p = G.players[playerID];
		const color = p.pendingCargo.shift()!;
		p.ship!.cargo.push({ cell, color });
		log(G, playerID, `stowed a ${color} cube`);
	}),

	/** Jettison a gained cargo cube instead of keeping it. */
	jettisonCargo: guarded('jettisonCargo', ({ G, playerID }) => {
		const color = G.players[playerID].pendingCargo.shift()!;
		log(G, playerID, `jettisoned a ${color} cube`);
	}),

	/** Two face-up exploration tokens: discard both for 1 fame or 2,000 credits. */
	claimExplorationPair: guarded('claimExplorationPair', ({ G, playerID }, choice: 'fame' | 'credits') => {
		const p = G.players[playerID];
		for (let n = 0; n < 2; n++) p.explorationTokens.splice(p.explorationTokens.findIndex((t) => t !== 'captain-in-need'), 1);
		// More than one pair can be collected in a single move.
		G.turn.explorationPairPending = pairableTokens(p.explorationTokens).length >= 2;
		if (choice === 'fame') p.fame += EXPLORATION_PAIR_FAME;
		else p.credits += EXPLORATION_PAIR_CREDITS;
		log(G, playerID, `discarded two exploration tokens for ${choice === 'fame' ? '1 fame' : '2,000 credits'}`);
	}),

	/**
	 * Scan Sector (standard action, rulebook p9): 1 energy to draw a sector and place it
	 * against the chosen unexplored side next to the ship. Ends movement.
	 */
	scanSector: guarded('scanSector', ({ G, playerID, random }, slot: number) => {
		const p = G.players[playerID];
		const edge = unexploredEdges(G.board, p.position!).find((e) => e.slot === slot)!;
		p.ship!.energy -= 1;
		const lost = G.turn.movement;
		G.turn.movement = 0;
		const name = exploreSector(G, random, edge.sectorIndex, slot);
		log(G, playerID, `scanned past the ${SLOT_NAMES[slot]} edge (−1 energy) and found ${name}${lost ? ` (${lost} unspent movement lost)` : ''}`);
	}),

	/**
	 * Blind Jump (minor action, rulebook p9): 1 movement to draw and place the sector
	 * across the edge, then the ship must move into the declared hex, whatever is there.
	 */
	blindJump: guarded('blindJump', ({ G, playerID, random, events }, target: string) => {
		const p = G.players[playerID];
		const edge = unexploredEdges(G.board, p.position!).find((e) => e.target === target)!;
		const name = exploreSector(G, random, edge.sectorIndex, edge.slot);
		log(G, playerID, `blind jumped past the ${SLOT_NAMES[edge.slot]} edge into ${name}`);
		if (boardHexes(G.board).get(target)?.kind === 'star') {
			G.turn.movement -= 1;
			p.position = target;
			destroyShip(G, playerID, 'blind jumped into a star');
			events.endTurn();
			return;
		}
		// The ship must fly into the declared space, rolling for any border on the way in.
		flyPath({ G, playerID, random, events } as MoveCtx, [target], true);
	}),

	/** Status Phase (simplified): refresh impulse & ability, arm markers for 1 energy each, end the turn. */
	endTurn: guarded('endTurn', ({ G, playerID, events }, armCount: number = 0) => {
		const ship = G.players[playerID].ship!;
		G.turn.movement = 0;
		ship.impulseReady = true;
		ship.abilityExhausted = false;
		if (armCount > 0) {
			armMarkers(ship, armCount);
			ship.energy -= armCount;
			log(G, playerID, `armed ${armCount} marker${armCount === 1 ? '' : 's'} (−${armCount} energy)`);
		}
		const draws = G.turn.missionDraws?.length ?? 0;
		if (draws) log(G, playerID, `drew ${draws * MISSION_DRAW} mission cards (choosing a mission comes later)`);
		log(G, playerID, 'ended their turn');
		events.endTurn();
	}),
};

const allPicked = (G: ZiaState) => Object.values(G.players).every((p) => p.ship);
const allOutfitted = (G: ZiaState) => Object.values(G.players).every((p) => p.outfittingDone);

const ZiaGame: Game<ZiaState> = {
	name: 'zia',

	setup: ({ ctx, random }, setupData?: ZiaSetupData) => createInitialState(ctx, setupData, random as unknown as RandomApi),

	moves: moves as unknown as Game<ZiaState>['moves'],

	phases: {
		pickShip: {
			start: true,
			turn: { order: TurnOrder.CUSTOM_FROM('pickOrder') },
			endIf: ({ G }) => allPicked(G),
			next: 'outfit',
		},
		outfit: {
			turn: { order: TurnOrder.CUSTOM_FROM('pickOrder') },
			onBegin: ({ G }) => {
				G.stage = 'outfit';
				log(G, null, `Captains buy starting outfits with their ${STARTING_CREDITS.toLocaleString('en-US')} credits.`);
			},
			endIf: ({ G }) => allOutfitted(G),
			next: 'play',
		},
		play: {
			turn: {
				order: TurnOrder.CUSTOM_FROM('turnOrder'),
				onBegin: ({ G, ctx, random }) => {
					G.turn = { movement: 0, explorationPairPending: false, crossing: null, missionDraws: [] };
					const p = G.players[ctx.currentPlayer];
					if (p?.ship && !p.position) respawnShip(G, p.id, random as unknown as RandomApi);
				},
			},
			onBegin: ({ G }) => {
				G.stage = 'play';
				log(G, null, 'All ships launched. The game begins!');
			},
		},
	},

	endIf: ({ G }) => {
		const winner = Object.values(G.players).find((p) => p.fame >= G.fameTarget);
		return winner ? { winner: winner.id } : undefined;
	},
};

export const ziaGameDef = defineGame<ZiaState>({
	game: ZiaGame,
	id: 'zia',
	displayName: 'Xia: Legends of a Drift System',
	description: 'Online play for Xia: Legends of a Drift System — explore, trade, fight and become a legend.',
	minPlayers: 2,
	maxPlayers: 5,
	validateMove: ({ G, playerID, currentPlayer }, moveName, ...args) => checkMove(G, playerID, currentPlayer, moveName, args),
});
