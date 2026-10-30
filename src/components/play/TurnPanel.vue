<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { OUTFITS_BY_ID } from '../../data/outfits';
import { BUY_MAX, BUY_PRICE, checkMove, freeEngineUseSpaces, SELL_PRICE, sellableCubes, tradeHere, usableShields } from '../../logic/game';
import { ECONOMY_CUBES, type EconomyCube } from '../../logic/types';
import { CUBE_FILL } from '../ship/shipMatTheme';
import { edgeSymbolFacing, SLOT_NAMES, unexploredEdges } from '../../logic/board';
import EdgeSymbolIcon from '../board/EdgeSymbolIcon.vue';
import { explorationTokenLabel } from '../../data/exploration';
import { engineRollResult, shipDef } from '../../logic/ship';
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
		.map((o) => ({
			uid: o.uid,
			def: OUTFITS_BY_ID[o.outfitId],
			free: freeEngineUseSpaces(ship.value!, o.uid).length,
			gts: engineRollResult(ship.value!, o.uid, 1, 99).gts,
		})),
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
/** Mission cards queued for the end of the turn (3 per mission point flown onto or over). */
const missionCards = computed(() => (props.G.turn.missionDraws?.length ?? 0) * 3);
const myTokens = computed(() => props.G.players[props.playerID]?.explorationTokens ?? []);
const pendingDamage = computed(() => props.G.players[props.playerID]?.pendingDamage ?? []);
/** A move paused at a border. */
const crossing = computed(() => props.G.turn.crossing ?? null);
const BORDER_INFO: Record<string, { name: string; odds: string }> = {
	shield: { name: 'Planetary shield', odds: '1–10: unblockable damage equal to the roll, and you stay put (−1 movement) · 11–17: through, +1,000 bounty · 18–20: through' },
	asteroid: { name: 'Asteroid', odds: '1–10: damage equal to the roll (shields can cut it) · 11–20: safe' },
	debris: { name: 'Debris field', odds: '1–3: ship destroyed · 4–20: safe' },
	nebula: { name: 'Nebula', odds: '1–10: lose energy equal to the roll (shields can cut it) · 11–20: safe' },
};
const shieldChoices = computed(() =>
	ship.value
		? usableShields(ship.value).map((uid) => {
				const o = ship.value!.outfits.find((x) => x.uid === uid)!;
				return { uid, def: OUTFITS_BY_ID[o.outfitId] };
			})
		: [],
);
/** Trade at a planet's Buy / Sell space. */
const trade = computed(() => tradeHere(props.G, props.playerID));
const buyColors = computed<EconomyCube[]>(() => {
	const b = trade.value?.buy;
	if (!b) return [];
	return b === 'any' ? ECONOMY_CUBES : [b];
});
const canBuy = (color: EconomyCube, n: number) => checkMove(props.G, props.playerID, props.currentPlayer, 'buyCargo', [color, n]) === true;
const sellable = computed(() => (ship.value && trade.value?.sell ? sellableCubes(ship.value, trade.value.sell) : []));
/** Selling by colour: all of them (a Big Shipment if 2+), or one at a time. */
const sellGroups = computed(() => {
	const by = new Map<string, string[]>();
	for (const c of sellable.value) by.set(c.color, [...(by.get(c.color) ?? []), c.cell]);
	return [...by.entries()].map(([color, cells]) => ({ color, cells }));
});
const pendingCargo = computed(() => props.G.players[props.playerID]?.pendingCargo ?? []);
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

	<div v-else-if="ship && def && crossing && !pendingDamage.length && !pendingCargo.length && !pairPending" class="space-y-2 rounded-lg border border-amber-700/70 bg-slate-900/70 p-3 text-sm">
		<template v-if="crossing.stage === 'confirm'">
			<p class="font-semibold text-amber-200">Border ahead: {{ crossing.borders.map((b) => BORDER_INFO[b].name).join(', then ') }}</p>
			<p v-for="b in crossing.borders" :key="b" class="text-xs text-slate-400">
				<span class="text-slate-300">{{ BORDER_INFO[b].name }}:</span> {{ BORDER_INFO[b].odds }}
			</p>
			<div class="grid gap-2" :class="crossing.forced ? '' : 'grid-cols-2'">
				<button class="action justify-center" @click="emit('act', 'crossBorder')">Roll d20</button>
				<button v-if="!crossing.forced" class="action justify-center" @click="emit('act', 'stopMove')">Stop here</button>
			</div>
		</template>
		<template v-else>
			<p class="font-semibold text-amber-200">
				Rolled {{ crossing.roll }}: {{ crossing.amount }} {{ crossing.borders[0] === 'asteroid' ? 'damage' : 'energy loss' }} to take
			</p>
			<p class="text-xs text-slate-400">Fire a shield to cut it down (uses an armed marker), or take it.</p>
			<button v-for="s in shieldChoices" :key="s.uid" class="action" @click="emit('act', 'useShield', s.uid)">
				<span>Fire {{ s.def.name }}</span>
				<span class="text-sky-300">roll {{ s.def.die }}</span>
			</button>
			<button class="action justify-center" @click="emit('act', 'acceptBorderEffect')">
				Take {{ crossing.amount }} {{ crossing.borders[0] === 'asteroid' ? 'damage' : 'energy loss' }}
			</button>
		</template>
	</div>

	<div v-else-if="ship && def && pendingDamage.length" class="space-y-2 rounded-lg border border-red-800/70 bg-slate-900/70 p-3 text-sm">
		<p class="font-semibold text-red-200">
			Place {{ pendingDamage.length }} {{ pendingDamage[0] === 'ice' ? 'ice damage' : 'damage' }}{{ pendingDamage.length > 1 ? ' markers' : '' }}
		</p>
		<p class="text-xs text-slate-400">
			Click a highlighted space in your hold. Damage on a cargo cube jettisons it; damage on a use space with a marker sends the marker to
			Disarmed.
		</p>
	</div>

	<div v-else-if="ship && def && pendingCargo.length" class="space-y-2 rounded-lg border border-emerald-800/70 bg-slate-900/70 p-3 text-sm">
		<p class="font-semibold text-emerald-200">Place your {{ pendingCargo[0] }} cube{{ pendingCargo.length > 1 ? ` (+${pendingCargo.length - 1} more)` : '' }}</p>
		<p class="text-xs text-slate-400">Click a highlighted space in your hold (an empty space or a Cargo Pod section).</p>
		<button class="action justify-center" @click="emit('act', 'jettisonCargo')">Jettison it instead</button>
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
		<p v-if="missionCards" class="rounded-md border border-orange-800/60 bg-orange-950/40 px-2 py-1.5 text-xs text-orange-200">
			You'll draw {{ missionCards }} mission cards at the end of your turn ({{ missionCards / 3 }} mission point{{ missionCards > 3 ? 's' : '' }}).
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
				<span class="text-sky-300">roll {{ e.def.die }}<template v-if="e.gts"> +{{ 2 * e.gts }}</template></span>
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

		<div v-if="trade" class="space-y-2 rounded-lg border border-emerald-900/60 bg-emerald-950/20 p-2">
			<span class="font-semibold text-slate-300">Trade</span>
			<template v-if="trade.buy">
				<p class="text-xs text-slate-400">
					Buy space: up to {{ BUY_MAX }} cubes for {{ BUY_PRICE.toLocaleString('en-US') }} cR (standard action, ends movement).
				</p>
				<div v-for="c in buyColors" :key="c" class="flex items-center gap-2">
					<span class="h-3.5 w-3.5 rounded-sm" :style="{ background: CUBE_FILL[c] }" />
					<span class="flex-1 capitalize">{{ c }} <span class="text-xs text-slate-500">({{ G.economy?.[c]?.cubes ?? 0 }} left)</span></span>
					<button class="step px-2" :disabled="!canBuy(c, 1)" @click="emit('act', 'buyCargo', c, 1)">Buy 1</button>
					<button class="step px-2" :disabled="!canBuy(c, 2)" @click="emit('act', 'buyCargo', c, 2)">Buy 2</button>
				</div>
			</template>
			<template v-if="trade.sell">
				<p class="text-xs text-slate-400">
					Sell space: buys {{ trade.sell === 'any' ? 'any cube' : trade.sell }} at {{ SELL_PRICE.toLocaleString('en-US') }} cR each (standard
					action). Selling all of them (2+) is a Big Shipment: +1 fame.
				</p>
				<p v-if="!sellable.length" class="text-xs text-slate-500">You have no cubes this planet buys.</p>
				<button v-if="sellable.length >= 2" class="action" @click="emit('act', 'sellCargo', sellable.map((c) => c.cell))">
					<span>Sell all {{ sellable.length }}</span>
					<span class="text-amber-300">+{{ (SELL_PRICE * sellable.length).toLocaleString('en-US') }} cR, +1 fame</span>
				</button>
				<button v-for="g in sellGroups" :key="g.color" class="action" @click="emit('act', 'sellCargo', [g.cells[0]])">
					<span class="flex items-center gap-2">
						<span class="h-3.5 w-3.5 rounded-sm" :style="{ background: CUBE_FILL[g.color as EconomyCube] }" />
						Sell 1 {{ g.color }}
					</span>
					<span class="text-amber-300">+{{ SELL_PRICE.toLocaleString('en-US') }} cR</span>
				</button>
			</template>
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
