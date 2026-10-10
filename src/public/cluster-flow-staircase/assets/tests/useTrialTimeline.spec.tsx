import { act, renderHook } from '@testing-library/react';
import {
  afterEach, beforeEach, describe, expect, test, vi,
} from 'vitest';
import {
  TRIAL_TIMELINE, TimelinePhase, plannedMs, useTrialTimeline,
} from '../useTrialTimeline';

const FRAME_MS = 1000 / 60;
let clock = 0;
let frameCallbacks: FrameRequestCallback[] = [];

function runFrames(count: number) {
  for (let i = 0; i < count; i += 1) {
    clock += FRAME_MS;
    const pending = frameCallbacks;
    frameCallbacks = [];
    // eslint-disable-next-line no-loop-func
    act(() => {
      pending.forEach((callback) => callback(clock));
    });
  }
}

beforeEach(() => {
  clock = 0;
  frameCallbacks = [];
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frameCallbacks.push(callback);
    return frameCallbacks.length;
  });
  vi.stubGlobal('cancelAnimationFrame', () => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useTrialTimeline', () => {
  test('the timeline is fixation 500, s1 200, mask 150, blank 250, s2 200, mask2 150, blank2 250', () => {
    expect(TRIAL_TIMELINE.map(({ phase, ms }) => [phase, ms])).toEqual([
      ['fixation', 500], ['s1', 200], ['mask', 150], ['blank', 250], ['s2', 200], ['mask2', 150], ['blank2', 250],
    ]);
    // 1 700 ms to the prompt, as before the second mask was added
    expect(TRIAL_TIMELINE.reduce((sum, { ms }) => sum + ms, 0)).toBe(1700);
    expect(plannedMs('blank2', FRAME_MS)).toBeCloseTo(250, 6);
    expect(plannedMs('mask2', 1000 / 144)).toBeCloseTo(22 * (1000 / 144), 6);
  });

  test('stays idle until activated', () => {
    const { result } = renderHook(() => useTrialTimeline(false, FRAME_MS));
    runFrames(100);
    expect(result.current.phase).toBe('idle');
  });

  test('walks through every phase in order and records paint-to-paint durations', () => {
    const { result } = renderHook(() => useTrialTimeline(true, FRAME_MS));
    const seen: TimelinePhase[] = [result.current.phase];
    for (let i = 0; i < 150; i += 1) {
      runFrames(1);
      if (seen[seen.length - 1] !== result.current.phase) seen.push(result.current.phase);
    }
    expect(seen).toEqual(['fixation', 's1', 'mask', 'blank', 's2', 'mask2', 'blank2', 'end']);
    const { measured, endedAt } = result.current;
    TRIAL_TIMELINE.forEach(({ phase, ms }) => expect(measured.current[phase]).toBeCloseTo(ms, 0));
    expect(endedAt.current).toBeGreaterThan(1700);
  });

  test('rounds every duration to whole frames of the refresh period', () => {
    const period = 1000 / 144;
    const { result } = renderHook(() => useTrialTimeline(true, period));
    for (let i = 0; i < 150; i += 1) runFrames(1);
    // at 60 Hz steps of the fake clock, 150 ms at 144 Hz is 22 frames -> 22 x 16.7 ms
    expect(result.current.measured.current.mask).toBeCloseTo(Math.round(150 / period) * FRAME_MS, 6);
  });

  test('records each phase\'s onset; stop() cuts the current phase and ends the run there', () => {
    const { result } = renderHook(() => useTrialTimeline(true, FRAME_MS));
    let guard = 0;
    while (result.current.phase !== 'mask2' && guard < 200) {
      runFrames(1);
      guard += 1;
    }
    runFrames(3);
    const { onsets, measured } = result.current;
    expect(onsets.current.mask2).toBeGreaterThan(onsets.current.s2 as number);
    const at = (onsets.current.mask2 as number) + 40;
    act(() => result.current.stop(at));
    expect(measured.current.mask2).toBeCloseTo(40, 6);
    runFrames(60);
    expect(result.current.phase).toBe('mask2');
    expect(measured.current.blank2).toBe(0);
  });

  test('a new run key restarts the timeline from the fixation', () => {
    const { result, rerender } = renderHook(({ key }) => useTrialTimeline(true, FRAME_MS, key), {
      initialProps: { key: 1 },
    });
    runFrames(150);
    expect(result.current.phase).toBe('end');
    rerender({ key: 2 });
    expect(result.current.phase).toBe('fixation');
    runFrames(35);
    expect(result.current.phase).toBe('s1');
  });
});
