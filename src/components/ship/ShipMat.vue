<script setup lang="ts">
import { computed } from 'vue';
import { IconChevronsRight, IconRocket } from '@tabler/icons-vue';
import { SHIPS_BY_ID, TIER_LABEL } from '../../data/ships';
import { OUTFITS_BY_ID } from '../../data/outfits';
import { parseShape } from '../../logic/holdGeometry';
import { markersOnOutfits, totalDamage } from '../../logic/ship';
import { MARKERS_PER_SHIP, type PlayerColor, type ShipState } from '../../logic/types';
import EnergyTrack from './EnergyTrack.vue';
import HoldGrid from './HoldGrid.vue';
import { PLAYER_HEX, TIER_THEME } from './shipMatTheme';

/**
 * A captain's ship mat: name/tier, armed & disarmed markers, price/hold/impulse,
 * the hold grid with outfits/cargo/damage, the energy meter, bounty and ship ability.
 */
const props = defineProps<{
	state: ShipState;
	color: PlayerColor;
	bounty?: number;
	captainName?: string;
	/** Hold cells emit `cellClick` (used by the design preview and, later, damage placement). */
	interactive?: boolean;
}>();
const emit = defineEmits<{ cellClick: [key: string] }>();

const ship = computed(() => SHIPS_BY_ID[props.state.shipId]);
const theme = computed(() => TIER_THEME[ship.value.tier]);
const markerColor = computed(() => PLAYER_HEX[props.color]);

/** Extra spaces outside the hull from Cargo Pods / Armor Plating, shown as "Hold: 11 (+3)". */
const exteriorSpaces = computed(() =>
	props.state.outfits.reduce((n, p) => n + parseShape(OUTFITS_BY_ID[p.outfitId].shape).filter((c) => c.kind === 'x').length, 0),
);

const onOutfits = computed(() => markersOnOutfits(props.state));
const damage = computed(() => totalDamage(props.state));
const ability = computed(() => ship.value.abilities[props.state.abilityIndex] ?? ship.value.abilities[0]);
const credits = (n: number) => n.toLocaleString('en-US');
</script>

<template>
	<section
		class="mat"
		:style="{ '--tier': theme.base, '--tier-light': theme.light, '--tier-dark': theme.dark }"
		:aria-label="`${ship.name} ship mat`"
	>
		<!-- Left column -->
		<div class="side">
			<header class="name-bar">
				<h2 class="ship-name">{{ ship.name }}</h2>
				<div class="tier-badge" :title="`Tier ${TIER_LABEL[ship.tier]}`">{{ TIER_LABEL[ship.tier] }}</div>
			</header>

			<div class="thumb">
				<IconRocket class="thumb-icon" :size="48" stroke-width="1.25" />
				<span v-if="captainName" class="captain" :style="{ background: markerColor }">{{ captainName }}</span>
			</div>

			<div class="panel markers">
				<div class="marker-label">Armed</div>
				<div class="slots">
					<span v-for="i in MARKERS_PER_SHIP" :key="`a${i}`" class="slot armed">
						<span v-if="i <= state.armedMarkers" class="piece" :style="{ '--marker': markerColor }" />
					</span>
				</div>
				<div class="marker-label">Disarmed</div>
				<div class="slots">
					<span v-for="i in MARKERS_PER_SHIP" :key="`d${i}`" class="slot disarmed">
						<span v-if="i <= state.disarmedMarkers" class="piece" :style="{ '--marker': markerColor }" />
					</span>
				</div>
				<div v-if="onOutfits" class="on-outfits">{{ onOutfits }} on outfits</div>
			</div>

			<div class="panel stats">
				<div>Price: {{ credits(ship.price) }}<span class="cr">cR</span></div>
				<div>
					Hold: {{ ship.holdSize }}<span v-if="exteriorSpaces"> (+{{ exteriorSpaces }})</span>
				</div>
				<div class="damage-line" :class="{ hurt: damage > 0 }">Damage: {{ damage }} / {{ ship.holdSize }}</div>
			</div>

			<div class="panel impulse">
				<div>Impulse: {{ ship.impulse }}</div>
				<div class="impulse-token" :class="{ exhausted: !state.impulseReady }" :title="state.impulseReady ? 'Impulse ready' : 'Impulse used this turn'">
					<IconChevronsRight :size="28" stroke-width="2.5" />
				</div>
			</div>
		</div>

		<!-- Right: space -->
		<div class="space">
			<div v-if="bounty" class="bounty" :title="`Bounty ${credits(bounty)} cR`">
				<span class="bounty-word">BOUNTY</span>
				<span class="bounty-amount">{{ credits(bounty) }}</span>
			</div>

			<div class="hold-area">
				<HoldGrid :ship="ship" :state="state" :marker-color="markerColor" :interactive="interactive" @cell-click="emit('cellClick', $event)" />
			</div>

			<div class="energy-bar">
				<EnergyTrack :energy="state.energy" :max="ship.energy" :marker-color="markerColor" />
			</div>
		</div>

		<!-- Ship ability card -->
		<footer class="ability" :class="{ exhausted: state.abilityExhausted }">
			<span class="ability-name">{{ ability.name }}</span>
			<span class="ability-text">{{ ability.summary }}</span>
			<span v-if="state.abilityExhausted" class="ability-state">Exhausted</span>
		</footer>
	</section>
