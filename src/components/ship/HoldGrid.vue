<script setup lang="ts">
import { computed } from 'vue';
import { OUTFITS_BY_ID } from '../../data/outfits';
import type { ShipDef } from '../../data/ships';
import { cellKey, hullCells, placedCells, type OccupiedCell } from '../../logic/holdGeometry';
import type { ShipState } from '../../logic/types';
import { CONNECTOR_FILL, CUBE_FILL, OUTFIT_FILL } from './shipMatTheme';

export interface HoldGhost {
	cells: { x: number; y: number; kind: string }[];
	fill: string;
	valid: boolean;
}

const props = defineProps<{
	ship: ShipDef;
	state: ShipState;
	markerColor: string;
	interactive?: boolean;
	/** Outfit preview that follows the cursor while placing. */
	ghost?: HoldGhost | null;
	/** Extra empty cells around the hull (room for Cargo Pod / Armor Plating while placing). */
	margin?: number;
	/** Outfit to highlight (selected for moving/returning). */
	selectedUid?: string | null;
}>();
const emit = defineEmits<{ cellClick: [key: string]; cellHover: [key: string | null] }>();

interface OutfitCellView extends OccupiedCell {
	fill: string;
	/** Which edges border a different outfit (draw an outline there). */
	edges: { t: boolean; r: boolean; b: boolean; l: boolean };
	used: boolean;
	label: string | null;
	isOverlayMod: boolean;
}

const SHORT_LABEL: Record<string, string> = { gts: 'GTS', 'm-comp': 'MC', 'cargo-pod': 'POD', 'armor-plating': 'ARM' };
const shortLabel = (id: string) => OUTFITS_BY_ID[id].die ?? SHORT_LABEL[id] ?? OUTFITS_BY_ID[id].name;

const hull = computed(() => hullCells(props.ship));

const outfitCells = computed<OutfitCellView[]>(() => {
	const all = props.state.outfits.flatMap((p) => placedCells(p).map((c) => ({ c, p })));
	const ownerAt = new Map<string, string>();
	for (const { c } of all) {
		if (!OUTFITS_BY_ID[c.outfitId].overlays) ownerAt.set(cellKey(c.x, c.y), c.uid);
	}
	const labelled = new Set<string>();
	return all.map(({ c, p }) => {
		const def = OUTFITS_BY_ID[c.outfitId];
		const same = (dx: number, dy: number) => ownerAt.get(cellKey(c.x + dx, c.y + dy)) === c.uid;
		let label: string | null = null;
		if (!labelled.has(c.uid) && c.kind !== 'U' && c.kind !== 'C') {
			labelled.add(c.uid);
			label = shortLabel(c.outfitId);
		}
		return {
			...c,
			fill: c.kind === 'C' ? CONNECTOR_FILL : OUTFIT_FILL[def.type],
			edges: { t: !same(0, -1), r: !same(1, 0), b: !same(0, 1), l: !same(-1, 0) },
			used: c.useIndex >= 0 && p.usedSpaces.includes(c.useIndex),
			label,
			isOverlayMod: !!def.overlays,
		};
	});
});

/** Outfits that never got a label (all cells are use spaces) get it on their first cell. */
const labelFallback = computed(() => {
	const seen = new Set(outfitCells.value.filter((c) => c.label).map((c) => c.uid));
	const out = new Map<string, string>();
	for (const c of outfitCells.value) {
		if (seen.has(c.uid) || c.isOverlayMod) continue;
		seen.add(c.uid);
		out.set(`${c.uid}@${cellKey(c.x, c.y)}`, shortLabel(c.outfitId));
	}
	return out;
});

const bounds = computed(() => {
	const xs: number[] = [];
	const ys: number[] = [];
	for (const k of hull.value) {
		const [x, y] = k.split(',').map(Number);
		xs.push(x);
		ys.push(y);
	}
	for (const c of outfitCells.value) {
		xs.push(c.x);
		ys.push(c.y);
	}
	const m = props.margin ?? 0;
	const minX = Math.min(...xs) - m;
	const minY = Math.min(...ys) - m;
	return { minX, minY, cols: Math.max(...xs) + m - minX + 1, rows: Math.max(...ys) + m - minY + 1 };
});

const hullList = computed(() =>
	[...hull.value].map((k) => {
		const [x, y] = k.split(',').map(Number);
		return { key: k, x, y };
	}),
);

