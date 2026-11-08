<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { OUTFITS_BY_ID } from '../../data/outfits';
import { rearmLimit, shieldOptions } from '../../logic/game';
import type { CombatOutfit, ShipState, ZiaState } from '../../logic/types';
import PromptDialog from './PromptDialog.vue';

/**
 * An attack in progress (G.combat). The defender chooses shields, places the damage and
 * re-arms; the attacker and everyone else see what's happening.
 */
const props = defineProps<{ G: ZiaState; playerID: string; nameOf: (seat: string) => string }>();
const emit = defineEmits<{ act: [name: string, ...args: unknown[]] }>();

const combat = computed(() => props.G.combat!);
const amDefender = computed(() => combat.value.defender === props.playerID);
const amAttacker = computed(() => combat.value.attacker === props.playerID);
const attackerName = computed(() => props.nameOf(combat.value.attacker));
const defenderName = computed(() => props.nameOf(combat.value.defender));
const ship = computed(() => props.G.players[props.playerID]?.ship ?? null);

/** "2× d6 Blaster (2d6)" */
function describe(owner: ShipState | null | undefined, used: CombatOutfit[]): string {
	return used
		.map((u) => {
			const def = OUTFITS_BY_ID[owner?.outfits.find((o) => o.uid === u.uid)?.outfitId ?? ''];
			return def ? `${u.spaces.length}× ${def.name} (${u.spaces.length}${def.die})` : '';
		})
		.filter(Boolean)
		.join(', ');
}
const weapons = computed(() => describe(props.G.players[combat.value.attacker]?.ship, combat.value.weapons));

// Defender: markers to put on each shield (one die each).
const shields = computed(() =>
	ship.value && amDefender.value
		? shieldOptions(ship.value).map((s) => ({ ...s, def: OUTFITS_BY_ID[ship.value!.outfits.find((o) => o.uid === s.uid)!.outfitId] }))
		: [],
);
const counts = ref<Record<string, number>>({});
const total = computed(() => Object.values(counts.value).reduce((a, b) => a + b, 0));
const armed = computed(() => ship.value?.armedMarkers ?? 0);
watch(
	() => combat.value.stage === 'defend' && amDefender.value,
	(defending) => {
		if (!defending) return;
		// Start with every shield marker the ship can raise.
		let left = armed.value;
		counts.value = Object.fromEntries(
			shields.value.map((s) => {
				const n = Math.min(s.free, left);
				left -= n;
				return [s.uid, n];
			}),
		);
	},
	{ immediate: true },
);
function step(uid: string, by: number) {
	const s = shields.value.find((x) => x.uid === uid)!;
	const next = (counts.value[uid] ?? 0) + by;
	if (next < 0 || next > s.free || total.value + by > armed.value) return;
	counts.value = { ...counts.value, [uid]: next };
}
function defend() {
	emit(
		'act',
		'defend',
		Object.entries(counts.value)
			.filter(([, n]) => n > 0)
			.map(([uid, count]) => ({ uid, count })),
	);
}

const pending = computed(() => props.G.players[props.playerID]?.pendingDamage.length ?? 0);
const limit = computed(() => rearmLimit(props.G));
const shieldMarkers = computed(() => combat.value.shields.reduce((n, s) => n + s.spaces.length, 0));
const rolled = computed(() => combat.value.attack != null);
const WAITING = { defend: 'choose shields', damage: 'place the damage', rearm: 'decide whether to re-arm shields' } as const;
</script>

<template>
	<div class="space-y-2 rounded-lg border border-red-800/70 bg-slate-900/70 p-3 text-sm">
		<p class="font-semibold text-red-200">
			<template v-if="amDefender">{{ attackerName }} is attacking you</template>
			<template v-else-if="amAttacker">You're attacking {{ defenderName }}</template>
			<template v-else>{{ attackerName }} is attacking {{ defenderName }}</template>
		</p>
		<p class="text-xs text-slate-400">Firing {{ weapons }}.</p>
		<p v-if="rolled" class="text-xs text-slate-300">
			Attack {{ combat.attack }} − defence {{ combat.defence }}:
			<strong :class="combat.damage ? 'text-red-300' : 'text-emerald-300'">{{ combat.damage ? `${combat.damage} damage` : 'no damage' }}</strong>
		</p>

		<template v-if="amDefender">
			<template v-if="combat.stage === 'damage'">
				<p class="font-semibold text-red-200">Place {{ pending }} damage</p>
				<p class="text-xs text-slate-400">
					Click a highlighted space in your hold. Damage on a cargo cube jettisons it; damage on a use space with a marker sends the marker to
					Disarmed.
				</p>
			</template>
		</template>
		<p v-else class="text-xs text-slate-400">Waiting for {{ defenderName }} to {{ WAITING[combat.stage] }}.</p>

		<PromptDialog v-if="amDefender && combat.stage === 'defend'" tone="red" :title="`${attackerName} is attacking you`">
			<p>
				Firing <span class="text-red-200">{{ weapons }}</span>. Raise shields to block: each armed marker on a shield rolls its die, and the total is
				taken off the attack.
			</p>
			<div v-for="s in shields" :key="s.uid" class="flex items-center justify-between gap-2">
				<span>{{ s.def.name }} <span class="text-xs text-slate-500">({{ s.free }} use space{{ s.free === 1 ? '' : 's' }})</span></span>
				<span class="flex items-center gap-2">
					<button type="button" class="step" :disabled="!counts[s.uid]" @click="step(s.uid, -1)">−</button>
					<span class="w-4 text-center font-bold">{{ counts[s.uid] ?? 0 }}</span>
					<button type="button" class="step" :disabled="(counts[s.uid] ?? 0) >= s.free || total >= armed" @click="step(s.uid, 1)">+</button>
				</span>
			</div>
			<p class="text-xs text-slate-500">
				{{ armed }} armed marker{{ armed === 1 ? '' : 's' }}. Afterwards you can re-arm the shield markers for 1 energy each.
			</p>
			<template #actions>
				<button v-if="total" @click="defend"><span>Raise shields</span><span class="text-sky-300">roll {{ total }} {{ total === 1 ? 'die' : 'dice' }}</span></button>
				<button :class="total ? 'secondary' : ''" @click="emit('act', 'defend', [])"><span>Take it without shields</span></button>
			</template>
		</PromptDialog>

		<PromptDialog v-if="amDefender && combat.stage === 'rearm'" tone="red" title="Re-arm your shields?">
			<p>
				You put {{ shieldMarkers }} marker{{ shieldMarkers === 1 ? '' : 's' }} on shields. Re-arm them for 1 energy each (you have
				{{ ship?.energy ?? 0 }}); the rest go to Disarmed.
			</p>
			<template #actions>
				<button v-for="n in limit" :key="n" @click="emit('act', 'rearmShields', limit - n + 1)">
					<span>Re-arm {{ limit - n + 1 }}</span><span class="text-amber-300">−{{ limit - n + 1 }} energy</span>
				</button>
				<button class="secondary" @click="emit('act', 'rearmShields', 0)"><span>Don't re-arm</span></button>
			</template>
		</PromptDialog>
	</div>
</template>

<style scoped>
.step {
	width: 1.75rem;
	height: 1.75rem;
	border-radius: 0.4rem;
	background: #334155;
	font-weight: 700;
}
.step:disabled {
	opacity: 0.4;
}
</style>
