import { useCallback, useEffect, useRef } from 'react';
import { gazeTracker } from './gazeTracker';

/**
 * Head position log for a whole page (not only while the plot is shown), to see where people move
 * (after the dots, on the slider, while reading feedback): trace = [t_ms_since_mount, x_mm, y_mm, z_mm]
 * (raw MediaPipe face origin, camera frame) at <= 5 Hz; marks = [t_ms, label] when the screen changes.
 */
export function useHeadTrace(label: string | null | undefined) {
  const t0 = useRef(performance.now());
  const trace = useRef<number[][]>([]);
  const marks = useRef<[number, string][]>([]);
  const last = useRef(-Infinity);
  useEffect(() => gazeTracker.onSample((s) => {
    const t = s.t - t0.current;
    if (!s.face || !s.origin || t - last.current < 200) return;
    last.current = t;
    trace.current.push([Math.round(t), ...s.origin.map((v) => Math.round(v * 10))]);
  }), []);
  useEffect(() => {
    if (label !== undefined && label !== null) marks.current.push([Math.round(performance.now() - t0.current), String(label)]);
  }, [label]);
  return useCallback(() => ({ headTrace: trace.current, headMarks: marks.current }), []);
}
