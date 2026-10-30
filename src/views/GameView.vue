<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, toRef, watch } from 'vue';
import { useGame, useTurnNotifications, loadSession } from '@engine/client';
import { gameDef, reachableHexes, routeBorders, unexploredEdges } from '../logic/index';
import type { PlayerColor, ZiaGameOver, ZiaState } from '../logic/types';
import { SHIPS_BY_ID } from '../data/ships';
import { cargoTargets, damageTargets } from '../logic/ship';
import { useMatchPlayers } from '../composables/useMatchPlayers';
import { useBotPlayers } from '../composables/useBotPlayers';
import BoardMap, { type BoardShip } from '../components/board/BoardMap.vue';
import ShipMat from '../components/ship/ShipMat.vue';
import { PLAYER_HEX } from '../components/ship/shipMatTheme';
import ShipPicker from '../components/setup/ShipPicker.vue';
import OutfitShop from '../components/setup/OutfitShop.vue';
import TurnPanel from '../components/play/TurnPanel.vue';
import ZiaLog from '../components/ZiaLog.vue';

const props = defineProps<{ matchID: string; playerID: string }>();

const game = useGame<ZiaState>();
const { isConnected, isMyTurn, gameover, reconnecting, connect, disconnect, state, currentPlayer, move } = game;
const { nameOf, seats } = useMatchPlayers(toRef(props, 'matchID'));
useBotPlayers(toRef(props, 'matchID'), toRef(props, 'playerID'));

const { requestPermission, permission, supported } = useTurnNotifications({
	displayName: gameDef.displayName,
	body: "It's your turn in Xia.",
});

const G = computed(() => state.value as ZiaState | undefined);
const loaded = computed(() => !!G.value?.players && props.playerID in G.value.players && !!G.value.board);
const stage = computed(() => G.value?.stage);
const gameOver = computed(() => gameover.value as ZiaGameOver | undefined);

/** Lobby colour if one was picked, else the colour assigned at setup. */
function playerColor(seat: string): PlayerColor {
	return seats.value[seat]?.color ?? G.value?.players?.[seat]?.color ?? 'red';
}
const colorOf = (seat: string) => PLAYER_HEX[playerColor(seat)];

const STAGE_LABEL = { pickShip: 'Setup · Pick ships', outfit: 'Setup · Outfitting', play: 'Playing' } as const;

const statusMessage = computed(() => {
	if (reconnecting.value && !isConnected.value) {
		return 'Restoring your session — waiting for the game server. If this lasts, check the server is running and VITE_SERVER_URL matches it.';
	}
	if (!isConnected.value) return 'Connecting to the game server…';
	if (!loaded.value) return 'Receiving game state…';
	if (gameOver.value) return 'The match has ended.';
	const who = nameOf(currentPlayer.value);
	switch (stage.value) {
		case 'pickShip':
			return isMyTurn.value ? 'Your pick: choose a Tier I ship and its ability below.' : `${who} is choosing a ship.`;
		case 'outfit':
			return isMyTurn.value ? 'Buy outfits and place them in your hold, then press “Done outfitting”.' : `${who} is buying outfits.`;
		default:
			return isMyTurn.value ? 'Your turn.' : `${who}'s turn.`;
	}
});

const boardShips = computed<BoardShip[]>(() =>
	Object.values(G.value?.players ?? {})
		.filter((p) => p.position)
		.map((p) => ({
			seat: p.id,
			position: p.position!,
			color: colorOf(p.id),
			label: (nameOf(p.id) || '?').split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase(),
			active: p.id === currentPlayer.value && stage.value === 'play',
		})),
);

const reachable = computed(() => {
	const g = G.value;
	if (!g || stage.value !== 'play' || !isMyTurn.value || g.turn.movement <= 0 || g.turn.crossing) return null;
	const me = g.players[props.playerID];
	if (!me?.position) return null;
	const occupied = new Set(
		Object.values(g.players)
			.filter((p) => p.id !== props.playerID && p.position)
			.map((p) => p.position!),
	);
	return reachableHexes(g.board, me.position, g.turn.movement, occupied);
});

/** Reachable spaces whose route crosses a border (the map marks them with ⚠). */
const borderWarnings = computed(() => {
	const g = G.value;
	const me = g?.players?.[props.playerID];
	if (!g || !me?.position || !reachable.value) return null;
	const tokens = new Set(g.explorationSpaces ?? []);
	return new Set([...reachable.value.keys()].filter((k) => routeBorders(g.board, me.position!, k, g.turn.movement, tokens, me.bounty > 0) > 0));
});

