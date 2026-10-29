<script setup lang="ts">
import { computed, ref } from 'vue';
import BoardMap from '../../components/board/BoardMap.vue';
import { explorePlacement, slotCrossed, startingBoard, type BoardState } from '../../logic/board';
import { boardHexes, startingDeck } from '../../logic/board';
import { HEX_DIRECTIONS, hexKey } from '../../logic/hex';

const SLOT_NAMES = ['E', 'SE', 'SW', 'W', 'NW', 'NE'];

/**
 * Design sandbox for the board — no server needed. Route: /dev/board
 * Click a hex on the outer rim of a sector to explore through that side: a blank tile
 * is placed against it, turned so the edge symbols match.
 */

const query = new URLSearchParams(window.location.search);
const players = ref(Math.min(5, Math.max(2, Number(query.get('players')) || 3)));
const board = ref<BoardState>(startingBoard(seatsFor(players.value)));
const note = ref('');

/** Every exploration space shows a face-down token in the preview. */
const tokens = computed(() => [...boardHexes(board.value).values()].filter((h) => h.kind === 'exploration').map((h) => h.key));

// ?explore=1:NE,0:NE pre-explores from sector index through side, in order.
for (const step of (query.get('explore') ?? '').split(',').filter(Boolean)) {
	const [index, side] = step.split(':');
	exploreFrom(Number(index), SLOT_NAMES.indexOf(side.toUpperCase()));
}

function seatsFor(n: number) {
	return Array.from({ length: n }, (_, i) => String(i));
}

function reset() {
	board.value = startingBoard(seatsFor(players.value));
	note.value = '';
}

function onHexClick(key: string) {
	// Explore through the first open side this hex touches (rim hexes only).
	const [q, r] = key.split(',').map(Number);
	for (const d of HEX_DIRECTIONS) {
		const crossed = slotCrossed(board.value, key, hexKey({ q: q + d.q, r: r + d.r }));
		if (!crossed) continue;
		if (exploreFrom(crossed.sectorIndex, crossed.slot)) return;
	}
	note.value = 'No open side next to that hex.';
}

function exploreFrom(sectorIndex: number, slot: number): boolean {
	if (!board.value.sectors[sectorIndex] || slot < 0) return false;
	const placed = explorePlacement(board.value, sectorIndex, slot);
	if (!placed) return false;
	const deck = startingDeck(board.value);
	if (!deck.length) return false;
	const tile = { id: deck[Math.floor(Math.random() * deck.length)] };
	board.value = { sectors: [...board.value.sectors, { tileId: tile.id, ...placed }] };
	note.value = `Explored from sector ${sectorIndex} through side ${SLOT_NAMES[slot]}; new tile turned ${placed.rotation * 60}°.`;
	return true;
}
</script>

<template>
	<div class="flex h-screen flex-col bg-slate-950 text-slate-100">
		<header class="flex flex-wrap items-center gap-4 p-4">
			<div>
				<h1 class="text-2xl font-bold">Board preview</h1>
				<p class="text-sm text-slate-400">Design sandbox; no server needed. Click a hex on a sector's outer rim to explore through that side.</p>
			</div>
			<label class="text-sm">
				Captains
				<select v-model.number="players" class="ml-1 rounded bg-slate-800 px-2 py-1" @change="reset">
					<option v-for="n in [2, 3, 4, 5]" :key="n" :value="n">{{ n }}</option>
				</select>
			</label>
			<button type="button" class="rounded bg-slate-800 px-3 py-1 text-sm hover:bg-slate-700" @click="reset">Reset</button>
			<span class="text-sm text-slate-400">{{ note }}</span>
			<router-link to="/" class="ml-auto text-sm text-slate-500 hover:text-slate-300">← Lobby</router-link>
		</header>
		<div class="min-h-0 flex-1 p-4 pt-0">
			<BoardMap :board="board" :ships="[]" :exploration-spaces="tokens" @hex-click="onHexClick" />
		</div>
	</div>
</template>
