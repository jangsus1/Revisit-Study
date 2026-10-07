import { describe, expect, test } from 'vitest';
import {
  baselineSpacing, buildBaseline, clipField, denseExtraCount, linkBudget, plannedEdgeCount,
} from '../baseline';
import { GENERATOR_CONFIG as C } from '../config';
import { generateDisplay } from '../generator';
import { DOT_R } from '../geometry';
import { MIN_CENTRE_DISTANCE, checkInvariants } from '../invariants';
import { measureDisplay } from '../metrics';
import { makePalette } from '../palette';
import { Display, Rect } from '../types';

const sizes = [8, 14, 24, 34, 48];
/** A field about the size of an even-layout stimulus A. */
const FIELD: Rect = {
  x: 140, y: 50, w: 440, h: 430,
};

function isConnected(display: Display): boolean {
  const adjacency = new Map<number, number[]>(display.nodes.map((n) => [n.id, []]));
  display.edges.forEach(({ source, target }) => {
    adjacency.get(source)?.push(target);
    adjacency.get(target)?.push(source);
  });
  const stack = [display.nodes[0].id];
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
  return seen.size === display.nodes.length;
}

function minPairDistance(d: Display): number {
  let best = Infinity;
  for (let i = 0; i < d.nodes.length; i += 1) {
    for (let j = i + 1; j < d.nodes.length; j += 1) {
      best = Math.min(best, Math.hypot(d.nodes[i].x - d.nodes[j].x, d.nodes[i].y - d.nodes[j].y));
    }
  }
  return best;
}

describe('denseExtraCount and plannedEdgeCount', () => {
  test('scale B_DENSE_EXTRA_PER_24 with the node count', () => {
    expect(denseExtraCount(24)).toBe(C.B_DENSE_EXTRA_PER_24);
    expect(denseExtraCount(48)).toBe(2 * C.B_DENSE_EXTRA_PER_24);
    expect(denseExtraCount(12)).toBe(Math.round(C.B_DENSE_EXTRA_PER_24 / 2));
    expect(plannedEdgeCount(24, 'sparse')).toBe(23);
    expect(plannedEdgeCount(24, 'dense')).toBe(23 + C.B_DENSE_EXTRA_PER_24);
  });
});

describe('clipField', () => {
  const lo = C.CANVAS_MARGIN + DOT_R;

  test('defaults to the canvas minus the margin', () => {
    expect(clipField()).toEqual({
      x: lo, y: lo, w: C.CANVAS.width - 2 * lo, h: C.CANVAS.height - 2 * lo,
    });
  });

  test('keeps a field that fits and clips one that does not', () => {
    expect(clipField(FIELD)).toEqual(FIELD);
    expect(clipField({
      x: 0, y: 10, w: 2000, h: 100,
    })).toEqual({
      x: lo, y: lo, w: C.CANVAS.width - 2 * lo, h: 110 - lo,
    });
  });
});

describe('baselineSpacing', () => {
  test('follows B_SPACING_FACTOR * sqrt(area / n) between the floor and the cap', () => {
    const area = FIELD.w * FIELD.h;
    const n = 40;
    const expected = C.B_SPACING_FACTOR * Math.sqrt(area / n);
    expect(expected).toBeLessThan(C.B_MAX_SPACING);
    expect(baselineSpacing(n, FIELD)).toBeCloseTo(expected, 9);
  });

  test('is capped at B_MAX_SPACING for few dots', () => {
    expect(baselineSpacing(8, FIELD)).toBe(C.B_MAX_SPACING);
  });

  test('never drops below the invariant floor', () => {
    expect(baselineSpacing(5000, FIELD)).toBe(MIN_CENTRE_DISTANCE);
    expect(baselineSpacing(10, {
      x: 100, y: 100, w: 1, h: 1,
    })).toBe(MIN_CENTRE_DISTANCE);
  });

  test('shrinks as N_B grows', () => {
    const values = [8, 14, 24, 34, 48].map((n) => baselineSpacing(n, FIELD));
    for (let i = 1; i < values.length; i += 1) expect(values[i]).toBeLessThanOrEqual(values[i - 1]);
  });
});

describe('linkBudget', () => {
  test('scales A\'s link length by the link counts', () => {
    expect(linkBudget({ linkLength: 1000, edges: 20 }, 40)).toBeCloseTo(2000, 9);
    expect(linkBudget({ linkLength: 1000, edges: 10 }, 10)).toBeCloseTo(1000, 9);
    expect(linkBudget({ linkLength: 1000, edges: 0 }, 10)).toBe(0);
  });
});

