import type { Game, Ctx } from 'boardgame.io';
import { INVALID_MOVE, TurnOrder } from 'boardgame.io/core';
import { defineGame } from '@engine/client';
import { IN_SCOPE_SHIPS, SHIPS_BY_ID } from '../data/ships';
import { OUTFITS, OUTFITS_BY_ID, type Die } from '../data/outfits';
import { boardHexes, reachableHexes, startingBoard, startingSpawnFor } from './board';
import { canPlaceOutfit, cellKey, placedCells } from './holdGeometry';
import { createShipState, shipDef } from './ship';
import {
	MARKERS_PER_SHIP,
	PLAYER_COLORS,
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
		};
	});

	const supply: Record<string, number> = {};
	for (const o of OUTFITS) if (o.copies != null) supply[o.id] = o.copies;

	return {
		history: [],
		stage: 'pickShip',
		players,
		fameTarget: setupData?.fameTarget ?? DEFAULT_FAME_TARGET,
		board: startingBoard(seats),
		pickOrder,
		turnOrder,
		supply,
		turn: { movement: 0 },
		log: [
			...pickOrder.map((s) => ({ seat: s, text: `rolled ${rolls[s]} for ship pick order` })),
			{ seat: null, text: 'Captains pick a Tier I ship, highest roll first.' },
		],
	};
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

// ---------------------------------------------------------------------------
// Validation (shared by the client for instant feedback and by the moves)
// ---------------------------------------------------------------------------

export function checkMove(G: ZiaState, playerID: string, currentPlayer: string, moveName: string, args: unknown[]): true | string {
	if (playerID !== currentPlayer) return 'Not your turn';
	const p = G.players[playerID];
	if (!p) return 'Unknown captain';

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

	moveShip: guarded('moveShip', ({ G, playerID }, target: string) => {
		const p = G.players[playerID];
		const cost = reachableHexes(G.board, p.position!, G.turn.movement, occupiedHexes(G, playerID)).get(target)!;
		p.position = target;
		G.turn.movement -= cost;
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
				onBegin: ({ G }) => {
					G.turn = { movement: 0 };
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
