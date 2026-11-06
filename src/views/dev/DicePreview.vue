<script setup lang="ts">
import { ref } from 'vue';
import DiceRollDialog from '../../components/play/DiceRollDialog.vue';
import type { DiceRoll } from '../../logic/types';

/** Design sandbox for the dice dialog. Route: /dev/dice. */
let nextId = 1;
const SAMPLES: Omit<DiceRoll, 'id' | 'seat'>[] = [
	{ sides: 20, roll: 7, label: 'Crossing the asteroid border', outcome: 'bad', detail: '7 damage' },
	{ sides: 20, roll: 14, label: 'Crossing the planetary shield', outcome: 'mixed', detail: 'Through, but detected: +1,000 bounty' },
	{ sides: 20, roll: 16, label: 'Harvest holo', outcome: 'good', detail: 'You get a holo cube' },
	{ sides: 20, roll: 2, label: 'Salvage cyber', outcome: 'bad', detail: 'Something in the wreckage detonated: your ship is destroyed' },
	{ sides: 20, roll: 20, label: 'Crossing the nebula border', outcome: 'good', detail: 'Safely through', luck: true },
	{ sides: 8, roll: 6, label: 'Fire d8 Engine', outcome: 'neutral', detail: '6 movement' },
	{ sides: 6, roll: 4, label: 'Fire d6 Shield', outcome: 'mixed', detail: 'Blocked 4: 3 still to take' },
	{ sides: 12, roll: 12, label: 'Fire d12 Engine', outcome: 'good', detail: '12 movement' },
];
const queue = ref<DiceRoll[]>([]);
const play = (s: (typeof SAMPLES)[number]) => queue.value.push({ ...s, id: nextId++, seat: '0' });
const playAll = () => SAMPLES.forEach(play);
</script>

<template>
	<div class="min-h-screen space-y-4 bg-[#05070d] p-6 text-slate-100">
		<h1 class="text-2xl font-bold">Dice preview</h1>
		<p class="text-sm text-slate-400">Click a roll to play it. Good and neutral results close by themselves; bad ones wait for Continue.</p>
		<div class="flex max-w-xl flex-col gap-2">
			<button type="button" class="rounded-lg bg-sky-700 px-3 py-2 font-semibold hover:bg-sky-600" @click="playAll">Play them all in a row</button>
			<button
				v-for="(s, i) in SAMPLES"
				:key="i"
				type="button"
				class="flex justify-between rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-left text-sm hover:border-sky-500"
				@click="play(s)"
			>
				<span>{{ s.label }} · d{{ s.sides }} → {{ s.roll }}</span>
				<span class="text-slate-400">{{ s.outcome }}</span>
			</button>
		</div>
		<DiceRollDialog v-if="queue.length" :key="queue[0].id" :roll="queue[0]" @done="queue.shift()" />
	</div>
</template>
