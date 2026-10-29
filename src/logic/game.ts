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
	reachableHexes,
	respawnHex,
	SLOT_NAMES,
	startingBoard,
	startingDeck,
	startingSpawnFor,
	unexploredEdges,
} from './board';
import { canPlaceOutfit, cellKey, hullCells, occupancy, placedCells } from './holdGeometry';
import { applyDamage, createShipState, damageTargets, shipDef, totalDamage } from './ship';
import {
	MARKERS_PER_SHIP,
	PLAYER_COLORS,
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
	const o = ship.outfits.find((x) => x.uid === uid);
	if (!o || OUTFITS_BY_ID[o.outfitId].type !== 'engine') return [];
	const damaged = new Set(ship.damage);
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
	if (totalDamage(ship) + p.pendingDamage.length >= shipDef(ship).holdSize) {
		destroyShip(G, seat, reason);
		return true;
	}
	return false;
}

/** Put a cargo cube in an empty hold space; returns false (jettisoned) if there's no room. */
function addCargo(ship: ShipState, color: ExplorationCube): boolean {
	const blocked = new Set([...ship.damage, ...ship.iceDamage, ...ship.cargo.map((c) => c.cell), ...occupancy(ship.outfits).keys()]);
	const cell = [...hullCells(shipDef(ship))].find((k) => !blocked.has(k));
	if (!cell) return false;
	ship.cargo.push({ cell, color });
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
		if (!addCargo(ship, color)) text += ', but the hold is full so it was jettisoned';
	}
	log(G, seat, text);

	if (token === 'ice-damage' && takeDamage(G, seat, 'ice', 1, 'ice damage filled the hold')) return true;
	if (pairableTokens(p.explorationTokens).length >= 2) G.turn.explorationPairPending = true;
	return false;
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
	if (p.ship) p.ship.cargo = [];
	G.turn.movement = 0;
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
	const roll = random.D20();
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
	if (roll === 20) {
		p.fame++;
		log(G, seat, 'rolled a natural 20: +1 fame for Luck');
	}
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
	// Damage to place and exploration pairs to cash in come before anything else.
	if (p.pendingDamage?.length && moveName !== 'placeDamage' && moveName !== 'claimExplorationPair') {
		return 'First place your damage: click a space in your hold';
	}
	if (G.turn.explorationPairPending && moveName !== 'claimExplorationPair' && moveName !== 'placeDamage') {
		return 'First choose 1 fame or 2,000 credits for your two exploration tokens';
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
		const damaged = new Set(ship.damage);
		const penalty = placedCells(o).filter((c) => damaged.has(cellKey(c.x, c.y))).length;
		const roll = random.Die(DIE_SIDES[def.die!]);
		const result = Math.max(1, roll - penalty);
		const lost = G.turn.movement;
		G.turn.movement = result;
		log(G, playerID, `fired the ${def.name}: rolled ${roll}${penalty ? ` −${penalty} damage` : ''} → ${result} movement${lost ? ` (${lost} unspent lost)` : ''}`);
	}),

	moveShip: guarded('moveShip', ({ G, playerID, random, events }, target: string) => {
		const p = G.players[playerID];
		const path = movePath(G.board, p.position!, target, G.turn.movement, new Set(G.explorationSpaces))!;
		G.turn.movement -= path.length;
		log(G, playerID, `moved ${path.length} space${path.length === 1 ? '' : 's'}`);
		// Collecting a token is a minor action: tokens on the way are flipped without stopping.
		for (const hex of path) {
			p.position = hex;
			if (collectExplorationToken(G, playerID, hex, random)) {
				events.endTurn();
				return;
			}
		}
	}),

	/** Place one pending damage on a hold space or outfit section of the captain's choice. */
	placeDamage: guarded('placeDamage', ({ G, playerID }, cell: string) => {
		const p = G.players[playerID];
		const kind = p.pendingDamage.shift()!;
		const cube = applyDamage(p.ship!, kind, cell);
		log(G, playerID, `placed ${kind === 'ice' ? 'ice damage' : 'damage'} in their hold${cube ? ` (a ${cube} cube was jettisoned)` : ''}`);
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
		G.turn.movement -= 1;
		const name = exploreSector(G, random, edge.sectorIndex, edge.slot);
		p.position = target;
		log(G, playerID, `blind jumped past the ${SLOT_NAMES[edge.slot]} edge into ${name}`);
		if (boardHexes(G.board).get(target)?.kind === 'star') {
			destroyShip(G, playerID, 'blind jumped into a star');
			events.endTurn();
		} else if (collectExplorationToken(G, playerID, target, random)) {
			events.endTurn();
		}
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
					G.turn = { movement: 0, explorationPairPending: false };
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
