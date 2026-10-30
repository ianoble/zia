import type { Game, Ctx } from 'boardgame.io';
import { INVALID_MOVE, TurnOrder } from 'boardgame.io/core';
import { defineGame } from '@engine/client';
import { IN_SCOPE_SHIPS, SHIPS_BY_ID } from '../data/ships';
import { OUTFITS, OUTFITS_BY_ID, type Die } from '../data/outfits';
import { SECTORS_BY_ID, type TradeCube } from '../data/sectors';
import { MISSION_CARDS } from '../data/missions';
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
	ECONOMY_CUBES,
	ECONOMY_MAX,
	MARKERS_PER_SHIP,
	PLAYER_COLORS,
	type CubeColor,
	type EconomyCube,
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
			activeMissions: [],
			drawnMissions: [],
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
		// Setup step 7 [E]: roll a d6 for each cube type's starting cubes on the Economy Board.
		economy: Object.fromEntries(ECONOMY_CUBES.map((c) => [c, { cubes: die(6), demand: 0 }])) as ZiaState['economy'],
		missionDeck: MISSION_CARDS.map((m) => m.id),
		missionDiscard: [],
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
}

/** Cards drawn per mission point (rulebook p12). */
export const MISSION_DRAW = 3;

/**
 * Draw (minor action, rulebook p12): a ship that flies onto or over a mission point (once
 * per point per turn, with a free mission slot) gets to draw 3 mission cards at the end of
 * the turn. It doesn't use up any movement.
 */
