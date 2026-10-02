import { describe, expect, test } from 'vitest';
import { GENERATOR_CONFIG as C } from '../config';
import {
  ELLIPSE_PERIMETER, ELLIPSE_STEPS, Lab, PALETTE_SIZE, deltaE2000, ellipseAtArc, ellipsePoint, hexToLab, labToSrgb,
  lchToHex, makePalette, paletteLab, palettePositions,
} from '../palette';

const deltaE76 = (p: Lab, q: Lab) => Math.hypot(p.L - q.L, p.a - q.a, p.b - q.b);
const chroma = (p: Lab) => Math.hypot(p.a, p.b);

describe('labToSrgb', () => {
  test('maps the reference points of CIELAB', () => {
    const white = labToSrgb(100, 0, 0);
    expect(white.r).toBeCloseTo(1, 3);
    expect(white.g).toBeCloseTo(1, 3);
    expect(white.b).toBeCloseTo(1, 3);
    expect(white.inGamut).toBe(true);
    const black = labToSrgb(0, 0, 0);
    expect(black.r).toBeCloseTo(0, 6);
    expect(black.inGamut).toBe(true);
  });

  test('flags colours outside the sRGB gamut', () => {
    expect(labToSrgb(50, 120, 0).inGamut).toBe(false);
    expect(labToSrgb(50, 10, 10).inGamut).toBe(true);
  });

  test('round-trips through srgbToLab', () => {
    const lab = hexToLab(lchToHex(60, 20, 123));
    expect(lab.L).toBeCloseTo(60, 0);
    expect(Math.hypot(lab.a, lab.b)).toBeCloseTo(20, 0);
  });
});

describe('deltaE2000', () => {
  // Sharma, Wu & Dalal (2005), Table 1, pairs 1, 7, 13 and 25
  test.each([
    [{ L: 50, a: 2.6772, b: -79.7751 }, { L: 50, a: 0, b: -82.7485 }, 2.0425],
    [{ L: 50, a: 0, b: 0 }, { L: 50, a: -1, b: 2 }, 2.3669],
    [{ L: 50, a: 2.5, b: 0 }, { L: 56, a: -27, b: -3 }, 31.903],
    [{ L: 60.2574, a: -34.0099, b: 36.2677 }, { L: 60.4626, a: -34.1751, b: 39.4387 }, 1.2644],
  ])('matches the published test pair %#', (p, q, expected) => {
    expect(deltaE2000(p, q)).toBeCloseTo(expected, 3);
  });

  test('is symmetric and zero for identical colours', () => {
    const p = { L: 40, a: 20, b: -30 };
    const q = { L: 70, a: -10, b: 25 };
    expect(deltaE2000(p, q)).toBeCloseTo(deltaE2000(q, p), 9);
    expect(deltaE2000(p, p)).toBe(0);
  });
});

describe('colour ellipse', () => {
  const points = Array.from({ length: ELLIPSE_STEPS }, (_, i) => ellipsePoint((2 * Math.PI * i) / ELLIPSE_STEPS));

  test('lies entirely inside sRGB, with L* in [30, 80]', () => {
    points.forEach((p) => {
      expect(labToSrgb(p.L, p.a, p.b).inGamut).toBe(true);
      expect(p.L).toBeGreaterThanOrEqual(30);
      expect(p.L).toBeLessThanOrEqual(80);
    });
  });

  test('varies lightness, chroma and hue', () => {
    const Ls = points.map((p) => p.L);
    const Cs = points.map(chroma);
    expect(Math.max(...Ls) - Math.min(...Ls)).toBeGreaterThan(30);
    expect(Math.max(...Cs) - Math.min(...Cs)).toBeGreaterThan(20);
    // the ellipse winds once around the neutral axis, so every hue is visited
    const hues = points.map((p) => ((Math.atan2(p.b, p.a) * 180) / Math.PI + 360) % 360);
    const buckets = new Set(hues.map((h) => Math.floor(h / 30)));
    expect(buckets.size).toBe(12);
  });

  test('ellipseAtArc walks the perimeter at constant speed', () => {
    // over short steps the chord equals the arc, so equal arc fractions give equal chords
    const n = 720;
    const steps = Array.from({ length: n }, (_, k) => deltaE76(ellipseAtArc(k / n), ellipseAtArc((k + 1) / n)));
    steps.forEach((d) => expect(Math.abs(d - ELLIPSE_PERIMETER / n)).toBeLessThan(0.01 * (ELLIPSE_PERIMETER / n)));
    expect(steps.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(ELLIPSE_PERIMETER);
    expect(ellipseAtArc(1.25)).toEqual(ellipseAtArc(0.25));
    expect(ellipseAtArc(-0.75)).toEqual(ellipseAtArc(0.25));
  });
});

describe('makePalette', () => {
  test('gives six distinct, well separated colours for every rotation', () => {
    for (let offset = 0; offset < 60; offset += 0.5) {
      const palette = makePalette(offset);
      expect(palette).toHaveLength(PALETTE_SIZE);
      expect(new Set(palette).size).toBe(PALETTE_SIZE);
      const labs = palette.map(hexToLab);
      for (let i = 0; i < labs.length; i += 1) {
        for (let j = i + 1; j < labs.length; j += 1) {
          // the best fixed-L*, fixed-chroma circle in sRGB manages about 17.5
          expect(deltaE2000(labs[i], labs[j])).toBeGreaterThan(27);
        }
      }
    }
  });

  test('neighbours are about equally far apart in CIELAB (equal arcs; chords differ with curvature)', () => {
    [0, 17, 45.5].forEach((offset) => {
      const labs = paletteLab(offset);
      const d = labs.map((p, k) => deltaE76(p, labs[(k + 1) % labs.length]));
      expect(Math.min(...d)).toBeGreaterThan(0.8 * Math.max(...d));
    });
  });

  test('the hex colours are the CIELAB samples, rounded to 8 bits', () => {
    paletteLab(13).forEach((p, k) => {
      expect(deltaE76(hexToLab(makePalette(13)[k]), p)).toBeLessThan(1);
    });
  });

  test('rotates with the offset; 60 degrees moves every colour on to the next', () => {
    expect(palettePositions(0)).toEqual([0, 60, 120, 180, 240, 300]);
    expect(palettePositions(30)).toEqual([30, 90, 150, 210, 270, 330]);
    expect(palettePositions(-10)[0]).toBe(350);
    expect(makePalette(60)).toEqual([...makePalette(0).slice(1), makePalette(0)[0]]);
    expect(makePalette(20)).not.toEqual(makePalette(0));
  });

  test('the default grey is a neutral at L* 50', () => {
    const grey = hexToLab(C.DOT_FILL);
    expect(Math.abs(grey.L - 50)).toBeLessThanOrEqual(0.5);
    expect(Math.hypot(grey.a, grey.b)).toBeLessThan(0.01);
  });
});
