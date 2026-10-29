import { describe, expect, test } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { GENERATOR_CONFIG as C } from '../config';
import { generateAttentionPair, generateTrialPair } from '../generator';
import { checkInvariants } from '../invariants';
import { deltaE2000, hexToLab, makePalette } from '../palette';
import { VARIANTS, VARIANT_CUE, Variant } from '../types';
import { linkStyle, markReach, nodeScale } from '../variants';
import { StimulusSVG } from '../../render/StimulusSVG';

const SEEDS = Array.from({ length: 25 }, (_, i) => 1000 + i * 37);
const pair = (variant: Variant, seed: number, nB: number) => generateTrialPair(seed, seed + 1, {
  cue: VARIANT_CUE[variant], density: 'sparse', nB, hueOffset: 0, variant,
});
const between = (d: { edges: { kind: string }[] }) => d.edges.filter((e) => e.kind === 'between').length;

function worstPair(palette: readonly string[], lab: (h: string) => ReturnType<typeof hexToLab>) {
  let worst = Infinity;
  palette.forEach((p, i) => palette.slice(i + 1).forEach((q) => { worst = Math.min(worst, deltaE2000(lab(p), lab(q))); }));
  return worst;
}

describe('follow-up variants', () => {
  test.each(VARIANTS)('%s builds valid pairs from N_B 8 to 48', (variant) => {
    SEEDS.forEach((seed) => [8, 24, 48].forEach((nB) => {
      const { displayA, displayB } = pair(variant, seed, nB);
      expect(displayA.variant).toBe(variant);
      expect(displayB.variant).toBe(variant);
      expect(displayB.n).toBe(nB);
      expect(checkInvariants(displayA)).toEqual([]);
      expect(checkInvariants(displayB)).toEqual([]);
    }));
  });

  test('a variant left unset gives exactly the original displays', () => {
    const plain = generateTrialPair(77, 78, { cue: 'color', density: 'sparse', nB: 24 });
    expect(plain.displayA.variant).toBeUndefined();
    expect(plain.displayA.nodes.map((n) => n.fill).every((f) => makePalette(0).includes(f))).toBe(true);
  });

  test('intra-full fills every cluster and matches B to A beyond a spanning tree', () => {
    SEEDS.forEach((seed) => {
      const sparse = generateTrialPair(seed, seed + 1, { cue: 'proximity', density: 'sparse', nB: 24 }).displayA;
      const { displayA, displayB } = pair('intra-full', seed, 24);
      expect(displayA.edges.length).toBeGreaterThan(sparse.edges.length + 8);
      expect(between(displayA)).toBe(C.NCLUST - 1);
      expect(Math.abs(displayB.edges.length - displayA.edges.length)).toBeLessThanOrEqual(6);
      const plus = pair('intra-full-plus', seed, 24).displayA;
      expect(between(plus)).toBeGreaterThan(C.NCLUST - 1);
    });
  });

  test('color-large scales nodes, link trimming and clearance together', () => {
    expect(nodeScale('color-large')).toBe(C.VARIANT_NODE_SCALE);
    expect(markReach('color-large')).toBeCloseTo(markReach() * C.VARIANT_NODE_SCALE);
    expect(linkStyle('color-large').trim).toBeGreaterThan(linkStyle().trim);
    const svg = renderToStaticMarkup(createElement(StimulusSVG, { display: pair('color-large', 5, 24).displayA }));
    expect(svg).toContain(`r="${C.RDOT * C.SCALE * C.VARIANT_NODE_SCALE}"`);
  });

  test('edge-bold draws thicker links and grey dotted between-cluster links', () => {
    const svg = renderToStaticMarkup(createElement(StimulusSVG, { display: pair('edge-bold', 5, 24).displayA }));
    expect(svg).toContain(`stroke-dasharray="${C.VARIANT_DOTS.dash} ${C.VARIANT_DOTS.gap}"`);
    expect(svg).toContain(C.VARIANT_DOTS.stroke);
    expect(linkStyle('edge-bold').width).toBeCloseTo(linkStyle().width * C.VARIANT_LINK_SCALE);
  });

  test('rect-shade fills the cluster areas, blackens the nodes and yellows B', () => {
    const { displayA, displayB } = pair('rect-shade', 5, 24);
    const a = renderToStaticMarkup(createElement(StimulusSVG, { display: displayA }));
    const b = renderToStaticMarkup(createElement(StimulusSVG, { display: displayB }));
    expect(a.split(`fill="${C.SHADE_FILL}"`).length - 1).toBe(C.NCLUST);
    expect(displayA.nodes.every((n) => n.fill === C.SHADE_NODE)).toBe(true);
    expect(displayB.nodes.every((n) => n.fill === C.SHADE_NODE)).toBe(true);
    expect(b).toContain(`fill="${C.SHADE_FILL}"`);
  });

  test('the few-colour palettes are vivid, differ in brightness and are far more distinct than the ellipse', () => {
    expect(worstPair(C.DISTINCT_COLOURS['color-distinct'], hexToLab)).toBeGreaterThan(48);
    expect(worstPair(C.DISTINCT_COLOURS['color-distinct-2'], hexToLab)).toBeGreaterThan(70);
    expect(worstPair(makePalette(0), hexToLab)).toBeLessThan(30);
    const labs = C.DISTINCT_COLOURS['color-distinct'].map(hexToLab);
    labs.forEach((lab) => expect(Math.hypot(lab.a, lab.b)).toBeGreaterThanOrEqual(85));
    const lightness = labs.map((lab) => lab.L).sort((a, b) => a - b);
    expect(lightness[1] - lightness[0]).toBeGreaterThan(15);
    expect(lightness[2] - lightness[1]).toBeGreaterThan(15);
  });

  test.each(['color-distinct', 'color-distinct-2'] as const)('%s: neighbouring clusters never share a colour', (variant) => {
    SEEDS.forEach((seed) => {
      const { displayA, displayB } = pair(variant, seed, 24);
      const palette = C.DISTINCT_COLOURS[variant];
      const cs = displayA.clusters;
      const fill = (c: typeof cs[number]) => displayA.nodes.find((n) => n.cluster === c.index)?.fill as string;
      cs.forEach((c) => expect(new Set(displayA.nodes.filter((n) => n.cluster === c.index).map((n) => n.fill)).size).toBe(1));
      const d = (a: typeof cs[number], b: typeof cs[number]) => Math.hypot(a.cx - b.cx, a.cy - b.cy);
      let nearest = Infinity;
      cs.forEach((a, i) => cs.slice(i + 1).forEach((b) => { nearest = Math.min(nearest, d(a, b)); }));
      // side-by-side and above-below neighbours (the diagonals are about 1.4 x further)
      cs.forEach((a, i) => cs.slice(i + 1).forEach((b) => {
        if (d(a, b) <= 1.2 * nearest) expect(fill(a)).not.toBe(fill(b));
      }));
      expect(new Set(displayA.nodes.map((n) => n.fill))).toEqual(new Set(palette));
      displayB.nodes.forEach((n) => expect(palette).toContain(n.fill));
    });
  });

  test('attention checks follow the variant', () => {
    const { displayA, displayB } = generateAttentionPair(11, 12, {
      cue: 'rect', density: 'sparse', few: 5, many: 30, variant: 'rect-shade',
    });
    expect(displayA.n).toBe(5);
    expect(displayB.n).toBe(30);
    expect(displayB.variant).toBe('rect-shade');
  });
});
