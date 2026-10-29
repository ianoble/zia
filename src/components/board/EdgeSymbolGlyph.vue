<script setup lang="ts">
import type { EdgeSymbol } from '../../data/sectors';

/**
 * The shape of one edge symbol, drawn along +x (the stem starts at x 0, on the tile edge).
 * Used inside an SVG: the board map rotates it into place, EdgeSymbolIcon shows it inline.
 */
defineProps<{ symbol: EdgeSymbol }>();
</script>

<template>
	<line v-if="symbol === 'line'" x1="0" y1="0" x2="34" y2="0" />
	<template v-else-if="symbol === 'bar'">
		<line x1="0" y1="0" x2="30" y2="0" />
		<line x1="30" y1="-11" x2="30" y2="11" />
	</template>
	<template v-else-if="symbol === 'square'">
		<line x1="0" y1="0" x2="22" y2="0" />
		<rect x="22" y="-8" width="16" height="16" />
	</template>
	<template v-else-if="symbol === 'circle'">
		<line x1="0" y1="0" x2="24" y2="0" />
		<circle cx="32" cy="0" r="8" />
	</template>
	<template v-else-if="symbol === 'arrow'">
		<line x1="0" y1="0" x2="22" y2="0" />
		<polygon points="22,-10 22,10 40,0" />
	</template>
	<template v-else-if="symbol === 'cup'">
		<line x1="0" y1="0" x2="22" y2="0" />
		<path d="M 32 -10 A 10 10 0 0 0 32 10" />
	</template>
</template>
