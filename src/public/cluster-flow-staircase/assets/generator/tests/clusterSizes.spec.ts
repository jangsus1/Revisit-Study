import { describe, expect, test } from 'vitest';
import { drawClusterSizes, numDistributer, rowForDraw } from '../clusterSizes';
import { mulberry32 } from '../prng';

describe('numDistributer', () => {
  test('only implements the live 6 x 24 branch', () => {
    expect(() => numDistributer(mulberry32(1), 5, 24)).toThrow(/live 6 x 24/);
  });

  test('rowForDraw splits 1..16 into 4 / 6 / 3 / 3', () => {
    const counts = [0, 0, 0, 0];
    for (let d = 1; d <= 16; d += 1) counts[rowForDraw(d)] += 1;
    expect(counts).toEqual([4, 6, 3, 3]);
  });

  test('10k draws: every size is in 3..6 and they always sum to 24', () => {
    const rng = mulberry32(2024);
    const seenSizes = new Set<number>();
    for (let i = 0; i < 10000; i += 1) {
      const sizes = numDistributer(rng);
      expect(sizes).toHaveLength(6);
      expect(sizes.reduce((a, b) => a + b, 0)).toBe(24);
      sizes.forEach((s) => {
        expect(s).toBeGreaterThanOrEqual(3);
        expect(s).toBeLessThanOrEqual(6);
        seenSizes.add(s);
      });
    }
    expect([...seenSizes].sort()).toEqual([3, 4, 5, 6]);
  });

  test('10k draws: row frequencies are within 3 percentage points of 25 / 37.5 / 18.75 / 18.75', () => {
    const rng = mulberry32(7);
    const counts = [0, 0, 0, 0];
    const n = 10000;
    for (let i = 0; i < n; i += 1) counts[drawClusterSizes(rng).row] += 1;
    const expected = [25, 37.5, 18.75, 18.75];
    counts.forEach((c, i) => {
      expect(Math.abs((100 * c) / n - expected[i])).toBeLessThan(3);
    });
  });

  test('is deterministic for a given stream', () => {
    expect(numDistributer(mulberry32(99))).toEqual(numDistributer(mulberry32(99)));
  });
});
