import { describe, expect, test } from 'vitest';
import { GENERATOR_CONFIG as C } from '../config';
import { generateDisplay, hashSeed } from '../generator';
import { checkInvariants } from '../invariants';
import { CUES, DENSITIES } from '../types';

describe('hashSeed', () => {
  test('is a deterministic 32-bit unsigned integer', () => {
    const h = hashSeed(1, 'B');
    expect(h).toBe(hashSeed(1, 'B'));
    expect(Number.isInteger(h)).toBe(true);
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThan(2 ** 32);
  });

  test('separates different part lists', () => {
    expect(hashSeed(1, 2)).not.toBe(hashSeed(2, 1));
    expect(hashSeed('a')).not.toBe(hashSeed('b'));
    expect(hashSeed(12, 'A')).not.toBe(hashSeed(12, 'B'));
  });
});

describe('generateDisplay', () => {
  test('is deterministic: the same arguments give a deep-equal display', () => {
    const opts = { kind: 'A' as const, cue: 'hull' as const, density: 'dense' as const };
    expect(generateDisplay(7, opts)).toEqual(generateDisplay(7, opts));
    const bOpts = {
      kind: 'B' as const, cue: 'color' as const, density: 'sparse' as const, nB: 30,
    };
    expect(generateDisplay(7, bOpts)).toEqual(generateDisplay(7, bOpts));
  });

  test('reports the requested seed and the attempt count', () => {
    const d = generateDisplay(123, { kind: 'A', cue: 'none', density: 'sparse' });
    expect(d.seed).toBe(123);
    expect(d.attempts).toBeGreaterThanOrEqual(1);
    expect(d.attempts).toBeLessThanOrEqual(C.MAX_SEED_ATTEMPTS);
  });

  test('stimulus A: 200 seeds x every cue x both densities satisfy the invariants', () => {
    const attempts: number[] = [];
    for (let seed = 1; seed <= 200; seed += 1) {
      for (const cue of CUES) {
        for (const density of DENSITIES) {
          const d = generateDisplay(seed, { kind: 'A', cue, density });
          expect(d.n).toBe(C.NTOTAL);
          expect(d.clusters).toHaveLength(C.NCLUST);
          expect(checkInvariants(d)).toEqual([]);
          expect(d.meta.clusterSizes?.reduce((a, b) => a + b, 0)).toBe(C.NTOTAL);
          expect(d.meta.gapX).toHaveLength(4);
          expect(d.meta.gapY).toHaveLength(3);
          expect(d.meta.order).toHaveLength(C.NCLUST);
          attempts.push(d.attempts);
        }
      }
    }
    const maxAttempts = Math.max(...attempts);
    expect(maxAttempts).toBeLessThan(C.MAX_SEED_ATTEMPTS);
  }, 120000);

  test('stimulus B: 50 seeds x every nB satisfy the invariants', () => {
    [8, 14, 24, 34, 48].forEach((nB) => {
      for (let seed = 1; seed <= 50; seed += 1) {
        const d = generateDisplay(seed, {
          kind: 'B', cue: 'none', density: 'sparse', nB,
        });
        expect(d.n).toBe(nB);
        expect(d.nodes).toHaveLength(nB);
        expect(d.clusters).toEqual([]);
        expect(checkInvariants(d)).toEqual([]);
      }
    });
  }, 120000);

  test('rejects a nonsensical nB for stimulus B', () => {
    expect(() => generateDisplay(1, {
      kind: 'B', cue: 'none', density: 'sparse', nB: 0,
    })).toThrow(/positive integer/);
  });
});
