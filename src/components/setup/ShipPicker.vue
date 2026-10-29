<script setup lang="ts">
import { computed, ref } from 'vue';
import { IN_SCOPE_SHIPS } from '../../data/ships';
import { parseShape } from '../../logic/holdGeometry';
import type { ZiaState } from '../../logic/types';

/** Setup step: pick a Tier I ship and one of its two abilities. */
const props = defineProps<{
	G: ZiaState;
	myTurn: boolean;
	nameOf: (seat: string) => string;
	colorOf: (seat: string) => string;
}>();
const emit = defineEmits<{ pick: [shipId: string, abilityIndex: number] }>();

const tierOne = IN_SCOPE_SHIPS.filter((s) => s.tier === 1);
const abilityChoice = ref<Record<string, number>>({});

const takenBy = computed(() => {
	const map: Record<string, string> = {};
	for (const p of Object.values(props.G.players)) if (p.ship) map[p.ship.shipId] = p.id;
	return map;
});

function holdCells(rows: string[]) {
	return parseShape(rows);
}
</script>

<template>
	<div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
		<article
			v-for="s in tierOne"
			:key="s.id"
			class="flex flex-col gap-3 rounded-xl border bg-slate-900/80 p-4"
			:class="takenBy[s.id] ? 'border-slate-800 opacity-60' : 'border-sky-900/70'"
		>
			<header class="flex items-start justify-between gap-2">
				<div>
					<h3 class="text-lg font-black uppercase tracking-wide">{{ s.name }}</h3>
					<p class="text-xs text-slate-400">
						Hold {{ s.holdSize }} · Impulse {{ s.impulse }} · Energy {{ s.energy }}
						<span v-if="s.set === 'embers'" class="ml-1 rounded bg-orange-900/60 px-1 text-orange-200">Embers</span>
					</p>
				</div>
				<div class="mini-hold" :style="{ '--cols': Math.max(...s.hold.map((r) => r.length)), '--rows': s.hold.length }">
					<span v-for="c in holdCells(s.hold)" :key="`${c.x},${c.y}`" :style="{ gridColumn: c.x + 1, gridRow: c.y + 1 }" />
				</div>
			</header>

			<fieldset class="space-y-2" :disabled="!!takenBy[s.id]">
				<label
					v-for="(a, i) in s.abilities"
					:key="a.name"
					class="flex cursor-pointer gap-2 rounded-lg border p-2 text-sm"
					:class="(abilityChoice[s.id] ?? 0) === i ? 'border-sky-500 bg-sky-950/50' : 'border-slate-700 hover:border-slate-500'"
				>
					<input v-model="abilityChoice[s.id]" type="radio" :name="`ab-${s.id}`" :value="i" class="mt-1" :checked="(abilityChoice[s.id] ?? 0) === i" />
					<span>
						<span class="block font-bold uppercase text-sky-200">{{ a.name }}</span>
						<span class="text-slate-300">{{ a.summary }}</span>
					</span>
				</label>
			</fieldset>

			<div class="mt-auto">
				<p v-if="takenBy[s.id]" class="text-sm font-semibold" :style="{ color: colorOf(takenBy[s.id]) }">
					Taken by {{ nameOf(takenBy[s.id]) }}
				</p>
				<button
					v-else
					type="button"
					class="w-full rounded-lg bg-sky-600 py-2 font-semibold transition-colors hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-40"
					:disabled="!myTurn"
					@click="emit('pick', s.id, abilityChoice[s.id] ?? 0)"
				>
					{{ myTurn ? 'Launch this ship' : 'Wait for your pick' }}
				</button>
			</div>
		</article>
	</div>
</template>

<style scoped>
.mini-hold {
	display: grid;
	grid-template-columns: repeat(var(--cols), 0.7rem);
	grid-template-rows: repeat(var(--rows), 0.7rem);
	gap: 2px;
	flex-shrink: 0;
}
.mini-hold span {
	border-radius: 2px;
	background: #94a3b8;
}
</style>
