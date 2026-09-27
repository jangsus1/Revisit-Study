import { act, renderHook } from '@testing-library/react';
import {
  afterEach, beforeEach, describe, expect, test, vi,
} from 'vitest';
import { TRIAL_TIMELINE, TimelinePhase, useTrialTimeline } from '../useTrialTimeline';

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
  test('the timeline is fixation 500, s1 200, mask 150, blank 250, s2 200, blank2 400', () => {
    expect(TRIAL_TIMELINE.map(({ phase, ms }) => [phase, ms])).toEqual([
      ['fixation', 500], ['s1', 200], ['mask', 150], ['blank', 250], ['s2', 200], ['blank2', 400],
    ]);
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
    expect(seen).toEqual(['fixation', 's1', 'mask', 'blank', 's2', 'blank2', 'end']);
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
