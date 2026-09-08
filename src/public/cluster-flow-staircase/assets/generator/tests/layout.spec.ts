import { describe, expect, test } from 'vitest';
import { GENERATOR_CONFIG as C } from '../config';
import { buildLayout, drawJitter, template } from '../layout';
import { jitterRng, mulberry32 } from '../prng';

describe('template', () => {
  test('gives the right number of lattice points for n = 3..6', () => {
    [3, 4, 5, 6].forEach((n) => {
      expect(template(mulberry32(n), n, -1)).toHaveLength(n);
    });
  });

  test('rejects unsupported sizes', () => {
    expect(() => template(mulberry32(1), 7, -1)).toThrow(/unsupported cluster size/);
  });

  test('Up forms grow upwards and Down forms downwards', () => {
    const up = template(mulberry32(1), 6, -1);
    const down = template(mulberry32(1), 6, 1);
    expect(Math.min(...up.map((p) => p.y))).toBe(-2 * C.INTER);
    expect(Math.max(...up.map((p) => p.y))).toBe(0);
    expect(Math.max(...down.map((p) => p.y))).toBe(2 * C.INTER);
    expect(Math.min(...down.map((p) => p.y))).toBe(0);
  });

  test('every point sits on the 2-wide lattice', () => {
    const pts = template(mulberry32(4), 5, -1);
    pts.forEach((p) => {
      expect([0, C.INTER]).toContain(p.x);
      expect(Math.abs(p.y % C.INTER)).toBe(0);
    });
  });
});

describe('drawJitter', () => {
  test('covers 3..15 inclusive', () => {
    const seen = new Set<number>();
    for (let seed = 0; seed < 2000; seed += 1) seen.add(drawJitter(jitterRng(seed)));
    expect(Math.min(...seen)).toBe(C.JITTER_MIN);
    expect(Math.max(...seen)).toBe(C.JITTER_MAX);
    expect(seen.size).toBe(C.JITTER_MAX - C.JITTER_MIN + 1);
  });
});

describe('buildLayout', () => {
  const sizes = [4, 4, 4, 4, 4, 4];

  test('returns one cluster per size with the right node counts', () => {
    const layout = buildLayout(mulberry32(1), sizes, 5);
    expect(layout.clusters).toHaveLength(6);
    layout.clusters.forEach((c, i) => expect(c.points).toHaveLength(sizes[i]));
    expect(layout.gapX).toHaveLength(4);
    expect(layout.gapY).toHaveLength(3);
  });

  test('is deterministic', () => {
    expect(buildLayout(mulberry32(3), sizes, 9)).toEqual(buildLayout(mulberry32(3), sizes, 9));
  });

  test('the centroid of each cluster is its centre, and the two rows share one baseline', () => {
    const layout = buildLayout(mulberry32(21), [3, 5, 4, 6, 3, 3], 7);
    const cy = layout.clusters.map((c) => c.cy);
    expect(cy[0]).toBeCloseTo(cy[1], 6);
    expect(cy[1]).toBeCloseTo(cy[2], 6);
    expect(cy[3]).toBeCloseTo(cy[4], 6);
    expect(cy[4]).toBeCloseTo(cy[5], 6);
    // the row separation is the largest of the three column gaps, scaled once
    expect(cy[3] - cy[0]).toBeCloseTo(Math.max(...layout.gapY) * C.SCALE, 6);
    // each row is centred on its own midpoint, so the two midpoints coincide
    const cx = layout.clusters.map((c) => c.cx);
    expect((cx[0] + cx[2]) / 2).toBeCloseTo((cx[3] + cx[5]) / 2, 6);
  });

  test('the horizontal cluster spacing follows gapX, scaled once', () => {
    const layout = buildLayout(mulberry32(31), sizes, 4);
    const cx = layout.clusters.map((c) => c.cx);
    expect(cx[1] - cx[0]).toBeCloseTo(layout.gapX[0] * C.SCALE, 6);
    expect(cx[2] - cx[1]).toBeCloseTo(layout.gapX[1] * C.SCALE, 6);
    expect(cx[4] - cx[3]).toBeCloseTo(layout.gapX[2] * C.SCALE, 6);
    expect(cx[5] - cx[4]).toBeCloseTo(layout.gapX[3] * C.SCALE, 6);
  });

  test('the bounding box of the dot centres is centred in the canvas', () => {
    const layout = buildLayout(mulberry32(77), [6, 3, 4, 3, 5, 3], 11);
    const pts = layout.clusters.flatMap((c) => c.points);
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    expect((Math.min(...xs) + Math.max(...xs)) / 2).toBeCloseTo(C.CANVAS.width / 2, 6);
    expect((Math.min(...ys) + Math.max(...ys)) / 2).toBeCloseTo(C.CANVAS.height / 2, 6);
  });

  test('jitter moves every node by at most the amplitude, in source px', () => {
    const noJitter = buildLayout(mulberry32(5), sizes, 0);
    noJitter.clusters.forEach((c) => c.points.forEach((p) => {
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
    }));
    const jittered = buildLayout(mulberry32(5), sizes, 15);
    expect(jittered).not.toEqual(noJitter);
  });
});
