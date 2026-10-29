import type { Game, Ctx } from 'boardgame.io';
import { defineGame } from '@engine/client';
import { PLAYER_COLORS, type ZiaPlayer, type ZiaSetupData, type ZiaState } from './types';

/** Placeholder values until the rules are modelled. */
export const STARTING_CREDITS = 0;
export const DEFAULT_FAME_TARGET = 10;

export function createInitialState(ctx: Pick<Ctx, 'numPlayers' | 'playOrder'>, setupData?: ZiaSetupData): ZiaState {
	const players: Record<string, ZiaPlayer> = {};
	ctx.playOrder.forEach((id, i) => {
		players[id] = {
			id,
			color: PLAYER_COLORS[i % PLAYER_COLORS.length],
			credits: STARTING_CREDITS,
			fame: 0,
			bounty: 0,
			ship: null,
		};
	});
	return {
		history: [],
		players,
		fameTarget: setupData?.fameTarget ?? DEFAULT_FAME_TARGET,
	};
}

const ZiaGame: Game<ZiaState> = {
	name: 'zia',

	setup: ({ ctx }, setupData?: ZiaSetupData) => createInitialState(ctx, setupData),

	moves: {
		/** Placeholder: end the current turn. */
		endTurn: ({ events }) => {
			events.endTurn();
		},
	},

	turn: {
		minMoves: 0,
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
});
