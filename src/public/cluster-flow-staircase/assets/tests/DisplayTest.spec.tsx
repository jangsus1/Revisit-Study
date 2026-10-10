import {
  act, cleanup, render, screen,
} from '@testing-library/react';
import {
  afterEach, beforeEach, describe, expect, test, vi,
} from 'vitest';
import {
  DISPLAY_TEST_CASE, DISPLAY_TEST_SEEDS, DisplayTest, GAP_MS, LEAD_IN_MS,
} from '../DisplayTest';
import type { DisplayTestResult } from '../generator';

const FRAME_MS = 1000 / 60;
let clock = 0;
let frameCallbacks: FrameRequestCallback[] = [];

function runFrames(count: number) {
  for (let i = 0; i < count; i += 1) {
    clock += FRAME_MS;
    const pending = frameCallbacks;
    frameCallbacks = [];
    // eslint-disable-next-line no-loop-func
    act(() => { pending.forEach((callback) => callback(clock)); });
  }
}

function runUntil(done: () => boolean, maxSteps = 2000) {
  for (let i = 0; i < maxSteps && !done(); i += 1) {
    act(() => { vi.advanceTimersByTime(50); });
    runFrames(3);
  }
}

beforeEach(() => {
  clock = 0;
  frameCallbacks = [];
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frameCallbacks.push(callback);
    return frameCallbacks.length;
  });
  vi.stubGlobal('cancelAnimationFrame', () => undefined);
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 900 });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('DisplayTest', () => {
  test('shows a blank frame first, then three real trial timelines of the fixed case', () => {
    const onDone = vi.fn();
    render(<DisplayTest refreshMs={FRAME_MS} onDone={onDone} />);
    expect(screen.getByTestId('display-test-blank')).toBeTruthy();
    expect(screen.queryByTestId('trial-stage')).toBeNull();
    act(() => { vi.advanceTimersByTime(LEAD_IN_MS); });
    expect(screen.getByTestId('layer-s1').getAttribute('data-n')).toBe('24');
    expect(screen.getByTestId('layer-s2').getAttribute('data-stimulus')).toBe('B');
    expect(screen.getByTestId('trial-stage').getAttribute('data-scale')).toBe('1');
    runUntil(() => onDone.mock.calls.length > 0);
    const result: DisplayTestResult = onDone.mock.calls[0][0];
    expect(result.cue).toBe(DISPLAY_TEST_CASE.cue);
    expect(result.seeds).toEqual(DISPLAY_TEST_SEEDS.map(([a, b]) => [a, b]));
    expect(result.scale).toBe(1);
    expect(result.passed).toBe(true);
    expect(result.rounds[0].runs).toHaveLength(3);
    expect(GAP_MS).toBeLessThan(LEAD_IN_MS);
  });

  test('leaving full screen drops the round\'s runs and restarts it once full screen is back', () => {
    const onDone = vi.fn();
    const { rerender } = render(<DisplayTest refreshMs={FRAME_MS} onDone={onDone} />);
    runUntil(() => screen.getByTestId('display-test').getAttribute('data-run') === '1');
    rerender(<DisplayTest refreshMs={FRAME_MS} onDone={onDone} blocked />);
    expect(screen.getByTestId('display-test').getAttribute('data-run')).toBe('0');
    expect(screen.queryByTestId('trial-stage')).toBeNull();
    act(() => { vi.advanceTimersByTime(5000); });
    runFrames(200);
    expect(onDone).not.toHaveBeenCalled();
    rerender(<DisplayTest refreshMs={FRAME_MS} onDone={onDone} />);
    runUntil(() => onDone.mock.calls.length > 0);
    const result: DisplayTestResult = onDone.mock.calls[0][0];
    expect(result.restarts).toBe(1);
    expect(result.rounds).toHaveLength(1);
    expect(result.rounds[0].runs).toHaveLength(3);
    expect(result.passed).toBe(true);
  });
});
