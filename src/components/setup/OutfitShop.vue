<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { OUTFITS, OUTFITS_BY_ID, type OutfitDef, type OutfitType } from '../../data/outfits';
import { autoPlace, occupancy, parseCellKey, parseShape, transformCells } from '../../logic/holdGeometry';
import { checkMove } from '../../logic/game';
import { shipDef } from '../../logic/ship';
import type { PlayerColor, Rotation, ZiaState } from '../../logic/types';
import ShipMat from '../ship/ShipMat.vue';
import type { HoldGhost } from '../ship/HoldGrid.vue';
import { OUTFIT_FILL, CONNECTOR_FILL } from '../ship/shipMatTheme';

/**
 * Setup step: buy starting outfits and place them in the hold.
 * Pick an outfit, move over the hold to preview it, R rotates, F flips, click to place.
 * Click a placed outfit to move or return it (full refund during setup).
 */
const props = defineProps<{
	G: ZiaState;
	playerID: string;
	currentPlayer: string;
	color: PlayerColor;
	captainName: string;
}>();
const emit = defineEmits<{ act: [name: string, ...args: unknown[]] }>();

const me = computed(() => props.G.players[props.playerID]);
const ship = computed(() => me.value.ship!);
const myTurn = computed(() => props.playerID === props.currentPlayer);

type Placing = { kind: 'buy'; outfitId: string } | { kind: 'move'; uid: string; outfitId: string };
const placing = ref<Placing | null>(null);
const rotation = ref<Rotation>(0);
const flipped = ref(false);
const hover = ref<string | null>(null);
const selectedUid = ref<string | null>(null);
const message = ref('');

const GROUPS: { label: string; types: OutfitType[] }[] = [
	{ label: 'Engines', types: ['engine'] },
	{ label: 'Shields', types: ['shield'] },
	{ label: 'Blasters', types: ['blaster'] },
	{ label: 'Missiles', types: ['missile'] },
	{ label: 'Embers outfits & mods', types: ['cargo-pod', 'armor-plating', 'mod'] },
];
const groups = GROUPS.map((g) => ({ ...g, items: OUTFITS.filter((o) => g.types.includes(o.type)) }));

const supplyLeft = (o: OutfitDef) => props.G.supply[o.id];
const canAfford = (o: OutfitDef) => me.value.credits >= o.cost && supplyLeft(o) !== 0;

function startBuy(o: OutfitDef) {
	if (!myTurn.value || !canAfford(o)) return;
	placing.value = { kind: 'buy', outfitId: o.id };
	selectedUid.value = null;
	rotation.value = 0;
	flipped.value = false;
	message.value = '';
}

const selected = computed(() => ship.value.outfits.find((o) => o.uid === selectedUid.value) ?? null);

function startMove() {
	const o = selected.value;
	if (!o) return;
	placing.value = { kind: 'move', uid: o.uid, outfitId: o.outfitId };
	rotation.value = o.rotation;
	flipped.value = o.flipped;
	message.value = '';
}

function returnSelected() {
	if (!selected.value) return;
	const ok = checkMove(props.G, props.playerID, props.currentPlayer, 'returnOutfit', [selected.value.uid]);
	if (ok !== true) {
		message.value = ok;
		return;
	}
	emit('act', 'returnOutfit', selected.value.uid);
	selectedUid.value = null;
}

function cancel() {
	placing.value = null;
	message.value = '';
}

/** Where the outfit would go: its first section sits on the hovered cell. */
const candidate = computed(() => {
	if (!placing.value || !hover.value) return null;
	const def = OUTFITS_BY_ID[placing.value.outfitId];
	const cells = transformCells(parseShape(def.shape), rotation.value, flipped.value);
	const h = parseCellKey(hover.value);
	const x = h.x - cells[0].x;
	const y = h.y - cells[0].y;
	const args = [x, y, rotation.value, flipped.value];
	const check =
		placing.value.kind === 'buy'
			? checkMove(props.G, props.playerID, props.currentPlayer, 'buyOutfit', [def.id, ...args])
			: checkMove(props.G, props.playerID, props.currentPlayer, 'moveOutfit', [placing.value.uid, ...args]);
	return { def, cells: cells.map((c) => ({ x: c.x + x, y: c.y + y, kind: c.kind })), args, check };
});

