import { describe, expect, test } from 'vitest';
import { GENERATOR_CONFIG as C } from '../config';
import { FLOW_PITCH, aligned, flowCells } from '../flow';
import { generateAttentionPair, generateTrialPair } from '../generator';
import { gridPath } from '../graph';
import { checkInvariants } from '../invariants';
import { mulberry32 } from '../prng';
import { Density, Display, VARIANT_CUE } from '../types';

const FLOW = ['flow', 'flow-shade', 'flow-shade-fit', 'flow-both'] as const;
const SEEDS = Array.from({ length: 30 }, (_, i) => 500 + i * 13);
const DENSITIES: Density[] = ['sparse', 'dense'];

const byId = (d: Display) => new Map(d.nodes.map((n) => [n.id, n]));
/** Every node an integer number of pitches from the first one, on both axes. */
function onLattice(d: Display): boolean {
  const [first] = d.nodes;
  const frac = (v: number) => Math.abs(v / FLOW_PITCH - Math.round(v / FLOW_PITCH));
  return d.nodes.every((n) => frac(n.x - first.x) < 1e-6 && frac(n.y - first.y) < 1e-6);
}
function connected(d: Display): boolean {
  const seen = new Set([d.nodes[0].id]);
  const grow = () => d.edges.filter((e) => seen.has(e.source) !== seen.has(e.target))
    .map((e) => seen.add(e.source).add(e.target)).length > 0;
  while (grow());
  return seen.size === d.nodes.length;
}

describe('flowchart prototypes', () => {
  test.each(FLOW)('%s: boxes on the lattice, straight connectors, one connected chart', (variant) => {
    SEEDS.forEach((seed) => DENSITIES.forEach((density) => [8, 17, 24, 31, 48].forEach((nB) => {
      const { displayA, displayB } = generateTrialPair(seed, seed + 1, {
        cue: VARIANT_CUE[variant], density, nB, variant,
      });
      [displayA, displayB].forEach((d) => {
        expect(checkInvariants(d)).toEqual([]);
        expect(onLattice(d)).toBe(true);
        expect(connected(d)).toBe(true);
        const nodes = byId(d);
        d.edges.forEach((e) => expect(aligned(nodes.get(e.source)!, nodes.get(e.target)!)).toBe(true));
      });
      expect(displayA.n).toBe(C.NTOTAL);
      expect(displayA.meta.jitter).toBe(0);
      expect(displayB.n).toBe(nB);
    })));
  });

  test('stimulus A passes on the first seed, so the retry loop does not skew it', () => {
    SEEDS.forEach((seed) => {
      const { displayA } = generateTrialPair(seed, seed + 1, {
        cue: 'proximity', density: 'sparse', nB: 24, variant: 'flow',
      });
      expect(displayA.attempts).toBe(1);
    });
  });

  test('flow leaves an empty lattice line between clusters; flow-shade does not and shades each cluster', () => {
    SEEDS.forEach((seed) => {
      const flow = generateTrialPair(seed, seed + 1, {
        cue: 'proximity', density: 'sparse', nB: 24, variant: 'flow',
      }).displayA;
      const shade = generateTrialPair(seed, seed + 1, {
        cue: 'rect', density: 'sparse', nB: 24, variant: 'flow-shade',
      }).displayA;
      const columns = (d: Display) => new Set(d.nodes.map((n) => n.x.toFixed(1))).size;
      const span = (d: Display) => Math.round((Math.max(...d.nodes.map((n) => n.x)) - Math.min(...d.nodes.map((n) => n.x))) / FLOW_PITCH);
      expect(columns(flow)).toBe(6);
      expect(span(flow)).toBe(7);
      expect(span(shade)).toBe(5);
      expect(flow.clusters.every((c) => c.rect === undefined)).toBe(true);
      expect(shade.clusters.every((c) => c.rect !== undefined)).toBe(true);
    });
  });

  test('B stays on the grid cells and attention pairs build', () => {
    const cells = flowCells();
    expect(cells.length).toBe(C.FLOW_GRID.cols * C.FLOW_GRID.rows);
    const { displayB } = generateTrialPair(9, 10, {
      cue: 'proximity', density: 'sparse', nB: 40, variant: 'flow',
    });
    displayB.nodes.forEach((n) => expect(cells.some((c) => Math.abs(c.x - n.x) < 1e-6 && Math.abs(c.y - n.y) < 1e-6)).toBe(true));
    SEEDS.forEach((seed) => {
      const pair = generateAttentionPair(seed, seed + 1, {
        cue: 'proximity', density: 'sparse', few: 5, many: 30, variant: 'flow',
      });
      expect(pair.displayA.n).toBe(5);
      expect(pair.displayB.n).toBe(30);
    });
  });

  test('gridPath only steps between neighbouring clusters', () => {
    const rng = mulberry32(3);
    for (let i = 0; i < 50; i += 1) {
      const path = gridPath(rng, 6);
      expect([...path].sort()).toEqual([0, 1, 2, 3, 4, 5]);
      path.slice(1).forEach((b, k) => {
        const a = path[k];
        expect(Math.abs(a - b) === 3 || (Math.floor(a / 3) === Math.floor(b / 3) && Math.abs(a - b) === 1)).toBe(true);
      });
    }
  });
});
