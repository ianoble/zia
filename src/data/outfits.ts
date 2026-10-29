/**
 * Outfit and mod catalog.
 * Source: Xia_Ships_&_Outfits_V1.02.pdf (page 2).
 *
 * `shape` is a text grid, one string per row, in the outfit's printed orientation:
 *   `#` = section
 *   `U` = section with a use space (activation space for a marker)
 *   `C` = connecting section, which must sit inside the hold (Cargo Pod / Armor Plating)
 *   `x` = exterior section, which must sit outside the hold (Cargo Pod / Armor Plating)
 *   `.` = empty
 * Section and use-space counts are checked against the reference sheet in outfits.test.ts.
 * Use-space positions were read from small images — verify against the tiles.
 */

export type OutfitType = 'engine' | 'shield' | 'blaster' | 'missile' | 'cargo-pod' | 'armor-plating' | 'mod';

export type Die = 'd6' | 'd8' | 'd12' | 'd20';

export type ModId = 'gts' | 'm-comp' | 'piercer' | 'enviro-shield';

export interface OutfitDef {
	id: string;
	name: string;
	type: OutfitType;
	die: Die | null;
	/** Outfit tier (I–III) for the four basic types; null otherwise. Sets the sell price. */
	tier: 1 | 2 | 3 | null;
	cost: number;
	shape: string[];
	/** Sections inside the hold, as printed on the sheet (Cargo Pod/Armor Plating print "1 (+3)"). */
	sections: number;
	useSpaces: number;
	/** Mods placed on top of another outfit's use space. */
	overlays?: 'weapon-use' | 'shield-use';
	/** Copies in the supply; null = unknown yet. */
	copies: number | null;
	set: 'base' | 'embers';
	summary?: string;
}

export const OUTFITS: OutfitDef[] = [
	// Engines
	{ id: 'engine-d6', name: 'd6 Engine', type: 'engine', die: 'd6', tier: 1, cost: 1000, shape: ['UU', '.U'], sections: 3, useSpaces: 3, copies: 7, set: 'base' },
	{ id: 'engine-d8', name: 'd8 Engine', type: 'engine', die: 'd8', tier: 2, cost: 2000, shape: ['#U', 'UU'], sections: 4, useSpaces: 3, copies: 7, set: 'base' },
	{ id: 'engine-d12', name: 'd12 Engine', type: 'engine', die: 'd12', tier: 3, cost: 3000, shape: ['##U', '.UU'], sections: 5, useSpaces: 3, copies: 7, set: 'base' },

	// Shields
	{ id: 'shield-d6', name: 'd6 Shield', type: 'shield', die: 'd6', tier: 1, cost: 1000, shape: ['#UU'], sections: 3, useSpaces: 2, copies: 7, set: 'base' },
	{ id: 'shield-d8', name: 'd8 Shield', type: 'shield', die: 'd8', tier: 2, cost: 2000, shape: ['#UU', '.U.'], sections: 4, useSpaces: 3, copies: 7, set: 'base' },
	{ id: 'shield-d12', name: 'd12 Shield', type: 'shield', die: 'd12', tier: 3, cost: 3000, shape: ['.U.', '#U#', '.U.'], sections: 5, useSpaces: 3, copies: 7, set: 'base' },

	// Blasters
	{ id: 'blaster-d6', name: 'd6 Blaster', type: 'blaster', die: 'd6', tier: 1, cost: 1000, shape: ['#U', '.U'], sections: 3, useSpaces: 2, copies: 7, set: 'base' },
	{ id: 'blaster-d8', name: 'd8 Blaster', type: 'blaster', die: 'd8', tier: 2, cost: 2000, shape: ['##', '.U', '.U'], sections: 4, useSpaces: 2, copies: 7, set: 'base' },
	{ id: 'blaster-d12', name: 'd12 Blaster', type: 'blaster', die: 'd12', tier: 3, cost: 3000, shape: ['###', '..U', '..U'], sections: 5, useSpaces: 2, copies: 7, set: 'base' },

	// Missiles
	{ id: 'missile-d8', name: 'd8 Missile', type: 'missile', die: 'd8', tier: 1, cost: 1000, shape: ['##U'], sections: 3, useSpaces: 1, copies: 7, set: 'base' },
	{ id: 'missile-d12', name: 'd12 Missile', type: 'missile', die: 'd12', tier: 2, cost: 2000, shape: ['###U'], sections: 4, useSpaces: 1, copies: 7, set: 'base' },
	{ id: 'missile-d20', name: 'd20 Missile', type: 'missile', die: 'd20', tier: 3, cost: 3000, shape: ['####U'], sections: 5, useSpaces: 1, copies: 7, set: 'base' },

	// Embers: new outfits (attach inside the hold at the green space, rest outside the ship)
	{
		id: 'cargo-pod', name: 'Cargo Pod', type: 'cargo-pod', die: null, tier: null, cost: 1000, shape: ['xxx', '.C.'], sections: 1, useSpaces: 0, copies: null, set: 'embers',
		summary: 'Holds four cargo cubes — and only cargo. Any damage taken to exterior spaces jettisons cargo.',
	},
	{
		id: 'armor-plating', name: 'Armor Plating', type: 'armor-plating', die: null, tier: null, cost: 1000, shape: ['xxx', '.C.'], sections: 1, useSpaces: 0, copies: null, set: 'embers',
		summary: 'Each space can hold 1 damage — and only damage. Ice damage only spreads into the ship via the green space.',
	},

	// Embers: mods (1x1)
	{
		id: 'gts', name: 'GTS', type: 'mod', die: null, tier: null, cost: 1000, shape: ['#'], sections: 1, useSpaces: 0, copies: null, set: 'embers',
		summary: 'Placed next to an engine, provides +2 to its rolls (but not exceeding its max).',
	},
	{
		id: 'm-comp', name: 'M-Comp', type: 'mod', die: null, tier: null, cost: 1000, shape: ['#'], sections: 1, useSpaces: 0, copies: null, set: 'embers',
		summary: 'Carry +2 active missions per undamaged M-Comp.',
	},
	{
		id: 'piercer', name: 'Piercer', type: 'mod', die: null, tier: null, cost: 1000, shape: ['U'], sections: 1, useSpaces: 1, overlays: 'weapon-use', copies: null, set: 'embers',
		summary: 'Place over a use space on a blaster or missile. Attacks using this space give -4 to shield rolls to block.',
	},
	{
		id: 'enviro-shield', name: 'Enviro-Shield', type: 'mod', die: null, tier: null, cost: 1000, shape: ['U'], sections: 1, useSpaces: 1, overlays: 'shield-use', copies: null, set: 'embers',
		summary: 'Place over a use space on a shield. Blocks using this space give the max result vs non-combat damage.',
	},
];

export const OUTFITS_BY_ID: Record<string, OutfitDef> = Object.fromEntries(OUTFITS.map((o) => [o.id, o]));

/** Selling refunds half the price, rounded up to the nearest 1,000 (rulebook p18). */
export function outfitSellValue(def: OutfitDef): number {
	return Math.ceil(def.cost / 2 / 1000) * 1000;
}
