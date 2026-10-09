import { describe, expect, test } from 'vitest';
import { GENERATOR_CONFIG as C } from '../config';
import {
  generateAttentionPair, generateDisplay, generateTrialPair, hashSeed, nodeBounds,
} from '../generator';
import { checkInvariants, linksConflict } from '../invariants';
import { measureDisplay } from '../metrics';
import { makePalette } from '../palette';
import {
  CUES, DENSITIES, Display, layoutModeFor,
} from '../types';

/** How many pairs of links of a display cross, touch or overlap. */
function crossingPairs(d: Display): number {
  const byId = new Map(d.nodes.map((n) => [n.id, n]));
  const at = (id: number) => byId.get(id) as Display['nodes'][number];
  let count = 0;
  d.edges.forEach((a, i) => d.edges.slice(i + 1).forEach((b) => {
    if (linksConflict(at(a.source), at(a.target), at(b.source), at(b.target))) count += 1;
  }));
  return count;
}

const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;
const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

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

describe('layoutModeFor', () => {
  test('only proximity keeps the gapped layout', () => {
    expect(CUES.map(layoutModeFor)).toEqual(['grouped', 'even', 'even', 'even', 'even']);
  });
});

describe('generateDisplay', () => {
  test('is deterministic: the same arguments give a deep-equal display', () => {
    const opts = {
      kind: 'A' as const, cue: 'color' as const, density: 'dense' as const, hueOffset: 13,
    };
    expect(generateDisplay(7, opts)).toEqual(generateDisplay(7, opts));
    const bOpts = {
      kind: 'B' as const, cue: 'color' as const, density: 'sparse' as const, nB: 30,
    };
    expect(generateDisplay(7, bOpts)).toEqual(generateDisplay(7, bOpts));
  });

  test('reports the requested seed and the attempt count', () => {
    const d = generateDisplay(123, { kind: 'A', cue: 'proximity', density: 'sparse' });
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
          expect(d.width).toBe(C.CANVAS.width);
          expect(d.height).toBe(C.CANVAS.height);
          expect(d.clusters).toHaveLength(C.NCLUST);
          expect(checkInvariants(d)).toEqual([]);
          expect(d.meta.clusterSizes?.reduce((a, b) => a + b, 0)).toBe(C.NTOTAL);
          expect(d.meta.gapX).toHaveLength(4);
          expect(d.meta.gapY).toHaveLength(3);
          expect(d.meta.order).toHaveLength(C.NCLUST);
          expect(d.meta.layout).toBe(layoutModeFor(cue));
          attempts.push(d.attempts);
        }
      }
    }
    expect(Math.max(...attempts)).toBeLessThan(C.MAX_SEED_ATTEMPTS);
    // the builders avoid crossings themselves, so dense A is no harder than sparse A
    expect(mean(attempts)).toBeLessThan(12);
  }, 120000);

  test('stimulus A: 200 seeds x every cue x both densities have no crossing links', () => {
    for (let seed = 1; seed <= 200; seed += 1) {
      for (const cue of CUES) {
        for (const density of DENSITIES) {
          const d = generateDisplay(seed, { kind: 'A', cue, density });
          expect(crossingPairs(d)).toBe(0);
        }
      }
    }
  }, 120000);

  test('rejects a nonsensical nB for stimulus B', () => {
    expect(() => generateDisplay(1, {
      kind: 'B', cue: 'proximity', density: 'sparse', nB: 0,
    })).toThrow(/positive integer/);
  });
});

describe('nodeBounds', () => {
  test('is the bounding box of the dot centres', () => {
    const d = generateDisplay(3, { kind: 'A', cue: 'rect', density: 'sparse' });
    const box = nodeBounds(d);
    expect(box.x).toBe(Math.min(...d.nodes.map((n) => n.x)));
    expect(box.y + box.h).toBeCloseTo(Math.max(...d.nodes.map((n) => n.y)), 9);
  });
});

