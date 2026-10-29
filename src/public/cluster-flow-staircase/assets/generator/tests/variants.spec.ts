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

  test('the distinct palette roughly doubles the closest pair of the ellipse', () => {
    expect(worstPair(C.DISTINCT_PALETTE, hexToLab)).toBeGreaterThan(50);
    expect(worstPair(makePalette(0), hexToLab)).toBeLessThan(30);
    const { displayA } = pair('color-distinct', 9, 24);
    expect(new Set(displayA.nodes.map((n) => n.fill))).toEqual(new Set(C.DISTINCT_PALETTE));
  });

  test('color-distinct gives neighbouring clusters the most different colours', () => {
    const labs = C.DISTINCT_PALETTE.map(hexToLab);
    const allPairs = labs.flatMap((p, i) => labs.slice(i + 1).map((q) => deltaE2000(p, q))).sort((a, b) => a - b);
    SEEDS.forEach((seed) => {
      const { displayA } = pair('color-distinct', seed, 24);
      const cs = displayA.clusters;
      const fill = (c: typeof cs[number]) => displayA.nodes.find((n) => n.cluster === c.index)?.fill as string;
      const d = (a: typeof cs[number], b: typeof cs[number]) => Math.hypot(a.cx - b.cx, a.cy - b.cy);
      let nearest = Infinity;
      cs.forEach((a, i) => cs.slice(i + 1).forEach((b) => { nearest = Math.min(nearest, d(a, b)); }));
      const nb = cs.flatMap((a, i) => cs.slice(i + 1).filter((b) => d(a, b) <= 1.5 * nearest)
        .map((b) => deltaE2000(hexToLab(fill(a)), hexToLab(fill(b)))));
      // the closest neighbouring pair never gets the palette's closest colour pair
      expect(Math.min(...nb)).toBeGreaterThan(allPairs[0] + 1e-6);
      // and each cluster keeps one colour
      cs.forEach((c) => expect(new Set(displayA.nodes.filter((n) => n.cluster === c.index).map((n) => n.fill)).size).toBe(1));
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
