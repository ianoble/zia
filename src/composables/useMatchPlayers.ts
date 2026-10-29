import { onUnmounted, ref, watch, type Ref } from 'vue';
import { SERVER_URL } from '../config';
import { gameDef, PLAYER_COLORS, type PlayerColor } from '../logic/index';

export interface MatchSeat {
	id: string;
	name: string | null;
	/** Colour picked in the lobby, if any. */
	color: PlayerColor | null;
}

/**
 * Seat names and lobby colours come from the match metadata (not game state),
 * so fetch them from the server. Polls until every seat has a name.
 */
export function useMatchPlayers(matchID: Ref<string>) {
	const seats = ref<Record<string, MatchSeat>>({});
	let timer: ReturnType<typeof setTimeout> | null = null;

	async function load() {
		try {
			const res = await fetch(`${SERVER_URL}/games/${gameDef.id}/${matchID.value}`);
			if (!res.ok) throw new Error();
			const data = (await res.json()) as { players?: { id: number; name?: string; data?: { color?: string } }[] };
			const next: Record<string, MatchSeat> = {};
			for (const p of data.players ?? []) {
				const color = PLAYER_COLORS.includes(p.data?.color as PlayerColor) ? (p.data!.color as PlayerColor) : null;
				next[String(p.id)] = { id: String(p.id), name: p.name ?? null, color };
			}
			seats.value = next;
			if (Object.values(next).some((s) => !s.name)) schedule(4000);
		} catch {
			schedule(5000);
		}
	}

	function schedule(ms: number) {
		if (timer) clearTimeout(timer);
		timer = setTimeout(load, ms);
	}

	watch(matchID, load, { immediate: true });
	onUnmounted(() => timer && clearTimeout(timer));

	const nameOf = (seat: string | null | undefined) => (seat == null ? '' : seats.value[seat]?.name ?? `Captain ${Number(seat) + 1}`);

	return { seats, nameOf };
}
