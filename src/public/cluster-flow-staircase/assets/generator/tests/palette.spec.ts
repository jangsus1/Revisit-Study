import { describe, expect, test } from 'vitest';
import { GENERATOR_CONFIG as C } from '../config';
import {
  PALETTE_CHROMA, PALETTE_SIZE, hexToLab, labToSrgb, lchToHex, makePalette, maxInGamutChroma, paletteHues,
} from '../palette';

const deltaE = (p: { L: number, a: number, b: number }, q: { L: number, a: number, b: number }) => Math.hypot(p.L - q.L, p.a - q.a, p.b - q.b);

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

describe('maxInGamutChroma', () => {
  test('is the edge of the gamut at every hue', () => {
    const cMax = maxInGamutChroma(C.LAB_L);
    expect(cMax).toBeGreaterThan(20);
    // just above the maximum, at least one hue leaves the gamut
    const outside = Array.from({ length: 360 }, (_, h) => h)
      .some((h) => !labToSrgb(C.LAB_L, (cMax + 0.5) * Math.cos((h * Math.PI) / 180), (cMax + 0.5) * Math.sin((h * Math.PI) / 180)).inGamut);
    expect(outside).toBe(true);
  });

  test('is memoised', () => {
    expect(maxInGamutChroma(C.LAB_L)).toBe(maxInGamutChroma(C.LAB_L));
  });
});

describe('makePalette', () => {
  test('every hue of the wheel is in gamut at the palette chroma, including fractional ones', () => {
    for (let h = 0; h < 360; h += 0.25) {
      const rad = (h * Math.PI) / 180;
      expect(labToSrgb(C.LAB_L, PALETTE_CHROMA * Math.cos(rad), PALETTE_CHROMA * Math.sin(rad)).inGamut).toBe(true);
    }
  });

  test('gives six distinct colours at constant L* and chroma, equally spaced in CIELAB', () => {
    [0, 17, 45.5].forEach((offset) => {
      const palette = makePalette(offset);
      expect(palette).toHaveLength(PALETTE_SIZE);
      expect(new Set(palette).size).toBe(PALETTE_SIZE);
      const labs = palette.map(hexToLab);
      labs.forEach((lab) => {
        expect(Math.abs(lab.L - C.LAB_L)).toBeLessThanOrEqual(0.5);
        expect(Math.abs(Math.hypot(lab.a, lab.b) - PALETTE_CHROMA)).toBeLessThanOrEqual(0.75);
      });
      // on a circle, six hues 60 degrees apart are one radius apart
      labs.forEach((lab, k) => {
        expect(Math.abs(deltaE(lab, labs[(k + 1) % labs.length]) - PALETTE_CHROMA)).toBeLessThanOrEqual(1);
      });
    });
  });

  test('rotates with the hue offset', () => {
    expect(paletteHues(0)).toEqual([0, 60, 120, 180, 240, 300]);
    expect(paletteHues(30)).toEqual([30, 90, 150, 210, 270, 330]);
    expect(paletteHues(-10)[0]).toBe(350);
    expect(makePalette(60)).toEqual([...makePalette(0).slice(1), makePalette(0)[0]]);
    const hue = (hex: string) => {
      const { a, b } = hexToLab(hex);
      return ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;
    };
    expect(hue(makePalette(25)[0])).toBeCloseTo(25, 0);
  });

  test('the default grey sits at the same L*', () => {
    const grey = hexToLab(C.DOT_FILL);
    expect(Math.abs(grey.L - C.LAB_L)).toBeLessThanOrEqual(0.5);
    expect(Math.hypot(grey.a, grey.b)).toBeLessThan(0.01);
  });
});
