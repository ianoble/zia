<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import MissionCard from './MissionCard.vue';

/**
 * Status Phase: the captain looks at the mission cards drawn this turn and keeps at least
 * one (up to `maxKeep`); the rest are discarded (rulebook p12).
 */
const props = defineProps<{ cards: string[]; maxKeep: number }>();
const emit = defineEmits<{ keep: [ids: string[]] }>();

const picked = ref<string[]>([]);
watch(
	() => props.cards.join(),
	() => (picked.value = []),
);

function toggle(id: string) {
	if (picked.value.includes(id)) picked.value = picked.value.filter((x) => x !== id);
	else if (props.maxKeep === 1) picked.value = [id];
	else if (picked.value.length < props.maxKeep) picked.value = [...picked.value, id];
}

const ready = computed(() => picked.value.length >= 1 && picked.value.length <= props.maxKeep);
</script>

<template>
	<div class="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
		<div class="w-full max-w-4xl rounded-xl border border-sky-800/60 bg-slate-950/95 p-5 shadow-2xl">
			<h2 class="text-lg font-bold text-slate-100">Choose your mission{{ maxKeep > 1 ? 's' : '' }}</h2>
			<p class="mt-1 text-sm text-slate-400">
				You drew {{ cards.length }} mission cards. Keep {{ maxKeep > 1 ? `1 to ${maxKeep}` : '1' }}; the rest are discarded and your turn ends.
			</p>
			<div class="mt-4 flex flex-wrap justify-center gap-4">
				<button v-for="id in cards" :key="id" type="button" class="rounded-lg transition-transform hover:-translate-y-1" @click="toggle(id)">
					<MissionCard :id="id" :selected="picked.includes(id)" />
				</button>
			</div>
			<div class="mt-5 flex items-center justify-end gap-3">
				<span class="text-sm text-slate-400">{{ picked.length }} / {{ maxKeep }} chosen</span>
				<button
					type="button"
					class="rounded-lg bg-emerald-600 px-4 py-2 font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
					:disabled="!ready"
					@click="emit('keep', picked)"
				>
					Keep and end turn
				</button>
			</div>
		</div>
	</div>
</template>
