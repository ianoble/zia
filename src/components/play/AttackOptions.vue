<script setup lang="ts">
import { computed, ref } from 'vue';
import { OUTFITS_BY_ID } from '../../data/outfits';
import { attackTargets } from '../../logic/game';
import type { ZiaState } from '../../logic/types';

/**
 * Attack (standard action): pick a ship in range and line of sight, and how many armed
 * markers to put on each weapon that reaches it (one die each).
 */
const props = defineProps<{ G: ZiaState; playerID: string; nameOf: (seat: string) => string; colorOf: (seat: string) => string }>();
const emit = defineEmits<{ act: [name: string, ...args: unknown[]] }>();

const ship = computed(() => props.G.players[props.playerID]?.ship ?? null);
const armed = computed(() => ship.value?.armedMarkers ?? 0);
const hasWeapons = computed(() => (ship.value?.outfits ?? []).some((o) => ['blaster', 'missile'].includes(OUTFITS_BY_ID[o.outfitId].type)));
const targets = computed(() =>
	attackTargets(props.G, props.playerID).map((t) => ({
		...t,
		weapons: t.weapons.map((w) => ({ ...w, def: OUTFITS_BY_ID[ship.value!.outfits.find((o) => o.uid === w.uid)!.outfitId] })),
	})),
);

/** Markers per weapon, per target ("seat:uid"); a weapon starts with 1. */
const counts = ref<Record<string, number>>({});
const countOf = (seat: string, uid: string, i: number) => counts.value[`${seat}:${uid}`] ?? (i === 0 ? 1 : 0);
const totalFor = (seat: string) => targets.value.find((t) => t.seat === seat)!.weapons.reduce((n, w, i) => n + countOf(seat, w.uid, i), 0);
function step(seat: string, uid: string, i: number, by: number) {
	const w = targets.value.find((t) => t.seat === seat)!.weapons[i];
	const next = countOf(seat, uid, i) + by;
	if (next < 0 || next > w.free || totalFor(seat) + by > armed.value) return;
	counts.value = { ...counts.value, [`${seat}:${uid}`]: next };
}
function attack(seat: string) {
	const t = targets.value.find((x) => x.seat === seat)!;
	const weapons = t.weapons.map((w, i) => ({ uid: w.uid, count: countOf(seat, w.uid, i) })).filter((w) => w.count > 0);
	emit('act', 'attack', seat, weapons);
	counts.value = {};
}
</script>

<template>
	<div v-if="hasWeapons" class="space-y-2 rounded-lg border border-red-900/60 bg-red-950/20 p-2">
		<span class="font-semibold text-slate-300">Attack</span>
		<p v-if="!targets.length" class="text-xs text-slate-500">
			{{
				armed
					? 'No ship in range and line of sight. Blasters reach 1 space, missiles 2–6; stars, asteroids, debris and planetary shields block the view.'
					: 'No armed markers left.'
			}}
		</p>
		<div v-for="t in targets" :key="t.seat" class="space-y-1.5 rounded-md border border-slate-800 bg-slate-900/60 p-2">
			<div class="flex items-center gap-2">
				<span class="h-2.5 w-2.5 rounded-full" :style="{ background: colorOf(t.seat) }" />
				<span class="flex-1 font-semibold">{{ nameOf(t.seat) }}</span>
				<span class="text-xs text-slate-500">range {{ t.range }}</span>
			</div>
			<div v-for="(w, i) in t.weapons" :key="w.uid" class="flex items-center justify-between gap-2">
				<span>{{ w.def.name }}</span>
				<span class="flex items-center gap-2">
					<button type="button" class="step" :disabled="!countOf(t.seat, w.uid, i)" @click="step(t.seat, w.uid, i, -1)">−</button>
					<span class="w-4 text-center font-bold">{{ countOf(t.seat, w.uid, i) }}</span>
					<button
						type="button"
						class="step"
						:disabled="countOf(t.seat, w.uid, i) >= w.free || totalFor(t.seat) >= armed"
						@click="step(t.seat, w.uid, i, 1)"
					>
						+
					</button>
				</span>
			</div>
			<button class="action" :disabled="!totalFor(t.seat)" @click="attack(t.seat)">
				<span>Attack {{ nameOf(t.seat) }}</span>
				<span class="text-red-300">roll {{ totalFor(t.seat) }} {{ totalFor(t.seat) === 1 ? 'die' : 'dice' }}</span>
			</button>
		</div>
		<p class="text-xs text-slate-500">
			Standard action (ends movement): one armed marker per die ({{ armed }} left). The defender can raise shields, then whatever gets through is
			damage.
		</p>
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
	border-color: #f87171;
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