const ghost = computed<HoldGhost | null>(() =>
	candidate.value ? { cells: candidate.value.cells, fill: OUTFIT_FILL[candidate.value.def.type], valid: candidate.value.check === true } : null,
);

function onCellClick(key: string) {
	if (!myTurn.value) return;
	if (placing.value) {
		const c = candidate.value;
		if (!c) return;
		if (c.check !== true) {
			message.value = c.check;
			return;
		}
		if (placing.value.kind === 'buy') emit('act', 'buyOutfit', placing.value.outfitId, ...c.args);
		else emit('act', 'moveOutfit', placing.value.uid, ...c.args);
		placing.value = null;
		selectedUid.value = null;
		message.value = '';
		return;
	}
	// Select the outfit under the cursor (mods on top win).
	const here = occupancy(ship.value.outfits).get(key) ?? [];
	const pick = here.find((c) => OUTFITS_BY_ID[c.outfitId].overlays) ?? here[0];
	selectedUid.value = pick ? pick.uid : null;
}

function autoPlaceSelected() {
	if (!placing.value || placing.value.kind !== 'buy') return;
	const p = autoPlace(shipDef(ship.value), ship.value.outfits, placing.value.outfitId, '__auto');
	if (!p) {
		message.value = `No room for a ${OUTFITS_BY_ID[placing.value.outfitId].name}`;
		return;
	}
	emit('act', 'buyOutfit', placing.value.outfitId, p.x, p.y, p.rotation, p.flipped);
	placing.value = null;
}

const rotate = () => (rotation.value = ((rotation.value + 1) % 4) as Rotation);
const flip = () => (flipped.value = !flipped.value);

function onKey(e: KeyboardEvent) {
	if (!placing.value || (e.target as HTMLElement)?.tagName === 'INPUT') return;
	if (e.key === 'r' || e.key === 'R') rotate();
	else if (e.key === 'f' || e.key === 'F') flip();
	else if (e.key === 'Escape') cancel();
}
onMounted(() => window.addEventListener('keydown', onKey));
onUnmounted(() => window.removeEventListener('keydown', onKey));

function shapePreview(o: OutfitDef) {
	const cells = parseShape(o.shape);
	return {
		cols: Math.max(...cells.map((c) => c.x)) + 1,
		rows: Math.max(...cells.map((c) => c.y)) + 1,
		cells: cells.map((c) => ({ ...c, fill: c.kind === 'C' ? CONNECTOR_FILL : OUTFIT_FILL[o.type] })),
	};
}
const credits = (n: number) => n.toLocaleString('en-US');
</script>

