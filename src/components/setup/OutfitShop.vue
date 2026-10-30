<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { OUTFITS, OUTFITS_BY_ID, type OutfitDef, type OutfitType } from '../../data/outfits';
import { autoPlace, occupancy, parseCellKey, parseShape, transformCells } from '../../logic/holdGeometry';
import { checkMove, outfitSellPrice } from '../../logic/game';
import { cargoTargets, createShipState, shipDef } from '../../logic/ship';
import { SHIPS_BY_ID } from '../../data/ships';
import type { PlayerColor, Rotation, ZiaState } from '../../logic/types';
import ShipMat from '../ship/ShipMat.vue';
import type { HoldGhost } from '../ship/HoldGrid.vue';
import { OUTFIT_FILL, CONNECTOR_FILL } from '../ship/shipMatTheme';

/**
 * Outfitters: buy outfits and place them in the hold, at setup or at a starport.
 * Pick an outfit, move over the hold to preview it, R rotates, F flips, click to place.
 * Click a placed outfit to move it, or return it (full refund during setup; sold for half,
 * rounded up, at a starport). At a starport, click a cube and then a free space to move it.
 * 'upgrade' mode: buying a new ship. The hold shown is the new ship's; place each outfit
 * from the list (or sell it), then complete the purchase.
 */
const props = withDefaults(
	defineProps<{
		G: ZiaState;
		playerID: string;
		currentPlayer: string;
		color: PlayerColor;
		captainName: string;
		mode?: 'setup' | 'starport' | 'upgrade';
	}>(),
	{ mode: 'setup' },
);
const emit = defineEmits<{ act: [name: string, ...args: unknown[]]; close: [] }>();
const atStarport = computed(() => props.mode !== 'setup');
const upgrading = computed(() => props.mode === 'upgrade' && !!me.value.upgrade);
/** Starport: a cube picked up to move elsewhere in the hold. */
const movingCube = ref<string | null>(null);
const cubeTargets = computed(() => (movingCube.value ? cargoTargets(ship.value) : null));

const me = computed(() => props.G.players[props.playerID]);
/** The hold being worked on: the current ship, or (buying a ship) the new one with its outfits so far. */
const ship = computed(() =>
	upgrading.value ? { ...createShipState(me.value.upgrade!.shipId), outfits: me.value.upgrade!.layout } : me.value.ship!,
);
const newShipName = computed(() => (me.value.upgrade ? SHIPS_BY_ID[me.value.upgrade.shipId].name : ''));
const newShipPrice = computed(() => (me.value.upgrade ? SHIPS_BY_ID[me.value.upgrade.shipId].price : 0));
/** Buying a ship: outfits not yet placed in the new hold. */
const unplaced = computed(() => {
	if (!upgrading.value) return [];
	const placed = new Set(me.value.upgrade!.layout.map((o) => o.uid));
	return me.value.ship!.outfits.filter((o) => !placed.has(o.uid));
});
const completeCheck = computed(() => checkMove(props.G, props.playerID, props.currentPlayer, 'completeShipUpgrade', []));

