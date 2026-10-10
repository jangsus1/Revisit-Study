/**
 * The frame-counted timeline of one cluster-flow trial, shared by the trial runner and the gallery
 * preview:
 *   fixation 500 ms -> stimulus 1 200 ms -> noise mask 150 ms -> blank 250 ms -> stimulus 2 200 ms
 *   -> noise mask 2 150 ms -> blank 250 ms -> end (1 700 ms to the prompt).
 * (Until 2026-10-09 there was no mask after the second stimulus and blank2 lasted 400 ms.)
 *
 * Every duration is converted to whole frames of the measured refresh period. One
 * requestAnimationFrame loop drives the phases; a phase's start is timestamped in the first frame
 * after its state was committed, so the recorded durations are paint-to-paint.
 */
import {
  MutableRefObject, useCallback, useEffect, useRef, useState,
} from 'react';
import type { MeasuredDurations } from './generator/types';

export type TimedPhase = keyof MeasuredDurations;
/** `idle` before the first run, `end` once the last timed phase is over. */
export type TimelinePhase = 'idle' | TimedPhase | 'end';

export const TRIAL_TIMELINE: readonly { phase: TimedPhase; ms: number }[] = [
  { phase: 'fixation', ms: 500 },
  { phase: 's1', ms: 200 },
  { phase: 'mask', ms: 150 },
  { phase: 'blank', ms: 250 },
  { phase: 's2', ms: 200 },
  { phase: 'mask2', ms: 150 },
  { phase: 'blank2', ms: 250 },
];

export const DEFAULT_REFRESH_MS = 1000 / 60;

export function emptyMeasured(): MeasuredDurations {
  return {
    fixation: 0, s1: 0, mask: 0, blank: 0, s2: 0, mask2: 0, blank2: 0,
  };
}

export interface TrialTimeline {
  phase: TimelinePhase;
  /** paint-to-paint durations of the phases run so far */
  measured: MutableRefObject<MeasuredDurations>;
  /** the rAF timestamp at which the last phase ended (the prompt's start) */
  endedAt: MutableRefObject<number>;
  /**
   * when the current phase began: its first painted frame, or, until that frame comes, the frame at
   * which the previous phase ended
   */
  phaseOnset: MutableRefObject<number>;
  /** the onset (as `phaseOnset`) of every phase that has begun in this run */
  onsets: MutableRefObject<Partial<Record<TimedPhase, number>>>;
  /**
   * Stops the timeline at time `at` (an early answer during mask2 or blank2): the current phase's measured
   * duration is cut there and no later phase runs; `phase` keeps its value.
   */
  stop: (at: number) => void;
}

/** The frame-counted duration of a timeline phase at the given refresh period, ms. */
export function plannedMs(phase: TimedPhase, refreshMs: number): number {
  const period = refreshMs > 0 ? refreshMs : DEFAULT_REFRESH_MS;
  const ms = TRIAL_TIMELINE.find((p) => p.phase === phase)?.ms ?? 0;
  return Math.max(1, Math.round(ms / period)) * period;
}

/**
 * Runs the timeline while `active` is true. Changing `runKey` while active restarts it from the
 * fixation, which is how the gallery replays a trial.
 */
export function useTrialTimeline(active: boolean, refreshMs: number, runKey = 0): TrialTimeline {
  const [phase, setPhase] = useState<TimelinePhase>(active ? TRIAL_TIMELINE[0].phase : 'idle');
  const measured = useRef<MeasuredDurations>(emptyMeasured());
  const endedAt = useRef(0);
  const phaseOnset = useRef(0);
  const onsets = useRef<Partial<Record<TimedPhase, number>>>({});
  const stopRef = useRef<(at: number) => void>(() => undefined);

  useEffect(() => {
    if (!active) {
      return undefined;
    }

    measured.current = emptyMeasured();
    onsets.current = {};
    setPhase(TRIAL_TIMELINE[0].phase);

    const period = refreshMs > 0 ? refreshMs : DEFAULT_REFRESH_MS;
    const framesFor = (ms: number) => Math.max(1, Math.round(ms / period));

    let index = 0;
    let frames = 0;
    let phaseStart = 0;
    let pendingStart = true;
    let rafId = 0;
    let cancelled = false;

    const step = (now: number) => {
      if (cancelled) {
        return;
      }
      rafId = requestAnimationFrame(step);

      if (pendingStart) {
        // First frame after the phase was committed: this is when it became visible.
        phaseStart = now;
        phaseOnset.current = now;
        onsets.current[TRIAL_TIMELINE[index].phase] = now;
        frames = 0;
        pendingStart = false;
        return;
      }

      frames += 1;
      if (frames < framesFor(TRIAL_TIMELINE[index].ms)) {
        return;
      }

      measured.current[TRIAL_TIMELINE[index].phase] = now - phaseStart;
      index += 1;

      if (index >= TRIAL_TIMELINE.length) {
        cancelled = true;
        cancelAnimationFrame(rafId);
        endedAt.current = now;
        setPhase('end');
        return;
      }

      setPhase(TRIAL_TIMELINE[index].phase);
      phaseOnset.current = now;
      onsets.current[TRIAL_TIMELINE[index].phase] = now;
      pendingStart = true;
    };

    stopRef.current = (at: number) => {
      if (cancelled) return;
      cancelled = true;
      cancelAnimationFrame(rafId);
      measured.current[TRIAL_TIMELINE[index].phase] = Math.max(0, at - phaseOnset.current);
    };

    rafId = requestAnimationFrame(step);

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
    };
  }, [active, refreshMs, runKey]);

  const stop = useCallback((at: number) => stopRef.current(at), []);

  return {
    phase, measured, endedAt, phaseOnset, onsets, stop,
  };
}
