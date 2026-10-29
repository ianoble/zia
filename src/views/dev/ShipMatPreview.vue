<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import ShipMat from '../../components/ship/ShipMat.vue';
import { SHIPS, SHIPS_BY_ID, TIER_LABEL } from '../../data/ships';
import { OUTFITS_BY_ID } from '../../data/outfits';
import { autoPlace, placedCells, cellKey } from '../../logic/holdGeometry';
import { cargoTargets, createShipState, damageTargets } from '../../logic/ship';
import { PLAYER_COLORS, MARKERS_PER_SHIP, type CubeColor, type PlayerColor, type ShipState } from '../../logic/types';

/** Design sandbox for the ship mat — no server needed. Route: /dev/ship-mat */

const query = new URLSearchParams(window.location.search);
const shipId = ref(SHIPS_BY_ID[query.get('ship') ?? ''] ? query.get('ship')! : 'easy-tiger');
const color = ref<PlayerColor>('red');
const bounty = ref(0);
const state = ref<ShipState>(createShipState(shipId.value));
const loadoutNote = ref('');
/** ?targets=damage|cargo highlights where damage or a cargo cube could be placed. */
const targetKind = (['damage', 'cargo'] as const).find((k) => k === query.get('targets'));
const targets = computed(() => (targetKind === 'damage' ? damageTargets(state.value) : targetKind === 'cargo' ? cargoTargets(state.value) : null));

const ship = computed(() => SHIPS_BY_ID[shipId.value]);

watch(shipId, (id) => {
	state.value = createShipState(id);
	loadoutNote.value = '';
});

const LOADOUTS: Record<string, string[]> = {
	Empty: [],
	'Tier I starter': ['engine-d6', 'shield-d6', 'blaster-d6'],
	'Heavy (d12/d20)': ['engine-d12', 'shield-d12', 'blaster-d12', 'missile-d20'],
	'Embers mods & pods': ['engine-d8', 'missile-d12', 'shield-d8', 'piercer', 'enviro-shield', 'gts', 'm-comp', 'cargo-pod', 'armor-plating'],
};

function applyLoadout(name: string) {
	const s = createShipState(shipId.value, state.value.abilityIndex);
	const skipped: string[] = [];
	for (const id of LOADOUTS[name]) {
		const p = autoPlace(ship.value, s.outfits, id, `o${s.outfits.length + 1}`);
		if (p) s.outfits.push(p);
		else skipped.push(OUTFITS_BY_ID[id].name);
	}
	s.energy = state.value.energy;
	state.value = s;
	loadoutNote.value = skipped.length ? `Didn't fit: ${skipped.join(', ')}` : '';
}

/** Move an armed marker onto the first free, undamaged use space. */
function useMarker() {
	const s = state.value;
	if (s.armedMarkers <= 0) return;
	const damaged = new Set(s.damage);
	for (const o of s.outfits) {
		for (const c of placedCells(o)) {
			if (c.kind !== 'U' || o.usedSpaces.includes(c.useIndex) || damaged.has(cellKey(c.x, c.y))) continue;
			if (OUTFITS_BY_ID[o.outfitId].overlays) continue;
			o.usedSpaces.push(c.useIndex);
			s.armedMarkers--;
			return;
		}
	}
}

function disarm() {
	if (state.value.armedMarkers > 0) {
		state.value.armedMarkers--;
		state.value.disarmedMarkers++;
	}
}

function rearmAll() {
	for (const o of state.value.outfits) o.usedSpaces = [];
	state.value.armedMarkers = MARKERS_PER_SHIP;
	state.value.disarmedMarkers = 0;
}

type ClickMode = 'damage' | 'ice' | CubeColor;
const clickMode = ref<ClickMode>('damage');
const CLICK_MODES: { id: ClickMode; label: string }[] = [
	{ id: 'damage', label: 'Damage' },
	{ id: 'ice', label: 'Ice' },
	{ id: 'spice', label: 'Spice' },
	{ id: 'holo', label: 'Holo' },
	{ id: 'terra', label: 'Terra' },
	{ id: 'plasma', label: 'Plasma' },
	{ id: 'cyber', label: 'Cyber' },
	{ id: 'ember', label: 'Ember' },
];

