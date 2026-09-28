/**
 * Full-viewport fixation-dot overlay plus timed calibration / validation sequences.
 * Dots are positioned in normalized screen coordinates ([-0.5, 0.5], origin = viewport centre,
 * y down) so they match the tracker's normPog frame exactly.
 */
import { Loader } from '@mantine/core';
import {
  useCallback, useEffect, useRef, useState,
} from 'react';
import { gazeTracker, meanHeadPose, normToPx } from './gazeTracker';
import type { GazeSample, HeadPose } from './gazeTracker';
import type { CalibResult } from '../../../gazeEngine/webeyetrack/types';

export type NormPoint = { nx: number; ny: number };

/**
 * Pilot diagnostics recorded at every dot, from dot onset to dot removal:
 * [t_ms_since_dot_onset, raw_x_px, raw_y_px, smooth_x_px, smooth_y_px, open01, face_z_mm]
 * (raw = affine-only estimate, smooth = Kalman output, both incl. the drift offset).
 */
export type DotTrace = number[][];

export type ValidationPoint = NormPoint & {
  n: number;
  errorPx: number | null;
  offsetPx: [number, number] | null;   // median (gaze - target) in viewport px
  dwellMs: number;
  collectMs: number;
  trace: DotTrace;
  pose: HeadPose | null;               // mean head pose over the collection window
};

/** Smooth-pursuit record: frames used and a gaze trace against the moving target. */
export type PursuitLog = {
  durationMs: number;
  lagMs: number;
  skipMs: number;
  frames: number;                      // frames that got a target (worker side)
  chunks: number;                      // support-set entries created
  n: number;                           // frames used for adaptation
  // [t_ms_since_motion_onset, raw_x, raw_y, target_x, target_y, open01] (gaze before the pursuit fit)
  trace: number[][];
};

export type CalibPointLog = CalibResult & NormPoint & {
  dwellMs: number;
  collectMs: number;
  fitMs?: number;                      // last point only: time adapting to all points after the dots
  pursuit?: PursuitLog;                // last point only, when a pursuit phase ran
  trace: DotTrace;                     // predictions before this dot was added to the calibration
  pose: HeadPose | null;
};
export type ValidationResult = {
  points: ValidationPoint[];
  meanErrorPx: number | null;   // null when no usable samples were collected
  meanErrorPctW: number | null;
  meanOffsetPx: [number, number] | null;
  viewport: [number, number];
  hz: number;
};

export const FULL_GRID: NormPoint[] = [-0.4, 0, 0.4].flatMap((ny) => [-0.4, 0, 0.4].map((nx) => ({ nx, ny })));
export const VALIDATION_POINTS: NormPoint[] = [
  { nx: 0, ny: 0 }, { nx: -0.3, ny: -0.3 }, { nx: 0.3, ny: -0.3 }, { nx: -0.3, ny: 0.3 }, { nx: 0.3, ny: 0.3 },
];
// Eight outer grid points; a short calibration picks three of them, rotated per trial.
const OUTER: NormPoint[] = [
  { nx: -0.35, ny: -0.35 }, { nx: 0, ny: -0.35 }, { nx: 0.35, ny: -0.35 }, { nx: 0.35, ny: 0 },
  { nx: 0.35, ny: 0.35 }, { nx: 0, ny: 0.35 }, { nx: -0.35, ny: 0.35 }, { nx: -0.35, ny: 0 },
];
export function shortCalibPoints(trialIndex: number, count = 3): NormPoint[] {
  const start = ((trialIndex % 8) + 8) % 8;
  const step = count >= 8 ? 1 : Math.max(1, Math.round(8 / count));
  return Array.from({ length: Math.min(count, 8) }, (_, i) => OUTER[(start + i * step) % 8]);
}

const sleep = (ms: number) => new Promise<void>((resolve) => { setTimeout(resolve, ms); });

/** Resolve after the browser has painted the current state (so a new screen is visible before heavy work). */
export const nextPaint = () => new Promise<void>((resolve) => {
  requestAnimationFrame(() => requestAnimationFrame(() => { setTimeout(resolve, 0); }));
});

