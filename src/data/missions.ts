/**
 * Mission cards. Placeholders until the real card data arrives: each has a mission type
 * (rulebook p13) and its side, but no objective, payment or delivery point yet.
 * Only base game and Embers types are in scope.
 */

export type MissionSide = 'lawful' | 'outlaw';

export interface MissionCardDef {
	id: string;
	type: string;
	side: MissionSide;
	placeholder: true;
}

export const MISSION_TYPES: { type: string; side: MissionSide }[] = [
	{ type: 'Bounty Hunter', side: 'lawful' },
	{ type: 'Research', side: 'lawful' },
	{ type: 'Shuttle', side: 'lawful' },
	{ type: 'Cargo', side: 'lawful' },
	{ type: 'Private Eye', side: 'lawful' },
	{ type: 'Assassin', side: 'outlaw' },
	{ type: 'Smuggler', side: 'outlaw' },
	{ type: 'Thief', side: 'outlaw' },
	{ type: 'Arms Dealer', side: 'outlaw' },
	{ type: 'Coerce', side: 'outlaw' },
];

/** 4 placeholder cards of each type (40 cards). */
export const MISSION_CARDS: MissionCardDef[] = MISSION_TYPES.flatMap(({ type, side }) =>
	[1, 2, 3, 4].map((n) => ({ id: `${type.toLowerCase().replace(/\s+/g, '-')}-${n}`, type, side, placeholder: true as const })),
);

export const MISSIONS_BY_ID: Record<string, MissionCardDef> = Object.fromEntries(MISSION_CARDS.map((m) => [m.id, m]));
