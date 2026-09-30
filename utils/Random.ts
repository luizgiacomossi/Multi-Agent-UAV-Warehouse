/**
 * Single source of randomness for the simulation core.
 *
 * Everything in `classes/` draws from `random()` instead of `Math.random()`, so experiments can
 * swap in a seeded generator and replay identical scenarios. The app keeps the default
 * (`Math.random`) and is unaffected.
 */

/** Returns uniform random numbers in [0, 1). */
export type RandomSource = () => number;

/**
 * Mulberry32: a small, fast, seedable PRNG (32-bit state, period 2^32). Good statistical quality
 * for simulation sampling; not suitable for cryptography.
 */
export function createSeededRandom(seed: number): RandomSource {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let activeSource: RandomSource = Math.random;

/** Uniform random number in [0, 1) from the active source. */
export const random = (): number => activeSource();

/** Replaces the active source (e.g. with `createSeededRandom(seed)`). */
export function setRandomSource(source: RandomSource): void {
  activeSource = source;
}

/** Restores the default, unseeded source. */
export function resetRandomSource(): void {
  activeSource = Math.random;
}

/** Runs `fn` with a seeded source and restores the previous source afterwards. */
export async function withSeed<T>(seed: number, fn: () => T | Promise<T>): Promise<T> {
  const previous = activeSource;
  activeSource = createSeededRandom(seed);
  try {
    return await fn();
  } finally {
    activeSource = previous;
  }
}
