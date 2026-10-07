import { describe, expect, test } from 'vitest';
import { GENERATOR_CONFIG as C } from '../config';
import {
  ARROW_CLEARANCE, DOT_RADIUS, LINK_GAP, MARK_MARGIN, MAX_MARK_REACH, MIN_CENTRE_DISTANCE, checkInvariants, insidePolygon,
  linkIsClear, linksConflict, markPolygon, pointSegmentDistance, segmentMarkDistance, segmentSegmentDistance,
} from '../invariants';
import { MARK_MAX_R, SQUARE_SIDE } from '../geometry';
import { Display, DisplayNode } from '../types';

function node(id: number, x: number, y: number, shape: DisplayNode['shape'] = 'circle'): DisplayNode {
  return {
    id, x, y, cluster: -1, rank: id, shape, fill: C.DOT_FILL,
  };
}

function display(nodes: DisplayNode[], edges: Display['edges'] = []): Display {
  return {
    kind: 'B',
    seed: 1,
    cue: 'proximity',
    density: 'sparse',
    n: nodes.length,
    width: C.CANVAS.width,
    height: C.CANVAS.height,
    background: C.BACKGROUND,
    nodes,
    edges,
    clusters: [],
    attempts: 1,
    meta: {},
  };
}

describe('geometry helpers', () => {
  test('pointSegmentDistance clamps to the segment ends', () => {
    expect(pointSegmentDistance(0, 5, 0, 0, 10, 0)).toBeCloseTo(5, 9);
    expect(pointSegmentDistance(-10, 0, 0, 0, 10, 0)).toBeCloseTo(10, 9);
    expect(pointSegmentDistance(20, 0, 0, 0, 10, 0)).toBeCloseTo(10, 9);
    expect(pointSegmentDistance(1, 1, 5, 5, 5, 5)).toBeCloseTo(Math.hypot(4, 4), 9);
  });

  test('linkIsClear rejects a link that runs over a third dot', () => {
    const a = node(0, 100, 100);
    const b = node(1, 300, 100);
    const middle = node(2, 200, 100);
    const aside = node(3, 200, 200);
    expect(linkIsClear(a, b, [a, b, middle])).toBe(false);
    expect(linkIsClear(a, b, [a, b, aside])).toBe(true);
  });
});

describe('checkInvariants', () => {
  test('accepts a well spaced display', () => {
    expect(checkInvariants(display([node(0, 100, 100), node(1, 300, 100)], [{
      source: 0, target: 1, kind: 'within', dashed: false, extra: false,
    }]))).toEqual([]);
  });

  test('1. rejects dots that are too close together', () => {
    const violations = checkInvariants(display([node(0, 100, 100), node(1, 100 + MIN_CENTRE_DISTANCE - 0.5, 100)]));
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatch(/apart/);
  });

  test('2. rejects a link passing behind a third dot', () => {
    const violations = checkInvariants(display(
      [node(0, 100, 100), node(1, 300, 100), node(2, 200, 100 + ARROW_CLEARANCE - 1)],
      [{
        source: 0, target: 1, kind: 'within', dashed: false, extra: false,
      }],
    ));
    expect(violations.some((v) => v.includes('passes'))).toBe(true);
  });

  test('segmentSegmentDistance', () => {
    expect(segmentSegmentDistance([0, 0], [10, 10], [0, 10], [10, 0])).toBe(0);
    expect(segmentSegmentDistance([0, 0], [10, 0], [0, 3], [10, 3])).toBeCloseTo(3, 9);
    expect(segmentSegmentDistance([0, 0], [10, 0], [13, 4], [20, 4])).toBeCloseTo(5, 9);
  });

  test('segmentMarkDistance measures to the mark outline, not the centre', () => {
    // circles: centre distance minus the radius, the original rule
    expect(segmentMarkDistance(node(0, 0, 0), -50, 20, 50, 20)).toBeCloseTo(20 - DOT_RADIUS, 9);
    expect(MARK_MARGIN + DOT_RADIUS).toBeCloseTo(ARROW_CLEARANCE, 9);
    // a horizontal line just above an upward triangle meets its tip; just below, its base
    const tri = node(0, 0, 0, 'triangle');
    const tip = segmentMarkDistance(tri, -50, -20, 50, -20);
    const base = segmentMarkDistance(tri, -50, 20, 50, 20);
    expect(tip).toBeLessThan(base);
    expect(segmentMarkDistance(tri, -50, 0, 50, 0)).toBe(0);
    // squares: distance to the nearest side
    const sq = node(0, 0, 0, 'square');
    expect(segmentMarkDistance(sq, SQUARE_SIDE / 2 + 3, -50, SQUARE_SIDE / 2 + 3, 50)).toBeCloseTo(3, 9);
    expect(segmentMarkDistance(sq, -50, 0, 50, 0)).toBe(0);
  });

  test('2. a link that clears a circle can still graze a triangle tip', () => {
    // a horizontal link above the node, between a circle's top and a triangle's tip
    const y = 100 - DOT_RADIUS - MARK_MARGIN - 1;
    const edges = [{
      source: 0, target: 1, kind: 'within' as const, dashed: false, extra: false,
    }];
    expect(checkInvariants(display([node(0, 100, y), node(1, 300, y), node(2, 200, 100)], edges))).toEqual([]);
    expect(checkInvariants(display([node(0, 100, y), node(1, 300, y), node(2, 200, 100, 'triangle')], edges))).toHaveLength(1);
    expect(linkIsClear(node(0, 100, y), node(1, 300, y), [node(2, 200, 100, 'star')])).toBe(false);
    // the same distance below the node clears the triangle's flat base
    const below = 100 + DOT_RADIUS + MARK_MARGIN + 1;
    expect(linkIsClear(node(0, 100, below), node(1, 300, below), [node(2, 200, 100, 'triangle')])).toBe(true);
  });

  test('2. accepts a link that only comes close to its own endpoints', () => {
    expect(checkInvariants(display([node(0, 100, 100), node(1, 100, 300)], [{
      source: 0, target: 1, kind: 'within', dashed: false, extra: false,
    }]))).toEqual([]);
  });

  test('2. reports an edge whose endpoint does not exist', () => {
    const violations = checkInvariants(display([node(0, 100, 100)], [{
      source: 0, target: 9, kind: 'within', dashed: false, extra: false,
    }]));
    expect(violations.some((v) => v.includes('missing dot'))).toBe(true);
  });

  test('3. rejects a dot that leaves the canvas margin', () => {
    const inside = C.CANVAS_MARGIN + DOT_RADIUS;
    expect(checkInvariants(display([node(0, inside, inside)]))).toEqual([]);
    expect(checkInvariants(display([node(0, inside - 1, inside)]))).toHaveLength(1);
    expect(checkInvariants(display([node(0, C.CANVAS.width - inside + 1, inside)]))).toHaveLength(1);
    expect(checkInvariants(display([node(0, inside, C.CANVAS.height - inside + 1)]))).toHaveLength(1);
  });

  test('the star and the Y are concave: a link may pass between their arms but not touch them', () => {
    const star = markPolygon('star', 0, 0) as [number, number][];
    expect(insidePolygon(star, 0, 0)).toBe(true);
    // just beyond an inner vertex, in the notch between two points, is outside it
    expect(insidePolygon(star, star[1][0] * 1.5, star[1][1] * 1.5)).toBe(false);
    expect(insidePolygon(star, star[0][0] * 0.9, star[0][1] * 0.9)).toBe(true);
    const y = markPolygon('y', 0, 0) as [number, number][];
    expect(insidePolygon(y, 0, 0)).toBe(true);
    // straight above the centre lies the gap between the two upper arms
    expect(insidePolygon(y, 0, -0.9 * MARK_MAX_R)).toBe(false);
    expect(segmentMarkDistance(node(0, 0, 0, 'y'), -50, 0, 50, 0)).toBe(0);
    expect(MAX_MARK_REACH).toBeCloseTo(MARK_MAX_R, 9);
  });
});

