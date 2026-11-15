import { describe, expect, test } from 'vitest';
import { GENERATOR_CONFIG as C } from '../config';
import {
  boxBounds, drawFlowGraph, drawGroupSizes, layoutFlow, moveApart, routeOf,
} from '../flowDagre';
import { generateAttentionPair, generateTrialPair } from '../generator';
import { checkInvariants } from '../invariants';
import { mulberry32 } from '../prng';
import { Density, Display, VARIANT_CUE } from '../types';

const D = C.FLOW_DAGRE;
// dagre takes tens of ms per chart, so the sets are small and the tests get a longer limit
const SEEDS = Array.from({ length: 8 }, (_, i) => 300 + i * 17);
const SLOW = 120000;
const DENSITIES: Density[] = ['sparse', 'dense'];
const DAGRE = ['flow-dagre-highlight', 'flow-dagre-apart', 'flow-dagre-both'] as const;
type DagreVariant = typeof DAGRE[number];
const pair = (variant: DagreVariant, seed: number, nB: number, density: Density = 'sparse') => generateTrialPair(seed, seed + 1, {
  cue: VARIANT_CUE[variant], density, nB, variant,
});
const xy = (d: Display) => d.nodes.map((n) => [n.x, n.y]);
const links = (d: Display) => d.edges.map((e) => [e.source, e.target]);
/** Box centres relative to the first box, so a chart can be compared whatever its place on the canvas. */
const shape = (pts: { x: number; y: number }[]) => pts.map((p) => [Math.round((p.x - pts[0].x) * 100) / 100, Math.round((p.y - pts[0].y) * 100) / 100]);

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
  });

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

  test('a route runs straight down through the rows it passes', () => {
    const half = D.box.height / 2 + C.FLOW_LINK_GAP;
    const route = routeOf({ x: 0, y: 0 }, { x: 100, y: 200 }, [{ x: 40, y: 20 }, { x: 60, y: 100 }], [0, 100, 200]);
    expect(route).toEqual([
      { x: 0, y: half }, { x: 60, y: 100 - half }, { x: 60, y: 100 + half }, { x: 100, y: 200 - half },
    ]);
  });

  test('moving apart keeps every group\'s shape and only pushes the groups away from each other', () => {
    SEEDS.forEach((seed) => {
      const rng = mulberry32(seed);
      const graph = drawFlowGraph(rng, drawGroupSizes(rng, 24), 'sparse');
      const base = layoutFlow(graph);
      const moved = moveApart(graph, base);
      if (!moved) return;
      const groups = [...new Set(graph.group)];
      const members = (pts: { x: number; y: number }[], k: number) => pts.filter((_, id) => graph.group[id] === k);
      const centroid = (pts: { x: number; y: number }[]) => ({
        x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length,
      });
      groups.forEach((k) => expect(shape(members(moved.pts, k))).toEqual(shape(members(base.pts, k))));
      groups.forEach((a) => groups.forEach((b) => {
        if (a >= b) return;
        const [ca, cb] = [centroid(members(base.pts, a)), centroid(members(base.pts, b))];
        const [ma, mb] = [centroid(members(moved.pts, a)), centroid(members(moved.pts, b))];
        expect(mb.x - ma.x).toBeCloseTo((cb.x - ca.x) * D.apart.x, 6);
        expect(mb.y - ma.y).toBeCloseTo((cb.y - ca.y) * D.apart.y, 6);
      }));
    });
  }, SLOW);

  test.each(DAGRE)('%s builds valid pairs across the staircase range', (variant) => {
    SEEDS.forEach((seed) => DENSITIES.forEach((density) => [8, 17, 24, 31, 40].forEach((nB) => {
      const { displayA, displayB } = pair(variant, seed, nB, density);
      expect(checkInvariants(displayA)).toEqual([]);
      expect(checkInvariants(displayB)).toEqual([]);
      expect(displayA.n).toBe(24);
      expect(displayA.clusters).toHaveLength(6);
      expect(displayB.n).toBe(nB);
      [displayA, displayB].forEach((d) => d.edges.forEach((e) => expect(e.points?.length).toBeGreaterThanOrEqual(2)));
    })));
  }, SLOW);

  test('B is the plain baseline in every variant: no groups, no shading, the same chart', () => {
    SEEDS.forEach((seed) => {
      const bs = DAGRE.map((variant) => pair(variant, seed, 28).displayB);
      bs.forEach((b) => {
        expect(b.clusters).toHaveLength(0);
        expect(b.background).toBe(C.BACKGROUND);
        expect(xy(b)).toEqual(xy(bs[0]));
        expect(links(b)).toEqual(links(bs[0]));
      });
      // and it is exactly dagre's layout of its own graph
      const rng = mulberry32(seed + 1);
      const graph = drawFlowGraph(rng, drawGroupSizes(rng, 28), 'sparse');
      expect(shape(bs[0].nodes)).toEqual(shape(layoutFlow(graph).pts));
    });
  }, SLOW);

  test('highlight only: A is the baseline layout of its graph, with a region per group', () => {
    const inside = (poly: { x: number; y: number }[], x: number, y: number) => {
      const xs = poly.map((q) => q.x);
      const ys = poly.map((q) => q.y);
      return x > Math.min(...xs) && x < Math.max(...xs) && y > Math.min(...ys) && y < Math.max(...ys);
    };
    SEEDS.forEach((seed) => {
      const { displayA } = pair('flow-dagre-highlight', seed, 24);
      if (displayA.attempts === 1) {
        const rng = mulberry32(seed);
        const graph = drawFlowGraph(rng, drawGroupSizes(rng, 24), 'sparse');
        expect(shape(displayA.nodes)).toEqual(shape(layoutFlow(graph).pts));
      }
      displayA.clusters.forEach((cluster) => {
        const shade = cluster.shade!;
        // one rectangle per box, and one strip or line per link inside the group
        const inner = displayA.edges.filter((e) => cluster.nodeIds.includes(e.source) && cluster.nodeIds.includes(e.target)).length;
        expect(shade.polygons.length + shade.lines.length).toBe(cluster.nodeIds.length + inner);
        // the box rectangles (listed first) hold their own box and no box of another group
        shade.polygons.slice(0, cluster.nodeIds.length).forEach((poly) => {
          const held = displayA.nodes.filter((n) => inside(poly, n.x, n.y));
          expect(held).toHaveLength(1);
          expect(held[0].cluster).toBe(cluster.index);
        });
      });
    });
  }, SLOW);

  test('apart and both share one layout; only the shading differs, and neither shades in apart', () => {
    SEEDS.forEach((seed) => {
      const apart = pair('flow-dagre-apart', seed, 24).displayA;
      const both = pair('flow-dagre-both', seed, 24).displayA;
      expect(xy(both)).toEqual(xy(apart));
      expect(both.edges).toEqual(apart.edges);
      expect(apart.clusters.every((c) => c.shade === undefined)).toBe(true);
      expect(both.clusters.every((c) => c.shade !== undefined)).toBe(true);
      // the same graph as the highlight variant when all three took the first seed
      const highlight = pair('flow-dagre-highlight', seed, 24).displayA;
      if (apart.attempts === 1 && highlight.attempts === 1) {
        expect(links(apart)).toEqual(links(highlight));
        const area = (d: Display) => {
          const b = boxBounds(d.nodes);
          return b.w * b.h;
        };
        expect(area(apart)).toBeGreaterThan(area(highlight));
      }
    });
  }, SLOW);

  test('attention pairs are two baseline charts', () => {
    SEEDS.forEach((seed) => {
      const { displayA, displayB } = generateAttentionPair(seed, seed + 1, {
        cue: 'proximity', density: 'sparse', few: 5, many: 30, variant: 'flow-dagre-apart',
      });
      expect(displayA.n).toBe(5);
      expect(displayB.n).toBe(30);
      expect(checkInvariants(displayA)).toEqual([]);
      expect(checkInvariants(displayB)).toEqual([]);
    });
  }, SLOW);
});