describe('generateTrialPair', () => {
  test('builds A exactly as generateDisplay does, and B inside A\'s field', () => {
    const { displayA, displayB } = generateTrialPair(11, 22, {
      cue: 'color', density: 'dense', nB: 30, hueOffset: 25,
    });
    expect(displayA).toEqual(generateDisplay(11, {
      kind: 'A', cue: 'color', density: 'dense', hueOffset: 25,
    }));
    expect(displayB.n).toBe(30);
    expect(displayB.meta.field).toEqual(nodeBounds(displayA));
    const palette = makePalette(25);
    displayB.nodes.forEach((n) => expect(palette).toContain(n.fill));
    expect(generateTrialPair(11, 22, {
      cue: 'color', density: 'dense', nB: 30, hueOffset: 25,
    })).toEqual({ displayA, displayB });
  });

  test('B for every nB from 8 to 48 satisfies the invariants in every cue\'s field', () => {
    for (const cue of CUES) {
      for (const density of DENSITIES) {
        for (let nB = 8; nB <= 48; nB += 4) {
          const { displayB } = generateTrialPair(nB, 1000 + nB, { cue, density, nB });
          expect(displayB.nodes).toHaveLength(nB);
          expect(displayB.clusters).toEqual([]);
          expect(checkInvariants(displayB)).toEqual([]);
        }
      }
    }
  }, 120000);

  test('B: 40 seed pairs x N_B 8 to 48 x both densities have no crossing links', () => {
    for (const density of DENSITIES) {
      for (let seed = 1; seed <= 40; seed += 1) {
        for (let nB = 8; nB <= 48; nB += 2) {
          const { displayA, displayB } = generateTrialPair(seed, hashSeed(seed, nB, 'B'), { cue: 'shape', density, nB });
          expect(crossingPairs(displayB)).toBe(0);
          expect(crossingPairs(displayA)).toBe(0);
          // the shape cue's B shows exactly A's six marks
          const six = new Set(displayA.nodes.map((n) => n.shape));
          expect(six.size).toBe(C.NCLUST);
          displayB.nodes.forEach((n) => expect(six.has(n.shape)).toBe(true));
        }
      }
    }
  }, 240000);

  test('feasibility: no B from 8 to 48 dots needs more than 50 attempts', () => {
    const attempts: number[] = [];
    for (const cue of CUES) {
      for (const density of DENSITIES) {
        for (let seed = 1; seed <= 3; seed += 1) {
          const displayA = generateDisplay(seed, { kind: 'A', cue, density });
          const metricsA = measureDisplay(displayA);
          for (let nB = 8; nB <= 48; nB += 1) {
            const displayB = generateDisplay(hashSeed(seed, nB, 'B'), {
              kind: 'B',
              cue,
              density,
              nB,
              field: nodeBounds(displayA),
              inkTarget: { linkLength: metricsA.linkLength, edges: displayA.edges.length },
            });
            attempts.push(displayB.attempts);
          }
        }
      }
    }
    expect(Math.max(...attempts)).toBeLessThanOrEqual(50);
    expect(mean(attempts)).toBeLessThan(5);
  }, 120000);

  test('B has the same dots and links for every cue; only its features differ', () => {
    const geometry = (d: Display) => ({
      nodes: d.nodes.map((n) => [n.x, n.y]),
      edges: d.edges.map((e) => [e.source, e.target]),
      field: d.meta.field,
      linkTarget: d.meta.linkTarget,
    });
    for (const density of DENSITIES) {
      for (let seed = 1; seed <= 25; seed += 1) {
        for (const nB of [8, 24, 48]) {
          const ref = geometry(generateTrialPair(seed, hashSeed(seed, nB), { cue: 'rect', density, nB }).displayB);
          CUES.forEach((cue) => {
            const { displayB } = generateTrialPair(seed, hashSeed(seed, nB), {
              cue, density, nB, hueOffset: 17,
            });
            expect(geometry(displayB)).toEqual(ref);
            expect(checkInvariants(displayB)).toEqual([]);
          });
        }
      }
    }
  }, 120000);

  describe('equating B to A at N_B = 24', () => {
    const SEEDS = 50;
    const pairs = (cue: Display['cue'], density: Display['density'] = 'sparse') => Array.from(
      { length: SEEDS },
      (_, i) => {
        const { displayA, displayB } = generateTrialPair(i + 1, hashSeed(i + 1, 'B'), { cue, density, nB: 24 });
        return {
          a: measureDisplay(displayA), b: measureDisplay(displayB), displayB,
        };
      },
    );

    test.each(CUES)('%s: B\'s spacing matches A\'s', (cue) => {
      const measured = pairs(cue);
      // mean nearest-neighbour distance within 15 % of A's
      const ratio = mean(measured.map(({ b }) => b.meanNN)) / mean(measured.map(({ a }) => a.meanNN));
      expect(ratio).toBeGreaterThan(0.85);
      expect(ratio).toBeLessThan(1.15);
      // and B's closest pair never much tighter than A's typical closest pair
      const typicalMinA = median(measured.map(({ a }) => a.minNN));
      measured.forEach(({ b }) => expect(b.minNN).toBeGreaterThanOrEqual(0.8 * typicalMinA));
    }, 60000);

    test.each(['proximity', 'rect'] as const)('%s: B\'s link length is within 25 %% of its target', (cue) => {
      DENSITIES.forEach((density) => {
        pairs(cue, density).forEach(({ b, displayB }) => {
          const target = displayB.meta.linkTarget as number;
          expect(b.linkLength / target).toBeGreaterThan(0.75);
          expect(b.linkLength / target).toBeLessThan(1.25);
        });
      });
    }, 60000);

    test('rect B ignores A\'s outline ink and is built like the colour B', () => {
      // colour shares the even layout with rect but has no outlines
      const plain = pairs('color').map(({ b }) => b.linkLength);
      const rect = pairs('rect').map(({ a, b }) => ({ a: a.linkLength, b: b.linkLength }));
      expect(mean(rect.map(({ b }) => b))).toBeCloseTo(mean(plain), 6);
      expect(mean(rect.map(({ b }) => b)) / mean(rect.map(({ a }) => a))).toBeLessThan(1.1);
    }, 60000);
  });
});

