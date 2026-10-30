<script setup lang="ts">
import { ref } from 'vue';
import MissionHand from '../../components/missions/MissionHand.vue';
import MissionChoice from '../../components/missions/MissionChoice.vue';
import { MISSION_CARDS } from '../../data/missions';

/** Design sandbox for the mission hand and the end-of-turn choice. Route: /dev/missions (?choose=1 opens the choice). */
const query = new URLSearchParams(window.location.search);
const hand = ref(MISSION_CARDS.filter((_, i) => i % 9 === 0).slice(0, 3).map((m) => m.id));
const drawn = ref(query.get('choose') === '1' ? MISSION_CARDS.filter((_, i) => i % 7 === 1).slice(0, 6).map((m) => m.id) : []);
const collapsed = ref(false);
function keep(ids: string[]) {
	hand.value = [...hand.value, ...ids];
	drawn.value = [];
}
</script>

<template>
	<div class="min-h-screen bg-[#05070d] p-6 text-slate-100">
		<h1 class="text-2xl font-bold">Missions preview</h1>
		<p class="text-sm text-slate-400">Hover a card in the tray; add <code>?choose=1</code> to the URL to see the end-of-turn choice.</p>
		<MissionHand v-model:collapsed="collapsed" :missions="hand" :limit="3" can-discard @discard="(id) => (hand = hand.filter((x) => x !== id))" />
		<MissionChoice v-if="drawn.length" :cards="drawn" :max-keep="2" @keep="keep" />
	</div>
</template>
