import type { BaseGameState } from '@engine/client';

// ---------------------------------------------------------------------------
// Player colours (placeholder set — revisit once components are modelled)
// ---------------------------------------------------------------------------

export type PlayerColor = 'red' | 'blue' | 'green' | 'yellow' | 'purple';

export const PLAYER_COLORS: PlayerColor[] = ['red', 'blue', 'green', 'yellow', 'purple'];

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export interface ZiaPlayer {
	id: string;
	color: PlayerColor;
	/** Credits (money). */
	credits: number;
	/** Fame points — first to the target wins. */
	fame: number;
}

export interface ZiaSetupData {
	/** Fame needed to win. */
	fameTarget?: number;
}

export interface ZiaState extends BaseGameState {
	players: Record<string, ZiaPlayer>;
	fameTarget: number;
}

export interface ZiaGameOver {
	winner?: string;
	isDraw?: boolean;
}
