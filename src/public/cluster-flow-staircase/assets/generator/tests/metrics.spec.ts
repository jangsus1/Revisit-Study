import { describe, expect, test } from 'vitest';
import { GENERATOR_CONFIG as C } from '../config';
import {
  CIRCLE_AREA, DASH_DUTY, DOT_R, HEAD_AREA, HEAD_LEN, LINK_W, MARK_MAX_R, MARK_POINTS, MARK_REACH, NODE_INK, SQUARE_SIDE, TRIM,
  polygonAreaOf, visibleLinkLength,
} from '../geometry';
import { measureDisplay } from '../metrics';
import {
  Display, DisplayEdge, DisplayNode, NodeShape,
} from '../types';

function node(id: number, x: number, y: number, shape: NodeShape = 'circle'): DisplayNode {
  return {
    id, x, y, cluster: 0, rank: id, shape, fill: C.DOT_FILL,
  };
}

function display(nodes: DisplayNode[], edges: DisplayEdge[] = [], clusters: Display['clusters'] = []): Display {
  return {
    kind: 'A',
    seed: 1,
    cue: 'proximity',
    density: 'sparse',
    n: nodes.length,
    width: C.CANVAS.width,
    height: C.CANVAS.height,
    background: C.BACKGROUND,
    nodes,
    edges,
    clusters,
    attempts: 1,
    meta: {},
  };
}

const link = (dashed: boolean): DisplayEdge => ({
  source: 0, target: 1, kind: dashed ? 'between' : 'within', dashed, extra: false,
});

describe('geometry', () => {
  test('the pool has seven filled marks; the square and the pentagon have the circle\'s area', () => {
    expect([...C.SHAPES]).toEqual(['circle', 'square', 'diamond', 'triangle', 'star', 'y', 'pentagon']);
    expect(SQUARE_SIDE * SQUARE_SIDE).toBeCloseTo(CIRCLE_AREA, 9);
    expect(NODE_INK.square).toBeCloseTo(CIRCLE_AREA, 9);
    expect(NODE_INK.pentagon).toBeCloseTo(CIRCLE_AREA, 9);
  });

  test('every other mark is capped at 1.35 RDOT and so is smaller than the circle', () => {
    expect(MARK_MAX_R).toBeCloseTo(1.35 * DOT_R, 9);
    (['diamond', 'triangle', 'star', 'y'] as const).forEach((shape) => {
      expect(MARK_REACH[shape]).toBeCloseTo(MARK_MAX_R, 9);
      expect(NODE_INK[shape]).toBeLessThan(CIRCLE_AREA);
      // equally large to the eye: no capped mark is below 60 % of the circle's area
      expect(NODE_INK[shape] / CIRCLE_AREA).toBeGreaterThan(0.6);
    });
    expect(MARK_REACH.square).toBeLessThan(MARK_MAX_R);
    expect(MARK_REACH.pentagon).toBeLessThan(MARK_MAX_R);
  });

  test('the diamond is taller than wide; the star and Y are concave', () => {
    const xs = MARK_POINTS.diamond.map(([x]) => x);
    const ys = MARK_POINTS.diamond.map(([, y]) => y);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(Math.max(...xs) - Math.min(...xs));
    expect(MARK_POINTS.star).toHaveLength(10);
    expect(MARK_POINTS.y).toHaveLength(9);
  });

  test('no mark reaches the trimmed link ends, so arrowheads never touch a node', () => {
    Object.values(MARK_REACH).forEach((reach) => expect(reach).toBeLessThan(TRIM));
    expect(DOT_R).toBeLessThan(TRIM);
  });

  test('polygonAreaOf is the shoelace area', () => {
    expect(polygonAreaOf([[0, 0], [4, 0], [4, 3]])).toBeCloseTo(6, 9);
    expect(polygonAreaOf([[0, 0], [0, 3], [4, 3], [4, 0]])).toBeCloseTo(12, 9);
  });

  test('visibleLinkLength trims both ends and removes the arrowhead', () => {
    expect(visibleLinkLength(100)).toBeCloseTo(100 - 2 * TRIM - HEAD_LEN, 9);
    expect(visibleLinkLength(2 * TRIM)).toBe(0);
  });

  test('the dash duty cycle counts the round caps', () => {
    expect(DASH_DUTY).toBeCloseTo((5.45 + LINK_W) / 20, 9);
  });
});

