/**
 * The colour-cue palette: six colours on an ellipse in CIELAB. The colour-wheel method of Zhang &
 * Luck (2008) and Luck & Vogel samples a circle at fixed lightness and chroma, which inside sRGB
 * caps the chroma at about 29 at L* 50 and leaves neighbouring colours only about 17.5 CIEDE2000
 * apart. Here the circle is replaced by a planar slice through the colour solid that is tilted out
 * of the a*b* plane (`COLOR_ELLIPSE`), so lightness, chroma and hue all change around it and the
 * colours are further apart (worst pair about 28 CIEDE2000) while the whole ellipse stays in sRGB.
 * The six samples are spaced evenly by arc length in CIELAB, so neighbours are about equally far
 * apart, and the ellipse is rotated per participant (`hueOffset`, degrees of the full perimeter;
 * 60 degrees moves every colour on to the next) so no colour is tied to a cluster size.
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

/** CIELAB to `#RRGGBB` (clamped to sRGB). */
export function labToHex(L: number, a: number, b: number): string {
  const { r, g, b: bl } = labToSrgb(L, a, b);
  return `#${toHex(r)}${toHex(g)}${toHex(bl)}`;
}

/** The colour at lightness L, chroma c and hue angle h (degrees) as `#RRGGBB`. */
export function lchToHex(L: number, c: number, h: number): string {
  const rad = (h * Math.PI) / 180;
  return labToHex(L, c * Math.cos(rad), c * Math.sin(rad));
}

export interface Lab { L: number; a: number; b: number }

/**
 * CIEDE2000 colour difference (Sharma, Wu & Dalal 2005, kL = kC = kH = 1). Used to choose and to
 * test the ellipse, and for the gallery readout.
 */
export function deltaE2000(p: Lab, q: Lab): number {
  const deg = Math.PI / 180;
  const c1 = Math.hypot(p.a, p.b);
  const c2 = Math.hypot(q.a, q.b);
  const cBar7 = ((c1 + c2) / 2) ** 7;
  const g = 0.5 * (1 - Math.sqrt(cBar7 / (cBar7 + 25 ** 7)));
  const a1 = (1 + g) * p.a;
  const a2 = (1 + g) * q.a;
  const c1p = Math.hypot(a1, p.b);
  const c2p = Math.hypot(a2, q.b);
  const hue = (b: number, a: number) => ((Math.atan2(b, a) / deg) + 360) % 360;
  const h1 = hue(p.b, a1);
  const h2 = hue(q.b, a2);
  const zero = c1p * c2p === 0;
  let dh = zero ? 0 : h2 - h1;
  if (dh > 180) dh -= 360; else if (dh < -180) dh += 360;
  const dL = q.L - p.L;
  const dC = c2p - c1p;
  const dH = 2 * Math.sqrt(c1p * c2p) * Math.sin((dh / 2) * deg);
  const lBar = (p.L + q.L) / 2;
  const cBarP = (c1p + c2p) / 2;
  let hBar = h1 + h2;
  if (!zero) {
    if (Math.abs(h1 - h2) > 180) hBar += h1 + h2 < 360 ? 360 : -360;
    hBar /= 2;
  }
  const t = 1 - 0.17 * Math.cos((hBar - 30) * deg) + 0.24 * Math.cos(2 * hBar * deg)
    + 0.32 * Math.cos((3 * hBar + 6) * deg) - 0.2 * Math.cos((4 * hBar - 63) * deg);
  const dTheta = 30 * Math.exp(-(((hBar - 275) / 25) ** 2));
  const rc = 2 * Math.sqrt(cBarP ** 7 / (cBarP ** 7 + 25 ** 7));
  const sl = 1 + (0.015 * (lBar - 50) ** 2) / Math.sqrt(20 + (lBar - 50) ** 2);
  const sc = 1 + 0.045 * cBarP;
  const sh = 1 + 0.015 * cBarP * t;
  const rt = -Math.sin(2 * dTheta * deg) * rc;
  return Math.sqrt((dL / sl) ** 2 + (dC / sc) ** 2 + (dH / sh) ** 2 + rt * (dC / sc) * (dH / sh));
}

/** The point of `COLOR_ELLIPSE` at parameter angle `t` (radians). */
export function ellipsePoint(t: number): Lab {
  const {
    centre, major, minor, axisHue, tilt,
  } = C.COLOR_ELLIPSE;
  const h = (axisHue * Math.PI) / 180;
  const k = (tilt * Math.PI) / 180;
  // major axis in the a*b* plane; minor axis perpendicular to it in a*b*, tilted towards +L*
  const u = { L: 0, a: Math.cos(h), b: Math.sin(h) };
  const v = { L: Math.sin(k), a: -Math.sin(h) * Math.cos(k), b: Math.cos(h) * Math.cos(k) };
  const cu = major * Math.cos(t);
  const cv = minor * Math.sin(t);
  return {
    L: centre[0] + cu * u.L + cv * v.L,
    a: centre[1] + cu * u.a + cv * v.a,
    b: centre[2] + cu * u.b + cv * v.b,
  };
}

/** Samples of the ellipse used for the arc-length table and the gamut tests. */
export const ELLIPSE_STEPS = 3600;

const arcTable: { t: number[]; s: number[] } = (() => {
  const t: number[] = [];
  const s: number[] = [0];
  let prev = ellipsePoint(0);
  for (let i = 0; i <= ELLIPSE_STEPS; i += 1) {
    const ti = (2 * Math.PI * i) / ELLIPSE_STEPS;
    t.push(ti);
    if (i > 0) {
      const p = ellipsePoint(ti);
      s.push(s[i - 1] + Math.hypot(p.L - prev.L, p.a - prev.a, p.b - prev.b));
      prev = p;
    }
  }
  return { t, s };
})();

/** The ellipse's perimeter in CIELAB units. */
export const ELLIPSE_PERIMETER = arcTable.s[ELLIPSE_STEPS];

/** The point a fraction `f` (any real; wrapped into [0, 1)) of the perimeter along the ellipse. */
export function ellipseAtArc(f: number): Lab {
  const target = (((f % 1) + 1) % 1) * ELLIPSE_PERIMETER;
  let lo = 0;
  let hi = ELLIPSE_STEPS;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1; // eslint-disable-line no-bitwise
    if (arcTable.s[mid] <= target) lo = mid; else hi = mid;
  }
  const w = (target - arcTable.s[lo]) / Math.max(1e-12, arcTable.s[hi] - arcTable.s[lo]);
  return ellipsePoint(arcTable.t[lo] + w * (arcTable.t[hi] - arcTable.t[lo]));
}

/** Number of colours; one per cluster. */
export const PALETTE_SIZE = 6;

/**
 * The positions of the six colours along the ellipse, in degrees of the perimeter (in [0, 360)),
 * for one rotation: `hueOffset + 60 k`.
 */
export function palettePositions(hueOffset = 0): number[] {
  return Array.from({ length: PALETTE_SIZE }, (_, k) => {
    const d = (hueOffset + (360 / PALETTE_SIZE) * k) % 360;
    return d < 0 ? d + 360 : d;
  });
}

/** The six palette colours in CIELAB for one rotation. */
export function paletteLab(hueOffset = 0): Lab[] {
  return palettePositions(hueOffset).map((d) => ellipseAtArc(d / 360));
}

/** The six palette colours as `#RRGGBB` for one rotation. */
export function makePalette(hueOffset = 0): string[] {
  return paletteLab(hueOffset).map((p) => labToHex(p.L, p.a, p.b));
}
