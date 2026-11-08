<script setup lang="ts">
import { computed, ref } from 'vue';
import BoardMap from '../../components/board/BoardMap.vue';
import { explorePlacement, slotCrossed, startingBoard, type BoardState } from '../../logic/board';
import { boardHexes, startingDeck } from '../../logic/board';
import { SECTOR_TILES } from '../../data/sectors';
import { HEX_DIRECTIONS, hexKey } from '../../logic/hex';
import { visibleHexes } from '../../logic/sight';

const SLOT_NAMES = ['E', 'SE', 'SW', 'W', 'NW', 'NE'];

/**
 * Design sandbox for the board — no server needed. Route: /dev/board
 * Click a hex on the outer rim of a sector to explore through that side: a blank tile
 * is placed against it, turned so the edge symbols match.
 * In Line of sight mode, clicking a hex shows every space it can see (up to missile
 * range, 6), numbered by range.
 */

const query = new URLSearchParams(window.location.search);
const players = ref(Math.min(5, Math.max(2, Number(query.get('players')) || 3)));
// ?start=loath,lunari,… picks the starting tiles (in seat order).
const startTiles = query.get('start')?.split(',').filter(Boolean);
if (startTiles?.length) players.value = Math.min(5, Math.max(2, startTiles.length));
const freshBoard = () => (startTiles?.length ? startingBoard(seatsFor(players.value), startTiles) : startingBoard(seatsFor(players.value)));
// ?gallery=1 shows every tile upright (as printed), in number order, to check layouts.
const gallery = query.get('gallery') === '1';
function galleryBoard(): BoardState {
	return {
		sectors: SECTOR_TILES.map((t, i) => {
			const col = i % 6;
			const row = Math.floor(i / 6);
			// Two sector-widths apart across, one tile-height-and-a-bit down, so tiles don't touch.
			return { tileId: t.id, center: { q: col * 10 + row, r: col * -6 + row * 7 }, rotation: 0 };
		}),
	};
}
const board = ref<BoardState>(gallery ? galleryBoard() : freshBoard());
const note = ref('');
// ?sight=1 starts in Line of sight mode.
const sightMode = ref(query.get('sight') === '1');
const sightFrom = ref<string | null>(null);
const sight = computed(() => (sightMode.value && sightFrom.value ? visibleHexes(board.value, sightFrom.value, 6) : null));
const sightShips = computed(() =>
	sightMode.value && sightFrom.value ? [{ seat: 'sight', position: sightFrom.value, color: '#f59e0b', label: 'A', active: true }] : [],
);

/** Every exploration space shows a face-down token in the preview. */
const tokens = computed(() => [...boardHexes(board.value).values()].filter((h) => h.kind === 'exploration').map((h) => h.key));

// ?explore=1:NE,0:NE:xia pre-explores from sector index through side (optionally a given tile), in order.
for (const step of (query.get('explore') ?? '').split(',').filter(Boolean)) {
	const [index, side, tileId] = step.split(':');
	exploreFrom(Number(index), SLOT_NAMES.indexOf(side.toUpperCase()), tileId);
}

function seatsFor(n: number) {
	return Array.from({ length: n }, (_, i) => String(i));
}

function reset() {
	board.value = freshBoard();
	note.value = '';
}

function onHexClick(key: string) {
	if (sightMode.value) {
		sightFrom.value = sightFrom.value === key ? null : key;
		note.value = sightFrom.value ? `Line of sight from ${key}: ${sight.value?.size ?? 0} spaces within range 6.` : '';
		return;
	}
	// Explore through the first open side this hex touches (rim hexes only).
	const [q, r] = key.split(',').map(Number);
	for (const d of HEX_DIRECTIONS) {
		const crossed = slotCrossed(board.value, key, hexKey({ q: q + d.q, r: r + d.r }));
		if (!crossed) continue;
		if (exploreFrom(crossed.sectorIndex, crossed.slot)) return;
	}
	note.value = 'No open side next to that hex.';
}

function exploreFrom(sectorIndex: number, slot: number, tileId?: string): boolean {
	if (!board.value.sectors[sectorIndex] || slot < 0) return false;
	const placed = explorePlacement(board.value, sectorIndex, slot);
	if (!placed) return false;
	const deck = startingDeck(board.value);
	if (!deck.length) return false;
	const tile = { id: tileId && deck.includes(tileId) ? tileId : deck[Math.floor(Math.random() * deck.length)] };
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
			<label class="text-sm">
				<input v-model="sightMode" type="checkbox" class="mr-1" @change="sightFrom = null" />
				Line of sight
			</label>
			<span class="text-sm text-slate-400">{{ note }}</span>
			<router-link to="/" class="ml-auto text-sm text-slate-500 hover:text-slate-300">← Lobby</router-link>
		</header>
		<div class="min-h-0 flex-1 p-4 pt-0">
			<BoardMap :board="board" :ships="sightShips" :exploration-spaces="tokens" :reachable="sight" @hex-click="onHexClick" />
		</div>
	</div>
</template>
