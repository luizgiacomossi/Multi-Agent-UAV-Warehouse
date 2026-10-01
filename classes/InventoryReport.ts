import { BusPart, Pallet } from '../types';
import { BUS_PARTS, totalsByPart } from './PalletContents';

/** What the fleet knows about the stock: only scanned pallets reveal their contents. */
export interface InventoryReport {
    scannedPallets: number;
    totalPallets: number;
    /** Units found per part, over scanned pallets only. */
    unitsByPart: Record<BusPart, number>;
}

export function buildInventoryReport(pallets: Pallet[], scannedIds: Set<string>): InventoryReport {
    const scanned = pallets.filter(p => scannedIds.has(p.id));
    return {
        scannedPallets: scanned.length,
        totalPallets: pallets.length,
        unitsByPart: totalsByPart(scanned.map(p => p.contents)),
    };
}

/**
 * Spoken summary, e.g. "Inventory complete: all 71 pallets scanned. Found 1,457 brake pads, ...".
 * `finished` is false for a report in the middle of a mission.
 */
export function describeInventory(report: InventoryReport, finished = true): string {
    const parts = (Object.keys(BUS_PARTS) as BusPart[])
        .map(id => `${report.unitsByPart[id].toLocaleString('en-US')} ${BUS_PARTS[id].name.toLowerCase()}`);
    const found = `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
    const missed = report.totalPallets - report.scannedPallets;
    const status = !finished
        ? (missed === 0 ? `All ${report.totalPallets} pallets scanned.` : `So far ${report.scannedPallets} of ${report.totalPallets} pallets scanned.`)
        : missed === 0
        ? `Inventory complete: all ${report.totalPallets} pallets scanned.`
        : `Inventory finished with ${report.scannedPallets} of ${report.totalPallets} pallets scanned; ${missed} could not be reached.`;
    return `${status} Found ${found}.`;
}