describe('measureDisplay', () => {
  test('ink of each of the seven marks is its exact filled area', () => {
    const r = C.RDOT * C.SCALE;
    const ink = (shape: NodeShape) => measureDisplay(display([node(0, 100, 100, shape)])).nodeInk;
    expect(ink('circle')).toBeCloseTo(Math.PI * r * r, 6);
    (['square', 'diamond', 'triangle', 'star', 'y', 'pentagon'] as const).forEach((shape) => {
      expect(ink(shape)).toBeCloseTo(polygonAreaOf(MARK_POINTS[shape]), 6);
    });
    // the triangle keeps its old size: circumradius 1.35 r, three quarters of the circle's area
    expect(ink('triangle')).toBeCloseTo((3 * Math.sqrt(3) * (1.35 * r) ** 2) / 4, 6);
  });

  test('a lone node has no neighbours, no links and no hull', () => {
    const m = measureDisplay(display([node(0, 100, 100)]));
    expect(m.linkInk).toBe(0);
    expect(m.linkLength).toBe(0);
    expect(m.meanNN).toBe(0);
    expect(m.hullArea).toBe(0);
    expect(m.ink).toBeCloseTo(m.nodeInk, 9);
  });

  test('ink and length of one solid link', () => {
    const d = 200;
    const m = measureDisplay(display([node(0, 100, 100), node(1, 100 + d, 100)], [link(false)]));
    const visible = d - 2 * (C.RDOT + C.LINK_TRIM) * C.SCALE - C.ARROWHEAD.length * C.SCALE;
    expect(m.linkLength).toBeCloseTo(visible, 9);
    const head = (C.ARROWHEAD.length * C.SCALE * C.ARROWHEAD.width * C.SCALE) / 2;
    expect(m.linkInk).toBeCloseTo(visible * C.LINK_WIDTH * C.SCALE + head, 9);
    expect(m.meanNN).toBe(d);
    expect(m.minNN).toBe(d);
    expect(m.meanPairwise).toBe(d);
  });

  test('a dashed link carries the duty cycle of its dashes', () => {
    const solid = measureDisplay(display([node(0, 100, 100), node(1, 300, 100)], [link(false)]));
    const dashed = measureDisplay(display([node(0, 100, 100), node(1, 300, 100)], [link(true)]));
    expect(dashed.linkLength).toBeCloseTo(solid.linkLength, 9);
    expect(dashed.linkInk - HEAD_AREA).toBeCloseTo((solid.linkInk - HEAD_AREA) * ((5.45 + LINK_W) / 20), 9);
  });

  test('outline ink of one rectangle is its perimeter times the stroke', () => {
    const rect = {
      x: 10, y: 20, w: 100, h: 50,
    };
    const m = measureDisplay(display([node(0, 60, 45)], [], [{
      index: 0, nodeIds: [0], cx: 60, cy: 45, orderPos: 0, rect,
    }]));
    expect(m.outlineInk).toBeCloseTo(2 * (100 + 50) * C.HULL_STROKE_WIDTH, 9);
    expect(m.ink).toBeCloseTo(m.nodeInk + m.outlineInk, 9);
  });

  test('spacing statistics and hull area of a right triangle', () => {
    const m = measureDisplay(display([node(0, 0, 0), node(1, 30, 0), node(2, 0, 40)]));
    expect(m.minNN).toBe(30);
    expect(m.meanNN).toBeCloseTo((30 + 30 + 40) / 3, 9);
    expect(m.meanPairwise).toBeCloseTo((30 + 40 + 50) / 3, 9);
    expect(m.hullArea).toBeCloseTo(600, 9);
  });
});
