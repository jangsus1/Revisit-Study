import { describe, expect, test } from 'vitest';
import { GENERATOR_CONFIG as C } from '../config';
import { CUE_PADDING, applyCue } from '../cues';
import { generateDisplay } from '../generator';
import { makePalette } from '../palette';
import { mulberry32 } from '../prng';
import { Display } from '../types';

const seeds = [1, 2, 3, 4, 5, 6, 7, 8];

function displays(cue: Display['cue'], hueOffset = 0) {
  return seeds.map((seed) => generateDisplay(seed, {
    kind: 'A', cue, density: 'sparse', hueOffset,
  }));
}

describe('cue: proximity', () => {
  test('leaves grey circles, solid links and no outlines', () => {
    displays('proximity').forEach((d) => {
      expect(d.nodes.every((n) => n.fill === C.DOT_FILL)).toBe(true);
      expect(d.nodes.every((n) => n.shape === 'circle')).toBe(true);
      expect(d.edges.every((e) => !e.dashed)).toBe(true);
      expect(d.clusters.every((c) => !c.rect)).toBe(true);
      expect(d.meta.layout).toBe('grouped');
    });
  });

  test('applyCue itself changes nothing', () => {
    const d = generateDisplay(4, { kind: 'A', cue: 'proximity', density: 'dense' });
    const copy = JSON.parse(JSON.stringify(d)) as Display;
    expect(applyCue(copy, 'proximity', mulberry32(1), makePalette(0))).toEqual(d);
  });
});

describe('every other cue uses the even layout', () => {
  test.each(['rect', 'color', 'shape', 'edge'] as const)('%s', (cue) => {
    displays(cue).forEach((d) => expect(d.meta.layout).toBe('even'));
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
    });
  });

  test('rectangles of neighbouring clusters do not overlap on the even layout', () => {
    displays('rect').forEach((d) => {
      const rects = d.clusters.map((c) => c.rect as { x: number, y: number, w: number, h: number });
      for (let i = 0; i < rects.length; i += 1) {
        for (let j = i + 1; j < rects.length; j += 1) {
          const a = rects[i];
          const b = rects[j];
          const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
          expect(overlap).toBe(false);
        }
      }
    });
  });
});

describe('cue: color', () => {
  test('assigns a permutation of the participant palette, one colour per cluster', () => {
    const palette = makePalette(0);
    const seen = new Set<string>();
    displays('color').forEach((d) => {
      const byCluster = new Map<number, string>();
      d.nodes.forEach((n) => {
        const previous = byCluster.get(n.cluster);
        if (previous) expect(n.fill).toBe(previous);
        byCluster.set(n.cluster, n.fill);
        expect(palette).toContain(n.fill);
      });
      expect(new Set(byCluster.values()).size).toBe(C.NCLUST);
      byCluster.forEach((fill) => seen.add(fill));
    });
    expect(seen.size).toBe(palette.length);
  });

  test('uses the rotated palette when a hue offset is given', () => {
    const rotated = makePalette(37);
    displays('color', 37).forEach((d) => {
      d.nodes.forEach((n) => expect(rotated).toContain(n.fill));
    });
    // the rotation does not move a single dot
    expect(displays('color', 37).map((d) => d.nodes.map((n) => [n.x, n.y])))
      .toEqual(displays('color', 0).map((d) => d.nodes.map((n) => [n.x, n.y])));
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
  test('gives every cluster its own one of the six marks, one mark per cluster', () => {
    const seen = new Set<string>();
    displays('shape').forEach((d) => {
      const byCluster = new Map<number, Set<string>>();
      d.nodes.forEach((n) => {
        if (!byCluster.has(n.cluster)) byCluster.set(n.cluster, new Set());
        (byCluster.get(n.cluster) as Set<string>).add(n.shape);
      });
      byCluster.forEach((shapes) => expect(shapes.size).toBe(1));
      const perCluster = [...byCluster.values()].map((shapes) => [...shapes][0]);
      expect([...perCluster].sort()).toEqual([...C.SHAPES].sort());
      seen.add(perCluster.join());
    });
    // the assignment is a seeded permutation, not a fixed one
    expect(seen.size).toBeGreaterThan(1);
  });
});