function queueMissionDraw(c: MoveCtx, hex: string) {
	const { G, playerID } = c;
	const p = G.players[playerID];
	if (!p.ship || !boardHexes(G.board).get(hex)?.kinds.includes('mission')) return;
	G.turn.missionDraws ??= [];
	if (G.turn.missionDraws.includes(hex)) return;
	if ((p.activeMissions?.length ?? 0) >= missionLimit(p.ship)) return;
	G.turn.missionDraws.push(hex);
	log(G, playerID, `reached a mission point: will draw ${MISSION_DRAW} mission cards at the end of the turn`);
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
	queueMissionDraw(c, to);
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

// ---------------------------------------------------------------------------
// Trade (rulebook p15-16): buy and sell cubes at a planet's Buy / Sell space
// ---------------------------------------------------------------------------

export const BUY_PRICE = 1000;
export const BUY_MAX = 2;
export const SELL_PRICE = 1000;

/** The trade on the space the captain's ship is on, with the planet tile. */
export function tradeHere(G: ZiaState, seat: string): { buy?: TradeCube; sell?: TradeCube; tileId: string } | null {
	const pos = G.players[seat]?.position;
	const h = pos ? boardHexes(G.board).get(pos) : null;
	if (!h || !(h.kinds.includes('buy') || h.kinds.includes('sell'))) return null;
	const tile = SECTORS_BY_ID[G.board.sectors[h.sectorIndex].tileId];
	return {
		tileId: tile.id,
		...(h.kinds.includes('buy') && tile.trade?.buy ? { buy: tile.trade.buy } : {}),
		...(h.kinds.includes('sell') && tile.trade?.sell ? { sell: tile.trade.sell } : {}),
	};
}

/** Cubes in the hold this Sell space will buy. */
export function sellableCubes(ship: ShipState, sell: TradeCube): ShipState['cargo'] {
	return ship.cargo.filter((c) => c.color !== 'ember' && (sell === 'any' || c.color === sell));
}

/** Free hold room for cubes, after cubes already waiting to be placed. */
const cargoRoom = (p: ZiaPlayer) => cargoTargets(p.ship!).length - p.pendingCargo.length;

/** A standard action ends movement: unspent movement is lost. */
function endMovement(G: ZiaState, seat: string) {
	if (G.turn.movement > 0) log(G, seat, `(${G.turn.movement} unspent movement lost)`);
	G.turn.movement = 0;
}

// ---------------------------------------------------------------------------
// Starport Phase (rulebook p18)
// ---------------------------------------------------------------------------

export const WEALTH_PRICE = 5000;

/** A starport: any space inside a planetary shield. (The Kiln comes later; Dead Worlds aren't planets.) */
export function atStarport(G: ZiaState, seat: string): boolean {
	const pos = G.players[seat]?.position;
	return !!pos && !!boardHexes(G.board).get(pos)?.kinds.includes('planet');
}

/** Repairing all normal damage: 1,000 for Tier I-II ships, 2,000 for Tier III. */
export const repairCost = (ship: ShipState) => (shipDef(ship).tier >= 3 ? 2000 : 1000);

/** Selling an outfit: half its price, rounded up to the next 1,000 (I and II: 1,000, III: 2,000). */
export const outfitSellPrice = (outfitId: string) => Math.ceil(OUTFITS_BY_ID[outfitId].cost / 2 / 1000) * 1000;

/** Hold cells an outfit sits on that have damage. */
const outfitDamaged = (ship: ShipState, o: PlacedOutfit) => {
	const damaged = damagedCells(ship);
	return placedCells(o).some((c) => damaged.has(cellKey(c.x, c.y)));
};

/** Starport rule: outfits can't go on damaged spaces or on cargo (move the cubes first). */
function clearOfDamageAndCargo(ship: ShipState, o: PlacedOutfit): true | string {
	const damaged = damagedCells(ship);
	const cargo = new Set(ship.cargo.map((c) => c.cell));
	const cells = placedCells(o).map((c) => cellKey(c.x, c.y));
	if (cells.some((k) => damaged.has(k))) return "Outfits can't go on damaged spaces";
	if (cells.some((k) => cargo.has(k))) return 'Move the cargo out of the way first';
	return true;
}

/** Draw a random mission card; the discard pile is reshuffled when the deck runs out. */
function drawMissionCard(G: ZiaState, random: RandomApi): string | null {
	if (!G.missionDeck.length) {
		G.missionDeck = G.missionDiscard;
		G.missionDiscard = [];
	}
	if (!G.missionDeck.length) return null;
	return G.missionDeck.splice(random.Die(G.missionDeck.length) - 1, 1)[0];
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
	// Active missions and face-down mission cards are discarded (rulebook p12).
	G.missionDiscard.push(...(p.activeMissions ?? []), ...(p.drawnMissions ?? []));
	p.activeMissions = [];
	p.drawnMissions = [];
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
	// Mission cards drawn at the end of the turn: choose which to keep before anything else.
	if (p.drawnMissions?.length && moveName !== 'chooseMissions') return 'Choose which mission cards to keep first';
	// Docked at a starport: the Action Phase is over.
	if (G.turn.starport && ACTION_MOVES.has(moveName)) return "You're docked: the Action Phase is over";
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
			if (G.stage !== 'outfit' && !(G.stage === 'play' && G.turn.starport)) return 'Outfits are bought at a starport (dock first)';
			if (!p.ship) return 'Pick a ship first';
			if (moveName === 'buyOutfit') {
				const def = OUTFITS_BY_ID[args[0] as string];
				if (!def) return 'Unknown outfit';
				if (p.credits < def.cost) return `Not enough credits for ${def.name}`;
				if (G.supply[def.id] === 0) return `No ${def.name} left in the supply`;
				const pos = placementArgs(args.slice(1));
				if (!pos) return 'Bad placement';
				const candidate = { uid: '__new', outfitId: def.id, usedSpaces: [], ...pos };
				const fits = canPlaceOutfit(shipDef(p.ship), p.ship.outfits, candidate);
				return fits === true ? clearOfDamageAndCargo(p.ship, candidate) : fits;
			}
			const uid = args[0] as string;
			const existing = p.ship.outfits.find((o) => o.uid === uid);
			if (!existing) return 'That outfit is not in your hold';
			if (outfitDamaged(p.ship, existing)) return moveName === 'returnOutfit' ? "Damaged outfits can't be sold: repair first" : "Damaged outfits can't be moved";
			if (moveName === 'returnOutfit') {
				const rest = p.ship.outfits.filter((o) => o.uid !== uid);
				return modsStillValid(p.ship, rest) ? true : 'Remove the mod sitting on it first';
			}
			const pos = placementArgs(args.slice(1));
			if (!pos) return 'Bad placement';
			const moved = { ...existing, ...pos, usedSpaces: [] };
			const ok = canPlaceOutfit(shipDef(p.ship), p.ship.outfits, moved);
			if (ok !== true) return ok;
			const clear = clearOfDamageAndCargo(p.ship, moved);
			if (clear !== true) return clear;
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

		case 'chooseMissions': {
			if (!p.drawnMissions?.length || !p.ship) return 'No mission cards to choose from';
			const ids = args[0];
			if (!Array.isArray(ids) || !ids.length) return 'Keep at least one mission';
			if (new Set(ids).size !== ids.length || ids.some((id) => !p.drawnMissions.includes(id as string))) return 'Pick from the cards you drew';
			if (ids.length > Math.max(1, missionLimit(p.ship) - p.activeMissions.length)) return `You can keep up to ${Math.max(1, missionLimit(p.ship) - p.activeMissions.length)}`;
			return true;
		}

		case 'discardMission':
			if (G.stage !== 'play') return 'Not during setup';
			return p.activeMissions?.includes(args[0] as string) ? true : 'That is not one of your active missions';

		case 'buyCargo': {
			if (G.stage !== 'play' || !p.ship) return 'Not during setup';
			const trade = tradeHere(G, playerID);
			if (!trade?.buy) return 'Fly to a planet\'s Buy space to buy cubes';
			const [color, count] = args as [EconomyCube, number];
			if (!ECONOMY_CUBES.includes(color)) return 'Pick a cube colour';
			if (trade.buy !== 'any' && trade.buy !== color) return `This planet only sells ${trade.buy}`;
			if (count !== 1 && count !== 2) return `Buy 1 or ${BUY_MAX} cubes`;
			if (p.credits < BUY_PRICE) return `Buying costs ${BUY_PRICE.toLocaleString('en-US')} credits`;
			if (G.economy[color].cubes < count) return `Only ${G.economy[color].cubes} ${color} left on the Economy Board`;
			if (cargoRoom(p) < count) return 'Not enough room in your hold';
			return true;
		}

		case 'sellCargo': {
			if (G.stage !== 'play' || !p.ship) return 'Not during setup';
			const trade = tradeHere(G, playerID);
			if (!trade?.sell) return 'Fly to a planet\'s Sell space to sell cubes';
			const cells = args[0];
			if (!Array.isArray(cells) || !cells.length) return 'Pick cubes to sell';
			const sellable = new Set(sellableCubes(p.ship, trade.sell).map((c) => c.cell));
			if (new Set(cells).size !== cells.length || cells.some((c) => !sellable.has(c as string))) return 'This planet doesn\'t buy those cubes';
			return true;
		}

		case 'enterStarport':
			if (G.stage !== 'play' || !p.ship) return 'Not during setup';
			if (G.turn.starport) return 'Already docked';
			return atStarport(G, playerID) ? true : 'Starports are inside a planetary shield';

		case 'rechargeEnergy':
		case 'repairDamage':
		case 'thawIce':
		case 'buyFame':
		case 'moveCargo': {
			if (!G.turn.starport || !p.ship) return 'Dock at a starport first';
			if (moveName === 'rechargeEnergy') return p.ship.energy < shipDef(p.ship).energy ? true : 'Energy is already full';
			if (moveName === 'repairDamage') {
				if (!p.ship.damage.length) return 'No damage to repair';
				return p.credits >= repairCost(p.ship) ? true : `Repairs cost ${repairCost(p.ship).toLocaleString('en-US')} credits`;
			}
			if (moveName === 'thawIce') return p.ship.iceDamage.length ? true : 'No ice damage to thaw';
			if (moveName === 'buyFame') {
				if (p.credits < WEALTH_PRICE) return `Fame costs ${WEALTH_PRICE.toLocaleString('en-US')} credits`;
				return p.fame + 1 >= G.fameTarget ? "The winning fame point can't be bought" : true;
			}
			const [from, to] = args as [string, string];
			if (!p.ship.cargo.some((c) => c.cell === from)) return 'No cube there';
			return cargoTargets(p.ship).includes(to) ? true : "A cube can't go there";
		}

		case 'claimExplorationPair':
			if (!G.turn.explorationPairPending) return 'No exploration tokens to cash in';
			return args[0] === 'fame' || args[0] === 'credits' ? true : 'Choose fame or credits';

		case 'endTurn': {
			if (G.stage !== 'play' || !p.ship) return 'Not during setup';
			const n = args[0] ?? 0;
			if (!Number.isInteger(n) || (n as number) < 0) return 'Bad number of markers';
			if ((n as number) > markersAvailableToArm(p.ship)) return 'Not that many markers to arm';
			if ((n as number) > p.ship.energy && !atStarport(G, playerID)) return 'Not enough energy to arm that many markers';
			return true;
		}
	}
	return `Unknown move ${moveName}`;
}

