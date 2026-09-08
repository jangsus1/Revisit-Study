/**
 * Seeded pseudo random number generation for the cluster-flow generator.
 *
 * Everything a display needs is drawn from one `mulberry32` stream so a display is a pure
 * function of its integer seed. The per-node jitter uses a second, derived stream so that
 * changing the jitter magnitude does not reshuffle every later draw (SPEC section 2).
 */
/* eslint-disable no-bitwise -- a 32-bit PRNG and its seed normalisation are bitwise by definition */

/** A uniform random source returning values in [0, 1). */
export type Rng = () => number;

/**
 * mulberry32: a small, fast 32-bit PRNG. Deterministic for a given 32-bit integer seed.
 */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Uniform in [0, 1). Thin alias kept so the code reads like the MATLAB source. */
export function rnd(rng: Rng): number {
  return rng();
}

/** MATLAB `randi(n)`: a uniform integer in 1..n. */
export function randi(rng: Rng, n: number): number {
  return 1 + Math.floor(rng() * n);
}

/** MATLAB `randperm(n)`, 0-indexed: a uniform permutation of 0..n-1 (Fisher-Yates). */
export function randperm(rng: Rng, n: number): number[] {
  const out = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}

/** Uniform in [-r, +r]. */
export function uj(rng: Rng, r: number): number {
  return (rng() * 2 - 1) * r;
}

/**
 * The separate jitter stream, `mulberry32(seed * 7919 + 13)`. `Math.imul` keeps the multiply
 * exact for 32-bit seeds (a plain `*` would lose precision above 2^53 / 7919).
 */
export function jitterRng(seed: number): Rng {
  return mulberry32((Math.imul(seed | 0, 7919) + 13) >>> 0);
}
