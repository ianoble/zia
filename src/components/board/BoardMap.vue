<script setup lang="ts">
import { computed, ref } from 'vue';
import { SECTORS_BY_ID } from '../../data/sectors';
import { boardHexes, edgeSymbolMarks, type BoardState } from '../../logic/board';
import { HEX_DIRECTIONS, hexCorners, hexKey, hexToPixel, addHex } from '../../logic/hex';

/**
 * The drift system: sectors of 19 flat-top hexes (geometry from sector_19_spaces.svg,
 * hex radius 100). Drag to pan; zoom with the +/- buttons. Ships are coloured tokens.
 */
export interface BoardShip {
	seat: string;
	position: string;
	color: string;
	label: string;
	active: boolean;
}

const props = defineProps<{
	board: BoardState;
	ships: BoardShip[];
	/** Hexes the active ship can move to, with their movement cost. */
	reachable?: Map<string, number> | null;
}>();
const emit = defineEmits<{ hexClick: [key: string] }>();

const SIZE = 100;

const hexes = computed(() =>
	[...boardHexes(props.board).values()].map((h) => {
		const { x, y } = hexToPixel(h.hex, SIZE);
		return {
			...h,
			x,
			y,
			points: hexCorners(x, y, SIZE)
				.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`)
				.join(' '),
		};
	}),
);

/** Thick outline around each sector: hex edges whose neighbour is in another sector (or off the board). */
const sectorEdges = computed(() => {
	const all = boardHexes(props.board);
	const lines: { x1: number; y1: number; x2: number; y2: number }[] = [];
	for (const h of hexes.value) {
		const corners = hexCorners(h.x, h.y, SIZE);
		HEX_DIRECTIONS.forEach((d, i) => {
			const n = all.get(hexKey(addHex(h.hex, d)));
			if (n && n.sectorIndex === h.sectorIndex) return;
			const a = corners[i];
			const b = corners[(i + 1) % 6];
			lines.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y });
		});
	}
	return lines;
});

/** Red outline around star regions (like the printed Nyr tile). */
const starEdges = computed(() => {
	const all = boardHexes(props.board);
	const lines: { x1: number; y1: number; x2: number; y2: number }[] = [];
	for (const h of hexes.value) {
		if (h.kind !== 'star') continue;
		const corners = hexCorners(h.x, h.y, SIZE);
		HEX_DIRECTIONS.forEach((d, i) => {
			if (all.get(hexKey(addHex(h.hex, d)))?.kind === 'star') return;
			const a = corners[i];
			const b = corners[(i + 1) % 6];
			lines.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y });
		});
	}
	return lines;
});

/** Star hexes fully surrounded by star (the centre of each star region), for the glow. */
const starCenters = computed(() => {
	const all = boardHexes(props.board);
	return hexes.value.filter(
		(h) => h.kind === 'star' && HEX_DIRECTIONS.every((d) => all.get(hexKey(addHex(h.hex, d)))?.kind === 'star'),
	);
});

/**
 * Edge symbols, one in the middle of each sector side. Each is drawn pointing into its
 * sector from the hex edge, so two matching tiles show a mirrored pair across the edge.
 */
const symbolMarks = computed(() =>
	edgeSymbolMarks(props.board).map((m) => {
		const { x, y } = hexToPixel(m.hex, SIZE);
		const out = 60 * m.direction + 30; // edge midpoint angle, degrees
		const a = (Math.PI / 180) * out;
		const d = (SIZE * Math.sqrt(3)) / 2;
		return { ...m, x: x + d * Math.cos(a), y: y + d * Math.sin(a), angle: out + 180 };
	}),
);

const sectorLabels = computed(() =>
	props.board.sectors.map((s, i) => {
		const { x, y } = hexToPixel(s.center, SIZE);
		return { i, x, y: y - SIZE * Math.sqrt(3) * 2 - 18, name: SECTORS_BY_ID[s.tileId]?.name ?? s.tileId };
	}),
);

const shipViews = computed(() =>
	props.ships.map((s) => {
		const [q, r] = s.position.split(',').map(Number);
		return { ...s, ...hexToPixel({ q, r }, SIZE) };
	}),
);

// ---- view box, pan & zoom ----
const fitBox = computed(() => {
	const xs = hexes.value.map((h) => h.x);
	const ys = hexes.value.map((h) => h.y);
	const pad = SIZE * 2;
	const minX = Math.min(...xs) - pad;
	const minY = Math.min(...ys) - pad;
	return { x: minX, y: minY, w: Math.max(...xs) + pad - minX, h: Math.max(...ys) + pad - minY };
});
/** Fixed zoom steps for the +/- buttons. */
const ZOOM_LEVELS = [0.6, 0.8, 1, 1.25, 1.6, 2, 2.5];
const zoomIndex = ref(ZOOM_LEVELS.indexOf(1));
const zoom = computed(() => ZOOM_LEVELS[zoomIndex.value]);
const canZoomIn = computed(() => zoomIndex.value < ZOOM_LEVELS.length - 1);
const canZoomOut = computed(() => zoomIndex.value > 0);
const zoomIn = () => canZoomIn.value && zoomIndex.value++;
const zoomOut = () => canZoomOut.value && zoomIndex.value--;
const pan = ref({ x: 0, y: 0 });
const viewBox = computed(() => {
	const f = fitBox.value;
	const w = f.w / zoom.value;
	const h = f.h / zoom.value;
	const cx = f.x + f.w / 2 + pan.value.x;
	const cy = f.y + f.h / 2 + pan.value.y;
	return `${cx - w / 2} ${cy - h / 2} ${w} ${h}`;
});

const svgEl = ref<SVGSVGElement | null>(null);
let drag: { x: number; y: number; px: number; py: number; moved: boolean } | null = null;

function unitsPerPixel() {
	const rect = svgEl.value?.getBoundingClientRect();
	if (!rect) return 1;
	const f = fitBox.value;
	return Math.max(f.w / zoom.value / rect.width, f.h / zoom.value / rect.height);
}
function onPointerDown(e: PointerEvent) {
	drag = { x: e.clientX, y: e.clientY, px: pan.value.x, py: pan.value.y, moved: false };
}
function onPointerMove(e: PointerEvent) {
	if (!drag) return;
	const dx = e.clientX - drag.x;
	const dy = e.clientY - drag.y;
	if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
	if (!drag.moved) return;
	const k = unitsPerPixel();
	pan.value = { x: drag.px - dx * k, y: drag.py - dy * k };
}
function onPointerUp() {
	setTimeout(() => (drag = null));
}
function onHexClick(key: string) {
	if (drag?.moved) return;
	emit('hexClick', key);
}
</script>

<template>
	<div class="board">
		<svg
			ref="svgEl"
			:viewBox="viewBox"
			preserveAspectRatio="xMidYMid meet"
			class="board-svg"
			@pointerdown="onPointerDown"
			@pointermove="onPointerMove"
			@pointerup="onPointerUp"
			@pointerleave="onPointerUp"
		>
			<defs>
				<radialGradient id="starGlow">
					<stop offset="0%" stop-color="#ffcf6b" stop-opacity="0.85" />
					<stop offset="45%" stop-color="#ff8a2a" stop-opacity="0.45" />
					<stop offset="100%" stop-color="#ff5a1f" stop-opacity="0" />
				</radialGradient>
			</defs>

			<!-- Spaces -->
			<g v-for="h in hexes" :key="h.key" :data-hex="h.key" class="hex" :class="{ reachable: reachable?.has(h.key) }" @click="onHexClick(h.key)">
				<polygon :points="h.points" class="hex-shape" :class="{ 'star-hex': h.kind === 'star' }" />
				<g v-if="h.kind === 'spawn'" class="spawn">
					<circle :cx="h.x" :cy="h.y" r="46" />
					<text :x="h.x" :y="h.y + 13" text-anchor="middle">⟳</text>
				</g>
				<text v-if="reachable?.has(h.key)" :x="h.x" :y="h.y + 78" text-anchor="middle" class="cost">{{ reachable.get(h.key) }}</text>
			</g>

			<!-- Stars -->
			<circle v-for="c in starCenters" :key="`star${c.key}`" :cx="c.x" :cy="c.y" :r="SIZE * 1.9" class="star-glow" />
			<circle v-for="c in starCenters" :key="`core${c.key}`" :cx="c.x" :cy="c.y" :r="SIZE * 0.75" class="star-core" />
			<line
				v-for="(l, i) in starEdges"
				:key="`se${i}`"
				:x1="l.x1"
				:y1="l.y1"
				:x2="l.x2"
				:y2="l.y2"
				class="star-edge"
			/>

			<!-- Sector outlines -->
			<line
				v-for="(l, i) in sectorEdges"
				:key="`e${i}`"
				:x1="l.x1"
				:y1="l.y1"
				:x2="l.x2"
				:y2="l.y2"
				class="sector-edge"
			/>
			<!-- Edge symbols (glyphs point along +x, into the sector) -->
			<g
				v-for="m in symbolMarks"
				:key="`sym${m.sectorIndex}-${m.slot}`"
				:transform="`translate(${m.x} ${m.y}) rotate(${m.angle})`"
				class="edge-symbol"
				:data-symbol="m.symbol"
			>
				<title>{{ m.symbol }}</title>
				<line v-if="m.symbol === 'line'" x1="0" y1="0" x2="34" y2="0" />
				<template v-else-if="m.symbol === 'bar'">
					<line x1="0" y1="0" x2="30" y2="0" />
					<line x1="30" y1="-11" x2="30" y2="11" />
				</template>
				<template v-else-if="m.symbol === 'square'">
					<line x1="0" y1="0" x2="22" y2="0" />
					<rect x="22" y="-8" width="16" height="16" />
				</template>
				<template v-else-if="m.symbol === 'circle'">
					<line x1="0" y1="0" x2="24" y2="0" />
					<circle cx="32" cy="0" r="8" />
				</template>
				<template v-else-if="m.symbol === 'arrow'">
					<line x1="0" y1="0" x2="22" y2="0" />
					<polygon points="22,-10 22,10 40,0" />
				</template>
				<template v-else-if="m.symbol === 'cup'">
					<line x1="0" y1="0" x2="22" y2="0" />
					<path d="M 32 -10 A 10 10 0 0 0 32 10" />
				</template>
			</g>
			<text v-for="s in sectorLabels" :key="`s${s.i}`" :x="s.x" :y="s.y" text-anchor="middle" class="sector-label">{{ s.name }}</text>

			<!-- Ships -->
			<g v-for="s in shipViews" :key="`ship${s.seat}`" class="ship" :class="{ active: s.active }" :transform="`translate(${s.x} ${s.y})`">
				<circle v-if="s.active" r="70" class="ship-halo" />
				<polygon points="-24,-58 24,-58 58,-24 58,24 24,58 -24,58 -58,24 -58,-24" class="ship-outline" />
				<polygon points="-19,-48 19,-48 48,-19 48,19 19,48 -19,48 -48,19 -48,-19" :fill="s.color" />
				<text y="16" text-anchor="middle" class="ship-label">{{ s.label }}</text>
			</g>
		</svg>
		<div class="zoom-controls">
			<button type="button" title="Zoom in" aria-label="Zoom in" :disabled="!canZoomIn" @click="zoomIn">+</button>
			<button type="button" title="Zoom out" aria-label="Zoom out" :disabled="!canZoomOut" @click="zoomOut">−</button>
		</div>
	</div>
</template>

<style scoped>
.board {
	position: relative;
	width: 100%;
	height: 100%;
	border-radius: 0.75rem;
	overflow: hidden;
	background:
		radial-gradient(1px 1px at 12% 22%, #fff9, transparent),
		radial-gradient(1px 1px at 72% 64%, #fff8, transparent),
		radial-gradient(1.5px 1.5px at 40% 80%, #fffa, transparent),
		radial-gradient(ellipse at 50% 40%, #1b1640, #05060f 75%);
	background-size: 180px 180px, 220px 220px, 260px 260px, 100% 100%;
}
.board-svg {
	width: 100%;
	height: 100%;
	display: block;
	cursor: grab;
	touch-action: none;
	user-select: none;
}
.board-svg:active {
	cursor: grabbing;
}
.hex-shape {
	fill: #0d1226cc;
	stroke: #5b6a9a;
	stroke-width: 2;
}
.hex:hover .hex-shape {
	fill: #1a2244;
}
.hex.reachable .hex-shape {
	fill: #13466acc;
	stroke: #5fd0ff;
	stroke-width: 3;
	cursor: pointer;
}
.hex.reachable:hover .hex-shape {
	fill: #1f6ea0;
}
.cost {
	font-size: 30px;
	font-weight: 700;
	fill: #9fe3ff;
	pointer-events: none;
}
.hex-shape.star-hex,
.hex:hover .hex-shape.star-hex {
	fill: #3a1d10;
	stroke: #7a3b1c;
	cursor: not-allowed;
}
.star-glow {
	fill: url(#starGlow);
	pointer-events: none;
}
.star-core {
	fill: #ffe9a8;
	filter: drop-shadow(0 0 24px #ffb02e);
	pointer-events: none;
}
.star-edge {
	stroke: #e5483a;
	stroke-width: 9;
	stroke-linecap: round;
	pointer-events: none;
}
.spawn circle {
	fill: none;
	stroke: #f2c230;
	stroke-width: 4;
	stroke-dasharray: 10 8;
}
.spawn text {
	font-size: 40px;
	fill: #f2c230;
	pointer-events: none;
}
.sector-edge {
	stroke: #c9d4ff;
	stroke-width: 6;
	stroke-linecap: round;
	pointer-events: none;
}
.edge-symbol {
	fill: none;
	stroke: #f1f5ff;
	stroke-width: 4;
	stroke-linecap: round;
	stroke-linejoin: round;
	pointer-events: none;
}
.sector-label {
	font-size: 30px;
	font-weight: 800;
	fill: #c9d4ff88;
	letter-spacing: 0.05em;
	pointer-events: none;
}
.ship {
	pointer-events: none;
	transition: transform 0.35s ease;
}
.ship-outline {
	fill: #000;
}
.ship-halo {
	fill: none;
	stroke: #fff;
	stroke-width: 5;
	stroke-dasharray: 14 10;
	opacity: 0.8;
}
.ship-label {
	font-size: 44px;
	font-weight: 900;
	fill: #fff;
	stroke: #000;
	stroke-width: 6;
	paint-order: stroke;
}
.zoom-controls {
	position: absolute;
	right: 0.6rem;
	bottom: 0.6rem;
	display: flex;
	flex-direction: column;
	overflow: hidden;
	border-radius: 0.5rem;
	border: 1px solid #475569;
	background: #1e293bcc;
}
.zoom-controls button {
	width: 2.2rem;
	height: 2.2rem;
	font-size: 1.25rem;
	font-weight: 700;
	line-height: 1;
	color: #e2e8f0;
}
.zoom-controls button + button {
	border-top: 1px solid #475569;
}
.zoom-controls button:hover:not(:disabled) {
	background: #334155;
}
.zoom-controls button:disabled {
	opacity: 0.35;
	cursor: not-allowed;
}
</style>