function toggle(list: string[], key: string) {
	const i = list.indexOf(key);
	if (i >= 0) list.splice(i, 1);
	else list.push(key);
}

function onCellClick(key: string) {
	const s = state.value;
	if (clickMode.value === 'damage') toggle(s.damage, key);
	else if (clickMode.value === 'ice') toggle(s.iceDamage, key);
	else {
		const i = s.cargo.findIndex((c) => c.cell === key);
		if (i >= 0 && s.cargo[i].color === clickMode.value) s.cargo.splice(i, 1);
		else if (i >= 0) s.cargo[i].color = clickMode.value;
		else s.cargo.push({ cell: key, color: clickMode.value });
	}
}

const showGallery = ref(false);

// URL options for sharing/screenshots: ?ship=long-haul&loadout=Heavy%20(d12/d20)&demo=1&gallery=1
{
	const q = query;
	const qLoadout = q.get('loadout');
	if (qLoadout && LOADOUTS[qLoadout]) applyLoadout(qLoadout);
	if (q.has('demo')) {
		if (!qLoadout) applyLoadout('Tier I starter');
		useMarker();
		useMarker();
		disarm();
		const s = state.value;
		s.energy = Math.max(0, ship.value.energy - 3);
		s.impulseReady = false;
		const free = [...new Set(s.outfits.flatMap((o) => placedCells(o).map((c) => cellKey(c.x, c.y))))];
		if (free[0]) s.damage.push(free[0]);
		if (free[3]) s.iceDamage.push(free[3]);
		bounty.value = 2000;
		// cargo in empty hull spaces
		const used = new Set(free);
		const empty = ship.value.hold.flatMap((row, y) => [...row].map((ch, x) => (ch === '#' && !used.has(cellKey(x, y)) ? cellKey(x, y) : null))).filter(Boolean) as string[];
		(['spice', 'cyber', 'ember'] as CubeColor[]).forEach((c, i) => empty[i] && s.cargo.push({ cell: empty[i], color: c }));
		if (empty[3]) s.damage.push(empty[3]);
	}
	if (q.has('gallery')) showGallery.value = true;
}
const galleryStates = computed(() => SHIPS.map((s) => ({ def: s, state: createShipState(s.id) })));
</script>