describe('buildBaseline', () => {
  test('places exactly nB ungrouped dots at least the N_B spacing apart', () => {
    sizes.forEach((nB) => {
      const d = buildBaseline(12345 + nB, nB, 'proximity', 'sparse', { field: FIELD }) as Display;
      expect(d).not.toBeNull();
      expect(d.kind).toBe('B');
      expect(d.n).toBe(nB);
      expect(d.nodes).toHaveLength(nB);
      expect(d.clusters).toEqual([]);
      expect(d.nodes.every((n) => n.cluster === -1)).toBe(true);
      expect(d.meta.spacing).toBeCloseTo(baselineSpacing(nB, FIELD), 9);
      expect(minPairDistance(d)).toBeGreaterThanOrEqual(d.meta.spacing as number);
      expect(minPairDistance(d)).toBeGreaterThanOrEqual(MIN_CENTRE_DISTANCE);
    });
  });

  test('keeps every dot centre inside the field', () => {
    sizes.forEach((nB) => {
      const d = buildBaseline(600 + nB, nB, 'color', 'dense', { field: FIELD }) as Display;
      expect(d.meta.field).toEqual(FIELD);
      d.nodes.forEach((n) => {
        expect(n.x).toBeGreaterThanOrEqual(FIELD.x);
        expect(n.x).toBeLessThanOrEqual(FIELD.x + FIELD.w);
        expect(n.y).toBeGreaterThanOrEqual(FIELD.y);
        expect(n.y).toBeLessThanOrEqual(FIELD.y + FIELD.h);
      });
    });
  });

  test('without a field it uses the whole canvas minus the margin', () => {
    const d = buildBaseline(3, 24, 'proximity', 'sparse') as Display;
    expect(d.meta.field).toEqual(clipField());
  });

  test('sparse: a connected spanning tree of nB - 1 rank-respecting arrows', () => {
    sizes.forEach((nB) => {
      const d = buildBaseline(77 + nB, nB, 'proximity', 'sparse', { field: FIELD }) as Display;
      expect(d.edges).toHaveLength(nB - 1);
      expect(isConnected(d)).toBe(true);
      const rank = new Map(d.nodes.map((n) => [n.id, n.rank]));
      expect([...rank.values()].sort((a, b) => a - b)).toEqual(d.nodes.map((_, i) => i));
      d.edges.forEach((e) => {
        expect(rank.get(e.source)).toBeLessThan(rank.get(e.target) as number);
        expect(e.kind).toBe('within');
      });
    });
  });

  test('dense: adds up to the matched number of extra rank-respecting arrows', () => {
    sizes.forEach((nB) => {
      const d = buildBaseline(303 + nB, nB, 'proximity', 'dense', { field: FIELD }) as Display;
      const extras = d.edges.filter((e) => e.extra);
      expect(d.edges.length).toBeGreaterThan(nB - 1);
      expect(d.edges.length).toBeLessThanOrEqual(plannedEdgeCount(nB, 'dense'));
      expect(extras.length).toBe(d.edges.length - (nB - 1));
      expect(isConnected(d)).toBe(true);
    });
  });

  test('links connect spatial neighbours, so B is no messier than A', () => {
    (['sparse', 'dense'] as const).forEach((density) => {
      [14, 34].forEach((nB) => {
        const d = buildBaseline(451 + nB, nB, 'proximity', density, { field: FIELD }) as Display;
        const byId = new Map(d.nodes.map((n) => [n.id, n]));
        const lengths = d.edges.map((e) => {
          const s = byId.get(e.source) as Display['nodes'][number];
          const t = byId.get(e.target) as Display['nodes'][number];
          return Math.hypot(s.x - t.x, s.y - t.y);
        });
        const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
        expect(mean).toBeLessThan(2 * C.INTER * C.SCALE);
      });
    });
  });

  test('each tree link goes to one of the nearest earlier dots wherever occlusion allows', () => {
    const nB = 34;
    const d = buildBaseline(88, nB, 'proximity', 'sparse', { field: FIELD }) as Display;
    const byId = new Map(d.nodes.map((n) => [n.id, n]));
    const tooFar = d.edges.filter((e) => {
      const s = byId.get(e.source) as Display['nodes'][number];
      const t = byId.get(e.target) as Display['nodes'][number];
      const length = Math.hypot(s.x - t.x, s.y - t.y);
      const closer = d.nodes.filter((n) => n.id !== s.id && n.id !== t.id
        && Math.hypot(n.x - s.x, n.y - s.y) < length
        && Math.hypot(n.x - t.x, n.y - t.y) < length);
      return closer.length > C.B_ATTACH_CANDIDATES;
    });
    expect(tooFar.length).toBeLessThan(d.edges.length / 4);
  });

  test('with a target, the total link length follows the budget and records it', () => {
    const target = { linkLength: 23 * 60, edges: 23 };
    const d = buildBaseline(5, 24, 'proximity', 'sparse', { field: FIELD, target }) as Display;
    expect(d.meta.linkTarget).toBeCloseTo(linkBudget(target, 23), 9);
    const { linkLength } = measureDisplay(d);
    expect(linkLength / (d.meta.linkTarget as number)).toBeGreaterThan(0.8);
    expect(linkLength / (d.meta.linkTarget as number)).toBeLessThan(1.2);

    // a larger budget makes B's links longer
    const longer = buildBaseline(5, 24, 'proximity', 'sparse', {
      field: FIELD, target: { ...target, linkLength: 23 * 120 },
    }) as Display;
    expect(measureDisplay(longer).linkLength).toBeGreaterThan(linkLength * 1.3);
  });

  test('long budgeted links spread over many nodes instead of forming a hub', () => {
    const target = { linkLength: 23 * 180, edges: 23 };
    for (let seed = 1; seed <= 20; seed += 1) {
      const d = buildBaseline(seed, 24, 'rect', 'sparse', { field: FIELD, target }) as Display;
      const degree = new Map<number, number>();
      d.edges.forEach((e) => {
        degree.set(e.source, (degree.get(e.source) ?? 0) + 1);
        degree.set(e.target, (degree.get(e.target) ?? 0) + 1);
      });
      expect(Math.max(...degree.values())).toBeLessThanOrEqual(C.B_MAX_DEGREE + 1);
    }
  });

  test('without a target no budget is recorded', () => {
    expect(buildBaseline(5, 24, 'proximity', 'sparse', { field: FIELD })?.meta.linkTarget).toBeUndefined();
  });

  test('matches the cue features without any spatial structure', () => {
    const palette = makePalette(20);
    const color = buildBaseline(5, 30, 'color', 'sparse', { field: FIELD, palette }) as Display;
    expect(color.nodes.every((n) => palette.includes(n.fill))).toBe(true);
    expect(new Set(color.nodes.map((n) => n.fill)).size).toBeGreaterThan(1);

    const shape = buildBaseline(5, 30, 'shape', 'sparse', { field: FIELD }) as Display;
    expect(shape.nodes.every((n) => (C.SHAPES as readonly string[]).includes(n.shape))).toBe(true);
    expect(new Set(shape.nodes.map((n) => n.shape)).size).toBe(C.SHAPES.length);
    // with A's six, B draws only from those six, and its geometry does not change
    const six = ['star', 'circle', 'y', 'diamond', 'pentagon', 'square'] as const;
    const subset = buildBaseline(5, 30, 'shape', 'sparse', { field: FIELD, shapes: six }) as Display;
    expect(new Set(subset.nodes.map((n) => n.shape))).toEqual(new Set(six));
    expect(subset.nodes.map((n) => [n.x, n.y])).toEqual(shape.nodes.map((n) => [n.x, n.y]));
    expect(subset.edges).toEqual(shape.edges);

    const edge = buildBaseline(5, 30, 'edge', 'sparse', { field: FIELD }) as Display;
    const dashed = edge.edges.filter((e) => e.dashed).length;
    expect(dashed).toBe(Math.round(edge.edges.length * C.B_DASH_PROPORTION.sparse));

    ['proximity', 'rect'].forEach((cue) => {
      const plain = buildBaseline(5, 30, cue as Display['cue'], 'sparse', { field: FIELD }) as Display;
      expect(plain.clusters).toEqual([]);
      expect(plain.nodes.every((n) => n.fill === C.DOT_FILL && n.shape === 'circle')).toBe(true);
      expect(plain.edges.every((e) => !e.dashed)).toBe(true);
    });
  });

  test('gives up when the field cannot hold the requested dots', () => {
    expect(buildBaseline(1, 5000, 'proximity', 'sparse')).toBeNull();
  });

  test('is deterministic and satisfies the shared invariants', () => {
    const a = buildBaseline(999, 34, 'edge', 'dense', { field: FIELD });
    const b = buildBaseline(999, 34, 'edge', 'dense', { field: FIELD });
    expect(a).toEqual(b);
    expect(checkInvariants(generateDisplay(999, {
      kind: 'B', cue: 'edge', density: 'dense', nB: 34, field: FIELD,
    }))).toEqual([]);
  });
});