const occupiedKeys = computed(() => new Set(outfitCells.value.map((c) => cellKey(c.x, c.y))));
const damageSet = computed(() => new Set(props.state.damage));
const iceSet = computed(() => new Set(props.state.iceDamage));
const cargoAt = computed(() => new Map(props.state.cargo.map((c) => [c.cell, c.color])));

/** Every cell that can show a token: hull cells plus exterior outfit sections. */
const tokenCells = computed(() => {
	const keys = new Set<string>(hull.value);
	for (const c of outfitCells.value) keys.add(cellKey(c.x, c.y));
	if (props.margin) {
		const b = bounds.value;
		for (let y = b.minY; y < b.minY + b.rows; y++) for (let x = b.minX; x < b.minX + b.cols; x++) keys.add(cellKey(x, y));
	}
	return [...keys].map((k) => {
		const [x, y] = k.split(',').map(Number);
		return { key: k, x, y, damage: damageSet.value.has(k), ice: iceSet.value.has(k), cargo: cargoAt.value.get(k) ?? null };
	});
});

function pos(x: number, y: number) {
	return { left: `calc(${x - bounds.value.minX} * var(--cell))`, top: `calc(${y - bounds.value.minY} * var(--cell))` };
}

function onClick(key: string) {
	if (props.interactive) emit('cellClick', key);
}
</script>

<template>
	<div
		class="hold"
		@mouseleave="interactive && emit('cellHover', null)"
		:style="{ width: `calc(${bounds.cols} * var(--cell))`, height: `calc(${bounds.rows} * var(--cell))` }"
		:class="{ interactive }"
	>
		<!-- Hull spaces -->
		<div v-for="h in hullList" :key="`h${h.key}`" class="hull-cell" :style="pos(h.x, h.y)">
			<div v-if="!occupiedKeys.has(h.key)" class="cube-slot" />
		</div>

		<!-- Outfit sections -->
		<div
			v-for="c in outfitCells.filter((o) => !o.isOverlayMod)"
			:key="`o${c.uid}${c.x},${c.y}`"
			class="outfit-cell"
			:class="{ exterior: c.kind === 'x', selected: c.uid === selectedUid }"
			:style="{
				...pos(c.x, c.y),
				'--fill': c.fill,
				borderTopWidth: c.edges.t ? '2px' : '0',
				borderRightWidth: c.edges.r ? '2px' : '0',
				borderBottomWidth: c.edges.b ? '2px' : '0',
				borderLeftWidth: c.edges.l ? '2px' : '0',
			}"
			:title="OUTFITS_BY_ID[c.outfitId].name"
		>
			<span v-if="c.label ?? labelFallback.get(`${c.uid}@${c.x},${c.y}`)" class="outfit-label">
				{{ c.label ?? labelFallback.get(`${c.uid}@${c.x},${c.y}`) }}
			</span>
			<span v-if="c.kind === 'U'" class="use-space" :class="{ used: c.used }">
				<span v-if="c.used" class="marker" :style="{ '--marker': markerColor }" />
			</span>
		</div>

		<!-- Mods sitting on a use space -->
		<div
			v-for="c in outfitCells.filter((o) => o.isOverlayMod)"
			:key="`m${c.uid}`"
			class="overlay-mod"
			:style="{ ...pos(c.x, c.y), '--fill': c.fill }"
			:title="OUTFITS_BY_ID[c.outfitId].name"
		>
			{{ OUTFITS_BY_ID[c.outfitId].id === 'piercer' ? 'P' : 'ES' }}
		</div>

		<!-- Tokens: cargo, damage, ice; also the click target -->
		<button
			v-for="t in tokenCells"
			:key="`t${t.key}`"
			type="button"
			class="token-cell"
			:style="pos(t.x, t.y)"
			:tabindex="interactive ? 0 : -1"
			:aria-label="`Hold space ${t.key}`"
			@click="onClick(t.key)"
			@mouseenter="interactive && emit('cellHover', t.key)"
		>
			<span v-if="t.cargo" class="cube" :style="{ background: CUBE_FILL[t.cargo] }" :title="`${t.cargo} cube`" />
			<span v-if="t.damage" class="damage" title="Damage" />
			<span v-if="t.ice" class="ice" title="Ice damage" />
		</button>

		<!-- Placement preview -->
		<div
			v-for="(g, i) in ghost?.cells ?? []"
			:key="`g${i}`"
			class="ghost-cell"
			:class="{ invalid: !ghost!.valid, exterior: g.kind === 'x' }"
			:style="{ ...pos(g.x, g.y), '--fill': g.kind === 'C' ? CONNECTOR_FILL : ghost!.fill }"
		>
			<span v-if="g.kind === 'U'" class="use-space ghost-use" />
		</div>
	</div>
