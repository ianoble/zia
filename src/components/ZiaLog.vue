<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';
import type { LogLine } from '../logic/types';

/** Readable game log (names and colours resolved by the parent). */
const props = defineProps<{ lines: LogLine[]; nameOf: (seat: string) => string; colorOf: (seat: string) => string }>();

const el = ref<HTMLElement | null>(null);
watch(
	() => props.lines.length,
	async () => {
		await nextTick();
		el.value?.scrollTo({ top: el.value.scrollHeight, behavior: 'smooth' });
	},
	{ immediate: true },
);
</script>

<template>
	<div class="rounded-lg border border-slate-800 bg-slate-900/60">
		<h3 class="border-b border-slate-800 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Log</h3>
		<ol ref="el" class="max-h-64 space-y-1 overflow-y-auto px-3 py-2 text-sm">
			<li v-for="(l, i) in lines" :key="i" :class="l.seat == null ? 'italic text-slate-400' : 'text-slate-200'">
				<strong v-if="l.seat != null" :style="{ color: colorOf(l.seat) }">{{ nameOf(l.seat) }}</strong>
				{{ l.text }}
			</li>
		</ol>
	</div>
</template>
