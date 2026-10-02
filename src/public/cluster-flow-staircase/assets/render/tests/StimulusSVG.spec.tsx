import { cleanup, render } from '@testing-library/react';
import {
  afterEach, describe, expect, test,
} from 'vitest';
import { GENERATOR_CONFIG as C } from '../../generator/config';
import {
  DOT_R, HOLLOW_STROKE, SQUARE_SIDE, TRIANGLE_R,
} from '../../generator/geometry';
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
  n: 6,
  width: C.CANVAS.width,
  height: C.CANVAS.height,
  background: C.BACKGROUND,
  nodes: [
    node(0, 100, 'circle'), node(1, 200, 'square'), node(2, 300, 'triangle'),
    node(3, 400, 'hollowCircle'), node(4, 500, 'hollowSquare'), node(5, 600, 'hollowTriangle'),
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
    nodeIds: [0, 1, 2, 3, 4, 5],
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

  test('draws the six marks in the node colour, outlines inside the filled footprint', () => {
    const { container } = render(<StimulusSVG display={display} />);
    const marks = [...container.querySelectorAll('[fill="#123456"], [stroke="#123456"]')];
    expect(marks).toHaveLength(6);
    const [circle, square, triangle, ring, box, outline] = marks;

    expect(circle.tagName).toBe('circle');
    expect(Number(circle.getAttribute('r'))).toBeCloseTo(DOT_R, 9);
    expect(square.tagName).toBe('rect');
    expect(Number(square.getAttribute('width'))).toBeCloseTo(SQUARE_SIDE, 9);
    expect(triangle.tagName).toBe('polygon');
    // top vertex TRIANGLE_R above the centre
    expect(Number((triangle.getAttribute('points') as string).split(' ')[0].split(',')[1])).toBeCloseTo(100 - TRIANGLE_R, 9);

    [ring, box, outline].forEach((m) => {
      expect(m.getAttribute('fill')).toBe('none');
      expect(Number(m.getAttribute('stroke-width'))).toBeCloseTo(HOLLOW_STROKE, 9);
    });
    expect(Number(ring.getAttribute('r')) + HOLLOW_STROKE / 2).toBeCloseTo(DOT_R, 9);
    expect(Number(box.getAttribute('width')) + HOLLOW_STROKE).toBeCloseTo(SQUARE_SIDE, 9);
    expect(Number((outline.getAttribute('points') as string).split(' ')[0].split(',')[1])).toBeCloseTo(100 - (TRIANGLE_R - HOLLOW_STROKE), 9);
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
