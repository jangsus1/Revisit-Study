import { MantineProvider } from '@mantine/core';
import {
  act, cleanup, fireEvent, render, screen,
} from '@testing-library/react';
import {
  afterEach, beforeEach, describe, expect, test, vi,
} from 'vitest';
import type { Display, GenerateOptions, TrialParams } from '../generator/types';
import TrialRunner from '../TrialRunner';

// The generator and the renderer are mocked: this suite is about the trial's timing, key
// handling and answer shape, all of which are independent of what the stimulus looks like.
function fakeDisplay(seed: number, opts: GenerateOptions): Display {
  return {
    kind: opts.kind,
    seed,
    cue: opts.cue,
    density: opts.density,
    n: opts.kind === 'A' ? 24 : opts.nB ?? 0,
    width: 480,
    height: 360,
    background: '#FFFFFF',
    nodes: [],
    edges: [],
    clusters: [],
    attempts: opts.kind === 'A' ? 1 : 3,
    meta: {},
  };
}

vi.mock('../generator', () => ({
  generateDisplay: (seed: number, opts: GenerateOptions) => fakeDisplay(seed, opts),
}));

vi.mock('../render/StimulusSVG', () => ({
  StimulusSVG: () => <svg data-testid="stimulus-svg" />,
  StimulusFrame: ({ display }: { display?: Display }) => (
    <div data-testid={display ? `frame-${display.kind}` : 'frame-blank'} />
  ),
}));

const FRAME_MS = 1000 / 60;

const params: TrialParams = {
  seedA: 11,
  seedB: 22,
  nB: 34,
  cue: 'color',
  density: 'sparse',
  cellId: 'cell-color-sparse',
  trialIndex: 3,
  staircaseId: 'above',
  feedback: false,
  refreshMs: FRAME_MS,
};

let clock = 0;
let frameCallbacks: FrameRequestCallback[] = [];

/** Runs `count` animation frames, each advancing the clock by one frame period. */
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

