<script setup lang="ts">
import { computed } from 'vue';
import { energyColor } from './shipMatTheme';

/** Energy meter: hexes 0..max in two staggered rows (evens on top, odds below). */
const props = defineProps<{ energy: number; max: number; markerColor: string }>();

const cells = computed(() =>
	Array.from({ length: props.max + 1 }, (_, value) => ({
		value,
		row: value % 2,
		col: Math.floor(value / 2),
		color: energyColor(value, props.max),
	})),
);
</script>

<template>
	<div class="energy" :style="{ '--cols': Math.floor(max / 2) + 1 }" role="meter" :aria-valuenow="energy" aria-valuemin="0" :aria-valuemax="max" :aria-label="`Energy ${energy} of ${max}`">
		<div class="energy-badge" title="Energy"><span>E</span></div>
		<div class="energy-grid">
			<div
				v-for="c in cells"
				:key="c.value"
				class="hex"
				:class="{ current: c.value === energy, spent: c.value > energy }"
				:style="{ '--hex-color': c.color, '--row': c.row, '--col': c.col }"
			>
				<div class="hex-inner">
					<div v-if="c.value === energy" class="marker" :style="{ '--marker': markerColor }" />
					<span class="num" :class="{ zero: c.value === 0 }">{{ c.value }}</span>
				</div>
			</div>
		</div>
	</div>
</template>

<style scoped>
.energy {
	--hex-w: calc(var(--energy-cell, var(--cell)) * 0.8);
	--hex-h: calc(var(--hex-w) * 1.1547);
	display: flex;
	align-items: center;
	gap: calc(var(--energy-cell, var(--cell)) * 0.3);
}
.energy-badge {
	flex-shrink: 0;
	/* Regular pentagon: height ≈ 0.95 × width. */
	width: calc(var(--energy-cell, var(--cell)) * 1.05);
	height: calc(var(--energy-cell, var(--cell)) * 1);
	display: grid;
	place-items: center;
	padding-top: calc(var(--energy-cell, var(--cell)) * 0.1);
	font-family: 'Arial Narrow', 'Roboto Condensed', 'Segoe UI', sans-serif;
	font-weight: 800;
	font-size: calc(var(--energy-cell, var(--cell)) * 0.62);
	line-height: 1;
	color: #c0392b;
	background: linear-gradient(160deg, #ffe66b, #f5a623);
	clip-path: polygon(50% 0, 100% 38%, 82% 100%, 18% 100%, 0 38%);
}
.energy-badge span {
	display: inline-block;
	transform: scale(0.85, 1.1);
}
.energy-grid {
	position: relative;
	width: calc(var(--cols) * var(--hex-w) + var(--hex-w) / 2);
	height: calc(var(--hex-h) * 1.75);
}
.hex {
	position: absolute;
	left: calc(var(--col) * var(--hex-w) + var(--row) * var(--hex-w) / 2);
	top: calc(var(--row) * var(--hex-h) * 0.75);
	width: var(--hex-w);
	height: var(--hex-h);
	clip-path: polygon(50% 0, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%);
	background: var(--hex-color);
	padding: 2px;
	filter: drop-shadow(0 0 3px var(--hex-color));
}
.hex-inner {
	position: relative;
	width: 100%;
	height: 100%;
	clip-path: inherit;
	background: #0d0f1a;
	display: grid;
	place-items: center;
	font-weight: 800;
	font-size: calc(var(--energy-cell, var(--cell)) * 0.36);
	color: #fff;
}
.hex.spent .hex-inner {
	color: #ffffff55;
}
.hex.spent {
	filter: none;
	opacity: 0.55;
}
.num {
	position: relative;
	z-index: 1;
	text-shadow: 0 1px 2px #000;
}
.zero::after {
	content: '';
	position: absolute;
	left: -20%;
	right: -20%;
	top: 50%;
	border-top: 2px solid #ff3fa4;
	transform: rotate(-60deg);
}
.marker {
	position: absolute;
	inset: 22%;
	clip-path: polygon(30% 0, 70% 0, 100% 30%, 100% 70%, 70% 100%, 30% 100%, 0 70%, 0 30%);
	background: #000;
}
.hex.current .hex-inner {
	background: #1b1f33;
}
</style>
