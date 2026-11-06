<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import type { DiceRoll } from '../../logic/types';

/**
 * Shows one of the captain's dice rolls: the die tumbles through random faces, lands on
 * the result, then says what happened. Good and neutral results close by themselves; a
 * bad one waits for the captain to click Continue. Clicking while it rolls skips ahead.
 */
const props = defineProps<{ roll: DiceRoll }>();
const emit = defineEmits<{ done: [] }>();

const ROLL_MS = 1100;
const FACE_MS = 70;
const AUTO_CLOSE_MS = 1800;

const reducedMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const landed = ref(false);
const face = ref(1);
let faceTimer: ReturnType<typeof setInterval> | undefined;
let landTimer: ReturnType<typeof setTimeout> | undefined;
let closeTimer: ReturnType<typeof setTimeout> | undefined;

function clearTimers() {
	clearInterval(faceTimer);
	clearTimeout(landTimer);
	clearTimeout(closeTimer);
}

function land() {
	clearTimers();
	landed.value = true;
	face.value = props.roll.roll;
	if (props.roll.outcome !== 'bad') closeTimer = setTimeout(() => emit('done'), AUTO_CLOSE_MS);
}

function start() {
	clearTimers();
	landed.value = false;
	if (reducedMotion || props.roll.automatic) return land();
	faceTimer = setInterval(() => {
		let next = face.value;
		while (props.roll.sides > 1 && next === face.value) next = 1 + Math.floor(Math.random() * props.roll.sides);
		face.value = next;
	}, FACE_MS);
	landTimer = setTimeout(land, ROLL_MS);
}

function onClick() {
	if (!landed.value) land();
	else emit('done');
}
function onKey(e: KeyboardEvent) {
	if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') {
		e.preventDefault();
		onClick();
	}
}

watch(() => props.roll.id, start);
onMounted(() => {
	start();
	window.addEventListener('keydown', onKey);
});
onUnmounted(() => {
	clearTimers();
	window.removeEventListener('keydown', onKey);
});

/** Die outline per number of sides (viewBox 0 0 100 100), with a few facet lines. */
const SHAPES: Record<number, { outline: string; facets: string[] }> = {
	6: { outline: '14,14 86,14 86,86 14,86', facets: [] },
	8: { outline: '50,4 94,50 50,96 6,50', facets: ['6,50 94,50'] },
	12: { outline: '50,5 94,37 77,91 23,91 6,37', facets: ['50,22 77,42 67,74 33,74 23,42 50,22'] },
	20: {
		outline: '50,4 92,27 92,73 50,96 8,73 8,27',
		facets: ['50,24 76,68 24,68 50,24', '50,4 50,24', '92,27 76,68', '92,73 76,68', '50,96 76,68', '50,96 24,68', '8,73 24,68', '8,27 24,68', '8,27 50,24', '92,27 50,24'],
	},
};
const shape = computed(() => SHAPES[props.roll.sides] ?? SHAPES[20]);

const TONE = {
	good: { fill: '#065f46', stroke: '#34d399', text: 'text-emerald-300', word: 'Success' },
	mixed: { fill: '#78350f', stroke: '#fbbf24', text: 'text-amber-300', word: 'Mixed' },
	bad: { fill: '#7f1d1d', stroke: '#f87171', text: 'text-red-300', word: 'Bad luck' },
	neutral: { fill: '#0c4a6e', stroke: '#38bdf8', text: 'text-sky-300', word: '' },
} as const;
const tone = computed(() => (landed.value ? TONE[props.roll.outcome] : { fill: '#1e293b', stroke: '#94a3b8', text: '', word: '' }));
</script>

<template>
	<Teleport to="body">
		<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" @click="onClick">
			<div
				role="dialog"
				aria-modal="true"
				:aria-label="`${roll.label}: d${roll.sides}`"
				class="w-full max-w-xs space-y-3 rounded-xl border border-slate-700 bg-slate-950/95 p-5 text-center shadow-2xl"
			>
				<p class="text-xs font-semibold uppercase tracking-wide text-slate-400">{{ roll.label }} · d{{ roll.sides }}</p>

				<div class="flex justify-center py-2">
					<svg viewBox="0 0 100 100" class="h-32 w-32 overflow-visible" :class="landed ? 'die-land' : 'die-tumble'">
						<polygon :points="shape.outline" :fill="tone.fill" :stroke="tone.stroke" stroke-width="3" stroke-linejoin="round" />
						<polyline
							v-for="(f, i) in shape.facets"
							:key="i"
							:points="f"
							fill="none"
							:stroke="tone.stroke"
							stroke-opacity="0.35"
							stroke-width="1.5"
						/>
						<text x="50" :y="roll.sides === 20 ? 58 : 54" text-anchor="middle" dominant-baseline="middle" class="fill-white font-black" :font-size="face >= 10 ? 26 : 30">
							{{ face }}
						</text>
					</svg>
				</div>

				<div class="min-h-[4.5rem]" aria-live="polite">
					<template v-if="landed">
						<p v-if="tone.word" class="text-lg font-bold" :class="tone.text">{{ tone.word }}</p>
						<p class="text-sm text-slate-200">{{ roll.detail }}</p>
						<p v-if="roll.automatic" class="mt-1 text-xs text-slate-400">Enviro-Shld: the shield rolls its maximum.</p>
						<p v-if="roll.luck" class="mt-1 text-sm font-semibold text-purple-300">Natural 20! +1 fame for Luck</p>
					</template>
					<p v-else class="pt-4 text-sm text-slate-500">Rolling…</p>
				</div>

				<button
					v-if="landed && roll.outcome === 'bad'"
					type="button"
					class="w-full rounded-lg border border-red-700/70 bg-red-950/50 py-2 font-semibold text-red-100 hover:border-red-400"
					@click.stop="emit('done')"
				>
					Continue
				</button>
				<p v-else-if="landed" class="text-xs text-slate-500">Click to continue</p>
			</div>
		</div>
	</Teleport>
</template>

<style scoped>
.die-tumble {
	animation: tumble 0.35s linear infinite;
}
.die-land {
	animation: land 0.35s ease-out;
}
@keyframes tumble {
	0% {
		transform: rotate(0deg) scale(0.9) translateY(0);
	}
	25% {
		transform: rotate(90deg) scale(1.05) translateY(-6px);
	}
	50% {
		transform: rotate(180deg) scale(0.92) translateY(0);
	}
	75% {
		transform: rotate(270deg) scale(1.05) translateY(-6px);
	}
	100% {
		transform: rotate(360deg) scale(0.9) translateY(0);
	}
}
@keyframes land {
	0% {
		transform: scale(1.35);
	}
	60% {
		transform: scale(0.92);
	}
	100% {
		transform: scale(1);
	}
}
</style>