function renderTrial(overrides: Partial<TrialParams> = {}) {
  const setAnswer = vi.fn();
  render(
    <MantineProvider>
      <TrialRunner
        parameters={{ ...params, ...overrides }}
        setAnswer={setAnswer}
        answers={{}}
        useTrrack={(() => undefined) as never}
      />
    </MantineProvider>,
  );
  return setAnswer;
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
  vi.stubGlobal('performance', { now: () => clock });
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  }));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('TrialRunner', () => {
  test('runs the timeline and collects a first-interval response', () => {
    const setAnswer = renderTrial();

    // no gate in jsdom: the Fullscreen API is unavailable, so the trial starts straight away
    expect(screen.queryByTestId('fullscreen-gate')).toBeNull();
    expect(screen.getByTestId('trial-runner')).toBeTruthy();

    runFrames(200);
    expect(screen.getByTestId('trial-prompt').textContent).toContain('Which one has more items?');

    fireEvent.keyDown(window, { key: 'i' });

    expect(setAnswer).toHaveBeenCalledTimes(1);
    const { status, answers } = setAnswer.mock.calls[0][0];
    expect(status).toBe(true);
    expect(answers.trial).toBe('first');

    const { trialData } = answers;
    expect(trialData.response).toBe('first');
    // nB (34) is larger, so 'first' is wrong
    expect(trialData.correct).toBe(false);
    expect(trialData.nA).toBe(24);
    expect(trialData.nB).toBe(34);
    expect(trialData.seedA).toBe(11);
    expect(trialData.seedB).toBe(22);
    expect(trialData.attemptsA).toBe(1);
    expect(trialData.attemptsB).toBe(3);
    expect(trialData.cellId).toBe('cell-color-sparse');
    expect(trialData.staircaseId).toBe('above');
    expect(trialData.trialIndex).toBe(3);
    expect(trialData.displayA.kind).toBe('A');
    expect(trialData.displayB.kind).toBe('B');
    expect(trialData.fullscreen).toBe(false);
  });

  test('measures every phase to within a frame of its target', () => {
    const setAnswer = renderTrial();
    runFrames(200);
    fireEvent.keyDown(window, { key: 'j' });

    const { measured } = setAnswer.mock.calls[0][0].answers.trialData;
    expect(measured.fixation).toBeCloseTo(500, 0);
    expect(measured.a).toBeCloseTo(200, 0);
    expect(measured.blank1).toBeCloseTo(400, 0);
    expect(measured.b).toBeCloseTo(200, 0);
    expect(measured.blank2).toBeCloseTo(400, 0);
  });

  test('scores the second interval as correct when it has more items', () => {
    const setAnswer = renderTrial();
    runFrames(200);
    fireEvent.keyDown(window, { key: 'j' });

    const { trial, trialData } = setAnswer.mock.calls[0][0].answers;
    expect(trial).toBe('second');
    expect(trialData.correct).toBe(true);
  });

  test('scores the first interval as correct when the baseline is smaller', () => {
    const setAnswer = renderTrial({ nB: 14 });
    runFrames(200);
    fireEvent.keyDown(window, { key: 'i' });
    expect(setAnswer.mock.calls[0][0].answers.trialData.correct).toBe(true);
  });

  test('shows the stimuli only during their own phases', () => {
    renderTrial();
    const visibility = (testId: string) => (screen.getByTestId(testId).parentElement as HTMLElement).style.visibility;

    runFrames(2);
    expect(visibility('frame-A')).toBe('hidden');
    expect(visibility('frame-B')).toBe('hidden');

    // fixation is 500 ms: one pending frame plus 30 frames
    runFrames(32);
    expect(visibility('frame-A')).toBe('visible');
    expect(visibility('frame-B')).toBe('hidden');
  });

  test('ignores keys other than i and j, and only responds once', () => {
    const setAnswer = renderTrial();
    runFrames(200);

    fireEvent.keyDown(window, { key: 'a' });
    fireEvent.keyDown(window, { key: 'Enter' });
    fireEvent.keyDown(window, { key: ' ' });
    expect(setAnswer).not.toHaveBeenCalled();

    fireEvent.keyDown(window, { key: 'i' });
    fireEvent.keyDown(window, { key: 'j' });
    expect(setAnswer).toHaveBeenCalledTimes(1);
  });

  test('ignores i and j before the prompt', () => {
    const setAnswer = renderTrial();
    runFrames(10);
    fireEvent.keyDown(window, { key: 'i' });
    expect(setAnswer).not.toHaveBeenCalled();
  });

  test('dispatches a synthetic Enter so the study advances', () => {
    const dispatched: KeyboardEvent[] = [];
    window.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        dispatched.push(event);
      }
    });

    renderTrial();
    runFrames(200);
    fireEvent.keyDown(window, { key: 'i' });
    expect(dispatched).toHaveLength(0);

    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(dispatched.length).toBeGreaterThan(0);
  });

  test('shows feedback for practice trials before advancing', () => {
    renderTrial({ feedback: true, nB: 40 });
    runFrames(200);
    fireEvent.keyDown(window, { key: 'j' });

    expect(screen.getByTestId('trial-feedback').textContent).toBe('Correct');

    act(() => {
      vi.advanceTimersByTime(700);
    });
    expect(screen.queryByTestId('trial-feedback')).toBeNull();
  });

  test('shows Incorrect for a wrong practice answer', () => {
    renderTrial({ feedback: true, nB: 40 });
    runFrames(200);
    fireEvent.keyDown(window, { key: 'i' });
    expect(screen.getByTestId('trial-feedback').textContent).toBe('Incorrect');
  });

  test('gates the trial behind a fullscreen prompt when the API is available', () => {
    const requestFullscreen = vi.fn(() => Promise.resolve());
    Object.defineProperty(document.documentElement, 'requestFullscreen', {
      configurable: true,
      value: requestFullscreen,
      writable: true,
    });

    try {
      const setAnswer = renderTrial();
      expect(screen.getByTestId('fullscreen-gate')).toBeTruthy();

      runFrames(200);
      expect(screen.queryByTestId('trial-prompt')).toBeNull();

      fireEvent.click(screen.getByRole('button', { name: 'Click to return to fullscreen' }));
      expect(requestFullscreen).toHaveBeenCalled();

      runFrames(200);
      expect(screen.getByTestId('trial-prompt')).toBeTruthy();
      fireEvent.keyDown(window, { key: 'i' });
      expect(setAnswer).toHaveBeenCalledTimes(1);
    } finally {
      Reflect.deleteProperty(document.documentElement, 'requestFullscreen');
    }
  });
});
