<script setup lang="ts">
import type { EdgeSymbol } from '../../data/sectors';
import EdgeSymbolGlyph from './EdgeSymbolGlyph.vue';

/** An edge symbol as a small inline icon: stem at the bottom, shape on top. */
defineProps<{ symbol: EdgeSymbol }>();
</script>

<template>
	<svg viewBox="-16 -44 32 48" class="inline-block h-[1.4em] w-[1em] align-middle" aria-hidden="true">
		<g transform="rotate(-90)" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">
			<EdgeSymbolGlyph :symbol="symbol" />
		</g>
	</svg>
</template>
