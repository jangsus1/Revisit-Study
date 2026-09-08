import { describe, expect, test } from 'vitest';
import { GENERATOR_CONFIG as C } from '../config';
import {
  ARROW_CLEARANCE, DOT_RADIUS, MIN_CENTRE_DISTANCE, checkInvariants, linkIsClear, pointSegmentDistance,
} from '../invariants';
import { Display, DisplayNode } from '../types';

function node(id: number, x: number, y: number): DisplayNode {
  return {
    id, x, y, cluster: -1, rank: id, shape: 'circle', fill: C.DOT_FILL,
  };
}

function display(nodes: DisplayNode[], edges: Display['edges'] = []): Display {
  return {
    kind: 'B',
    seed: 1,
    cue: 'none',
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
});