</template>

<style scoped>
.mat {
	--cell: clamp(2.4rem, 4.6vw, 4.25rem);
	max-width: 72rem;
	margin-inline: auto;
	display: grid;
	grid-template-columns: minmax(11rem, 15rem) 1fr;
	grid-template-rows: 1fr auto;
	border-radius: 1rem;
	overflow: hidden;
	background: #000;
	border: 3px solid #000;
	box-shadow: 0 10px 30px #0009;
	color: #12121a;
	font-family: 'Ubuntu', 'Segoe UI', system-ui, sans-serif;
}

/* ---- side column ---- */
.side {
	display: flex;
	flex-direction: column;
	background: color-mix(in srgb, var(--tier) 85%, #000);
	background-image: radial-gradient(circle at 20% 10%, #ffffff22, transparent 50%), linear-gradient(#0000, #0003);
}
.name-bar {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 0.5rem;
	padding: 0.6rem 0.75rem;
	background: var(--tier-light);
}
.ship-name {
	font-size: 1.3rem;
	font-weight: 900;
	text-transform: uppercase;
	line-height: 1.05;
	letter-spacing: 0.01em;
}
.tier-badge {
	flex-shrink: 0;
	display: grid;
	place-items: center;
	width: 2.6rem;
	height: 2.3rem;
	clip-path: polygon(25% 0, 75% 0, 100% 50%, 75% 100%, 25% 100%, 0 50%);
	background: var(--tier-dark);
	color: var(--tier-light);
	font-weight: 900;
	font-size: 1rem;
	letter-spacing: -0.05em;
}
.thumb {
	position: relative;
	display: grid;
	place-items: center;
	height: 6.5rem;
	background-color: #1a1d24;
	background-image: linear-gradient(#ffffff10 1px, transparent 1px), linear-gradient(90deg, #ffffff10 1px, transparent 1px);
	background-size: 8px 8px;
	color: #cfd6e4;
}
.thumb-icon {
	transform: rotate(45deg);
	filter: drop-shadow(0 4px 6px #000);
}
.captain {
	position: absolute;
	bottom: 0.35rem;
	left: 0.5rem;
	padding: 0 0.4rem;
	border-radius: 0.3rem;
	font-size: 0.7rem;
	font-weight: 700;
	color: #fff;
	text-shadow: 0 1px 1px #0008;
}
.panel {
	padding: 0.55rem 0.75rem;
	border-top: 3px solid #0004;
	font-weight: 700;
}
.markers {
	text-align: center;
}
.marker-label {
	font-size: 0.85rem;
	margin-top: 0.15rem;
}
.slots {
	display: flex;
	justify-content: center;
	gap: 0.3rem;
	margin: 0.2rem 0;
}
.slot,
.piece {
	clip-path: polygon(30% 0, 70% 0, 100% 30%, 100% 70%, 70% 100%, 30% 100%, 0 70%, 0 30%);
}
.slot {
	position: relative;
	width: 1.75rem;
	height: 1.75rem;
}
.slot.armed {
	background: radial-gradient(circle, #b6f25a, #4a9a17);
}
.slot.disarmed {
	background: radial-gradient(circle, #e5524b, #8a1a14);
}
.slot::after {
	content: '⏻';
	position: absolute;
	inset: 0;
	display: grid;
	place-items: center;
	font-size: 0.9rem;
	color: #0007;
}
.piece {
	position: absolute;
	inset: 2px;
	z-index: 1;
	background: #000;
}
.on-outfits {
	font-size: 0.7rem;
	font-weight: 600;
	opacity: 0.8;
}
.stats {
	font-size: 1rem;
	line-height: 1.35;
}
.cr {
	margin-left: 0.15rem;
	font-size: 0.75em;
}
.damage-line {
	font-size: 0.8rem;
	opacity: 0.75;
}
.damage-line.hurt {
	opacity: 1;
	color: #7a1500;
}
.impulse {
	display: flex;
	align-items: center;
	justify-content: space-between;
	margin-top: auto;
}
.impulse-token {
	display: grid;
	place-items: center;
	width: 3rem;
	height: 3rem;
	border-radius: 9999px;
	background: radial-gradient(circle at 35% 30%, #d9dde3, #6e737b);
	color: #fff;
	box-shadow: inset 0 0 0 3px #3a3d43, 0 2px 4px #0006;
}
.impulse-token.exhausted {
	background: radial-gradient(circle at 35% 30%, #5a5d63, #2a2c30);
	color: #ffffff40;
}

/* ---- space ---- */
.space {
	position: relative;
	display: flex;
	flex-direction: column;
	min-width: 0;
	background-color: #05060f;
	background-image:
		radial-gradient(1px 1px at 10% 20%, #fff, transparent),
		radial-gradient(1px 1px at 30% 70%, #fffc, transparent),
		radial-gradient(1.5px 1.5px at 55% 15%, #fff, transparent),
		radial-gradient(1px 1px at 75% 55%, #fffa, transparent),
		radial-gradient(1px 1px at 90% 85%, #fff, transparent),
		radial-gradient(1px 1px at 45% 45%, #fff8, transparent),
		radial-gradient(ellipse at 60% 40%, #2a1f4a66, transparent 70%);
	background-size: 140px 140px, 170px 170px, 210px 210px, 120px 120px, 190px 190px, 90px 90px, 100% 100%;
}
.hold-area {
	flex: 1;
	display: grid;
	place-items: center;
	padding: calc(var(--cell) * 0.6) calc(var(--cell) * 0.6) calc(var(--cell) * 0.3);
	overflow: auto;
}
.energy-bar {
	padding: 0.5rem 0.9rem 0.6rem;
	border-top: 3px solid var(--tier);
	background-color: #0b0d14;
	background-image: linear-gradient(#ffffff08 1px, transparent 1px), linear-gradient(90deg, #ffffff08 1px, transparent 1px);
	background-size: 10px 10px;
}
.bounty {
	position: absolute;
	top: 0.6rem;
	right: 0.6rem;
	z-index: 2;
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: flex-end;
	width: 6rem;
	height: 5.2rem;
	padding-bottom: 0.5rem;
	clip-path: polygon(50% 0, 100% 100%, 0 100%);
	background: radial-gradient(circle at 50% 70%, #ff7a5a, #d8361e);
	color: #fff;
	filter: drop-shadow(0 0 8px #ff5a3a);
}
.bounty-word {
	font-size: 0.6rem;
	font-weight: 800;
	letter-spacing: 0.15em;
}
.bounty-amount {
	font-size: 0.9rem;
	font-weight: 900;
}

/* ---- ability ---- */
.ability {
	grid-column: 1 / -1;
	display: flex;
	align-items: baseline;
	gap: 0.6rem;
	padding: 0.5rem 0.9rem;
	background: #14161f;
	border-top: 3px solid var(--tier);
	color: #e6e8ef;
	font-size: 0.85rem;
}
.ability-name {
	flex-shrink: 0;
	font-weight: 900;
	text-transform: uppercase;
	color: var(--tier-light);
}
.ability-text {
	opacity: 0.85;
}
.ability.exhausted .ability-name,
.ability.exhausted .ability-text {
	opacity: 0.4;
}
.ability-state {
	margin-left: auto;
	flex-shrink: 0;
	font-size: 0.7rem;
	font-weight: 700;
	text-transform: uppercase;
	color: #ff9d7a;
}

@media (max-width: 640px) {
	.mat {
		grid-template-columns: 1fr;
	}
	.side {
		display: grid;
		grid-template-columns: 1fr 1fr;
	}
	.name-bar {
		grid-column: 1 / -1;
	}
}
</style>