function startPlace(uid: string, outfitId: string) {
	placing.value = { kind: 'move', uid, outfitId };
	selectedUid.value = null;
	rotation.value = 0;
	flipped.value = false;
	message.value = '';
}
function sellUnplaced(uid: string) {
	emit('act', 'returnOutfit', uid);
}
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
			: checkMove(props.G, props.playerID, props.currentPlayer, upgrading.value ? 'upgradePlaceOutfit' : 'moveOutfit', [placing.value.uid, ...args]);
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
		else emit('act', upgrading.value ? 'upgradePlaceOutfit' : 'moveOutfit', placing.value.uid, ...c.args);
		placing.value = null;
		selectedUid.value = null;
		message.value = '';
		return;
	}
	// Starport: move a cube (click it, then click a free space).
	if (atStarport.value && !upgrading.value) {
		if (movingCube.value) {
			if (cubeTargets.value?.includes(key)) emit('act', 'moveCargo', movingCube.value, key);
			movingCube.value = null;
			return;
		}
		if (ship.value.cargo.some((c) => c.cell === key)) {
			movingCube.value = key;
			selectedUid.value = null;
			message.value = 'Click a free space to move the cube there.';
			return;
		}
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
				:targets="cubeTargets"
				target-kind="cargo"
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
					<button v-if="upgrading" class="btn" @click="emit('act', 'upgradeUnplace', selected.uid); selectedUid = null">Take out</button>
					<button v-if="!upgrading" class="btn" @click="returnSelected">
						{{ atStarport ? 'Sell' : 'Return' }} (+{{ credits(atStarport ? outfitSellPrice(selected.outfitId) : OUTFITS_BY_ID[selected.outfitId].cost) }} cR)
					</button>
					<button class="btn" @click="selectedUid = null">Deselect</button>
				</template>
				<span v-else class="text-slate-400">
					Choose an outfit from the shop, or click one in your hold to move or {{ atStarport ? 'sell' : 'return' }} it.<template v-if="atStarport">
						Click a cube to move it.</template
					>
				</span>
				<span v-if="message" class="w-full text-amber-300">{{ message }}</span>
			</div>
		</div>

		<!-- Buying a ship: outfits to place, then pay -->
		<aside v-if="upgrading" class="space-y-3 rounded-xl border border-violet-800/70 bg-slate-900/80 p-4">
			<div class="flex items-baseline justify-between">
				<h3 class="text-lg font-bold">Fitting out the {{ newShipName }}</h3>
				<span class="text-xl font-black text-amber-300">{{ credits(me.credits) }} <span class="text-sm">cR</span></span>
			</div>
			<p class="text-xs text-slate-400">
				Place every outfit in the new hold (or sell it), then buy the ship. Damage and bounty stay with the old ship; your cubes are placed
				again after.
			</p>
			<div v-if="unplaced.length" class="space-y-1.5">
				<h4 class="text-xs font-semibold uppercase tracking-wide text-slate-500">To place ({{ unplaced.length }})</h4>
				<div v-for="o in unplaced" :key="o.uid" class="flex items-center gap-2">
					<button
						type="button"
						class="shop-item flex-1"
						:class="{ active: placing?.kind === 'move' && placing.uid === o.uid }"
						@click="startPlace(o.uid, o.outfitId)"
					>
						<span class="flex-1 text-left">{{ OUTFITS_BY_ID[o.outfitId].name }}</span>
						<span class="text-slate-400">Place</span>
					</button>
					<button type="button" class="btn text-xs" @click="sellUnplaced(o.uid)">Sell +{{ credits(outfitSellPrice(o.outfitId)) }}</button>
				</div>
			</div>
			<p v-else class="text-sm text-emerald-300">Every outfit is placed.</p>
			<button
				type="button"
				class="w-full rounded-lg bg-violet-600 py-2.5 font-semibold transition-colors hover:bg-violet-500 disabled:opacity-40"
				:disabled="completeCheck !== true"
				:title="completeCheck === true ? '' : completeCheck"
				@click="emit('act', 'completeShipUpgrade')"
			>
				Buy the {{ newShipName }} ({{ credits(newShipPrice) }} cR, +1 fame)
			</button>
			<button type="button" class="btn w-full" @click="emit('act', 'cancelShipUpgrade')">Cancel</button>
		</aside>

		<!-- Shop -->
		<aside v-else class="space-y-3 rounded-xl border border-slate-800 bg-slate-900/80 p-4">
			<div class="flex items-baseline justify-between">
				<h3 class="text-lg font-bold">Outfitters</h3>
				<span class="text-xl font-black text-amber-300">{{ credits(me.credits) }} <span class="text-sm">cR</span></span>
			</div>
			<p class="text-xs text-slate-400">
				{{
					atStarport
						? 'Starport outfitters. Damaged outfits can’t be moved or sold, and nothing can go on damage or cargo.'
						: 'Spend your starting credits. Anything left over stays with you.'
				}}
			</p>

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
				@click="atStarport ? emit('close') : emit('act', 'finishOutfitting')"
			>
				{{ atStarport ? 'Close outfitters' : myTurn ? 'Done outfitting' : 'Waiting for your turn to outfit' }}
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