describe('generateAttentionPair', () => {
  test('5 and 30 ungrouped items in the trial B\'s field, with the cue\'s features and no crossings', () => {
    for (const cue of CUES) {
      for (const density of DENSITIES) {
        for (let seed = 1; seed <= 5; seed += 1) {
          const { displayA, displayB } = generateAttentionPair(seed, hashSeed(seed, 'B'), {
            cue, density, few: 5, many: 30, hueOffset: 12,
          });
          const trialB = generateTrialPair(seed, hashSeed(seed, 'B'), {
            cue, density, nB: 30, hueOffset: 12,
          }).displayB;
          expect(displayA.n).toBe(5);
          expect(displayB.n).toBe(30);
          [displayA, displayB].forEach((d) => {
            expect(d.kind).toBe('B');
            expect(d.clusters).toEqual([]);
            expect(d.meta.field).toEqual(trialB.meta.field);
            expect(checkInvariants(d)).toEqual([]);
          });
          // the 30-item display is exactly the trial's B for N_B = 30
          expect(displayB).toEqual(trialB);
          if (cue === 'color') displayA.nodes.forEach((n) => expect(makePalette(12)).toContain(n.fill));
          if (cue === 'shape') {
            const six = new Set(generateDisplay(seed, {
              kind: 'A', cue, density, hueOffset: 12,
            }).nodes.map((n) => n.shape));
            displayA.nodes.forEach((n) => expect(six.has(n.shape)).toBe(true));
          }
        }
      }
    }
  }, 60000);
});
