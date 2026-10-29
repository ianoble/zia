import { describe, expect, it } from 'vitest';
import { createShipState, engineRollResult } from './ship';
import { cellKey, placedCells } from './holdGeometry';
import type { PlacedOutfit, ShipState } from './types';

/** An engine at (0,0) and, optionally, a GTS just right of its rightmost top cell. */
function shipWith(engineId: string, gts: 'adjacent' | 'apart' | null) {
	const ship: ShipState = createShipState('easy-tiger');
	const engine: PlacedOutfit = { uid: 'e1', outfitId: engineId, x: 0, y: 0, rotation: 0, flipped: false, usedSpaces: [] };
	ship.outfits.push(engine);
	const cells = placedCells(engine);
	const right = Math.max(...cells.map((c) => c.x));
	const top = cells.find((c) => c.x === right)!;
	if (gts) {
		const at = gts === 'adjacent' ? { x: right + 1, y: top.y } : { x: right + 3, y: top.y + 5 };
		ship.outfits.push({ uid: 'g1', outfitId: 'gts', ...at, rotation: 0, flipped: false, usedSpaces: [] });
	}
	return { ship, engineCell: cellKey(cells[0].x, cells[0].y), gtsCell: gts ? cellKey(right + 1, top.y) : '' };
}

describe('engine rolls', () => {
	it('a GTS next to the engine adds 2', () => {
		const { ship } = shipWith('engine-d8', 'adjacent');
		expect(engineRollResult(ship, 'e1', 1, 8)).toEqual({ result: 3, penalty: 0, gts: 1 });
	});

	it('never above the die maximum', () => {
		const { ship } = shipWith('engine-d8', 'adjacent');
		expect(engineRollResult(ship, 'e1', 7, 8).result).toBe(8);
	});

	it('damage first, then GTS (rulebook example: d6 rolls 5, 1 damage, GTS = 6)', () => {
		const { ship, engineCell } = shipWith('engine-d6', 'adjacent');
		ship.damage.push(engineCell);
		expect(engineRollResult(ship, 'e1', 5, 6)).toEqual({ result: 6, penalty: 1, gts: 1 });
	});

	it('ice damage counts like normal damage', () => {
		const { ship, engineCell } = shipWith('engine-d8', null);
		ship.iceDamage.push(engineCell);
		expect(engineRollResult(ship, 'e1', 5, 8).result).toBe(4);
	});

	it('no bonus from a GTS that is damaged or not next to the engine', () => {
		const apart = shipWith('engine-d8', 'apart');
		expect(engineRollResult(apart.ship, 'e1', 1, 8).gts).toBe(0);
		const hurt = shipWith('engine-d8', 'adjacent');
		hurt.ship.damage.push(hurt.gtsCell);
		expect(engineRollResult(hurt.ship, 'e1', 1, 8).result).toBe(1);
	});
});