// Smooth pursuit (continuous calibration): the dot follows a 3:2 Lissajous curve over 80 % of the
// viewport (smooth, passes the centre region many times; peak speed ~0.31 viewport widths/s, about
// 14 deg/s on a laptop). Frames are paired with the dot position PURSUIT_LAG_MS earlier (camera +
// pipeline latency); the first PURSUIT_SKIP_MS of motion (catch-up saccade) are not used.
export const PURSUIT_MS = 20000;
export const PURSUIT_LAG_MS = 80;
export const PURSUIT_SKIP_MS = 600;
export const PURSUIT_LEAD_MS = 1200;   // dot waits at its start position before moving
export function lissajous(u: number): [number, number] {
  return [
    (0.5 + 0.4 * Math.sin(2 * Math.PI * 3 * u + Math.PI / 2)) * window.innerWidth,
    (0.5 + 0.4 * Math.sin(2 * Math.PI * 2 * u)) * window.innerHeight,
  ];
}

/** Move `el` along the Lissajous path for durationMs; resolves with the motion onset time. */
export async function animatePursuit(
  getEl: () => HTMLDivElement | null,
  durationMs: number,
  cancelled: () => boolean,
  onStart: (t0: number) => void,
): Promise<number> {
  const place = (p: [number, number]) => {
    const el = getEl();
    if (el) el.style.transform = `translate(${p[0] - 9}px, ${p[1] - 9}px)`;
  };
  place(lissajous(0));
  await sleep(PURSUIT_LEAD_MS);
  const t0 = performance.now();
  onStart(t0);
  await new Promise<void>((resolve) => {
    const step = () => {
      const e = performance.now() - t0;
      if (cancelled() || e >= durationMs) { place(lissajous(1)); resolve(); return; }
      place(lissajous(e / durationMs));
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
  await sleep(PURSUIT_LAG_MS + 100);   // frames still in the pipeline
  return t0;
}

export function useDotSequence() {
  const [dot, setDot] = useState<NormPoint | null>(null);
  const [collecting, setCollecting] = useState(false);
  const [message, setMessage] = useState('');
  const [fitting, setFitting] = useState(false);
  const [pursuitOn, setPursuitOn] = useState(false);
  const pursuitDotRef = useRef<HTMLDivElement | null>(null);
  const cancelled = useRef(false);

  // Reset on (re)mount so React StrictMode's simulated unmount does not leave it cancelled forever
  useEffect(() => {
    cancelled.current = false;
    return () => { cancelled.current = true; };
  }, []);

  /** Show one dot and record every sample from its onset until it is removed. */
  const showDot = useCallback(async (pt: NormPoint, dwellMs: number, collectMs: number, during: () => Promise<unknown>) => {
    const onset = performance.now();
    const trace: DotTrace = [];
    const poseSamples: GazeSample[] = [];
    const collectFrom = onset + Math.max(0, dwellMs - collectMs);
    const unsub = gazeTracker.onSample((s: GazeSample) => {
      const [rx, ry] = normToPx(s.rx, s.ry);
      const [x, y] = normToPx(s.nx, s.ny);
      trace.push([Math.round(s.t - onset), Math.round(rx), Math.round(ry), Math.round(x), Math.round(y),
        s.open && s.face ? 1 : 0, s.origin ? Math.round(s.origin[2] * 10) : -1]);
      if (s.t >= collectFrom) poseSamples.push(s);
    });
    setDot(pt);
    setCollecting(false);
    await sleep(Math.max(0, dwellMs - collectMs));
    if (cancelled.current) { unsub(); return null; }
    setCollecting(true);
    const result = await during();
    setCollecting(false);
    unsub();
    return { result, trace, pose: meanHeadPose(poseSamples) };
  }, []);

  /** Smooth pursuit with the study tracker: the worker buffers frames, then gets the (lagged) path. */
  const runPursuit = useCallback(async (durationMs: number): Promise<PursuitLog> => {
    setDot(null);
    setMessage('Now follow the moving dot with your eyes. Keep your head still.');
    setPursuitOn(true);
    await nextPaint();
    const trace: number[][] = [];
    let t0 = Infinity;
    const target = (t: number) => {
      const e = t - PURSUIT_LAG_MS - t0;
      return e < PURSUIT_SKIP_MS || e > durationMs ? null : lissajous(e / durationMs);
    };
    const unsub = gazeTracker.onSample((s: GazeSample) => {
      if (s.t < t0) return;
      const [rx, ry] = normToPx(s.rx, s.ry);
      const tg = lissajous(Math.min(1, Math.max(0, (s.t - t0) / durationMs)));
      trace.push([Math.round(s.t - t0), Math.round(rx), Math.round(ry), Math.round(tg[0]), Math.round(tg[1]), s.open && s.face ? 1 : 0]);
    });
    await gazeTracker.calibStart(0, 0, true);
    await animatePursuit(() => pursuitDotRef.current, durationMs, () => cancelled.current, (t) => { t0 = t; });
    unsub();
    setPursuitOn(false);
    const path: number[][] = [];
    for (let t = t0; t <= performance.now(); t += 10) {
      const xy = target(t);
      if (xy) path.push([t, xy[0] / window.innerWidth - 0.5, xy[1] / window.innerHeight - 0.5]);
    }
    const r = await gazeTracker.pursuitEnd(path, 12, 10);
    return {
      durationMs, lagMs: PURSUIT_LAG_MS, skipMs: PURSUIT_SKIP_MS, frames: r.frames, chunks: r.chunks, n: r.n, trace,
    };
  }, []);

  /**
   * Show each point and collect eye samples during its last `collectMs` (optionally followed by
   * `pursuitMs` of smooth pursuit); the tracker adapts to all of it only afterwards, on a
   * "Calibrating…" screen, so no dot is held while the model trains.
   */
  const runCalibration = useCallback(async (
    points: NormPoint[],
    ptType: 'calib' | 'click',
    dwellMs = 1800,
    collectMs = 1000,
    pursuitMs = 0,
  ): Promise<CalibPointLog[]> => {
    const results: CalibPointLog[] = [];
    for (let i = 0; i < points.length; i += 1) {
      if (cancelled.current) break;
      setMessage(`Look at the dot (${i + 1} / ${points.length})`);
      // eslint-disable-next-line no-await-in-loop
      const r = await showDot(points[i], dwellMs, collectMs, () => gazeTracker.calibrate(points[i].nx, points[i].ny, collectMs, ptType, true));
      if (r) {
        results.push({
          ...(r.result as CalibResult), ...points[i], dwellMs, collectMs, trace: r.trace, pose: r.pose,
        });
      }
    }
    setDot(null);
    setCollecting(false);
    const pursuit = pursuitMs > 0 && !cancelled.current ? await runPursuit(pursuitMs) : undefined;
    setMessage('');
    setFitting(true);
    await nextPaint();
    try {
      const fit = await gazeTracker.flushCalibration();
      const last = results[results.length - 1];
      if (last) {
        Object.assign(last, {
          entries: fit.entries, distinctTargets: fit.distinctTargets, affineFitted: fit.affineFitted, fitMs: fit.fitMs, pursuit,
        });
      }
    } finally {
      setFitting(false);
    }
    return results;
  }, [showDot, runPursuit]);

  /** Show each point; during the last `collectMs` measure the gaze error (no adaptation). */
  const runValidation = useCallback(async (
    points: NormPoint[],
    dwellMs = 1500,
    collectMs = 800,
    label = 'Keep looking at the dot',
  ): Promise<ValidationResult> => {
    const out: ValidationPoint[] = [];
    for (let i = 0; i < points.length; i += 1) {
      if (cancelled.current) break;
      setMessage(points.length > 1 ? `${label} (${i + 1} / ${points.length})` : label);
      const [tx, ty] = normToPx(points[i].nx, points[i].ny);
      // eslint-disable-next-line no-await-in-loop
      const r = await showDot(points[i], dwellMs, collectMs, () => new Promise<ValidationPoint>((resolve) => {
        // Use the raw (affine-corrected, un-smoothed) estimate: the Kalman output lags large
        // saccades by several hundred ms and would inflate the error right after a dot jump.
        const errors: number[] = [];
        const dxs: number[] = [];
        const dys: number[] = [];
        const unsub = gazeTracker.onSample((s: GazeSample) => {
          if (!s.open || !s.face) return;
          const [gx, gy] = normToPx(s.rx, s.ry);
          errors.push(Math.hypot(gx - tx, gy - ty));
          dxs.push(gx - tx);
          dys.push(gy - ty);
        });
        setTimeout(() => {
          unsub();
          // Median of the most recent half of the window: robust to a late-arriving fixation
          const keep = Math.max(3, Math.floor(errors.length / 2));
          const med = (arr: number[]) => {
            const recent = arr.slice(-keep).sort((a, b) => a - b);
            return recent.length ? recent[Math.floor(recent.length / 2)] : null;
          };
          const median = med(errors);
          const mdx = med(dxs);
          const mdy = med(dys);
          resolve({
            ...points[i],
            n: errors.length,
            errorPx: median,
            offsetPx: mdx === null || mdy === null ? null : [mdx, mdy],
            dwellMs,
            collectMs,
            trace: [],
            pose: null,
          });
        }, collectMs);
      }));
      if (r) out.push({ ...(r.result as ValidationPoint), trace: r.trace, pose: r.pose });
    }
    setDot(null);
    const valid = out.filter((p) => p.errorPx !== null) as (ValidationPoint & { errorPx: number })[];
    const meanErrorPx = valid.length ? valid.reduce((a, p) => a + p.errorPx, 0) / valid.length : null;
    const withOff = out.filter((p) => p.offsetPx !== null) as (ValidationPoint & { offsetPx: [number, number] })[];
    const meanOffsetPx: [number, number] | null = withOff.length
      ? [withOff.reduce((a, p) => a + p.offsetPx[0], 0) / withOff.length, withOff.reduce((a, p) => a + p.offsetPx[1], 0) / withOff.length]
      : null;
    return {
      points: out,
      meanErrorPx,
      meanErrorPctW: meanErrorPx === null ? null : meanErrorPx / window.innerWidth,
      meanOffsetPx,
      viewport: [window.innerWidth, window.innerHeight],
      hz: gazeTracker.hz,
    };
  }, [showDot]);

  return {
    dot, collecting, message, setMessage, runCalibration, runValidation, fitting, pursuitOn, pursuitDotRef,
  };
}

/** The moving smooth-pursuit dot (positioned by animatePursuit via its ref, no CSS transitions). */
export function PursuitDot({ dotRef }: { dotRef: React.RefObject<HTMLDivElement | null> }) {
  return (
    <div
      ref={dotRef}
      style={{
        position: 'absolute', left: 0, top: 0, width: 18, height: 18, borderRadius: 9, background: '#d7263d', boxShadow: '0 0 0 4px rgba(0,0,0,0.08)', willChange: 'transform',
      }}
    >
      <div style={{
        position: 'absolute', left: 7, top: 7, width: 4, height: 4, borderRadius: 2, background: '#fff',
      }}
      />
    </div>
  );
}

export function CalibrationOverlay({
  dot, collecting, message, children, fitting = false, pursuitDotRef, pursuitOn = false,
}: {
  dot: NormPoint | null;
  collecting: boolean;
  message?: string;
  children?: React.ReactNode;
  fitting?: boolean;                                        // "Calibrating…" rest screen
  pursuitOn?: boolean;
  pursuitDotRef?: React.RefObject<HTMLDivElement | null>;
}) {
  const [px, py] = dot ? normToPx(dot.nx, dot.ny) : [0, 0];
  const size = collecting ? 14 : 26;
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2000,
        background: '#ffffff',
        cursor: 'none',
        userSelect: 'none',
      }}
    >
      {fitting && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 18, color: '#444',
        }}
        >
          <Loader size="lg" />
          <div style={{ fontSize: 22, fontWeight: 600 }}>Calibrating…</div>
          <div style={{ fontSize: 16, color: '#666' }}>You can blink and rest your eyes. Please keep your head where it is.</div>
        </div>
      )}
      {pursuitOn && pursuitDotRef && <PursuitDot dotRef={pursuitDotRef} />}
      {dot && !fitting && (
        <div
          style={{
            position: 'absolute',
            left: px - size / 2,
            top: py - size / 2,
            width: size,
            height: size,
            borderRadius: '50%',
            background: collecting ? '#d7263d' : '#1c4e80',
            boxShadow: '0 0 0 4px rgba(0,0,0,0.08)',
            transition: 'left 0.35s ease, top 0.35s ease, width 0.6s ease, height 0.6s ease, background 0.3s',
          }}
        >
          <div
            style={{
              position: 'absolute', left: '50%', top: '50%', width: 4, height: 4, marginLeft: -2, marginTop: -2, borderRadius: '50%', background: '#fff',
            }}
          />
        </div>
      )}
      {message && !fitting && (
        <div style={{
          position: 'absolute', bottom: 24, left: 0, right: 0, textAlign: 'center', color: '#666', fontSize: 16,
        }}
        >
          {message}
        </div>
      )}
      {children}
    </div>
  );
}
