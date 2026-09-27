/**
 * Accuracy / precision metrics for one validation run of one engine (standard webcam
 * eye-tracking measures, all in viewport px):
 *  - accuracy: per dot, median distance between gaze samples and the target; averaged over dots
 *  - precision SD: RMS distance of samples from their own centroid (spread)
 *  - precision RMS-S2S: RMS distance between consecutive samples (jitter)
 *  - bias: mean (gaze - target) over dots; "after bias" = error left if a perfect constant
 *    drift offset were applied (what a centre-dot drift fix can at best achieve)
 *  - data loss: share of frames without a valid estimate (no face, blink, not calibrated)
 */
import type { EngineSample } from './types';

export type DotSamples = { tx: number; ty: number; samples: EngineSample[]; collectMs: number };

export type DotMetrics = {
  tx: number; ty: number;
  n: number; nValid: number;
  errorPx: number | null;            // median sample error
  centroid: [number, number] | null; // median gaze position
  offsetPx: [number, number] | null; // centroid - target
  sdPx: number | null;
  s2sPx: number | null;
};

export type RunMetrics = {
  dots: DotMetrics[];
  accuracyPx: number | null;
  accuracyPctW: number | null;
  dotErr: { min: number; median: number; p90: number; max: number } | null;
  sampleErr: { p10: number; p25: number; p50: number; p75: number; p90: number } | null;
  sdPx: number | null;
  s2sPx: number | null;
  biasPx: [number, number] | null;
  afterBiasPx: number | null;
  lossPct: number;
  hz: number;
};

const median = (a: number[]) => quantile(a, 0.5);
export function quantile(values: number[], q: number): number {
  const s = [...values].sort((a, b) => a - b);
  if (!s.length) return NaN;
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}
const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
const orNull = (v: number) => (Number.isFinite(v) ? v : null);

export function dotMetrics(d: DotSamples): DotMetrics {
  const ok = d.samples.filter((s) => s.valid);
  const base = {
    tx: d.tx, ty: d.ty, n: d.samples.length, nValid: ok.length,
  };
  if (ok.length < 2) {
    return {
      ...base, errorPx: null, centroid: null, offsetPx: null, sdPx: null, s2sPx: null,
    };
  }
  const mx = mean(ok.map((s) => s.x));
  const my = mean(ok.map((s) => s.y));
  const cx = median(ok.map((s) => s.x));
  const cy = median(ok.map((s) => s.y));
  const sd = Math.sqrt(mean(ok.map((s) => (s.x - mx) ** 2 + (s.y - my) ** 2)));
  const steps = ok.slice(1).map((s, i) => (s.x - ok[i].x) ** 2 + (s.y - ok[i].y) ** 2);
  return {
    ...base,
    errorPx: median(ok.map((s) => Math.hypot(s.x - d.tx, s.y - d.ty))),
    centroid: [cx, cy],
    offsetPx: [cx - d.tx, cy - d.ty],
    sdPx: sd,
    s2sPx: Math.sqrt(mean(steps)),
  };
}

export function runMetrics(dots: DotSamples[], viewportW: number): RunMetrics {
  const dm = dots.map(dotMetrics);
  const errs = dm.map((d) => d.errorPx).filter((v): v is number => v !== null);
  const offs = dm.map((d) => d.offsetPx).filter((v): v is [number, number] => v !== null);
  const all = dots.flatMap((d) => d.samples.filter((s) => s.valid).map((s) => Math.hypot(s.x - d.tx, s.y - d.ty)));
  const total = dots.reduce((a, d) => a + d.samples.length, 0);
  const valid = dots.reduce((a, d) => a + d.samples.filter((s) => s.valid).length, 0);
  const time = dots.reduce((a, d) => a + d.collectMs, 0);
  const bias: [number, number] | null = offs.length ? [mean(offs.map((o) => o[0])), mean(offs.map((o) => o[1]))] : null;
  const acc = errs.length ? mean(errs) : null;
  return {
    dots: dm,
    accuracyPx: acc,
    accuracyPctW: acc === null ? null : acc / viewportW,
    dotErr: errs.length ? {
      min: Math.min(...errs), median: median(errs), p90: quantile(errs, 0.9), max: Math.max(...errs),
    } : null,
    sampleErr: all.length ? {
      p10: quantile(all, 0.1), p25: quantile(all, 0.25), p50: quantile(all, 0.5), p75: quantile(all, 0.75), p90: quantile(all, 0.9),
    } : null,
    sdPx: orNull(mean(dm.map((d) => d.sdPx).filter((v): v is number => v !== null))),
    s2sPx: orNull(mean(dm.map((d) => d.s2sPx).filter((v): v is number => v !== null))),
    biasPx: bias,
    afterBiasPx: bias ? orNull(mean(offs.map((o) => Math.hypot(o[0] - bias[0], o[1] - bias[1])))) : null,
    lossPct: total ? 100 * (1 - valid / total) : 100,
    hz: time ? (1000 * total) / time : 0,
  };
}
