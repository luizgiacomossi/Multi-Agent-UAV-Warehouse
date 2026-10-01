import { Position3D } from '../types';

/** String key of a grid cell, for maps and sets. */
export const positionKey = (p: Position3D): string => `${p.x},${p.y},${p.z}`;

export const samePosition = (a: Position3D, b: Position3D): boolean => a.x === b.x && a.y === b.y && a.z === b.z;

export const manhattanDistance = (a: Position3D, b: Position3D): number =>
    Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.z - b.z);
