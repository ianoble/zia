import { onUnmounted, watch, type Ref } from 'vue';
import { Client } from 'boardgame.io/client';
import { SocketIO } from 'boardgame.io/multiplayer';
import { gameDef } from '../logic/index';
import { botDecision } from '../logic/bot';
import { actingSeat } from '../logic/game';
import type { ZiaState } from '../logic/types';
import { SERVER_URL } from '../config';

/** Pause before each bot move so humans can follow what happens. */
const BOT_DELAY_MS = 700;

export function botCredentialsKey(matchID: string): string {
	return `bgf:bots:${gameDef.id}:${matchID}`;
}

export function loadBotCredentials(matchID: string): Record<string, string> {
	try {
		return JSON.parse(localStorage.getItem(botCredentialsKey(matchID)) || '{}');
	} catch {
		return {};
	}
}

export function saveBotCredentials(matchID: string, seat: string, credentials: string) {
	const all = loadBotCredentials(matchID);
	all[seat] = credentials;
	localStorage.setItem(botCredentialsKey(matchID), JSON.stringify(all));
}

type BotState = { G: ZiaState; ctx: { currentPlayer: string; gameover?: unknown }; _stateID: number } | null;

/**
 * Runs the bot seats added with "Fill with Bots" as headless boardgame.io clients
 * in this browser tab (only the host's tab has their credentials).
 */
export function useBotPlayers(matchID: Ref<string>, humanPlayerID: Ref<string>) {
	const bots: { client: ReturnType<typeof Client>; stop: () => void }[] = [];

	function startBots() {
		stopBots();
		const creds = loadBotCredentials(matchID.value);
		for (const seat of Object.keys(creds).filter((s) => s !== humanPlayerID.value)) {
			const client = Client({
				game: gameDef.game,
				debug: false,
				multiplayer: SocketIO({ server: SERVER_URL }),
				matchID: matchID.value,
				playerID: seat,
				credentials: creds[seat],
			} as Parameters<typeof Client>[0]);

			let timer: ReturnType<typeof setTimeout> | null = null;
			let actedOn = -1;

			const act = () => {
				timer = null;
				const s = client.getState() as BotState;
				if (!s?.G?.players || s.ctx.gameover != null || s._stateID === actedOn) return;
				const d = botDecision(s.G, seat, s.ctx.currentPlayer);
				if (!d) return;
				actedOn = s._stateID;
				(client.moves[d.move] as (...a: unknown[]) => void)(...d.args);
			};

			const unsubscribe = client.subscribe((state) => {
				const s = state as BotState;
				if (!s?.G?.players || actingSeat(s.G, s.ctx.currentPlayer) !== seat || timer) return;
				timer = setTimeout(act, BOT_DELAY_MS);
			});
			// Safety net: re-check periodically in case an update was missed.
			const watchdog = setInterval(() => {
				const s = client.getState() as BotState;
				if (!timer && s?.G?.players && actingSeat(s.G, s.ctx.currentPlayer) === seat && s._stateID !== actedOn) timer = setTimeout(act, BOT_DELAY_MS);
			}, 2000);

			client.start();
			bots.push({
				client,
				stop: () => {
					if (timer) clearTimeout(timer);
					clearInterval(watchdog);
					unsubscribe();
					client.stop();
				},
			});
		}
	}

	function stopBots() {
		for (const b of bots) b.stop();
		bots.length = 0;
	}

	watch(
		[matchID, humanPlayerID],
		() => {
			if (matchID.value) startBots();
		},
		{ immediate: true },
	);
	onUnmounted(stopBots);
}
