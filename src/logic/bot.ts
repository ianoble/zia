/**
 * Simple bot captains, used to fill seats for testing. Pure decision function:
 * given the state, return the next move for the bot's seat (or null to wait).
 */
import { IN_SCOPE_SHIPS } from '../data/ships';
import { OUTFITS_BY_ID } from '../data/outfits';
import { reachableHexes } from './board';
import { checkMove } from './game';
import { autoPlace } from './holdGeometry';
import { shipDef } from './ship';
import { MARKERS_PER_SHIP, type ZiaState } from './types';

export interface BotMove {
	move: string;
	args: unknown[];
}

/** Starting loadout a bot tries to buy, in order (one of each). */
const BOT_LOADOUT = ['engine-d6', 'shield-d6', 'blaster-d6', 'missile-d8'];

export function botDecision(G: ZiaState, seat: string, currentPlayer: string, rand: () => number = Math.random): BotMove | null {
	if (seat !== currentPlayer) return null;
	const p = G.players[seat];
	if (!p) return null;
	const ok = (m: BotMove) => checkMove(G, seat, currentPlayer, m.move, m.args) === true;

	if (G.stage === 'pickShip') {
		const taken = new Set(Object.values(G.players).map((o) => o.ship?.shipId));
		const free = IN_SCOPE_SHIPS.filter((s) => s.tier === 1 && !taken.has(s.id));
		if (!free.length) return null;
		const ship = free[Math.floor(rand() * free.length)];
		return { move: 'pickShip', args: [ship.id, Math.floor(rand() * ship.abilities.length)] };
	}

	if (G.stage === 'outfit' && p.ship) {
		const owned = new Set(p.ship.outfits.map((o) => o.outfitId));
		for (const id of BOT_LOADOUT) {
			if (owned.has(id) || p.credits < OUTFITS_BY_ID[id].cost) continue;
			const spot = autoPlace(shipDef(p.ship), p.ship.outfits, id, '__bot');
			if (!spot) continue;
			const m = { move: 'buyOutfit', args: [id, spot.x, spot.y, spot.rotation, spot.flipped] };
			if (ok(m)) return m;
		}
		return { move: 'finishOutfitting', args: [] };
	}

	if (G.stage === 'play' && p.ship && p.position) {
		// Spend movement on a random reachable space, preferring the farthest.
		if (G.turn.movement > 0) {
			const occupied = new Set(Object.values(G.players).filter((o) => o.id !== seat && o.position).map((o) => o.position!));
			const reach = [...reachableHexes(G.board, p.position, G.turn.movement, occupied)];
			if (reach.length) {
				const far = Math.max(...reach.map(([, c]) => c));
				const options = reach.filter(([, c]) => c === far);
				return { move: 'moveShip', args: [options[Math.floor(rand() * options.length)][0]] };
			}
		}
		if (p.ship.impulseReady) return { move: 'useImpulse', args: [] };
		const arm = Math.min(MARKERS_PER_SHIP - p.ship.armedMarkers, p.ship.energy);
		return { move: 'endTurn', args: [arm] };
	}

	return null;
}
