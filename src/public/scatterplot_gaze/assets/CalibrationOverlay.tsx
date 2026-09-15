/**
 * Full-viewport fixation-dot overlay plus timed calibration / validation sequences.
 * Dots are positioned in normalized screen coordinates ([-0.5, 0.5], origin = viewport centre,
 * y down) so they match the tracker's normPog frame exactly.
 */
import {
  useCallback, useEffect, useRef, useState,
} from 'react';
import { gazeTracker, normToPx } from './gazeTracker';
import type { GazeSample } from './gazeTracker';
import type { CalibResult } from '../../../gazeEngine/webeyetrack/types';

export type NormPoint = { nx: number; ny: number };

export type ValidationPoint = NormPoint & { n: number; errorPx: number | null };
export type ValidationResult = {
  points: ValidationPoint[];
  meanErrorPx: number | null;   // null when no usable samples were collected
  meanErrorPctW: number | null;
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
export function shortCalibPoints(trialIndex: number): NormPoint[] {
  const start = ((trialIndex % 8) + 8) % 8;
  return [OUTER[start], OUTER[(start + 3) % 8], OUTER[(start + 6) % 8]];
}

const sleep = (ms: number) => new Promise<void>((resolve) => { setTimeout(resolve, ms); });

export function useDotSequence() {
  const [dot, setDot] = useState<NormPoint | null>(null);
  const [collecting, setCollecting] = useState(false);
  const [message, setMessage] = useState('');
  const cancelled = useRef(false);

  // Reset on (re)mount so React StrictMode's simulated unmount does not leave it cancelled forever
  useEffect(() => {
    cancelled.current = false;
    return () => { cancelled.current = true; };
  }, []);

  const showDot = useCallback(async (pt: NormPoint, dwellMs: number, collectMs: number, during: () => Promise<unknown>) => {
    setDot(pt);
    setCollecting(false);
    await sleep(Math.max(0, dwellMs - collectMs));
    if (cancelled.current) return null;
    setCollecting(true);
    const result = await during();
    setCollecting(false);
    return result;
  }, []);

  /** Show each point; during the last `collectMs` the tracker adapts to it. */
  const runCalibration = useCallback(async (
    points: NormPoint[],
    ptType: 'calib' | 'click',
    dwellMs = 1800,
    collectMs = 1000,
  ): Promise<CalibResult[]> => {
    const results: CalibResult[] = [];
    for (let i = 0; i < points.length; i += 1) {
      if (cancelled.current) break;
      setMessage(`Look at the dot (${i + 1} / ${points.length})`);
      // eslint-disable-next-line no-await-in-loop
      const r = await showDot(points[i], dwellMs, collectMs, () => gazeTracker.calibrate(points[i].nx, points[i].ny, collectMs, ptType));
      if (r) results.push(r as CalibResult);
    }
    setDot(null);
    return results;
  }, [showDot]);

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
        const errors: number[] = [];
        const unsub = gazeTracker.onSample((s: GazeSample) => {
          if (!s.open || !s.face) return;
          const [gx, gy] = normToPx(s.nx, s.ny);
          errors.push(Math.hypot(gx - tx, gy - ty));
        });
        setTimeout(() => {
          unsub();
          resolve({
            ...points[i],
            n: errors.length,
            errorPx: errors.length ? errors.reduce((a, b) => a + b, 0) / errors.length : null,
          });
        }, collectMs);
      }));
      if (r) out.push(r as ValidationPoint);
    }
    setDot(null);
    const valid = out.filter((p) => p.errorPx !== null) as (ValidationPoint & { errorPx: number })[];
    const meanErrorPx = valid.length ? valid.reduce((a, p) => a + p.errorPx, 0) / valid.length : null;
    return {
      points: out,
      meanErrorPx,
      meanErrorPctW: meanErrorPx === null ? null : meanErrorPx / window.innerWidth,
      viewport: [window.innerWidth, window.innerHeight],
      hz: gazeTracker.hz,
    };
  }, [showDot]);

  return {
    dot, collecting, message, setMessage, runCalibration, runValidation,
  };
}

export function CalibrationOverlay({
  dot, collecting, message, children,
}: {
  dot: NormPoint | null;
  collecting: boolean;
  message?: string;
  children?: React.ReactNode;
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
      {dot && (
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
      {message && (
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
