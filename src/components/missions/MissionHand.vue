<script setup lang="ts">
import { ref } from 'vue';
import { IconCards } from '@tabler/icons-vue';
import MissionCard from './MissionCard.vue';

/**
 * The captain's active missions, fanned in a tray along the bottom of the screen
 * (like the poker hand in Western Legends). Hover a card to lift it; collapse the tray
 * for more room.
 */
const props = defineProps<{ missions: string[]; limit: number; canDiscard: boolean }>();
const emit = defineEmits<{ discard: [id: string] }>();
const collapsed = defineModel<boolean>('collapsed', { default: false });

const hovered = ref<number | null>(null);
const FAN_DEG = 5;
const OVERLAP = 34;

function fanStyle(i: number) {
	const n = props.missions.length;
	const deg = (i - (n - 1) / 2) * FAN_DEG;
	const lift = hovered.value === i ? 'translateY(-18px) scale(1.1) ' : '';
	return { transform: `${lift}rotate(${deg}deg)`, marginLeft: i === 0 ? '0' : `-${OVERLAP}px`, zIndex: hovered.value === i ? 50 : i + 1 };
}
</script>

<template>
	<div class="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center px-4">
		<div
			class="relative flex w-full max-w-5xl flex-col items-center border-t border-sky-900/40 bg-gradient-to-t from-[#05070d] via-[#05070d]/95 to-transparent px-4 pb-3 pt-10 transition-transform duration-300 ease-out"
			:class="collapsed ? 'translate-y-[calc(100%-3.25rem)]' : 'translate-y-0'"
		>
			<div class="pointer-events-auto absolute left-3 top-3 flex items-center gap-2">
				<button
					type="button"
					class="flex h-9 w-9 items-center justify-center rounded-lg border border-sky-800/60 bg-slate-900/95 text-sky-100 shadow-md hover:bg-slate-800"
					:aria-expanded="!collapsed"
					:title="collapsed ? 'Show missions' : 'Hide missions'"
					@click="collapsed = !collapsed"
				>
					<IconCards :size="20" stroke="1.75" aria-hidden="true" />
				</button>
				<span class="text-xs font-semibold text-slate-300">Active missions {{ missions.length }} / {{ limit }}</span>
			</div>

			<div v-if="!missions.length" class="pointer-events-auto flex min-h-[8rem] items-center text-sm text-slate-500">
				No active missions. Fly over a mission point to draw some at the end of your turn.
			</div>
			<div v-else class="pointer-events-auto flex min-h-[13rem] items-end justify-center">
				<div
					v-for="(id, i) in missions"
					:key="id"
					class="relative shrink-0 transition-transform duration-150"
					:style="fanStyle(i)"
					@mouseenter="hovered = i"
					@mouseleave="hovered = null"
				>
					<MissionCard :id="id" />
					<button
						v-if="canDiscard && hovered === i"
						type="button"
						class="absolute inset-x-2 bottom-2 rounded-md bg-slate-900/95 py-1 text-xs font-semibold text-red-300 ring-1 ring-red-800 hover:bg-red-950"
						@click="emit('discard', id)"
					>
						Discard mission
					</button>
				</div>
			</div>
		</div>
	</div>
</template>