/** Off-board spaces next to my ship I can Blind Jump into (needs 1 movement and tiles left). */
const jumpTargets = computed(() => {
	const g = G.value;
	if (!g || stage.value !== 'play' || !isMyTurn.value || g.turn.movement < 1 || !g.sectorDeck?.length || g.turn.crossing) return null;
	const me = g.players[props.playerID];
	if (!me?.position) return null;
	return unexploredEdges(g.board, me.position).map((e) => e.target);
});

function onHexClick(key: string) {
	if (reachable.value?.has(key)) move('moveShip', key);
	else if (jumpTargets.value?.includes(key)) move('blindJump', key);
}

function act(name: string, ...args: unknown[]) {
	move(name, ...args);
}

// Collapsible map, remembered across reloads, so the ship mat can take the top of the page.
const MAP_COLLAPSED_KEY = 'zia:mapCollapsed';
const mapCollapsed = ref(localStorage.getItem(MAP_COLLAPSED_KEY) === '1');
watch(mapCollapsed, (v) => localStorage.setItem(MAP_COLLAPSED_KEY, v ? '1' : '0'));

// Ship mats below the board: mine by default, tabs for the others.
const viewedSeat = ref(props.playerID);
watch(
	() => props.playerID,
	(id) => (viewedSeat.value = id),
);
const viewedShip = computed(() => G.value?.players?.[viewedSeat.value]?.ship ?? null);

/** Damage or cubes waiting to be placed: highlight where they can go on my ship mat (damage first). */
const holdPlacement = computed<'damage' | 'cargo' | null>(() => {
	const me = G.value?.players?.[props.playerID];
	if (me?.pendingDamage?.length) return 'damage';
	if (me?.pendingCargo?.length) return 'cargo';
	return null;
});
const holdTargetCells = computed(() => {
	const ship = G.value?.players?.[props.playerID]?.ship;
	if (!holdPlacement.value || !ship || viewedSeat.value !== props.playerID) return null;
	return holdPlacement.value === 'damage' ? damageTargets(ship) : cargoTargets(ship);
});
// Show my ship when I have something to place.
watch(holdPlacement, (kind) => kind && (viewedSeat.value = props.playerID));
function onHoldClick(cell: string) {
	if (!holdTargetCells.value?.includes(cell)) return;
	move(holdPlacement.value === 'damage' ? 'placeDamage' : 'placeCargo', cell);
}
const captainsWithShips = computed(() => Object.values(G.value?.players ?? {}).filter((p) => p.ship));

const orderedSeats = computed(() => {
	const g = G.value;
	if (!g) return [];
	return stage.value === 'play' ? g.turnOrder : g.pickOrder;
});

const credits = (n: number) => n.toLocaleString('en-US');

onMounted(() => {
	const session = loadSession(gameDef.id, props.matchID);
	const creds = session?.playerID === props.playerID ? session.credentials : undefined;
	connect(gameDef.id, props.matchID, props.playerID, creds);
});
onUnmounted(() => disconnect());
</script>

