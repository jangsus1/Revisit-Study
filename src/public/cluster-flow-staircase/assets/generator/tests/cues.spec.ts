import { polygonContains } from 'd3';
import { describe, expect, test } from 'vitest';
import { GENERATOR_CONFIG as C } from '../config';
import { CUE_PADDING } from '../cues';
import { generateDisplay } from '../generator';
import { Display } from '../types';

const seeds = [1, 2, 3, 4, 5, 6, 7, 8];

function displays(cue: Display['cue']) {
  return seeds.map((seed) => generateDisplay(seed, { kind: 'A', cue, density: 'sparse' }));
}

describe('cue: none', () => {
  test('leaves grey circles and solid links', () => {
    displays('none').forEach((d) => {
      expect(d.nodes.every((n) => n.fill === C.DOT_FILL)).toBe(true);
      expect(d.nodes.every((n) => n.shape === 'circle')).toBe(true);
      expect(d.edges.every((e) => !e.dashed)).toBe(true);
      expect(d.clusters.every((c) => !c.hull && !c.rect)).toBe(true);
    });
  });
});

describe('cue: hull', () => {
  test('every cluster gets a padded hull that contains all of its dots', () => {
    displays('hull').forEach((d) => {
      expect(d.clusters.every((c) => (c.hull?.length ?? 0) >= 3)).toBe(true);
      d.clusters.forEach((cluster) => {
        const hull = cluster.hull as [number, number][];
        cluster.nodeIds.forEach((id) => {
          const node = d.nodes.find((n) => n.id === id) as Display['nodes'][number];
          expect(polygonContains(hull, [node.x, node.y])).toBe(true);
        });
      });
      expect(d.clusters.every((c) => !c.rect)).toBe(true);
    });
  });

  test('the hull keeps at least the cue padding away from the outermost dots', () => {
    const d = generateDisplay(3, { kind: 'A', cue: 'hull', density: 'sparse' });
    d.clusters.forEach((cluster) => {
      const pts = d.nodes.filter((n) => cluster.nodeIds.includes(n.id));
      const hull = cluster.hull as [number, number][];
      const minX = Math.min(...pts.map((p) => p.x));
      expect(Math.min(...hull.map(([x]) => x))).toBeLessThanOrEqual(minX - CUE_PADDING + 1e-6);
    });
  });
});

describe('cue: rect', () => {
  test('every cluster gets the padded bounding rectangle of its dots', () => {
    displays('rect').forEach((d) => {
      d.clusters.forEach((cluster) => {
        const pts = d.nodes.filter((n) => cluster.nodeIds.includes(n.id));
        const rect = cluster.rect as { x: number, y: number, w: number, h: number };
        expect(rect.x).toBeCloseTo(Math.min(...pts.map((p) => p.x)) - CUE_PADDING, 6);
        expect(rect.y).toBeCloseTo(Math.min(...pts.map((p) => p.y)) - CUE_PADDING, 6);
        expect(rect.x + rect.w).toBeCloseTo(Math.max(...pts.map((p) => p.x)) + CUE_PADDING, 6);
        expect(rect.y + rect.h).toBeCloseTo(Math.max(...pts.map((p) => p.y)) + CUE_PADDING, 6);
      });
      expect(d.clusters.every((c) => !c.hull)).toBe(true);
    });
  });
});

describe('cue: color', () => {
  test('assigns a permutation of the palette, one colour per cluster', () => {
    const seen = new Set<string>();
    displays('color').forEach((d) => {
      const byCluster = new Map<number, string>();
      d.nodes.forEach((n) => {
        const previous = byCluster.get(n.cluster);
        if (previous) expect(n.fill).toBe(previous);
        byCluster.set(n.cluster, n.fill);
        expect(C.COLOR_PALETTE).toContain(n.fill);
      });
      expect(new Set(byCluster.values()).size).toBe(C.NCLUST);
      byCluster.forEach((fill) => seen.add(fill));
    });
    // over several seeds the permutation moves colours around
    expect(seen.size).toBe(C.COLOR_PALETTE.length);
  });
});

describe('cue: edge', () => {
  test('dashes exactly the between-cluster links', () => {
    (['sparse', 'dense'] as const).forEach((density) => {
      seeds.forEach((seed) => {
        const d = generateDisplay(seed, { kind: 'A', cue: 'edge', density });
        d.edges.forEach((e) => expect(e.dashed).toBe(e.kind === 'between'));
        expect(d.edges.some((e) => e.dashed)).toBe(true);
      });
    });
  });
});

describe('cue: shape', () => {
  test('uses three shapes, two clusters each, and never repeats along the traversal order', () => {
    displays('shape').forEach((d) => {
      const byCluster = new Map<number, string>();
      d.nodes.forEach((n) => byCluster.set(n.cluster, n.shape));
      const counts = new Map<string, number>();
      byCluster.forEach((shape) => counts.set(shape, (counts.get(shape) ?? 0) + 1));
      expect([...counts.values()].sort()).toEqual([2, 2, 2]);
      expect([...counts.keys()].sort()).toEqual([...C.SHAPES].sort());

      const inOrder = [...d.clusters]
        .sort((a, b) => a.orderPos - b.orderPos)
        .map((c) => byCluster.get(c.index));
      for (let i = 1; i < inOrder.length; i += 1) {
        expect(inOrder[i]).not.toBe(inOrder[i - 1]);
      }
    });
  });
});
