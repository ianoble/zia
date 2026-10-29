/**
 * Player ship catalog (ship mats + ship ability cards).
 * Source: Xia_Ships_&_Outfits_V1.02.pdf.
 *
 * `hold` is the hold layout as a text grid, one string per row:
 *   `#` = hold space, `.` = no space.
 * The number of `#` cells must equal `holdSize` (checked in ships.test.ts).
 * Layouts were transcribed by hand from small images — verify against the mats.
 */

export type ShipTier = 1 | 2 | 3;

/** Which box the ship comes from. `ks` = Kickstarter/Sellsword (out of scope by default). */
export type ContentSet = 'base' | 'embers' | 'ks';

export interface ShipAbilityDef {
	name: string;
	/** Short summary from the reference sheet; full card text still to be added. */
	summary: string;
}

export interface ShipDef {
	id: string;
	name: string;
	tier: ShipTier;
	holdSize: number;
	impulse: number;
	/** Maximum energy (top of the energy meter). */
	energy: number;
	price: number;
	hold: string[];
	/** When taking a ship you choose one of these; you keep it when you upgrade. */
	abilities: ShipAbilityDef[];
	set: ContentSet;
}

export const SHIPS: ShipDef[] = [
	// ---------------------------------------------------------------- Tier I
	{
		id: 'easy-tiger', name: 'Easy Tiger', tier: 1, holdSize: 11, impulse: 3, energy: 8, price: 1000, set: 'base',
		hold: ['##.', '###', '###', '###'],
		abilities: [
			{ name: 'TAC-X', summary: 'Spend 1 energy to re-roll any one result.' },
			{ name: 'Hyper Calc-32', summary: 'Take a 3 result instead of rolling for outfits.' },
		],
	},
	{
		id: 'ghoststalker', name: 'Ghoststalker', tier: 1, holdSize: 9, impulse: 3, energy: 8, price: 1000, set: 'base',
		hold: ['.###', '###.', '.###'],
		abilities: [
			{ name: 'Disruptor Field', summary: 'Spend 2 energy to attempt to pass planetary shields with a roll.' },
			{ name: 'Crypto Lance', summary: 'Planetary shields do not stop movement, but may still cause damage.' },
		],
	},
	{
		id: 'numerator', name: 'Numerator', tier: 1, holdSize: 10, impulse: 4, energy: 9, price: 1000, set: 'base',
		hold: ['###', '..#', '.##', '..#', '###'],
		abilities: [
			{ name: 'Afterburner', summary: 'Spend 1 energy to attempt a move boost roll.' },
			{ name: 'LR-Scan', summary: 'Pay 5 energy when collecting an explore token to double the result or place a new token.' },
		],
	},
	{
		id: 'persistent-memory', name: 'Persistent Memory', tier: 1, holdSize: 11, impulse: 3, energy: 9, price: 1000, set: 'base',
		hold: ['.###', '##..', '#...', '##..', '.###'],
		abilities: [
			{ name: 'Mag-Harpoon', summary: 'Spend 1 energy to follow another ship. Distance based on roll.' },
			{ name: 'Total Recoil', summary: 'Use weapon outfits as engine outfits. Shield piercer mods are 3 weaker.' },
		],
	},
	{
		id: 'puddle-jumper', name: 'Puddle Jumper', tier: 1, holdSize: 10, impulse: 4, energy: 10, price: 1000, set: 'base',
		hold: ['..##..', '..##..', '######'],
		abilities: [
			{ name: 'Energy Scoop', summary: 'Roll to potentially collect energy.' },
			{ name: 'Eco-Core', summary: 'Pay 0 energy to arm markers.' },
		],
	},
	{
		id: 'swamp-rat', name: 'Swamp Rat', tier: 1, holdSize: 12, impulse: 3, energy: 8, price: 1000, set: 'base',
		hold: ['######', '######'],
		abilities: [
			{ name: 'Over-Surge', summary: 'Spend 1 energy and damage an outfit to use it.' },
			{ name: 'VRX-Heatsink', summary: 'Each damage on an outfit gives it +1 rather than -1. You may damage the ship as an action.' },
		],
	},
	{
		id: 'vagabond', name: 'Vagabond', tier: 1, holdSize: 11, impulse: 3, energy: 8, price: 1000, set: 'embers',
		hold: ['####.', '...##', '#####'],
		abilities: [
			{ name: 'Batea Grid', summary: 'Spend 1 energy to collect a random cargo cube from inside various borders.' },
			{ name: 'Quantum Ripple', summary: 'Rotate sectors on blind jump to your choice. +1 impulse once all sectors are discovered.' },
		],
	},

	// --------------------------------------------------------------- Tier II
	{
		id: 'bitter-karma', name: 'Bitter Karma', tier: 2, holdSize: 14, impulse: 2, energy: 12, price: 5000, set: 'base',
		hold: ['######', '..##..', '######'],
		abilities: [
			{ name: 'EMP Burst', summary: 'Spend 2 energy to attempt a roll to cause nearby ships to lose energy and take damage.' },
			{ name: 'Dimension #10', summary: 'Choose your respawn point and have 0 damage. You may self-destruct and respawn at turn start.' },
		],
	},
	{
		id: 'exodus-void-wasp', name: 'Exodus / Void Wasp', tier: 2, holdSize: 13, impulse: 3, energy: 10, price: 5000, set: 'ks',
		hold: ['.##.', '.###', '####', '#...', '###.'],
		abilities: [
			{ name: 'RK-5 Blasters', summary: 'These are size 2 blasters with one use space that do 2d6 damage. They must stay equipped.' },
		],
	},
	{
		id: 'gaiden', name: 'Gaiden', tier: 2, holdSize: 13, impulse: 4, energy: 10, price: 5000, set: 'base',
		hold: ['##..##', '.#####', '##..##'],
		abilities: [
			{ name: 'Evasive Thrusters', summary: 'Spend 2 energy to attempt to dodge damage.' },
			{ name: 'Scar-Lite Hull', summary: 'Reduce damage by 1 (or 3 in combat). Freeze step is skipped. Repair damage for free.' },
		],
	},
	{
		id: 'lone-drifter', name: 'Lone Drifter', tier: 2, holdSize: 14, impulse: 2, energy: 11, price: 5000, set: 'base',
		hold: ['#####', '..#..', '.###.', '#####'],
		abilities: [
			{ name: 'Auto-Pilot', summary: "Spend 2 energy to attempt to move after each player's turn." },
			{ name: 'Inertia Harness', summary: 'Move 3 spaces after a buy or sell action (6 if the good was in demand).' },
		],
	},
	{
		id: 'mach-horror', name: 'Mach Horror', tier: 2, holdSize: 13, impulse: 3, energy: 12, price: 5000, set: 'base',
		hold: ['.##.##', '#####.', '.##.##'],
		abilities: [
			{ name: 'Sentry Gun', summary: "Spend 2 energy to attempt an attack on another player's turn." },
			{ name: 'Double Agent', summary: 'Use lawful planets as an Outlaw. Get discounts while at 4,000+ bounty.' },
		],
	},
	{
		id: 'occams-razor', name: "Occam's Razor", tier: 2, holdSize: 13, impulse: 3, energy: 11, price: 5000, set: 'base',
		hold: ['..###..', '#######', '..###..'],
		abilities: [
			{ name: 'Pyrion Railgun', summary: 'Spend 2 energy to roll in an attempt to damage target outfits. Damage is unblockable.' },
			{ name: 'Solar Capacitor', summary: 'Pay 0 energy to arm weapon outfits. Stars provide energy and +1 to blaster activations.' },
		],
	},
	{
		id: 'skimmer', name: 'Skimmer', tier: 2, holdSize: 13, impulse: 3, energy: 10, price: 5000, set: 'embers',
		hold: ['..#..', '..##.', '#####', '#####'],
		abilities: [
			{ name: 'Recall', summary: 'Spawn a recall token. Spend 2 energy to attempt to return to this space instantly.' },
			{ name: 'Microjump', summary: 'Spend 2 energy to move into asteroid, ice asteroid or debris without rolling.' },
		],
	},
	{
		id: 'the-krembler', name: 'The Krembler', tier: 2, holdSize: 14, impulse: 3, energy: 10, price: 5000, set: 'base',
		hold: ['..##', '.##.', '###.', '.###', '..##', '..##'],
		abilities: [
			{ name: 'Nano-Regeneration', summary: 'Spend 2 energy to attempt a roll to repair ship.' },
			{ name: 'Kinetic Weave', summary: 'Spend 2 movement to repair 1 damage.' },
		],
	},

	// -------------------------------------------------------------- Tier III
	{
		id: 'carriak', name: 'Carriak', tier: 3, holdSize: 16, impulse: 2, energy: 14, price: 8000, set: 'embers',
		hold: ['.#.....', '#######', '#######', '.#.....'],
		abilities: [
			{ name: 'Absorption Shield', summary: 'Spend 4 energy to repair 1 damage. Roll to gain energy when taking damage.' },
			{ name: 'Prototype Shield', summary: 'Roll an extra die for shields and remove lowest dice. Repair with excess shields. Gain 1k blocking.' },
		],
	},
	{
		id: 'cold-phoenix', name: 'Cold Phoenix', tier: 3, holdSize: 15, impulse: 3, energy: 14, price: 8000, set: 'base',
		hold: ['##.....', '#######', '.######'],
		abilities: [
			{ name: 'Wormhole Ripper', summary: 'Spend 3 energy to attempt to jump sectors.' },
			{ name: 'Termination Helix', summary: 'Spend 2 energy to place your ship adjacent to another ship in your sector.' },
		],
	},
	{
		id: 'constant-sorrow', name: 'Constant Sorrow', tier: 3, holdSize: 16, impulse: 1, energy: 16, price: 8000, set: 'base',
		hold: ['....##', '...###', '######', '#####.'],
		abilities: [
			{ name: 'Particle Ray Beam', summary: 'Spend 3 energy to attempt an attack in a straight line up to 8 spaces. All ships in line are hit.' },
			{ name: 'Green Lightning', summary: 'Spend 2 energy and 1 blaster to attempt to hit ships in up to six directions three spaces away.' },
		],
	},
	{
		id: 'long-haul', name: 'Long Haul', tier: 3, holdSize: 18, impulse: 1, energy: 14, price: 8000, set: 'base',
		hold: ['..##...', '#######', '#######', '..##...'],
		abilities: [
			{ name: 'Livestream-1', summary: 'Each title provides +1 to mission, engine and impulse rolls. Draw new titles. You can claim titles immediately.' },
			{ name: 'Shuttle Bay', summary: 'Original Tier I ship can be used to perform limited actions by spending 3 energy for two uses.' },
		],
	},
	{
		id: 'manchester', name: 'Manchester', tier: 3, holdSize: 16, impulse: 2, energy: 14, price: 8000, set: 'base',
		hold: ['##.##', '##.##', '#####', '.###.'],
		abilities: [
			{ name: 'Hard Bargaining', summary: 'Spend 3 energy to attempt to increase the price of cubes you sell.' },
			{ name: "Scoundrel's Gambit", summary: 'Jettison cargo to prevent 5 (or 10) damage.' },
		],
	},
	{
		id: 'nightshade', name: 'Nightshade', tier: 3, holdSize: 14, impulse: 2, energy: 16, price: 8000, set: 'base',
		hold: ['.##..', '.###.', '#####', '.####'],
		abilities: [
			{ name: 'Replication Drive', summary: 'Replicate the ability of an adjacent ship.' },
			{ name: 'Duplicant', summary: 'Spend 2 energy to place a token on an outfit in your ship to make a new activation space.' },
		],
	},
	{
		id: 'slow-leak', name: 'Slow Leak', tier: 3, holdSize: 17, impulse: 2, energy: 17, price: 8000, set: 'base',
		hold: ['..####', '######', '#####.', '..##..'],
		abilities: [
			{ name: 'Shockwave', summary: 'Spend 3 energy to attempt to damage and push away adjacent ships.' },
			{ name: 'Graviton Pulse', summary: 'Spend 5 energy to force all ships in your sector to move towards the centre of the sector.' },
		],
	},
];

export const SHIPS_BY_ID: Record<string, ShipDef> = Object.fromEntries(SHIPS.map((s) => [s.id, s]));

/** Ships available in a game using the base game + Embers. */
export const IN_SCOPE_SHIPS = SHIPS.filter((s) => s.set === 'base' || s.set === 'embers');

export const TIER_LABEL: Record<ShipTier, string> = { 1: 'I', 2: 'II', 3: 'III' };
