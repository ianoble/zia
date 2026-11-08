<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';

/**
 * A question for the captain, shown as a modal over the game. Put the explanation in the
 * default slot and the answers in the `actions` slot. With `dismissible`, Escape or a click
 * on the backdrop emits `close` (for prompts that can be cancelled).
 */
const props = withDefaults(defineProps<{ title: string; tone?: 'sky' | 'amber' | 'fuchsia' | 'red'; dismissible?: boolean }>(), {
	tone: 'sky',
	dismissible: false,
});
const emit = defineEmits<{ close: [] }>();

const TONES = {
	sky: { border: 'border-sky-700/70', title: 'text-sky-200' },
	amber: { border: 'border-amber-600/70', title: 'text-amber-200' },
	fuchsia: { border: 'border-fuchsia-700/70', title: 'text-fuchsia-200' },
	red: { border: 'border-red-700/70', title: 'text-red-200' },
} as const;

function onKey(e: KeyboardEvent) {
	if (props.dismissible && e.key === 'Escape') emit('close');
}
onMounted(() => window.addEventListener('keydown', onKey));
onUnmounted(() => window.removeEventListener('keydown', onKey));
</script>

<template>
	<Teleport to="body">
		<div class="fixed inset-0 z-40 flex items-center justify-center bg-black/55 p-4" @click.self="dismissible && emit('close')">
			<div
				role="dialog"
				aria-modal="true"
				:aria-label="title"
				class="w-full max-w-md space-y-3 rounded-xl border bg-slate-950/95 p-5 text-sm text-slate-200 shadow-2xl"
				:class="TONES[tone].border"
			>
				<h2 class="text-base font-bold" :class="TONES[tone].title">{{ title }}</h2>
				<div class="space-y-2 text-slate-300"><slot /></div>
				<div class="prompt-actions grid gap-2 pt-1"><slot name="actions" /></div>
			</div>
		</div>
	</Teleport>
</template>

<style scoped>
.prompt-actions :deep(button) {
	display: flex;
	width: 100%;
	align-items: center;
	justify-content: space-between;
	gap: 0.5rem;
	border-radius: 0.5rem;
	border: 1px solid #334155;
	background: #1e293b;
	padding: 0.55rem 0.75rem;
	font-weight: 600;
	text-align: left;
}
.prompt-actions :deep(button:hover:not(:disabled)) {
	border-color: #38bdf8;
}
.prompt-actions :deep(button:disabled) {
	opacity: 0.4;
	cursor: not-allowed;
}
.prompt-actions :deep(button.secondary) {
	justify-content: center;
	background: transparent;
	font-weight: 500;
	color: #94a3b8;
}
</style>
