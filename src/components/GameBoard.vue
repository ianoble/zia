<script setup lang="ts">
import { computed } from 'vue';
import { useGame } from '@engine/client';
import type { ZiaState } from '../logic/types';

/** Placeholder board: player summary + End Turn. Replace with the drift system map. */
const { state, currentPlayer, playerID, isMyTurn, move } = useGame<ZiaState>();

const players = computed(() => Object.values(state.value?.players ?? {}));

const COLOR_DOT: Record<string, string> = {
	red: 'bg-red-600',
	blue: 'bg-blue-600',
	green: 'bg-green-600',
	yellow: 'bg-yellow-500',
	purple: 'bg-purple-600',
};
</script>

<template>
	<div class="space-y-4 rounded-xl border border-slate-800 bg-slate-950/60 p-4">
		<h2 class="text-sm font-semibold uppercase tracking-wide text-slate-400">Captains</h2>
		<ul class="space-y-2">
			<li
				v-for="p in players"
				:key="p.id"
				class="flex items-center gap-3 rounded-lg bg-slate-900 px-3 py-2 text-sm"
				:class="p.id === currentPlayer ? 'ring-1 ring-sky-500' : ''"
			>
				<span class="h-3 w-3 shrink-0 rounded-full" :class="COLOR_DOT[p.color] ?? 'bg-slate-600'" />
				<span>Seat {{ p.id }}<span v-if="p.id === playerID" class="text-slate-500"> (you)</span></span>
				<span class="ml-auto text-slate-400">{{ p.credits }} credits · {{ p.fame }} fame</span>
			</li>
		</ul>
		<button
			class="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold transition-colors hover:bg-sky-500 disabled:opacity-40"
			:disabled="!isMyTurn"
			@click="move('endTurn')"
		>
			End Turn
		</button>
	</div>
</template>
