import { cleanup, render } from '@testing-library/react';
import {
  afterEach, describe, expect, test,
} from 'vitest';
import { GENERATOR_CONFIG as C } from '../../generator/config';
import {
  CROSS_ARM, CROSS_STROKE, DOT_R, HOLLOW_SIDE, HOLLOW_STROKE,
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
  n: 3,
  width: C.CANVAS.width,
  height: C.CANVAS.height,
  background: C.BACKGROUND,
  nodes: [node(0, 100, 'circle'), node(1, 250, 'hollowSquare'), node(2, 400, 'cross')],
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
    nodeIds: [0, 1, 2],
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

  test('draws a filled circle, a hollow square and an open cross in the node colour', () => {
    const { container } = render(<StimulusSVG display={display} />);
    const circle = container.querySelector('circle') as SVGCircleElement;
    expect(Number(circle.getAttribute('r'))).toBeCloseTo(DOT_R, 9);
    expect(circle.getAttribute('fill')).toBe('#123456');

    const square = [...container.querySelectorAll('rect')].find((r) => r.getAttribute('stroke') === '#123456') as SVGRectElement;
    expect(square.getAttribute('fill')).toBe('none');
    expect(Number(square.getAttribute('stroke-width'))).toBeCloseTo(HOLLOW_STROKE, 9);
    // the outline's outer edge is HOLLOW_SIDE wide
    expect(Number(square.getAttribute('width')) + HOLLOW_STROKE).toBeCloseTo(HOLLOW_SIDE, 9);

    const cross = container.querySelector('g[stroke="#123456"]') as SVGGElement;
    const bars = cross.querySelectorAll('line');
    expect(bars).toHaveLength(2);
    expect(Number(cross.getAttribute('stroke-width'))).toBeCloseTo(CROSS_STROKE, 9);
    expect(Number(bars[0].getAttribute('x2')) - Number(bars[0].getAttribute('x1'))).toBeCloseTo(2 * CROSS_ARM, 9);
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
    expect(container.querySelector('polygon[stroke]')).toBeNull();
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
