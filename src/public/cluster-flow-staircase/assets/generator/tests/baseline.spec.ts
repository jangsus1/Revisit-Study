import { describe, expect, test } from 'vitest';
import { buildBaseline, denseExtraCount } from '../baseline';
import { GENERATOR_CONFIG as C } from '../config';
import { generateDisplay } from '../generator';
import { MIN_CENTRE_DISTANCE, checkInvariants } from '../invariants';
import { Display } from '../types';

const sizes = [8, 14, 24, 34, 48];

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

describe('denseExtraCount', () => {
  test('scales B_DENSE_EXTRA_PER_24 with the node count', () => {
    expect(denseExtraCount(24)).toBe(C.B_DENSE_EXTRA_PER_24);
    expect(denseExtraCount(48)).toBe(2 * C.B_DENSE_EXTRA_PER_24);
    expect(denseExtraCount(12)).toBe(C.B_DENSE_EXTRA_PER_24 / 2);
  });
});

describe('buildBaseline', () => {
  test('places exactly nB ungrouped dots with the shared minimum spacing', () => {
    sizes.forEach((nB) => {
      const d = buildBaseline(12345 + nB, nB, 'none', 'sparse') as Display;
      expect(d).not.toBeNull();
      expect(d.kind).toBe('B');
      expect(d.n).toBe(nB);
      expect(d.nodes).toHaveLength(nB);
      expect(d.clusters).toEqual([]);
      expect(d.nodes.every((n) => n.cluster === -1)).toBe(true);
      for (let i = 0; i < d.nodes.length; i += 1) {
        for (let j = i + 1; j < d.nodes.length; j += 1) {
          expect(Math.hypot(d.nodes[i].x - d.nodes[j].x, d.nodes[i].y - d.nodes[j].y))
            .toBeGreaterThanOrEqual(MIN_CENTRE_DISTANCE);
        }
      }
    });
  });

  test('sparse: a connected spanning tree of nB - 1 rank-respecting arrows', () => {
    sizes.forEach((nB) => {
      const d = buildBaseline(77 + nB, nB, 'none', 'sparse') as Display;
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
      const d = buildBaseline(303 + nB, nB, 'none', 'dense') as Display;
      const extras = d.edges.filter((e) => e.extra);
      expect(d.edges.length).toBeGreaterThan(nB - 1);
      expect(d.edges.length).toBeLessThanOrEqual(nB - 1 + denseExtraCount(nB));
      expect(extras.length).toBe(d.edges.length - (nB - 1));
      expect(isConnected(d)).toBe(true);
    });
  });

  test('matches the cue features without any spatial structure', () => {
    const color = buildBaseline(5, 30, 'color', 'sparse') as Display;
    expect(color.nodes.every((n) => (C.COLOR_PALETTE as readonly string[]).includes(n.fill))).toBe(true);
    expect(new Set(color.nodes.map((n) => n.fill)).size).toBeGreaterThan(1);

    const shape = buildBaseline(5, 30, 'shape', 'sparse') as Display;
    expect(shape.nodes.every((n) => (C.SHAPES as readonly string[]).includes(n.shape))).toBe(true);
    expect(new Set(shape.nodes.map((n) => n.shape)).size).toBeGreaterThan(1);

    const edge = buildBaseline(5, 30, 'edge', 'sparse') as Display;
    const dashed = edge.edges.filter((e) => e.dashed).length;
    expect(dashed).toBe(Math.round(edge.edges.length * C.B_DASH_PROPORTION.sparse));

    const hull = buildBaseline(5, 30, 'hull', 'sparse') as Display;
    expect(hull.clusters).toEqual([]);
    expect(hull.nodes.every((n) => n.fill === C.DOT_FILL && n.shape === 'circle')).toBe(true);
  });

  test('gives up when the canvas cannot hold the requested dots', () => {
    expect(buildBaseline(1, 5000, 'none', 'sparse')).toBeNull();
  });

  test('is deterministic and satisfies the shared invariants', () => {
    const a = buildBaseline(999, 34, 'edge', 'dense');
    const b = buildBaseline(999, 34, 'edge', 'dense');
    expect(a).toEqual(b);
    expect(checkInvariants(generateDisplay(999, {
      kind: 'B', cue: 'edge', density: 'dense', nB: 34,
    }))).toEqual([]);
  });
});
