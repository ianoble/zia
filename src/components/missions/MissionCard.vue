<script setup lang="ts">
import { computed } from 'vue';
import { MISSIONS_BY_ID } from '../../data/missions';

/** One mission card (placeholder art: type and side only until the real card data arrives). */
const props = defineProps<{ id: string; selected?: boolean }>();
const card = computed(() => MISSIONS_BY_ID[props.id]);
</script>

<template>
	<div class="mission-card" :class="[card?.side ?? 'lawful', { selected }]">
		<div class="mission-head">
			<span class="mission-kicker">Mission</span>
			<span class="mission-side">{{ card?.side === 'outlaw' ? 'Outlaw' : 'Lawful' }}</span>
		</div>
		<div class="mission-type">{{ card?.type ?? id }}</div>
		<div class="mission-body">Objective, payment and delivery point coming with the card data.</div>
	</div>
</template>

<style scoped>
.mission-card {
	display: flex;
	width: 8.5rem;
	height: 12rem;
	flex-direction: column;
	gap: 0.4rem;
	border-radius: 0.6rem;
	border: 2px solid var(--edge);
	background: linear-gradient(165deg, var(--top), #0b1020 70%);
	padding: 0.55rem;
	color: #e2e8f0;
	box-shadow: 0 6px 18px #0009;
}
.mission-card.lawful {
	--edge: #3b82f6;
	--top: #1e3a8a;
	--accent: #93c5fd;
}
.mission-card.outlaw {
	--edge: #ef4444;
	--top: #7f1d1d;
	--accent: #fca5a5;
}
.mission-card.selected {
	outline: 3px solid #fbbf24;
	outline-offset: 2px;
}
.mission-head {
	display: flex;
	justify-content: space-between;
	font-size: 0.6rem;
	font-weight: 800;
	letter-spacing: 0.08em;
	text-transform: uppercase;
	color: var(--accent);
}
.mission-type {
	font-size: 1rem;
	font-weight: 800;
	line-height: 1.15;
}
.mission-body {
	margin-top: auto;
	font-size: 0.65rem;
	line-height: 1.3;
	color: #94a3b8;
}
</style>
