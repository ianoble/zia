<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { OUTFITS_BY_ID } from '../../data/outfits';
import { freeEngineUseSpaces } from '../../logic/game';
import { edgeSymbolFacing, SLOT_NAMES, unexploredEdges } from '../../logic/board';
import EdgeSymbolIcon from '../board/EdgeSymbolIcon.vue';
import { explorationTokenLabel } from '../../data/exploration';
import { shipDef } from '../../logic/ship';
import { MARKERS_PER_SHIP, type ZiaState } from '../../logic/types';

/** Active captain's controls: impulse, fire engines, then end turn (Status Phase: arm markers). */
const props = defineProps<{ G: ZiaState; playerID: string; currentPlayer: string; nameOf: (seat: string) => string }>();
const emit = defineEmits<{ act: [name: string, ...args: unknown[]] }>();

const myTurn = computed(() => props.playerID === props.currentPlayer);
const ship = computed(() => props.G.players[props.playerID]?.ship ?? null);
const def = computed(() => (ship.value ? shipDef(ship.value) : null));
const movement = computed(() => props.G.turn.movement);

const engines = computed(() =>
	(ship.value?.outfits ?? [])
		.filter((o) => OUTFITS_BY_ID[o.outfitId].type === 'engine')
		.map((o) => ({ uid: o.uid, def: OUTFITS_BY_ID[o.outfitId], free: freeEngineUseSpaces(ship.value!, o.uid).length })),
);

/** Sides of my sector with an unexplored edge next to my ship, for Scan Sector. */
const scanSides = computed(() => {
	const pos = props.G.players[props.playerID]?.position;
	if (!pos) return [];
	const seen = new Set<number>();
	return unexploredEdges(props.G.board, pos)
		.filter((e) => !seen.has(e.slot) && seen.add(e.slot))
		.map((e) => ({ slot: e.slot, name: SLOT_NAMES[e.slot], symbol: edgeSymbolFacing(props.G.board.sectors[e.sectorIndex].rotation, e.slot) }));
});
const myTokens = computed(() => props.G.players[props.playerID]?.explorationTokens ?? []);
const pairPending = computed(() => !!props.G.turn.explorationPairPending);
const deckLeft = computed(() => props.G.sectorDeck?.length ?? 0);

const maxArm = computed(() => (ship.value ? Math.min(MARKERS_PER_SHIP - ship.value.armedMarkers, ship.value.energy) : 0));
const armCount = ref(0);
watch(
	() => [myTurn.value, maxArm.value] as const,
	() => (armCount.value = maxArm.value),
	{ immediate: true },
);
</script>

