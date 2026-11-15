import { describe, expect, test } from 'vitest';
import { GENERATOR_CONFIG as C } from '../config';
import {
  boxBounds, drawFlowGraph, drawGroupSizes, layoutFlow, routeOf,
} from '../flowDagre';
import { generateAttentionPair, generateTrialPair } from '../generator';
import { checkInvariants } from '../invariants';
import { mulberry32 } from '../prng';
import { Density, Display } from '../types';

const D = C.FLOW_DAGRE;
// dagre takes tens of ms per chart, so the sets are small and the tests get a longer limit
const SEEDS = Array.from({ length: 8 }, (_, i) => 300 + i * 17);
const SLOW = 120000;
const DENSITIES: Density[] = ['sparse', 'dense'];
const pair = (variant: 'flow-dagre' | 'flow-dagre-shade', seed: number, nB: number, density: Density = 'sparse') => generateTrialPair(seed, seed + 1, {
  cue: variant === 'flow-dagre' ? 'proximity' : 'rect', density, nB, variant,
});
const area = (d: Display) => {
  const b = boxBounds(d.nodes);
  return b.w * b.h;
};

describe('dagre flowcharts', () => {
  test('group sizes stay within 3 to 6 and sum to n', () => {
    const rng = mulberry32(5);
    for (let n = 8; n <= 48; n += 1) {
      const sizes = drawGroupSizes(rng, n);
      expect(sizes.reduce((a, b) => a + b, 0)).toBe(n);
      sizes.forEach((s) => {
        expect(s).toBeGreaterThanOrEqual(D.groupSize.min);
        expect(s).toBeLessThanOrEqual(D.groupSize.max);
      });
    }
  }, SLOW);

  test('the flow is one connected DAG no deeper than maxDepth, a tree when sparse', () => {
    SEEDS.forEach((seed) => DENSITIES.forEach((density) => {
      const rng = mulberry32(seed);
      const graph = drawFlowGraph(rng, drawGroupSizes(rng, 24), density);
      const depth = new Array<number>(24).fill(0);
      // links are listed parent first, so one pass gives the longest path to every box
      [...graph.links].sort((a, b) => a[1] - b[1]).forEach(([s, t]) => { depth[t] = Math.max(depth[t], depth[s] + 1); });
      expect(Math.max(...depth)).toBeLessThanOrEqual(D.maxDepth);
      if (density === 'sparse') expect(graph.links.length).toBe(23);
      const seen = new Set([0]);
      graph.links.forEach(([s, t]) => { if (seen.has(s)) seen.add(t); });
      expect(seen.size).toBe(24);
    }));
  }, SLOW);

  test('with clusters every group is a block no other group reaches into', () => {
    SEEDS.forEach((seed) => {
      const rng = mulberry32(seed);
      const graph = drawFlowGraph(rng, drawGroupSizes(rng, 24), 'sparse');
      const { pts } = layoutFlow(graph, true);
      const groups = [...new Set(graph.group)];
      groups.forEach((k) => {
        const b = boxBounds(pts.filter((_, id) => graph.group[id] === k));
        pts.forEach((p, id) => {
          if (graph.group[id] === k) return;
          const inside = p.x > b.x && p.x < b.x + b.w && p.y > b.y && p.y < b.y + b.h;
          expect(inside).toBe(false);
        });
      });
    });
  }, SLOW);

  test('a route runs straight down through the rows it passes', () => {
    const half = D.box.height / 2 + C.FLOW_LINK_GAP;
    const route = routeOf({ x: 0, y: 0 }, { x: 100, y: 200 }, [{ x: 40, y: 20 }, { x: 60, y: 100 }], [0, 100, 200]);
    expect(route).toEqual([
      { x: 0, y: half }, { x: 60, y: 100 - half }, { x: 60, y: 100 + half }, { x: 100, y: 200 - half },
    ]);
  }, SLOW);

  test.each(['flow-dagre', 'flow-dagre-shade'] as const)('%s builds valid pairs across the staircase range', (variant) => {
    SEEDS.forEach((seed) => DENSITIES.forEach((density) => [8, 17, 24, 31, 40].forEach((nB) => {
      const { displayA, displayB } = pair(variant, seed, nB, density);
      expect(checkInvariants(displayA)).toEqual([]);
      expect(checkInvariants(displayB)).toEqual([]);
      expect(displayA.n).toBe(24);
      expect(displayA.clusters).toHaveLength(6);
      expect(displayB.n).toBe(nB);
      expect(displayB.clusters).toHaveLength(0);
      [displayA, displayB].forEach((d) => d.edges.forEach((e) => expect(e.points?.length).toBeGreaterThanOrEqual(2)));
    })));
  }, SLOW);

  test('the two variants share A\'s layout and B; only the shading differs', () => {
    SEEDS.forEach((seed) => {
      const plain = pair('flow-dagre', seed, 24);
      const shade = pair('flow-dagre-shade', seed, 24);
      expect(shade.displayA.nodes.map((n) => [n.x, n.y])).toEqual(plain.displayA.nodes.map((n) => [n.x, n.y]));
      expect(shade.displayA.edges).toEqual(plain.displayA.edges);
      expect(shade.displayB.nodes.map((n) => [n.x, n.y])).toEqual(plain.displayB.nodes.map((n) => [n.x, n.y]));
      expect(plain.displayA.clusters.every((c) => c.rect === undefined)).toBe(true);
      expect(shade.displayA.clusters.every((c) => c.rect !== undefined)).toBe(true);
    });
  }, SLOW);

  test('B covers about A\'s area at 24 boxes and less or more with fewer or more', () => {
    const mean = (nB: number) => SEEDS.map((seed) => {
      const { displayA, displayB } = pair('flow-dagre', seed, nB);
      return area(displayB) / area(displayA);
    }).reduce((a, b) => a + b, 0) / SEEDS.length;
    expect(mean(24)).toBeGreaterThan(0.8);
    expect(mean(24)).toBeLessThan(1.2);
    expect(mean(17)).toBeLessThan(mean(24));
    expect(mean(31)).toBeGreaterThan(mean(24));
  }, SLOW);

  test('attention pairs are two unclustered charts', () => {
    SEEDS.slice(0, 8).forEach((seed) => {
      const { displayA, displayB } = generateAttentionPair(seed, seed + 1, {
        cue: 'proximity', density: 'sparse', few: 5, many: 30, variant: 'flow-dagre',
      });
      expect(displayA.n).toBe(5);
      expect(displayB.n).toBe(30);
      expect(checkInvariants(displayA)).toEqual([]);
      expect(checkInvariants(displayB)).toEqual([]);
    });
  }, SLOW);
});
