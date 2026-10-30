<script setup lang="ts">
import { ECONOMY_CUBES, ECONOMY_MAX, type ZiaState } from '../../logic/types';
import { CUBE_FILL } from '../ship/shipMatTheme';

/** [Embers] The Economy Board: cubes available to buy per type, and In Demand credits on empty sections. */
defineProps<{ G: ZiaState }>();
</script>

<template>
	<div v-if="G.economy" class="rounded-lg border border-slate-800 bg-slate-900/60">
		<h3 class="border-b border-slate-800 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Economy board</h3>
		<ul class="space-y-1.5 px-3 py-2 text-sm">
			<li v-for="c in ECONOMY_CUBES" :key="c" class="flex items-center gap-2">
				<span class="w-14 capitalize text-slate-300">{{ c }}</span>
				<span class="flex gap-0.5">
					<span
						v-for="i in ECONOMY_MAX"
						:key="i"
						class="h-3.5 w-3.5 rounded-sm border border-black/40"
						:style="{ background: i <= G.economy[c].cubes ? CUBE_FILL[c] : '#1e293b' }"
					/>
				</span>
				<span v-if="G.economy[c].demand" class="ml-auto text-xs font-semibold text-amber-300" title="In Demand: the next sale that produces this cube earns it">
					In demand +{{ G.economy[c].demand.toLocaleString('en-US') }}
				</span>
			</li>
		</ul>
	</div>
</template>
