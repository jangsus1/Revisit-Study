/**
 * The colour-cue palette: six colours sampled from a circle in CIELAB at fixed lightness and fixed
 * chroma, 60 degrees apart, as in the colour-wheel method of Zhang & Luck (2008) and Luck & Vogel.
 * Here the circle is centred on the neutral axis (a* = b* = 0) and its radius is the largest one
 * whose every hue fits inside the sRGB gamut, so the colours differ in hue only: equal L*, equal
 * chroma, equal CIELAB distance between neighbours. The default grey node (`DOT_FILL`) sits at the
 * same L*. The circle is rotated per participant (`hueOffset`) so no hue is tied to a cluster size.
 */
import { GENERATOR_CONFIG as C } from './config';

/** D65 reference white (CIE 1931 2 degree observer), Y normalised to 1. */
const WHITE = { x: 0.95047, y: 1, z: 1.08883 };
const EPSILON = 216 / 24389;
const KAPPA = 24389 / 27;
/**
 * Tolerance on a linear-RGB channel before a colour counts as out of gamut; absorbs the rounding
 * of the published matrix (white maps to 1 +- 3e-5).
 */
const GAMUT_EPS = 1e-4;

export interface Srgb {
  /** gamma-encoded channels in [0, 1] (clamped) */
  r: number;
  g: number;
  b: number;
  /** true when no channel had to be clamped */
  inGamut: boolean;
}

function fInv(t: number): number {
  const t3 = t * t * t;
  return t3 > EPSILON ? t3 : (116 * t - 16) / KAPPA;
}

function gammaEncode(v: number): number {
  return v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
}

function gammaDecode(v: number): number {
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

function f(t: number): number {
  return t > EPSILON ? Math.cbrt(t) : (KAPPA * t + 16) / 116;
}

/** CIELAB (D65) to gamma-encoded sRGB, clamped to [0, 1], with an in-gamut flag. */
export function labToSrgb(L: number, a: number, b: number): Srgb {
  const fy = (L + 16) / 116;
  const fx = fy + a / 500;
  const fz = fy - b / 200;
  const x = WHITE.x * fInv(fx);
  const y = WHITE.y * (L > KAPPA * EPSILON ? fy ** 3 : L / KAPPA);
  const z = WHITE.z * fInv(fz);

  const lin = [
    3.2404542 * x - 1.5371385 * y - 0.4985314 * z,
    -0.969266 * x + 1.8760108 * y + 0.041556 * z,
    0.0556434 * x - 0.2040259 * y + 1.0572252 * z,
  ];
  const inGamut = lin.every((v) => v >= -GAMUT_EPS && v <= 1 + GAMUT_EPS);
  const [r, g, bl] = lin.map((v) => gammaEncode(Math.min(1, Math.max(0, v))));
  return {
    r, g, b: bl, inGamut,
  };
}

/** Gamma-encoded sRGB in [0, 1] to CIELAB (D65). Used by the tests and the gallery readout. */
export function srgbToLab(r: number, g: number, b: number): { L: number; a: number; b: number } {
  const [lr, lg, lb] = [r, g, b].map(gammaDecode);
  const x = 0.4124564 * lr + 0.3575761 * lg + 0.1804375 * lb;
  const y = 0.2126729 * lr + 0.7151522 * lg + 0.072175 * lb;
  const z = 0.0193339 * lr + 0.119192 * lg + 0.9503041 * lb;
  const fx = f(x / WHITE.x);
  const fy = f(y / WHITE.y);
  const fz = f(z / WHITE.z);
  return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

/** `#RRGGBB` to CIELAB. */
export function hexToLab(hex: string): { L: number; a: number; b: number } {
  const v = hex.replace('#', '');
  return srgbToLab(
    parseInt(v.slice(0, 2), 16) / 255,
    parseInt(v.slice(2, 4), 16) / 255,
    parseInt(v.slice(4, 6), 16) / 255,
  );
}

function toHex(v: number): string {
  return Math.round(v * 255).toString(16).padStart(2, '0').toUpperCase();
}

/** The colour at lightness L, chroma c and hue angle h (degrees) as `#RRGGBB`. */
export function lchToHex(L: number, c: number, h: number): string {
  const rad = (h * Math.PI) / 180;
  const { r, g, b } = labToSrgb(L, c * Math.cos(rad), c * Math.sin(rad));
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function allHuesInGamut(L: number, c: number): boolean {
  for (let h = 0; h < 360; h += 1) {
    const rad = (h * Math.PI) / 180;
    if (!labToSrgb(L, c * Math.cos(rad), c * Math.sin(rad)).inGamut) return false;
  }
  return true;
}

const chromaCache = new Map<number, number>();

/**
 * The largest chroma at which every hue (checked at 1 degree steps) of the CIELAB circle at
 * lightness `L` is inside the sRGB gamut. Binary search to 0.01; memoised per L.
 */
export function maxInGamutChroma(L: number): number {
  const cached = chromaCache.get(L);
  if (cached !== undefined) return cached;
  let lo = 0;
  let hi = 150;
  while (hi - lo > 0.01) {
    const mid = (lo + hi) / 2;
    if (allHuesInGamut(L, mid)) lo = mid; else hi = mid;
  }
  chromaCache.set(L, lo);
  return lo;
}

/**
 * The chroma the palette uses: the in-gamut maximum at `LAB_L`, rounded down to a whole unit so
 * hues between the 1 degree test steps (any `hueOffset`) stay in gamut too.
 */
export const PALETTE_CHROMA = Math.floor(maxInGamutChroma(C.LAB_L));

/** Number of hues on the wheel; one per cluster. */
export const PALETTE_SIZE = 6;

/** The hue angles (degrees, in [0, 360)) of the palette for one rotation. */
export function paletteHues(hueOffset = 0): number[] {
  return Array.from({ length: PALETTE_SIZE }, (_, k) => {
    const h = (hueOffset + (360 / PALETTE_SIZE) * k) % 360;
    return h < 0 ? h + 360 : h;
  });
}

/** Six `#RRGGBB` colours at hue angles `hueOffset + 60 k`, fixed `LAB_L` and `PALETTE_CHROMA`. */
export function makePalette(hueOffset = 0): string[] {
  return paletteHues(hueOffset).map((h) => lchToHex(C.LAB_L, PALETTE_CHROMA, h));
}