describe('4. no link crossings', () => {
  const edge = (source: number, target: number) => ({
    source, target, kind: 'within' as const, dashed: false, extra: false,
  });

  test('rejects a hand-built display whose two links cross', () => {
    // an X: 0 -> 3 and 1 -> 2 cross in the middle of a square
    const nodes = [node(0, 100, 100), node(1, 300, 100), node(2, 100, 300), node(3, 300, 300)];
    const crossing = checkInvariants(display(nodes, [edge(0, 3), edge(1, 2)]));
    expect(crossing).toHaveLength(1);
    expect(crossing[0]).toMatch(/cross/);
    // the same four dots wired around the square do not cross
    expect(checkInvariants(display(nodes, [edge(0, 1), edge(1, 3), edge(3, 2), edge(2, 0)]))).toEqual([]);
  });

  test('rejects links that touch or overlap without crossing', () => {
    // parallel links closer than one link width
    const close = [node(0, 100, 100), node(1, 300, 100), node(2, 150, 100 + LINK_GAP / 2), node(3, 350, 100 + LINK_GAP / 2)];
    expect(linksConflict(close[0], close[1], close[2], close[3])).toBe(true);
    // collinear and overlapping: 0 -> 1 and 2 -> 3 on one line
    const line = [node(0, 100, 100), node(1, 300, 100), node(2, 200, 100), node(3, 400, 100)];
    expect(linksConflict(line[0], line[1], line[2], line[3])).toBe(true);
    // the same parallel links a little more than one link width apart are fine
    const near = [node(0, 100, 100), node(1, 300, 100), node(2, 150, 100 + LINK_GAP + 0.5), node(3, 350, 100 + LINK_GAP + 0.5)];
    expect(linksConflict(near[0], near[1], near[2], near[3])).toBe(false);
    // well apart
    const apart = [node(0, 100, 100), node(1, 300, 100), node(2, 100, 200), node(3, 300, 200)];
    expect(linksConflict(apart[0], apart[1], apart[2], apart[3])).toBe(false);
  });

  test('links that share an endpoint meet there without counting as crossing, unless they overlap', () => {
    const a = node(0, 100, 100);
    const b = node(1, 300, 100);
    const c = node(2, 100, 300);
    expect(linksConflict(a, b, a, c)).toBe(false);
    expect(linksConflict(a, b, c, a)).toBe(false);
    // the same link twice, either way round
    expect(linksConflict(a, b, a, b)).toBe(true);
    expect(linksConflict(a, b, b, a)).toBe(true);
    // a second link leaving a almost along a -> b runs back over it
    const d = node(3, 300, 100 + LINK_GAP / 2);
    expect(linksConflict(a, b, a, d)).toBe(true);
  });
});
