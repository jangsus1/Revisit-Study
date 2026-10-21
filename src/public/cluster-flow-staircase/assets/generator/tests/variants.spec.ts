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

/** Machado et al. (2009) severity-1 simulation on linear sRGB, as used for the palette search. */
const CVD = {
  protan: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deutan: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.011820, 0.042940, 0.968881]],
};
function simulate(hex: string, m: number[][]) {
  const lin = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const enc = (v: number) => {
    const c = Math.min(1, Math.max(0, v));
    return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
  };
  const c = [1, 3, 5].map((i) => lin(parseInt(hex.slice(i, i + 2), 16) / 255));
  const o = m.map((row) => enc(row[0] * c[0] + row[1] * c[1] + row[2] * c[2]));
  return hexToLab(`#${o.map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('')}`);
}
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

  test('the distinct palettes beat the ellipse, most of all under colour-blindness simulation', () => {
    const ellipse = makePalette(0);
    const cvd = (p: readonly string[]) => Math.min(worstPair(p, (h) => simulate(h, CVD.protan)), worstPair(p, (h) => simulate(h, CVD.deutan)));
    C.DISTINCT_PALETTES.forEach((p) => {
      expect(worstPair(p, hexToLab)).toBeGreaterThan(30);
      expect(cvd(p)).toBeGreaterThan(20);
      expect(cvd(p)).toBeGreaterThan(2.5 * cvd(ellipse));
    });
    ['color-distinct', 'color-distinct-b'].forEach((v, i) => {
      const { displayA } = pair(v as Variant, 9, 24);
      expect(new Set(displayA.nodes.map((n) => n.fill))).toEqual(new Set(C.DISTINCT_PALETTES[i]));
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