<template>
	<div v-if="!myTurn" class="rounded-lg border border-slate-800 bg-slate-900/60 p-3 text-sm text-slate-300">
		Waiting for <strong>{{ nameOf(currentPlayer) }}</strong> to take their turn.
	</div>

	<div v-else-if="ship && def && pairPending" class="space-y-3 rounded-lg border border-fuchsia-800/70 bg-slate-900/70 p-3 text-sm">
		<p class="font-semibold text-fuchsia-200">You have two exploration tokens face up.</p>
		<p class="text-xs text-slate-400">Discard both and choose a reward:</p>
		<div class="grid grid-cols-2 gap-2">
			<button class="action justify-center" @click="emit('act', 'claimExplorationPair', 'fame')">1 fame</button>
			<button class="action justify-center" @click="emit('act', 'claimExplorationPair', 'credits')">2,000 credits</button>
		</div>
	</div>

	<div v-else-if="ship && def" class="space-y-4 rounded-lg border border-sky-900/70 bg-slate-900/70 p-3 text-sm">
		<div class="flex items-center justify-between">
			<span class="font-semibold text-slate-300">Movement</span>
			<span class="text-3xl font-black" :class="movement > 0 ? 'text-sky-300' : 'text-slate-500'">{{ movement }}</span>
		</div>
		<p class="text-xs text-slate-400">
			{{ movement > 0 ? 'Click a highlighted space on the map to move (1 per space).' : 'Get movement by flipping impulse or firing an engine.' }}
		</p>

		<div class="space-y-2">
			<button class="action" :disabled="!ship.impulseReady" @click="emit('act', 'useImpulse')">
				<span>Flip impulse</span>
				<span class="text-sky-300">+{{ def.impulse }}</span>
			</button>
			<p class="text-xs text-slate-500">Minor action, once per turn. Adds to your current movement.</p>
		</div>

		<div class="space-y-2">
			<button
				v-for="e in engines"
				:key="e.uid"
				class="action"
				:disabled="!e.free || ship.armedMarkers <= 0"
				:title="!e.free ? 'No free use space' : ship.armedMarkers <= 0 ? 'No armed markers' : 'Uses an armed marker and rolls the engine die'"
				@click="emit('act', 'fireEngine', e.uid)"
			>
				<span>Fire {{ e.def.name }}</span>
				<span class="text-sky-300">roll {{ e.def.die }}</span>
			</button>
			<p v-if="!engines.length" class="text-xs text-slate-500">No engines fitted — impulse is your only movement.</p>
			<p v-else class="text-xs text-slate-500">
				Standard action: uses an armed marker ({{ ship.armedMarkers }} left). Unspent movement is lost first.
			</p>
		</div>

		<div class="space-y-2">
			<div class="flex items-center justify-between">
				<span class="font-semibold text-slate-300">Explore</span>
				<span class="text-xs text-slate-500">{{ deckLeft }} sector{{ deckLeft === 1 ? '' : 's' }} left</span>
			</div>
			<template v-if="scanSides.length && deckLeft">
				<button
					v-for="s in scanSides"
					:key="s.slot"
					class="action"
					:disabled="ship.energy < 1"
					:title="ship.energy < 1 ? 'Needs 1 energy' : `Draw a sector and place it against the ${s.name} edge, matching its symbol`"
					@click="emit('act', 'scanSector', s.slot)"
				>
					<span class="flex items-center gap-2">Scan {{ s.name }} edge <EdgeSymbolIcon :symbol="s.symbol" class="text-violet-300" /></span>
					<span class="text-violet-300">1 energy</span>
				</button>
				<p class="text-xs text-slate-500">
					Standard action: ends movement. Or Blind Jump (minor, 1 movement): click a dashed space off the board next to your ship. You must fly
					in, whatever is there.
				</p>
			</template>
			<p v-if="myTokens.length" class="text-xs text-slate-400">
				Exploration tokens on your mat: <span class="text-fuchsia-300">{{ myTokens.map(explorationTokenLabel).join(', ') }}</span>
			</p>
			<p v-if="!(scanSides.length && deckLeft)" class="text-xs text-slate-500">
				{{ deckLeft ? 'Move next to an unexplored edge (the outer rim of the map) to Scan or Blind Jump.' : 'Every sector has been explored.' }}
			</p>
		</div>

		<div class="space-y-2 border-t border-slate-800 pt-3">
			<div class="flex items-center justify-between gap-2">
				<span class="text-slate-300">Arm markers (1 energy each)</span>
				<div class="flex items-center gap-2">
					<button class="step" :disabled="armCount <= 0" @click="armCount--">−</button>
					<span class="w-4 text-center font-bold">{{ armCount }}</span>
					<button class="step" :disabled="armCount >= maxArm" @click="armCount++">+</button>
				</div>
			</div>
			<p class="text-xs text-slate-500">Energy {{ ship.energy }} / {{ def.energy }} · {{ MARKERS_PER_SHIP - ship.armedMarkers }} not armed</p>
			<button class="w-full rounded-lg bg-emerald-600 py-2 font-semibold hover:bg-emerald-500" @click="emit('act', 'endTurn', armCount)">
				End turn
			</button>
		</div>
	</div>
</template>

<style scoped>
.action {
	display: flex;
	width: 100%;
	align-items: center;
	justify-content: space-between;
	border-radius: 0.5rem;
	border: 1px solid #334155;
	background: #1e293b;
	padding: 0.5rem 0.75rem;
	font-weight: 600;
}
.action:hover:not(:disabled) {
	border-color: #38bdf8;
}
.action:disabled {
	opacity: 0.4;
	cursor: not-allowed;
}
.step {
	width: 1.75rem;
	height: 1.75rem;
	border-radius: 0.4rem;
	background: #334155;
	font-weight: 700;
}
.step:disabled {
	opacity: 0.4;
}
</style>
