import { describe, expect, test } from 'vitest';
import { GraphCluster, buildGraph, greedyOrder } from '../graph';
import { generateDisplay } from '../generator';
import { mulberry32 } from '../prng';
import { Display } from '../types';

function grid(): GraphCluster[] {
  // three clusters in a row, three below: the greedy chain must snake through them
  return [0, 1, 2, 3, 4, 5].map((i) => {
    const cx = 100 + 100 * (i % 3);
    const cy = 100 + 100 * Math.floor(i / 3);
    return {
      index: i,
      nodeIds: [i * 3, i * 3 + 1, i * 3 + 2],
      positions: [{ x: cx, y: cy }, { x: cx + 10, y: cy }, { x: cx, y: cy + 10 }],
      cx,
      cy,
    };
  });
}

/** Depth-first check that the undirected edge set spans every node of the cluster. */
function isConnected(nodeIds: number[], edges: { source: number, target: number }[]): boolean {
  const ids = new Set(nodeIds);
  const adjacency = new Map<number, number[]>(nodeIds.map((id) => [id, []]));
  edges.forEach(({ source, target }) => {
    if (ids.has(source) && ids.has(target)) {
      adjacency.get(source)?.push(target);
      adjacency.get(target)?.push(source);
    }
  });
  const stack = [nodeIds[0]];
  const seen = new Set(stack);
  while (stack.length > 0) {
    const id = stack.pop() as number;
    (adjacency.get(id) ?? []).forEach((next) => {
      if (!seen.has(next)) {
        seen.add(next);
        stack.push(next);
      }
    });
  }
  return seen.size === nodeIds.length;
}

function ranksOf(display: Display): Map<number, number> {
  return new Map(display.nodes.map((n) => [n.id, n.rank]));
}

describe('greedyOrder', () => {
  test('starts at the top-left cluster and visits every cluster once', () => {
    const order = greedyOrder(grid());
    expect(order[0]).toBe(0);
    expect([...order].sort()).toEqual([0, 1, 2, 3, 4, 5]);
  });

  test('each step moves to the nearest unvisited cluster', () => {
    const clusters = grid();
    const order = greedyOrder(clusters);
    for (let i = 1; i < order.length; i += 1) {
      const prev = clusters[order[i - 1]];
      const chosen = clusters[order[i]];
      const chosenD = Math.hypot(prev.cx - chosen.cx, prev.cy - chosen.cy);
      order.slice(i).forEach((j) => {
        const other = clusters[j];
        expect(Math.hypot(prev.cx - other.cx, prev.cy - other.cy)).toBeGreaterThanOrEqual(chosenD - 1e-9);
      });
    }
  });
});

describe('buildGraph', () => {
  test('sparse: one spanning tree per cluster plus a five-link backbone', () => {
    const clusters = grid();
    const { edges, order } = buildGraph(mulberry32(4), clusters, 'sparse');
    expect(order).toHaveLength(6);
    expect(edges.filter((e) => e.kind === 'within')).toHaveLength(6 * 2);
    expect(edges.filter((e) => e.kind === 'between')).toHaveLength(5);
    expect(edges.every((e) => !e.extra)).toBe(true);
  });

  test('dense adds within-cluster extras and up to three skip links', () => {
    const clusters = grid();
    const sparse = buildGraph(mulberry32(4), clusters, 'sparse');
    const dense = buildGraph(mulberry32(4), clusters, 'dense');
    expect(dense.edges.length).toBeGreaterThan(sparse.edges.length);
    const extras = dense.edges.filter((e) => e.extra);
    expect(extras.length).toBeGreaterThan(0);
    expect(dense.edges.filter((e) => e.kind === 'between' && e.extra).length).toBeLessThanOrEqual(3);
  });
});

describe('the graph of a generated display', () => {
  const seeds = [1, 2, 3, 5, 8, 13, 21, 34, 55, 89];

  test('every cluster tree is connected and acyclic, and every arrow runs low rank -> high rank', () => {
    (['sparse', 'dense'] as const).forEach((density) => {
      seeds.forEach((seed) => {
        const display = generateDisplay(seed, { kind: 'A', cue: 'none', density });
        const rank = ranksOf(display);
        display.edges.forEach((edge) => {
          const s = display.nodes.find((n) => n.id === edge.source);
          const t = display.nodes.find((n) => n.id === edge.target);
          if (s && t && s.cluster === t.cluster) {
            // within one cluster the rank order is total, so no arrow can be backward
            expect(rank.get(edge.source)).toBeLessThan(rank.get(edge.target) as number);
          }
        });
        display.clusters.forEach((cluster) => {
          const tree = display.edges.filter((e) => !e.extra && e.kind === 'within'
            && cluster.nodeIds.includes(e.source) && cluster.nodeIds.includes(e.target));
          expect(tree).toHaveLength(cluster.nodeIds.length - 1);
          expect(isConnected(cluster.nodeIds, tree)).toBe(true);
        });
      });
    });
  });

  test('the whole display is acyclic', () => {
    seeds.forEach((seed) => {
      const display = generateDisplay(seed, { kind: 'A', cue: 'none', density: 'dense' });
      const indegree = new Map(display.nodes.map((n) => [n.id, 0]));
      display.edges.forEach((e) => indegree.set(e.target, (indegree.get(e.target) ?? 0) + 1));
      const queue = display.nodes.filter((n) => indegree.get(n.id) === 0).map((n) => n.id);
      let removed = 0;
      while (queue.length > 0) {
        const id = queue.pop() as number;
        removed += 1;
        display.edges.filter((e) => e.source === id).forEach((e) => {
          const left = (indegree.get(e.target) ?? 0) - 1;
          indegree.set(e.target, left);
          if (left === 0) queue.push(e.target);
        });
      }
      expect(removed).toBe(display.nodes.length);
    });
  });

  test('sparse: each backbone link leaves a sink of its cluster and enters a source of the next', () => {
    seeds.forEach((seed) => {
      const display = generateDisplay(seed, { kind: 'A', cue: 'none', density: 'sparse' });
      const within = display.edges.filter((e) => e.kind === 'within');
      const between = display.edges.filter((e) => e.kind === 'between');
      expect(between).toHaveLength(5);
      const clusterOf = new Map(display.nodes.map((n) => [n.id, n.cluster]));
      between.forEach((edge) => {
        expect(within.some((e) => e.source === edge.source)).toBe(false); // source is a sink
        expect(within.some((e) => e.target === edge.target)).toBe(false); // target is a source
        const from = display.clusters.find((c) => c.index === clusterOf.get(edge.source));
        const to = display.clusters.find((c) => c.index === clusterOf.get(edge.target));
        expect(to?.orderPos).toBe((from?.orderPos as number) + 1);
      });
    });
  });
});