</template>

<style scoped>
.hold {
	position: relative;
}
.hull-cell,
.outfit-cell,
.token-cell,
.overlay-mod {
	position: absolute;
	width: var(--cell);
	height: var(--cell);
}
.hull-cell {
	padding: 3px;
}
.hull-cell::before {
	content: '';
	position: absolute;
	inset: 3px;
	border-radius: 6px;
	background: linear-gradient(160deg, #c9d3e6cc, #8796b0aa);
	border: 1px solid #ffffff55;
	box-shadow: inset 0 0 10px #0005;
}
.outfit-cell.selected {
	outline: 3px solid #fff;
	outline-offset: -3px;
	filter: brightness(1.15);
}
.ghost-cell {
	position: absolute;
	width: var(--cell);
	height: var(--cell);
	z-index: 4;
	pointer-events: none;
	background: color-mix(in srgb, var(--fill) 70%, transparent);
	box-shadow: inset 0 0 0 3px #4ade80;
}
.ghost-cell.exterior {
	background: repeating-linear-gradient(45deg, color-mix(in srgb, var(--fill) 70%, transparent) 0 6px, transparent 6px 12px);
}
.ghost-cell.invalid {
	box-shadow: inset 0 0 0 3px #f87171;
	background: color-mix(in srgb, #f87171 35%, transparent);
}
.ghost-use {
	opacity: 0.8;
}
.cube-slot {
	position: absolute;
	inset: 34%;
	border-radius: 3px;
	background: linear-gradient(135deg, #f1e7c4, #b7a879);
	box-shadow: 1px 2px 2px #0006;
	opacity: 0.5;
}
.outfit-cell {
	background: var(--fill);
	border: 0 solid #10131c;
	box-shadow: inset 0 0 0 1px #ffffff30, inset 0 -6px 10px #0003;
}
.outfit-cell.exterior {
	background: repeating-linear-gradient(45deg, var(--fill), var(--fill) 6px, color-mix(in srgb, var(--fill) 80%, #000) 6px, color-mix(in srgb, var(--fill) 80%, #000) 12px);
	opacity: 0.92;
}
.outfit-label {
	position: absolute;
	z-index: 3;
	pointer-events: none;
	top: 2px;
	left: 4px;
	font-size: calc(var(--cell) * 0.28);
	font-weight: 900;
	color: #10131c;
	text-shadow: 0 0 2px #fff8;
}
.use-space {
	position: absolute;
	inset: 24%;
	border-radius: 9999px;
	background: #f39a1e;
	box-shadow: inset 0 0 0 2px #8a4b00, 0 0 4px #0008;
}
.marker,
.damage {
	position: absolute;
	clip-path: polygon(30% 0, 70% 0, 100% 30%, 100% 70%, 70% 100%, 30% 100%, 0 70%, 0 30%);
}
.use-space .marker {
	inset: -12%;
	background: #000;
}
.overlay-mod {
	display: grid;
	place-items: end;
	padding: 2px;
	font-size: calc(var(--cell) * 0.2);
	font-weight: 900;
	color: #fff;
	pointer-events: none;
}
.overlay-mod::before {
	content: '';
	position: absolute;
	inset: 12%;
	border-radius: 9999px;
	border: 3px solid var(--fill);
}
.token-cell {
	z-index: 1;
	background: transparent;
	border: 0;
	padding: 0;
	cursor: default;
}
.interactive .token-cell {
	cursor: pointer;
}
.interactive .token-cell:hover {
	outline: 2px solid #ffffff88;
	outline-offset: -2px;
	border-radius: 6px;
}
.cube {
	position: absolute;
	inset: 30%;
	border-radius: 3px;
	box-shadow: inset -3px -3px 0 #0003, 1px 2px 3px #0008;
}
.damage {
	inset: 18%;
	background: radial-gradient(circle at 35% 30%, #ffb15c, #e8650c 60%, #a8400a);
	box-shadow: inset 0 0 0 2px #0005;
	opacity: 0.95;
}
.ice {
	position: absolute;
	inset: 22%;
	transform: rotate(45deg);
	border-radius: 3px;
	background: linear-gradient(135deg, #e6f7ff, #4fb6ff 55%, #1c6fd1);
	box-shadow: 0 0 6px #4fb6ffaa;
}
</style>
