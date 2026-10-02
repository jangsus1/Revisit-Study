import { describe, expect, test } from 'vitest';
import { GENERATOR_CONFIG as C } from '../config';
import {
  buildLayout, clusterGap, drawJitter, template,
} from '../layout';
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

  test('the top row\'s bottom edges share one line, the bottom row\'s top edges another', () => {
    const layout = buildLayout(mulberry32(21), [3, 5, 4, 6, 3, 3], 7);
    const bottoms = layout.clusters.slice(0, 3).map((c) => Math.max(...c.points.map((p) => p.y)));
    const tops = layout.clusters.slice(3).map((c) => Math.min(...c.points.map((p) => p.y)));
    bottoms.forEach((y) => expect(y).toBeCloseTo(bottoms[0], 6));
    tops.forEach((y) => expect(y).toBeCloseTo(tops[0], 6));
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

describe('buildLayout: grouped and even gaps', () => {
  const sizesList = [[4, 4, 4, 4, 4, 4], [3, 5, 4, 6, 3, 3], [6, 3, 4, 3, 5, 3], [6, 6, 3, 3, 3, 3]];
  const pitch = C.INTER * C.SCALE;
  const xs = (pts: { x: number }[]) => pts.map((p) => p.x);
  const ys = (pts: { y: number }[]) => pts.map((p) => p.y);

  test('defaults to grouped and records the mode', () => {
    expect(buildLayout(mulberry32(1), sizesList[0], 5).mode).toBe('grouped');
    expect(buildLayout(mulberry32(1), sizesList[0], 5, 'even').mode).toBe('even');
  });

  test('uses the same templates and jitter as the grouped layout of the same seed', () => {
    sizesList.forEach((sizes, k) => {
      const grouped = buildLayout(mulberry32(40 + k), sizes, 12, 'grouped');
      const even = buildLayout(mulberry32(40 + k), sizes, 12, 'even');
      grouped.clusters.forEach((cluster, i) => {
        const other = even.clusters[i];
        cluster.points.forEach((p, j) => {
          expect(p.x - cluster.cx).toBeCloseTo(other.points[j].x - other.cx, 6);
          expect(p.y - cluster.cy).toBeCloseTo(other.points[j].y - other.cy, 6);
        });
      });
    });
  });

  test('the gap is one pitch for even and PROXIMITY_GAP pitches for grouped', () => {
    expect(clusterGap('even')).toBe(C.INTER);
    expect(clusterGap('grouped')).toBe(C.PROXIMITY_GAP * C.INTER);
    expect(C.PROXIMITY_GAP).toBeGreaterThanOrEqual(2);
  });

  test.each([['even', 1], ['grouped', C.PROXIMITY_GAP]] as const)('%s: every horizontal edge-to-edge gap is %s pitch(es)', (mode, factor) => {
    sizesList.forEach((sizes, k) => {
      const { clusters } = buildLayout(mulberry32(7 + k), sizes, 15, mode);
      [[0, 1], [1, 2], [3, 4], [4, 5]].forEach(([a, b]) => {
        expect(Math.min(...xs(clusters[b].points)) - Math.max(...xs(clusters[a].points))).toBeCloseTo(factor * pitch, 6);
      });
    });
  });

  test.each([['even', 1], ['grouped', C.PROXIMITY_GAP]] as const)('%s: every vertical gap between the rows is %s pitch(es), column by column', (mode, factor) => {
    sizesList.forEach((sizes, k) => {
      const { clusters } = buildLayout(mulberry32(70 + k), sizes, 15, mode);
      [0, 1, 2].forEach((c) => {
        expect(Math.min(...ys(clusters[c + 3].points)) - Math.max(...ys(clusters[c].points))).toBeCloseTo(factor * pitch, 6);
      });
    });
  });

  test('the widest and tallest grouped layouts fit the canvas margin', () => {
    // two 6-dot columns stacked, maximum jitter: the tallest case; three 2-wide clusters: the widest
    [[6, 3, 3, 6, 3, 3], [5, 5, 5, 3, 3, 3], [4, 4, 4, 4, 4, 4]].forEach((sizes, k) => {
      for (let seed = 0; seed < 50; seed += 1) {
        const pts = buildLayout(mulberry32(1000 * k + seed), sizes, C.JITTER_MAX, 'grouped').clusters.flatMap((c) => c.points);
        const lo = C.CANVAS_MARGIN + C.RDOT * C.SCALE;
        pts.forEach((p) => {
          expect(p.x).toBeGreaterThanOrEqual(lo);
          expect(p.x).toBeLessThanOrEqual(C.CANVAS.width - lo);
          expect(p.y).toBeGreaterThanOrEqual(lo);
          expect(p.y).toBeLessThanOrEqual(C.CANVAS.height - lo);
        });
      }
    });
  });

  test('gapX and gapY record the centroid distances in source px', () => {
    const layout = buildLayout(mulberry32(9), sizesList[1], 10, 'even');
    const cx = layout.clusters.map((c) => c.cx);
    const cy = layout.clusters.map((c) => c.cy);
    expect(cx[1] - cx[0]).toBeCloseTo(layout.gapX[0] * C.SCALE, 6);
    expect(cx[5] - cx[4]).toBeCloseTo(layout.gapX[3] * C.SCALE, 6);
    [0, 1, 2].forEach((c) => expect(cy[c + 3] - cy[c]).toBeCloseTo(layout.gapY[c] * C.SCALE, 6));
  });

  test('is more compact than the grouped layout and centred in the canvas', () => {
    sizesList.forEach((sizes, k) => {
      const grouped = buildLayout(mulberry32(90 + k), sizes, 8, 'grouped');
      const even = buildLayout(mulberry32(90 + k), sizes, 8, 'even');
      const width = (l: typeof even) => {
        const all = xs(l.clusters.flatMap((c) => c.points));
        return Math.max(...all) - Math.min(...all);
      };
      expect(width(even)).toBeLessThan(width(grouped));
      const pts = even.clusters.flatMap((c) => c.points);
      expect((Math.min(...xs(pts)) + Math.max(...xs(pts))) / 2).toBeCloseTo(C.CANVAS.width / 2, 6);
      expect((Math.min(...ys(pts)) + Math.max(...ys(pts))) / 2).toBeCloseTo(C.CANVAS.height / 2, 6);
    });
  });
});