<template>
	<div class="min-h-screen bg-slate-950 text-slate-100">
		<div class="mx-auto max-w-[1400px] space-y-5 p-4">
			<header class="flex flex-wrap items-center justify-between gap-3">
				<div>
					<h1 class="text-2xl font-bold">Ship mat preview</h1>
					<p class="text-sm text-slate-400">Design sandbox; no server needed. Click hold spaces to toggle the selected token.</p>
				</div>
				<router-link to="/" class="text-sm text-slate-500 hover:text-slate-300">← Lobby</router-link>
			</header>

			<!-- Controls -->
			<div class="grid gap-4 rounded-xl border border-slate-800 bg-slate-900/70 p-4 text-sm md:grid-cols-2 xl:grid-cols-4">
				<div class="space-y-2">
					<label class="block text-slate-400">Ship</label>
					<select v-model="shipId" class="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2">
						<optgroup v-for="tier in [1, 2, 3] as const" :key="tier" :label="`Tier ${TIER_LABEL[tier]}`">
							<option v-for="s in SHIPS.filter((x) => x.tier === tier)" :key="s.id" :value="s.id">
								{{ s.name }}{{ s.set === 'embers' ? ' (Embers)' : s.set === 'ks' ? ' (KS, out of scope)' : '' }}
							</option>
						</optgroup>
					</select>
					<div class="flex flex-wrap gap-2">
						<label v-for="(a, i) in ship.abilities" :key="a.name" class="flex items-center gap-1.5">
							<input v-model="state.abilityIndex" type="radio" :value="i" /> {{ a.name }}
						</label>
					</div>
					<div class="flex gap-2">
						<button
							v-for="c in PLAYER_COLORS"
							:key="c"
							class="h-7 w-7 rounded-full border-2"
							:class="color === c ? 'border-white' : 'border-transparent'"
							:style="{ background: { red: '#e0393e', blue: '#2f74e0', green: '#2fae4e', yellow: '#f2c230', purple: '#9b4fe0' }[c] }"
							:title="c"
							@click="color = c"
						/>
					</div>
				</div>

				<div class="space-y-2">
					<label class="block text-slate-400">Energy: {{ state.energy }} / {{ ship.energy }}</label>
					<input v-model.number="state.energy" type="range" min="0" :max="ship.energy" class="w-full" />
					<label class="block text-slate-400">Bounty</label>
					<input v-model.number="bounty" type="number" step="1000" min="0" class="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5" />
					<div class="flex flex-wrap gap-3">
						<label class="flex items-center gap-1.5"><input v-model="state.impulseReady" type="checkbox" /> Impulse ready (untick = flipped)</label>
						<label class="flex items-center gap-1.5"><input v-model="state.abilityExhausted" type="checkbox" /> Ability exhausted</label>
					</div>
				</div>

				<div class="space-y-2">
					<label class="block text-slate-400">Markers</label>
					<div class="flex flex-wrap gap-2">
						<button class="btn" @click="useMarker">Use on outfit</button>
						<button class="btn" @click="disarm">Disarm one</button>
						<button class="btn" @click="rearmAll">Re-arm all</button>
					</div>
					<label class="block text-slate-400">Sample outfits</label>
					<div class="flex flex-wrap gap-2">
						<button v-for="(_, name) in LOADOUTS" :key="name" class="btn" @click="applyLoadout(name as string)">{{ name }}</button>
					</div>
					<p v-if="loadoutNote" class="text-xs text-amber-300">{{ loadoutNote }}</p>
				</div>

				<div class="space-y-2">
					<label class="block text-slate-400">Clicking a hold space toggles</label>
					<div class="flex flex-wrap gap-1.5">
						<button
							v-for="m in CLICK_MODES"
							:key="m.id"
							class="rounded-md border px-2 py-1 text-xs"
							:class="clickMode === m.id ? 'border-sky-400 bg-sky-900/60' : 'border-slate-700 bg-slate-800 hover:bg-slate-700'"
							@click="clickMode = m.id"
						>
							{{ m.label }}
						</button>
					</div>
					<button class="btn" @click="state.damage = []; state.iceDamage = []; state.cargo = []">Clear tokens</button>
					<label class="flex items-center gap-1.5 pt-2"><input v-model="showGallery" type="checkbox" /> Show all ships (check hold layouts)</label>
				</div>
			</div>

			<ShipMat :state="state" :color="color" :bounty="bounty" captain-name="Captain Ian" interactive can-impulse :targets="targets" :target-kind="targetKind" @cell-click="onCellClick" @impulse="state.impulseReady = false" />

			<!-- Gallery of every ship to verify transcribed hold layouts -->
			<div v-if="showGallery" class="grid gap-4 lg:grid-cols-2">
				<div v-for="g in galleryStates" :key="g.def.id" class="gallery-item">
					<ShipMat :state="g.state" :color="color" />
				</div>
			</div>
		</div>
	</div>
</template>

<style scoped>
.btn {
	border-radius: 0.5rem;
	border: 1px solid rgb(51 65 85);
	background: rgb(30 41 59);
	padding: 0.35rem 0.7rem;
	font-size: 0.8rem;
}
.btn:hover {
	background: rgb(51 65 85);
}
.gallery-item :deep(.mat) {
	--cell: 2.4rem;
	--energy-cell: 2.4rem;
}
</style>
