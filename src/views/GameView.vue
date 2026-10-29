<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue';
import { useGame, useTurnNotifications, loadSession, GameLog } from '@engine/client';
import { gameDef } from '../logic/index';
import type { ZiaGameOver, ZiaState } from '../logic/types';
import GameBoard from '../components/GameBoard.vue';

const props = defineProps<{ matchID: string; playerID: string }>();

const game = useGame<ZiaState>();
const { isConnected, isMyTurn, gameover, reconnecting, connect, disconnect, state, playerID: clientPlayerId } = game;

const G = computed(() => state.value);

const {
	requestPermission: requestTurnNotifications,
	permission: notificationPermission,
	supported: notificationsSupported,
} = useTurnNotifications({
	displayName: gameDef.displayName,
	body: "It's your turn in Xia.",
});

/** Full state received for this seat. */
const gameLoaded = computed(() => {
	const pid = clientPlayerId.value;
	const players = G.value?.players;
	return pid != null && players != null && typeof players === 'object' && pid in players;
});

/**
 * Match has started and not ended.
 * boardgame.io's `isActive` only means *this seat* may move right now, so it is not used here.
 */
const matchRunning = computed(() => gameLoaded.value && gameover.value == null);

const gameOver = computed(() => gameover.value as ZiaGameOver | undefined);

const statusMessage = computed(() => {
	if (reconnecting.value && !isConnected.value) {
		return 'Restoring your saved session — waiting for the game server. If this lasts more than a few seconds, start the boardgame.io server or check VITE_SERVER_URL matches its URL.';
	}
	if (reconnecting.value) return 'Finishing session restore with the server…';
	if (!isConnected.value) return 'Connecting to the game server…';
	if (!gameLoaded.value) return 'Receiving game state from the server…';
	if (!matchRunning.value) return 'This match has ended.';
	if (isMyTurn.value) return 'Your turn.';
	return "Waiting for another player's turn.";
});

const showTurnNotifyRow = computed(
	() => notificationsSupported.value && isConnected.value && matchRunning.value && notificationPermission.value !== 'granted',
);

onMounted(() => {
	const session = loadSession(gameDef.id, props.matchID);
	const creds = session?.playerID === props.playerID ? session.credentials : undefined;
	connect(gameDef.id, props.matchID, props.playerID, creds);
});

onUnmounted(() => {
	disconnect();
});
</script>

<template>
	<div class="relative min-h-screen bg-[#05070d] text-slate-100">
		<div class="mx-auto flex w-full max-w-[1920px] flex-col gap-4 px-2 py-3 sm:px-4 md:flex-row md:items-start md:gap-5 lg:px-6">
			<!-- Board column -->
			<section class="order-2 w-full min-w-0 md:order-1 md:flex-1">
				<GameBoard v-if="isConnected && gameLoaded" />
				<div
					v-else
					class="flex min-h-[200px] items-center justify-center rounded-xl border border-dashed border-slate-700/80 bg-slate-950/50 px-4 text-center text-sm text-slate-500"
				>
					Connect and load your seat to see the board.
				</div>
			</section>

			<!-- Side panel -->
			<aside
				class="order-1 flex w-full min-w-0 flex-col rounded-xl border border-slate-800/60 bg-slate-950/75 p-3 shadow-xl shadow-black/20 backdrop-blur-md md:order-2 md:w-[min(100%,22rem)] md:shrink-0"
			>
				<header class="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-800/80 bg-slate-900/60 px-3 py-3">
					<h1 class="text-lg font-semibold">{{ gameDef.displayName }}</h1>
					<router-link to="/" class="text-sm text-slate-500 hover:text-slate-300">← Lobby</router-link>
				</header>

				<p class="mb-2 rounded-lg border border-slate-800/80 bg-slate-900/50 px-3 py-2 text-center text-sm text-slate-200" role="status">
					{{ statusMessage }}
				</p>

				<div v-if="showTurnNotifyRow" class="mb-2 flex flex-wrap items-center justify-center gap-2 text-xs text-slate-400">
					<button
						type="button"
						class="rounded-lg border border-slate-600 bg-slate-900/90 px-3 py-1.5 text-slate-200 hover:bg-slate-800"
						@click="requestTurnNotifications"
					>
						Notify me when it's my turn
					</button>
				</div>

				<p v-if="isConnected && matchRunning" class="mb-2 text-center text-xs text-slate-400">
					Match <code class="rounded bg-slate-900 px-1 py-0.5 text-slate-300">{{ matchID }}</code> · You are seat
					<code class="rounded bg-slate-900 px-1 py-0.5 text-slate-300">{{ playerID }}</code>
				</p>

				<div v-if="gameOver" class="mt-2 rounded-lg border border-sky-800/50 bg-slate-900/90 p-4 text-center text-sm">
					<span v-if="gameOver.winner === playerID" class="text-emerald-400">You win!</span>
					<span v-else-if="gameOver.winner" class="text-slate-300">Seat {{ gameOver.winner }} wins.</span>
					<span v-else class="text-slate-300">Draw.</span>
				</div>

				<div class="mt-4 min-h-0">
					<GameLog />
				</div>
			</aside>
		</div>
	</div>
</template>
