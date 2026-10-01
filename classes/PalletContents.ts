import { BusPart, PalletContents, Position3D } from '../types';

/** A bus spare part: display name, units per pallet and badge colour. */
export interface BusPartInfo {
    name: string;
    minQuantity: number;
    maxQuantity: number;
    color: string;
}

export const BUS_PARTS: Record<BusPart, BusPartInfo> = {
    BRK: { name: 'Brake pads', minQuantity: 40, maxQuantity: 120, color: '#ef4444' },
    FLT: { name: 'Oil filters', minQuantity: 60, maxQuantity: 200, color: '#f59e0b' },
    TYR: { name: 'Tyres', minQuantity: 4, maxQuantity: 12, color: '#22d3ee' },
};

const PART_IDS = Object.keys(BUS_PARTS) as BusPart[];

/** 32-bit integer hash of a grid cell (avalanche mix, so neighbouring cells differ). */
function cellHash(p: Position3D): number {
    let h = Math.imul(p.x + 1, 0x9e3779b1) ^ Math.imul(p.y + 1, 0x85ebca6b) ^ Math.imul(p.z + 1, 0xc2b2ae35);
    h ^= h >>> 16;
    h = Math.imul(h, 0x7feb352d);
    h ^= h >>> 15;
    h = Math.imul(h, 0x846ca68b);
    h ^= h >>> 16;
    return h >>> 0;
}

/**
 * Contents of the pallet at `position`. Derived from the cell, not from the simulation's random
 * source, so adding contents leaves every seeded scenario (and benchmark result) unchanged, and
 * the same warehouse always holds the same parts.
 */
export function palletContentsAt(position: Position3D): PalletContents {
    const h = cellHash(position);
    const part = PART_IDS[h % PART_IDS.length];
    const { minQuantity, maxQuantity } = BUS_PARTS[part];
    return { part, quantity: minQuantity + (Math.floor(h / PART_IDS.length) % (maxQuantity - minQuantity + 1)) };
}

/** Units found per part over the given contents. */
export function totalsByPart(contents: PalletContents[]): Record<BusPart, number> {
    const totals = Object.fromEntries(PART_IDS.map(id => [id, 0])) as Record<BusPart, number>;
    contents.forEach(c => { totals[c.part] += c.quantity; });
    return totals;
}
