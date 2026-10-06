import { MantineProvider } from '@mantine/core';
import {
  act, cleanup, fireEvent, render, screen,
} from '@testing-library/react';
import {
  afterEach, beforeEach, describe, expect, test, vi,
} from 'vitest';
import type { Display, GenerateOptions, TrialParams } from '../generator/types';
import TrialRunner, { PROMPT_TEXT, READY_TEXT, forgetStartedTrials } from '../TrialRunner';
import { fullscreenSession } from '../ui/fullscreen';

vi.mock('../ui/studyContext', () => ({ useStudyProgress: () => null, useUpcomingCell: () => null }));

// The generator and the renderer are mocked: this suite is about the trial's timing, key
// handling and answer shape, all of which are independent of what the stimulus looks like.
function fakeDisplay(seed: number, opts: GenerateOptions): Display {
  return {
    kind: opts.kind,
    seed,
    cue: opts.cue,
    density: opts.density,
    n: opts.kind === 'A' ? 24 : opts.nB ?? 0,
    width: 720,
    height: 540,
    background: '#FFFFFF',
    nodes: [],
    edges: [],
    clusters: [],
    attempts: opts.kind === 'A' ? 1 : 3,
    meta: {},
  };
}

vi.mock('../generator', () => ({
  generateTrialPair: (seedA: number, seedB: number, opts: Omit<GenerateOptions, 'kind'> & { nB: number }) => ({
    displayA: fakeDisplay(seedA, { ...opts, kind: 'A' }),
    displayB: fakeDisplay(seedB, { ...opts, kind: 'B' }),
  }),
  measureDisplay: (display: Display) => ({ ink: display.n, meanNN: 1 }),
  hashSeed: (...parts: (string | number)[]) => parts.join('|').length,
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
  aFirst: true,
  hueOffset: 17,
  starts: { above: 31, below: 17 },
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
  const advance = vi.fn();
  render(
    <MantineProvider>
      <TrialRunner
        parameters={{ ...params, ...overrides }}
        setAnswer={setAnswer}
        advance={advance}
        answers={{}}
        useTrrack={(() => undefined) as never}
      />
    </MantineProvider>,
  );
  return { setAnswer, advance };
}

beforeEach(() => {
  clock = 0;
  frameCallbacks = [];
  fullscreenSession.exits = 0;
  fullscreenSession.refused = false;
  forgetStartedTrials();
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frameCallbacks.push(callback);
    return frameCallbacks.length;
  });
  vi.stubGlobal('cancelAnimationFrame', () => undefined);
  // jsdom has no 2D canvas; the mask then stays blank, which is all this suite needs
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
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
    const { setAnswer } = renderTrial();

    // no gate in jsdom: the Fullscreen API is unavailable, so the trial starts straight away
    expect(screen.queryByTestId('fullscreen-gate')).toBeNull();
    expect(screen.getByTestId('trial-runner')).toBeTruthy();

    runFrames(200);
    expect(screen.getByTestId('trial-prompt').textContent).toBe(PROMPT_TEXT);
    expect(PROMPT_TEXT).toBe('Which one had more items?');
    // without waitForStart there is no start gate
    expect(screen.queryByTestId('start-gate')).toBeNull();

    fireEvent.keyDown(window, { key: 'f' });

    expect(setAnswer).toHaveBeenCalledTimes(1);
    const { status, answers } = setAnswer.mock.calls[0][0];
    expect(status).toBe(true);
    expect(answers.trial).toBe('first');

    const { trialData } = answers;
    expect(trialData.response).toBe('first');
    expect(trialData.aFirst).toBe(true);
    expect(trialData.hueOffset).toBe(17);
    expect(trialData.starts).toEqual({ above: 31, below: 17 });
    // correctness is not stored here: reVISit keeps the block's correctAnswer on the same record
    expect(trialData.correct).toBeUndefined();
    expect(trialData.aOnLeft).toBeUndefined();
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
    expect(trialData.metricsA).toEqual({ ink: 24, meanNN: 1 });
    expect(trialData.metricsB).toEqual({ ink: 34, meanNN: 1 });
    expect(trialData.fullscreen).toBe(false);
    expect(trialData.fullscreenExits).toBe(0);
    expect(trialData.startWaitMs).toBeNull();
    // jsdom's 1024 x 768 window holds the 720 x 540 test canvas at scale 1; no card, no physical width
    expect(trialData.displayScale).toBe(1);
    expect(trialData.stimulusWidthCm).toBeNull();
  });

  test('measures every phase to within a frame of its target', () => {
    const { setAnswer } = renderTrial();
    runFrames(200);
    fireEvent.keyDown(window, { key: 'j' });

    const { measured } = setAnswer.mock.calls[0][0].answers.trialData;
    expect(Object.keys(measured).sort()).toEqual(['blank', 'blank2', 'fixation', 'mask', 's1', 's2']);
    expect(measured.fixation).toBeCloseTo(500, 0);
    expect(measured.s1).toBeCloseTo(200, 0);
    expect(measured.mask).toBeCloseTo(150, 0);
    expect(measured.blank).toBeCloseTo(250, 0);
    expect(measured.s2).toBeCloseTo(200, 0);
    expect(measured.blank2).toBeCloseTo(400, 0);
  });

  test('writes the chosen interval to the graded trial response', () => {
    const { setAnswer } = renderTrial();
    runFrames(200);
    fireEvent.keyDown(window, { key: 'j' });

    const { trial, trialData } = setAnswer.mock.calls[0][0].answers;
    expect(trial).toBe('second');
    expect(trialData.response).toBe('second');
  });

  test('the arrow keys answer by interval as well', () => {
    const first = renderTrial();
    runFrames(200);
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(first.setAnswer.mock.calls[0][0].answers.trial).toBe('first');
    cleanup();

    const second = renderTrial();
    runFrames(200);
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(second.setAnswer.mock.calls[0][0].answers.trial).toBe('second');
  });

  test('shows everything at one location: a single stage with blank, s1, mask, s2 and fixation layers', () => {
    renderTrial();
    expect(screen.getAllByTestId('trial-stage')).toHaveLength(1);
    ['layer-s1', 'layer-mask', 'layer-s2', 'layer-fixation'].forEach((id) => {
      expect(screen.getByTestId('trial-stage').contains(screen.getByTestId(id))).toBe(true);
    });
    expect(screen.getByTestId('layer-mask').contains(screen.getByTestId('noise-mask'))).toBe(true);
    expect(screen.queryByTestId('slot-left')).toBeNull();
    expect(screen.queryByTestId('slot-right')).toBeNull();
  });

  test('shows A first and B second when aFirst is true', () => {
    renderTrial({ aFirst: true });
    expect(screen.getByTestId('layer-s1').getAttribute('data-stimulus')).toBe('A');
    expect(screen.getByTestId('layer-s2').getAttribute('data-stimulus')).toBe('B');
    expect(screen.getByTestId('layer-s1').contains(screen.getByTestId('frame-A'))).toBe(true);
    expect(screen.getByTestId('layer-s2').contains(screen.getByTestId('frame-B'))).toBe(true);
  });

  test('shows B first when aFirst is false and records it', () => {
    const { setAnswer } = renderTrial({ aFirst: false });
    expect(screen.getByTestId('layer-s1').getAttribute('data-stimulus')).toBe('B');
    expect(screen.getByTestId('layer-s2').getAttribute('data-stimulus')).toBe('A');

    runFrames(200);
    fireEvent.keyDown(window, { key: 'f' });
    expect(setAnswer.mock.calls[0][0].answers.trialData.aFirst).toBe(false);
  });

  test('shows each layer only during its own phase', () => {
    renderTrial();
    const visibility = (testId: string) => screen.getByTestId(testId).style.visibility;
    const visibleLayers = () => ['layer-fixation', 'layer-s1', 'layer-mask', 'layer-s2']
      .filter((id) => visibility(id) === 'visible');

    runFrames(2);
    expect(visibleLayers()).toEqual(['layer-fixation']);

    // fixation is 500 ms: one pending frame plus 30 frames
    runFrames(30);
    expect(visibleLayers()).toEqual(['layer-s1']);

    // s1 is 12 frames (+1 pending), then the 9-frame mask
    runFrames(13);
    expect(visibleLayers()).toEqual(['layer-mask']);

    // mask 9 frames (+1), then the 15-frame blank shows nothing but the blank canvas
    runFrames(10);
    expect(visibleLayers()).toEqual([]);

    runFrames(16);
    expect(visibleLayers()).toEqual(['layer-s2']);

    runFrames(13);
    expect(visibleLayers()).toEqual([]);
    expect(screen.queryByTestId('trial-prompt')).toBeNull();

    runFrames(25);
    expect(screen.getByTestId('trial-prompt')).toBeTruthy();
    expect(visibleLayers()).toEqual([]);
  });

  test('ignores keys other than f, j and the arrows, and only responds once', () => {
    const { setAnswer } = renderTrial();
    runFrames(200);

    fireEvent.keyDown(window, { key: 'a' });
    fireEvent.keyDown(window, { key: 'Enter' });
    fireEvent.keyDown(window, { key: ' ' });
    expect(setAnswer).not.toHaveBeenCalled();

    fireEvent.keyDown(window, { key: 'f' });
    fireEvent.keyDown(window, { key: 'j' });
    expect(setAnswer).toHaveBeenCalledTimes(1);
  });

  test('ignores answer keys before the prompt', () => {
    const { setAnswer } = renderTrial();
    runFrames(10);
    fireEvent.keyDown(window, { key: 'f' });
    expect(setAnswer).not.toHaveBeenCalled();
  });

  test('calls advance() exactly once, after the answer and not before', () => {
    const { advance } = renderTrial();
    runFrames(200);
    expect(advance).not.toHaveBeenCalled();

    fireEvent.keyDown(window, { key: 'f' });
    expect(advance).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(window, { key: 'j' });
    expect(advance).toHaveBeenCalledTimes(1);
  });

  test('keeps the blank overlay after a main-trial answer', () => {
    renderTrial();
    runFrames(200);
    fireEvent.keyDown(window, { key: 'f' });
    expect(screen.getByTestId('trial-runner')).toBeTruthy();
    expect(screen.queryByTestId('trial-prompt')).toBeNull();
    expect(screen.queryByTestId('practice-done')).toBeNull();
  });

  test('practice trials hand over to the platform instead of advancing', () => {
    const { setAnswer, advance } = renderTrial({
      staircaseId: 'practice', cellId: 'practice', nB: 40, starts: null,
    });
    runFrames(200);
    fireEvent.keyDown(window, { key: 'j' });

    expect(setAnswer).toHaveBeenCalledTimes(1);
    expect(setAnswer.mock.calls[0][0].answers.trial).toBe('second');
    expect(setAnswer.mock.calls[0][0].answers.trialData.starts).toBeNull();
    expect(advance).not.toHaveBeenCalled();

    // the fixed overlay is gone so reVISit's feedback and Next button are visible
    expect(screen.queryByTestId('trial-runner')).toBeNull();
    expect(screen.getByTestId('practice-done').textContent).toContain('second');
    expect(screen.getByTestId('practice-done').textContent).toContain('Enter');
  });

  test('swallows Enter until the answer is in', () => {
    const seen: string[] = [];
    const bubble = (event: KeyboardEvent) => {
      seen.push(event.key);
    };
    window.addEventListener('keydown', bubble);

    try {
      renderTrial();
      runFrames(10);
      fireEvent.keyDown(window, { key: 'Enter' });
      expect(seen).toEqual([]);

      runFrames(200);
      fireEvent.keyDown(window, { key: 'Enter' });
      expect(seen).toEqual([]);

      fireEvent.keyDown(window, { key: 'f' });
      fireEvent.keyDown(window, { key: 'Enter' });
      expect(seen).toContain('Enter');
    } finally {
      window.removeEventListener('keydown', bubble);
    }
  });

  test('records the fullscreen state at the time of the answer', () => {
    let fullscreenElement: Element | null = null;
    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      get: () => fullscreenElement,
    });

    try {
      const { setAnswer } = renderTrial();
      runFrames(100);

      fullscreenElement = document.documentElement;
      act(() => {
        document.dispatchEvent(new Event('fullscreenchange'));
      });

      runFrames(100);
      fireEvent.keyDown(window, { key: 'f' });
      expect(setAnswer.mock.calls[0][0].answers.trialData.fullscreen).toBe(true);
    } finally {
      Reflect.deleteProperty(document, 'fullscreenElement');
    }
  });

  test('gates the trial behind a fullscreen prompt when the API is available', () => {
    const requestFullscreen = vi.fn(() => Promise.resolve());
    Object.defineProperty(document.documentElement, 'requestFullscreen', {
      configurable: true,
      value: requestFullscreen,
      writable: true,
    });

    try {
      const { setAnswer } = renderTrial();
      expect(screen.getByTestId('fullscreen-gate')).toBeTruthy();

      runFrames(200);
      expect(screen.queryByTestId('trial-prompt')).toBeNull();

      fireEvent.click(screen.getByRole('button', { name: 'Return to full screen' }));
      expect(screen.queryByTestId('fullscreen-gate')).toBeNull();
      expect(requestFullscreen).toHaveBeenCalled();

      runFrames(200);
      expect(screen.getByTestId('trial-prompt')).toBeTruthy();
      fireEvent.keyDown(window, { key: 'f' });
      expect(setAnswer).toHaveBeenCalledTimes(1);
    } finally {
      Reflect.deleteProperty(document.documentElement, 'requestFullscreen');
    }
  });

  describe('start gate', () => {
    test('waits on the ready screen until a key, which is not taken as an answer', () => {
      const { setAnswer, advance } = renderTrial({ waitForStart: true });
      expect(screen.getByTestId('start-gate')).toBeTruthy();
      expect(screen.getByTestId('start-gate-text').textContent).toBe(READY_TEXT);
      expect(screen.getByTestId('answer-keys').textContent).toContain('F');

      // the timeline does not run behind the ready screen
      runFrames(200);
      expect(screen.queryByTestId('trial-prompt')).toBeNull();

      clock += 1234;
      fireEvent.keyDown(window, { key: 'f' });
      expect(screen.queryByTestId('start-gate')).toBeNull();
      expect(setAnswer).not.toHaveBeenCalled();
      expect(advance).not.toHaveBeenCalled();

      runFrames(200);
      expect(screen.getByTestId('trial-prompt')).toBeTruthy();
      fireEvent.keyDown(window, { key: 'j' });
      expect(setAnswer).toHaveBeenCalledTimes(1);
      const { trial, trialData } = setAnswer.mock.calls[0][0].answers;
      expect(trial).toBe('second');
      expect(trialData.startWaitMs).toBeCloseTo(1234 + 200 * FRAME_MS, 3);
      // the fixation still lasted its 500 ms after the start
      expect(trialData.measured.fixation).toBeCloseTo(500, 0);
    });

    test('a remount of a started trial does not show the gate again and keeps the wait', () => {
      renderTrial({ waitForStart: true });
      clock += 500;
      fireEvent.keyDown(window, { key: 'f' });
      cleanup();

      const { setAnswer } = renderTrial({ waitForStart: true });
      expect(screen.queryByTestId('start-gate')).toBeNull();
      runFrames(200);
      fireEvent.keyDown(window, { key: 'f' });
      expect(setAnswer.mock.calls[0][0].answers.trialData.startWaitMs).toBe(500);
      cleanup();

      // another trial still waits
      renderTrial({ waitForStart: true, trialIndex: 4 });
      expect(screen.getByTestId('start-gate')).toBeTruthy();
    });

    test('starts on a click', () => {
      renderTrial({ waitForStart: true });
      fireEvent.pointerDown(screen.getByTestId('start-gate'));
      expect(screen.queryByTestId('start-gate')).toBeNull();
      runFrames(200);
      expect(screen.getByTestId('trial-prompt')).toBeTruthy();
    });

    test('swallows the starting key, Enter included, so reVISit never sees it', () => {
      const seen: string[] = [];
      const bubble = (event: KeyboardEvent) => {
        seen.push(event.key);
      };
      window.addEventListener('keydown', bubble);
      try {
        renderTrial({ waitForStart: true });
        fireEvent.keyDown(window, { key: 'Enter' });
        expect(seen).toEqual([]);
        expect(screen.queryByTestId('start-gate')).toBeNull();
      } finally {
        window.removeEventListener('keydown', bubble);
      }
    });

    test('ignores modifier keys, Escape and auto-repeat', () => {
      renderTrial({ waitForStart: true });
      fireEvent.keyDown(window, { key: 'Shift' });
      fireEvent.keyDown(window, { key: 'Escape' });
      fireEvent.keyDown(window, { key: 'k', repeat: true });
      expect(screen.getByTestId('start-gate')).toBeTruthy();
      fireEvent.keyDown(window, { key: ' ' });
      expect(screen.queryByTestId('start-gate')).toBeNull();
    });
  });

  describe('stimulus size', () => {
    test('scales the stage to 21 cm with a card calibration and records it', () => {
      // 40 px/cm: 21 cm = 840 px on the 720-px test canvas -> scale 1.1667, which fits 1024 x 768
      const { setAnswer } = renderTrial({ pxPerCm: 40 });
      const scaled = screen.getByTestId('trial-stage-scaled');
      expect(scaled.style.width).toBe(`${720 * 1.1667}px`);
      expect(screen.getByTestId('trial-stage').getAttribute('data-scale')).toBe('1.1667');
      runFrames(200);
      fireEvent.keyDown(window, { key: 'f' });
      const { trialData } = setAnswer.mock.calls[0][0].answers;
      expect(trialData.displayScale).toBe(1.1667);
      expect(trialData.stimulusWidthCm).toBeCloseTo(21, 1);
      // stored geometry stays in design pixels
      expect(trialData.displayA.width).toBe(720);
    });

    test('shrinks the stage to fit a small window', () => {
      vi.stubGlobal('innerWidth', 800);
      vi.stubGlobal('innerHeight', 600);
      const { setAnswer } = renderTrial();
      runFrames(200);
      fireEvent.keyDown(window, { key: 'f' });
      // (600 - 120) / 540
      expect(setAnswer.mock.calls[0][0].answers.trialData.displayScale).toBeCloseTo(480 / 540, 4);
    });
  });

  test('ignores answers while the full-screen gate is up and counts exits', () => {
    let fullscreenElement: Element | null = document.documentElement;
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => fullscreenElement });
    Object.defineProperty(document.documentElement, 'requestFullscreen', {
      configurable: true, writable: true, value: vi.fn(() => Promise.resolve()),
    });
    try {
      const { setAnswer } = renderTrial();
      runFrames(200);
      fullscreenElement = null;
      act(() => {
        document.dispatchEvent(new Event('fullscreenchange'));
      });
      expect(screen.getByTestId('fullscreen-gate')).toBeTruthy();
      fireEvent.keyDown(window, { key: 'f' });
      expect(setAnswer).not.toHaveBeenCalled();

      fireEvent.click(screen.getByRole('button', { name: 'Return to full screen' }));
      fireEvent.keyDown(window, { key: 'f' });
      expect(setAnswer).toHaveBeenCalledTimes(1);
      expect(setAnswer.mock.calls[0][0].answers.trialData.fullscreenExits).toBe(1);
    } finally {
      Reflect.deleteProperty(document, 'fullscreenElement');
      Reflect.deleteProperty(document.documentElement, 'requestFullscreen');
    }
  });
});
