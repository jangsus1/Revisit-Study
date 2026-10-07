import { cleanup, render } from '@testing-library/react';
import {
  afterEach, describe, expect, test,
} from 'vitest';
import { GENERATOR_CONFIG as C } from '../../generator/config';
import { DOT_R, MARK_POINTS, MARK_REACH } from '../../generator/geometry';
import { Display, DisplayNode } from '../../generator/types';
import { StimulusFrame, StimulusSVG } from '../StimulusSVG';

afterEach(() => cleanup());

function node(id: number, x: number, shape: DisplayNode['shape'], fill = '#123456'): DisplayNode {
  return {
    id, x, y: 100, cluster: 0, rank: id, shape, fill,
  };
}

const display: Display = {
  kind: 'A',
  seed: 1,
  cue: 'shape',
  density: 'sparse',
  n: 7,
  width: C.CANVAS.width,
  height: C.CANVAS.height,
  background: C.BACKGROUND,
  nodes: [
    node(0, 100, 'circle'), node(1, 180, 'square'), node(2, 260, 'diamond'), node(3, 340, 'triangle'),
    node(4, 420, 'star'), node(5, 500, 'y'), node(6, 580, 'pentagon'),
  ],
  edges: [
    {
      source: 0, target: 1, kind: 'within', dashed: false, extra: false,
    },
    {
      source: 1, target: 2, kind: 'between', dashed: true, extra: false,
    },
  ],
  clusters: [{
    index: 0,
    nodeIds: [0, 1, 2, 3, 4, 5, 6],
    cx: 250,
    cy: 100,
    orderPos: 0,
    rect: {
      x: 80, y: 80, w: 340, h: 40,
    },
  }],
  attempts: 1,
  meta: {},
};

describe('StimulusSVG', () => {
  test('draws the canvas at 1:1 size', () => {
    const { container } = render(<StimulusSVG display={display} />);
    const svg = container.querySelector('svg') as SVGSVGElement;
    expect(svg.getAttribute('width')).toBe(String(C.CANVAS.width));
    expect(svg.getAttribute('height')).toBe(String(C.CANVAS.height));
  });

  test('draws the seven marks filled in the node colour, with the generator\'s outlines', () => {
    const { container } = render(<StimulusSVG display={display} />);
    const marks = [...container.querySelectorAll('[fill="#123456"]')];
    expect(marks).toHaveLength(7);
    expect(container.querySelector('[stroke="#123456"]')).toBeNull();
    const [circle, ...polygons] = marks;

    expect(circle.tagName).toBe('circle');
    expect(Number(circle.getAttribute('r'))).toBeCloseTo(DOT_R, 9);
    (['square', 'diamond', 'triangle', 'star', 'y', 'pentagon'] as const).forEach((shape, k) => {
      const el = polygons[k];
      expect(el.tagName).toBe('polygon');
      const pts = (el.getAttribute('points') as string).split(' ').map((p) => p.split(',').map(Number));
      expect(pts).toHaveLength(MARK_POINTS[shape].length);
      const cx = 180 + 80 * k;
      pts.forEach(([x, y], v) => {
        expect(x - cx).toBeCloseTo(MARK_POINTS[shape][v][0], 9);
        expect(y - 100).toBeCloseTo(MARK_POINTS[shape][v][1], 9);
        expect(Math.hypot(x - cx, y - 100)).toBeLessThanOrEqual(MARK_REACH[shape] + 1e-9);
      });
    });
  });

  test('dashes only the dashed link, with round caps and the Sterzik level-3 pattern', () => {
    const { container } = render(<StimulusSVG display={display} />);
    const links = [...container.querySelectorAll('line')].filter((l) => l.getAttribute('stroke') === C.LINK_STROKE);
    expect(links).toHaveLength(2);
    expect(links[0].getAttribute('stroke-dasharray')).toBeNull();
    expect(links[0].getAttribute('stroke-linecap')).toBe('butt');
    expect(links[1].getAttribute('stroke-dasharray')).toBe('5.45 14.55');
    expect(links[1].getAttribute('stroke-linecap')).toBe('round');
  });

  test('draws the rect cue outline and no hull', () => {
    const { container } = render(<StimulusSVG display={display} />);
    const outline = [...container.querySelectorAll('rect')].find((r) => r.getAttribute('stroke') === C.HULL_STROKE) as SVGRectElement;
    expect(outline.getAttribute('width')).toBe('340');
    expect(container.querySelector(`polygon[stroke="${C.HULL_STROKE}"]`)).toBeNull();
  });
});

describe('StimulusFrame', () => {
  test('a frame without a display is a blank canvas of the same size', () => {
    const { getByTestId } = render(<StimulusFrame />);
    const frame = getByTestId('stimulus-frame');
    expect(frame.style.width).toBe(`${C.CANVAS.width}px`);
    expect(frame.style.height).toBe(`${C.CANVAS.height}px`);
    expect(frame.querySelector('svg')).toBeNull();
  });
});