<template>
	<div class="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
		<div class="space-y-3">
			<ShipMat
				:state="ship"
				:color="color"
				:captain-name="captainName"
				:interactive="myTurn"
				:ghost="ghost"
				:margin="placing ? 1 : 0"
				:selected-uid="selectedUid"
				@cell-click="onCellClick"
				@cell-hover="hover = $event"
			/>

			<!-- Placement toolbar -->
			<div v-if="myTurn" class="flex flex-wrap items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/80 p-3 text-sm">
				<template v-if="placing">
					<span class="font-semibold">
						{{ placing.kind === 'buy' ? 'Placing' : 'Moving' }} {{ OUTFITS_BY_ID[placing.outfitId].name }}
					</span>
					<button class="btn" @click="rotate">Rotate <kbd>R</kbd></button>
					<button class="btn" @click="flip">Flip <kbd>F</kbd></button>
					<button v-if="placing.kind === 'buy'" class="btn" @click="autoPlaceSelected">Auto-place</button>
					<button class="btn" @click="cancel">Cancel <kbd>Esc</kbd></button>
					<span class="text-slate-400">Hover the hold and click to place.</span>
				</template>
				<template v-else-if="selected">
					<span class="font-semibold">{{ OUTFITS_BY_ID[selected.outfitId].name }}</span>
					<button class="btn" @click="startMove">Move</button>
					<button class="btn" @click="returnSelected">Return (+{{ credits(OUTFITS_BY_ID[selected.outfitId].cost) }} cR)</button>
					<button class="btn" @click="selectedUid = null">Deselect</button>
				</template>
				<span v-else class="text-slate-400">Choose an outfit from the shop, or click one in your hold to move or return it.</span>
				<span v-if="message" class="w-full text-amber-300">{{ message }}</span>
			</div>
		</div>

		<!-- Shop -->
		<aside class="space-y-3 rounded-xl border border-slate-800 bg-slate-900/80 p-4">
			<div class="flex items-baseline justify-between">
				<h3 class="text-lg font-bold">Outfitters</h3>
				<span class="text-xl font-black text-amber-300">{{ credits(me.credits) }} <span class="text-sm">cR</span></span>
			</div>
			<p class="text-xs text-slate-400">Spend your starting credits. Anything left over stays with you.</p>

			<div v-for="g in groups" :key="g.label" class="space-y-1.5">
				<h4 class="text-xs font-semibold uppercase tracking-wide text-slate-500">{{ g.label }}</h4>
				<button
					v-for="o in g.items"
					:key="o.id"
					type="button"
					class="shop-item"
					:class="{ active: placing?.kind === 'buy' && placing.outfitId === o.id }"
					:disabled="!myTurn || !canAfford(o)"
					:title="o.summary ?? `${o.sections} sections, ${o.useSpaces} use space${o.useSpaces === 1 ? '' : 's'}`"
					@click="startBuy(o)"
				>
					<span class="shape" :style="{ '--cols': shapePreview(o).cols, '--rows': shapePreview(o).rows }">
						<span
							v-for="c in shapePreview(o).cells"
							:key="`${c.x},${c.y}`"
							:class="{ use: c.kind === 'U', ext: c.kind === 'x' }"
							:style="{ gridColumn: c.x + 1, gridRow: c.y + 1, background: c.fill }"
						/>
					</span>
					<span class="flex-1 text-left">{{ o.name }}</span>
					<span class="text-slate-400">{{ credits(o.cost) }}</span>
					<span v-if="supplyLeft(o) != null" class="w-8 text-right text-xs text-slate-500">×{{ supplyLeft(o) }}</span>
				</button>
			</div>

			<button
				type="button"
				class="w-full rounded-lg bg-emerald-600 py-2.5 font-semibold transition-colors hover:bg-emerald-500 disabled:opacity-40"
				:disabled="!myTurn"
				@click="emit('act', 'finishOutfitting')"
			>
				{{ myTurn ? 'Done outfitting' : 'Waiting for your turn to outfit' }}
			</button>
		</aside>
	</div>
</template>

<style scoped>
.btn {
	border-radius: 0.5rem;
	border: 1px solid rgb(51 65 85);
	background: rgb(30 41 59);
	padding: 0.3rem 0.7rem;
}
.btn:hover {
	background: rgb(51 65 85);
}
kbd {
	margin-left: 0.25rem;
	padding: 0 0.3rem;
	border-radius: 0.25rem;
	background: #0f172a;
	font-size: 0.7rem;
	color: #94a3b8;
}
.shop-item {
	display: flex;
	width: 100%;
	align-items: center;
	gap: 0.6rem;
	border-radius: 0.5rem;
	border: 1px solid #334155;
	background: #1e293b;
	padding: 0.35rem 0.6rem;
	font-size: 0.85rem;
}
.shop-item:hover:not(:disabled) {
	border-color: #64748b;
}
.shop-item.active {
	border-color: #38bdf8;
	background: #0c4a6e80;
}
.shop-item:disabled {
	opacity: 0.4;
	cursor: not-allowed;
}
.shape {
	display: grid;
	grid-template-columns: repeat(var(--cols), 0.6rem);
	grid-template-rows: repeat(var(--rows), 0.6rem);
	gap: 1px;
	width: 3.2rem;
	justify-content: center;
}
.shape span {
	border-radius: 1px;
}
.shape span.use {
	box-shadow: inset 0 0 0 2px #f39a1e;
}
.shape span.ext {
	opacity: 0.6;
}
</style>