<template>
	<div class="min-h-screen bg-[#05070d] text-slate-100">
		<!-- Top bar -->
		<header class="flex flex-wrap items-center gap-3 border-b border-slate-800 px-4 py-3">
			<h1 class="text-lg font-bold">{{ gameDef.displayName }}</h1>
			<span v-if="stage" class="rounded-full bg-sky-900/60 px-2.5 py-0.5 text-xs font-semibold text-sky-200">{{ STAGE_LABEL[stage] }}</span>
			<p class="flex-1 text-sm" :class="isMyTurn && loaded ? 'font-semibold text-emerald-300' : 'text-slate-300'" role="status">
				{{ statusMessage }}
			</p>
			<button
				v-if="supported && permission !== 'granted' && loaded"
				type="button"
				class="rounded-lg border border-slate-700 px-2.5 py-1 text-xs text-slate-300 hover:bg-slate-800"
				@click="requestPermission"
			>
				Notify me on my turn
			</button>
			<router-link to="/" class="text-sm text-slate-500 hover:text-slate-300">← Lobby</router-link>
		</header>

		<div v-if="!loaded" class="flex min-h-[60vh] items-center justify-center text-slate-500">{{ statusMessage }}</div>

		<template v-else-if="G">
			<div class="grid items-start gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
				<!-- Left: board, then the ship mat / setup step directly underneath -->
				<div class="min-w-0 space-y-4">
					<section>
						<button
							type="button"
							class="mb-2 flex w-full items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-1.5 text-left text-sm font-semibold text-slate-300 hover:border-slate-600"
							:aria-expanded="!mapCollapsed"
							@click="mapCollapsed = !mapCollapsed"
						>
							<span class="inline-block transition-transform" :class="mapCollapsed ? '' : 'rotate-90'">▶</span>
							Map
							<span class="ml-auto text-xs font-normal text-slate-500">{{ mapCollapsed ? 'Show' : 'Hide' }}</span>
						</button>
						<div v-show="!mapCollapsed" class="h-[52vh] min-h-[380px]">
							<BoardMap :board="G.board" :ships="boardShips" :reachable="reachable"
								:jump-targets="jumpTargets"
								:border-warnings="borderWarnings"
								:exploration-spaces="G.explorationSpaces"
								@hex-click="onHexClick"
							/>
						</div>
					</section>

				<!-- Stage content -->
				<section class="pb-8">
					<ShipPicker v-if="stage === 'pickShip'" :G="G" :my-turn="isMyTurn" :name-of="nameOf" :color-of="colorOf" @pick="(id, ab) => act('pickShip', id, ab)" />

					<OutfitShop
						v-else-if="stage === 'outfit' && G.players[playerID].ship"
						:G="G"
						:player-i-d="playerID"
						:current-player="currentPlayer"
						:color="playerColor(playerID)"
						:captain-name="nameOf(playerID)"
						@act="act"
					/>

					<div v-else-if="stage === 'play'" class="space-y-3">
						<div class="flex flex-wrap gap-2">
							<button
								v-for="p in captainsWithShips"
								:key="p.id"
								type="button"
								class="rounded-lg border px-3 py-1.5 text-sm"
								:class="viewedSeat === p.id ? 'border-sky-500 bg-sky-950/60' : 'border-slate-700 bg-slate-900 hover:border-slate-500'"
								@click="viewedSeat = p.id"
							>
								<span class="mr-1.5 inline-block h-2.5 w-2.5 rounded-full" :style="{ background: colorOf(p.id) }" />
								{{ p.id === playerID ? 'Your ship' : nameOf(p.id) }}
							</button>
						</div>
						<ShipMat
							v-if="viewedShip"
							:state="viewedShip"
							:color="playerColor(viewedSeat)"
							:bounty="G.players[viewedSeat].bounty"
							:captain-name="nameOf(viewedSeat)"
							:can-impulse="viewedSeat === playerID && isMyTurn && viewedShip.impulseReady"
							:interactive="!!holdTargetCells"
							:targets="holdTargetCells"
							:target-kind="holdPlacement ?? undefined"
							@impulse="act('useImpulse')"
							@cell-click="onHoldClick"
						/>
					</div>
				</section>
				</div>

				<!-- Sidebar -->
				<!-- Sidebar stays in view while scrolling -->
				<aside class="flex flex-col gap-3 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto">
					<div class="rounded-lg border border-slate-800 bg-slate-900/60">
						<h3 class="border-b border-slate-800 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
							Captains {{ stage === 'play' ? '(turn order)' : '(pick order)' }}
						</h3>
						<ul class="divide-y divide-slate-800">
							<li
								v-for="seat in orderedSeats"
								:key="seat"
								class="flex items-center gap-2 px-3 py-2 text-sm"
								:class="seat === currentPlayer && !gameOver ? 'bg-sky-950/40' : ''"
							>
								<span class="h-3 w-3 shrink-0 rounded-full ring-2 ring-black" :style="{ background: colorOf(seat) }" />
								<span class="min-w-0 flex-1">
									<span class="block truncate font-semibold">
										{{ nameOf(seat) }}<span v-if="seat === playerID" class="font-normal text-slate-500"> (you)</span>
									</span>
									<span class="block truncate text-xs text-slate-400">
										{{ G.players[seat].ship ? SHIPS_BY_ID[G.players[seat].ship!.shipId].name : 'No ship yet' }}
										<template v-if="stage !== 'play'"> · rolled {{ G.players[seat].initiativeRoll }}</template>
									</span>
								</span>
								<span class="text-right text-xs">
									<span class="block text-amber-300">{{ credits(G.players[seat].credits) }} cR</span>
									<span class="block text-purple-300">{{ G.players[seat].fame }} fame</span>
								</span>
								<span v-if="seat === currentPlayer && !gameOver" class="text-sky-300" title="Current turn">▶</span>
							</li>
						</ul>
					</div>

					<TurnPanel v-if="stage === 'play'" :G="G" :player-i-d="playerID" :current-player="currentPlayer" :name-of="nameOf" @act="act" />

					<div v-if="gameOver" class="rounded-lg border border-amber-800/50 bg-slate-900/90 p-4 text-center text-sm">
						<span v-if="gameOver.winner === playerID" class="text-emerald-400">You win!</span>
						<span v-else-if="gameOver.winner">{{ nameOf(gameOver.winner) }} wins.</span>
						<span v-else>Draw.</span>
					</div>

					<ZiaLog :lines="G.log ?? []" :name-of="nameOf" :color-of="colorOf" />
				</aside>
			</div>

		</template>
	</div>
</template>