/** Moves that resolve something the captain must deal with first (damage, cubes, token pairs). */
const RESOLVING_MOVES = new Set(['placeDamage', 'placeCargo', 'jettisonCargo', 'claimExplorationPair']);

/** Action Phase moves, not allowed once docked at a starport. */
const ACTION_MOVES = new Set(['useImpulse', 'fireEngine', 'moveShip', 'blindJump', 'scanSector', 'buyCargo', 'sellCargo', 'crossBorder', 'stopMove']);

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
		const refund = G.stage === 'outfit' ? def.cost : outfitSellPrice(o.outfitId);
		p.credits += refund;
		if (G.supply[o.outfitId] != null) G.supply[o.outfitId]++;
		log(G, playerID, G.stage === 'outfit' ? `returned a ${def.name}` : `sold a ${def.name} for ${refund.toLocaleString('en-US')} credits`);
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

	/**
	 * Status Phase, after drawing mission cards: keep at least one as an active mission (up
	 * to the Active Mission Limit) and discard the rest, then the turn ends (rulebook p12).
	 */
	chooseMissions: guarded('chooseMissions', ({ G, playerID, events }, ids: string[]) => {
		const p = G.players[playerID];
		// Over the limit (e.g. a damaged M-Comp): the oldest active missions are dropped.
		const overflow = Math.max(0, p.activeMissions.length + ids.length - missionLimit(p.ship!));
		G.missionDiscard.push(...p.activeMissions.splice(0, overflow));
		p.activeMissions.push(...ids);
		G.missionDiscard.push(...p.drawnMissions.filter((id) => !ids.includes(id)));
		const discarded = p.drawnMissions.length - ids.length;
		p.drawnMissions = [];
		log(G, playerID, `kept ${ids.length} mission${ids.length === 1 ? '' : 's'} and discarded ${discarded}`);
		log(G, playerID, 'ended their turn');
		events.endTurn();
	}),

	/**
	 * Buy (standard action): up to 2 of the planet's cubes for 1,000, from the Economy
	 * Board. The captain places them in the hold. Repeatable while credits and room last.
	 */
	buyCargo: guarded('buyCargo', ({ G, playerID }, color: EconomyCube, count: number) => {
		const p = G.players[playerID];
		p.credits -= BUY_PRICE;
		G.economy[color].cubes -= count;
		for (let i = 0; i < count; i++) gainCargo(G, playerID, color);
		log(G, playerID, `bought ${count} ${color} cube${count === 1 ? '' : 's'} for ${BUY_PRICE.toLocaleString('en-US')} credits`);
		endMovement(G, playerID);
	}),

	/**
	 * Sell (standard action): 1,000 per cube the planet buys. Selling a Big Shipment (2+
	 * cubes and every cube this space buys) earns 1 fame. The planet consumes the cubes
	 * and produces its own type onto the Economy Board (max 6), claiming any In Demand
	 * credits for the seller.
	 */
	sellCargo: guarded('sellCargo', ({ G, playerID }, cells: string[]) => {
		const p = G.players[playerID];
		const ship = p.ship!;
		const trade = tradeHere(G, playerID)!;
		const all = sellableCubes(ship, trade.sell!).length;
		const sold = ship.cargo.filter((c) => cells.includes(c.cell));
		ship.cargo = ship.cargo.filter((c) => !cells.includes(c.cell));
		p.credits += SELL_PRICE * sold.length;
		const big = sold.length >= 2 && sold.length === all;
		if (big) p.fame++;
		log(G, playerID, `sold ${sold.length} cube${sold.length === 1 ? '' : 's'} for ${(SELL_PRICE * sold.length).toLocaleString('en-US')} credits${big ? ' (Big Shipment: +1 fame)' : ''}`);
		// Produce: Loath (sells 'any') never produces; a planet produces the cube type it sells to captains.
		const produce = SECTORS_BY_ID[trade.tileId].trade?.buy;
		if (produce && produce !== 'any') {
			const section = G.economy[produce];
			let made = 0;
			for (let i = 0; i < sold.length && section.cubes < ECONOMY_MAX; i++) {
				section.cubes++;
				made++;
			}
			if (made && section.demand) {
				p.credits += section.demand;
				log(G, playerID, `produced ${produce}, which was In Demand: +${section.demand.toLocaleString('en-US')} credits`);
				section.demand = 0;
			}
		}
		endMovement(G, playerID);
	}),

	/** Dock: end the Action Phase at a starport and start the Starport Phase. */
	enterStarport: guarded('enterStarport', ({ G, playerID }) => {
		G.turn.starport = true;
		endMovement(G, playerID);
		log(G, playerID, 'docked at the starport');
	}),

	/** Starport: recharge energy to full, free. */
	rechargeEnergy: guarded('rechargeEnergy', ({ G, playerID }) => {
		const ship = G.players[playerID].ship!;
		ship.energy = shipDef(ship).energy;
		log(G, playerID, 'recharged their energy');
	}),

	/** Starport: remove all normal damage (1,000; 2,000 for Tier III). */
	repairDamage: guarded('repairDamage', ({ G, playerID }) => {
		const p = G.players[playerID];
		const cost = repairCost(p.ship!);
		p.credits -= cost;
		p.ship!.damage = [];
		log(G, playerID, `repaired all damage for ${cost.toLocaleString('en-US')} credits`);
	}),

	/** Starport [E]: remove all ice damage, free. */
	thawIce: guarded('thawIce', ({ G, playerID }) => {
		G.players[playerID].ship!.iceDamage = [];
		log(G, playerID, 'thawed their ice damage');
	}),

	/** Starport: Throw Some Credits Around, 5,000 for 1 fame (never the winning point). */
	buyFame: guarded('buyFame', ({ G, playerID }) => {
		const p = G.players[playerID];
		p.credits -= WEALTH_PRICE;
		p.fame++;
		log(G, playerID, `threw some credits around: ${WEALTH_PRICE.toLocaleString('en-US')} for 1 fame`);
	}),

	/** Starport: rearrange the hold, moving a cube to another free space. */
	moveCargo: guarded('moveCargo', ({ G, playerID }, from: string, to: string) => {
		const cube = G.players[playerID].ship!.cargo.find((c) => c.cell === from)!;
		cube.cell = to;
	}),

	/** Jettison an active mission (allowed at any time, rulebook p12). */
	discardMission: guarded('discardMission', ({ G, playerID }, id: string) => {
		const p = G.players[playerID];
		p.activeMissions = p.activeMissions.filter((m) => m !== id);
		G.missionDiscard.push(id);
		log(G, playerID, 'discarded an active mission');
	}),

	/** Status Phase (simplified): refresh impulse & ability, arm markers for 1 energy each, end the turn. */
	endTurn: guarded('endTurn', ({ G, playerID, events, random }, armCount: number = 0) => {
		const ship = G.players[playerID].ship!;
		G.turn.movement = 0;
		ship.impulseReady = true;
		ship.abilityExhausted = false;
		if (armCount > 0) {
			armMarkers(ship, armCount);
			// Arming at a starport is free (rulebook p18).
			const free = atStarport(G, playerID);
			if (!free) ship.energy -= armCount;
			log(G, playerID, `armed ${armCount} marker${armCount === 1 ? '' : 's'} (${free ? 'free at the starport' : `−${armCount} energy`})`);
		}
		// Status step 6 [E] In Demand: every empty Economy Board section gets 1,000 credits (max 1,000).
		for (const c of ECONOMY_CUBES) if (G.economy[c].cubes === 0) G.economy[c].demand = 1000;
		// Status Phase: mission cards drawn on mission points this turn are looked at now,
		// and the captain keeps at least one (chooseMissions ends the turn).
		const p = G.players[playerID];
		const draws = (G.turn.missionDraws?.length ?? 0) * MISSION_DRAW;
		for (let i = 0; i < draws; i++) {
			const id = drawMissionCard(G, random);
			if (id) p.drawnMissions.push(id);
		}
		G.turn.missionDraws = [];
		if (p.drawnMissions.length) {
			log(G, playerID, `drew ${p.drawnMissions.length} mission cards and is choosing which to keep`);
			return;
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
					G.turn = { movement: 0, explorationPairPending: false, crossing: null, missionDraws: [], starport: false };
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
