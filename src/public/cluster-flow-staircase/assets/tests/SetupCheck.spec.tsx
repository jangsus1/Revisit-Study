import { MantineProvider } from '@mantine/core';
import {
  act, cleanup, fireEvent, render, screen,
} from '@testing-library/react';
import {
  afterEach, beforeEach, describe, expect, test, vi,
} from 'vitest';
import SetupCheck, { SetupCheckParameters } from '../SetupCheck';

vi.mock('../ui/studyContext', () => ({ useStudyProgress: () => null, useUpcomingCell: () => null }));

const START = 'Enter full screen and start';

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

function renderSetup(parameters: SetupCheckParameters | undefined = { calibrationIntervals: 4, refreshSamples: 6 }) {
  const setAnswer = vi.fn();
  const advance = vi.fn();
  render(
    <MantineProvider>
      <SetupCheck
        parameters={parameters}
        setAnswer={setAnswer}
        advance={advance}
        answers={{}}
        useTrrack={(() => undefined) as never}
      />
    </MantineProvider>,
  );
  return { setAnswer, advance };
}

/** Runs the timing stage, continues to the card check and answers it. */
function completeSetup(card: 'no-card' | 'done' = 'no-card') {
  fireEvent.click(screen.getByRole('button', { name: START }));
  runFrames(3000);
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  fireEvent.click(screen.getByRole('button', { name: card === 'no-card' ? 'I have no card' : 'Done' }));
}

beforeEach(() => {
  clock = 0;
  frameCallbacks = [];
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frameCallbacks.push(callback);
    return frameCallbacks.length;
  });
  vi.stubGlobal('cancelAnimationFrame', () => undefined);
  vi.stubGlobal('performance', { now: () => clock });
  vi.stubGlobal('ResizeObserver', class {
    observe() { return this; }

    unobserve() { return this; }

    disconnect() { return this; }
  });
  Object.defineProperty(window, 'screen', { configurable: true, value: { width: 1920, height: 1080 } });
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
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('SetupCheck', () => {
  test('offers the start button and does not answer before it runs', () => {
    const { setAnswer, advance } = renderSetup();
    expect(screen.getByRole('button', { name: START })).toBeTruthy();
    runFrames(50);
    expect(setAnswer).not.toHaveBeenCalled();
    expect(advance).not.toHaveBeenCalled();
  });

  test('measures the timing, shows a short result, and only answers after the card step', () => {
    const { setAnswer, advance } = renderSetup();
    fireEvent.click(screen.getByRole('button', { name: START }));
    expect(screen.getByTestId('setup-running')).toBeTruthy();

    runFrames(400);
    expect(screen.getByTestId('setup-summary')).toBeTruthy();
    expect(screen.getByTestId('setup-hz').textContent).toBe('60.0 Hz');
    expect(setAnswer).not.toHaveBeenCalled();

    // Enter continues to the screen-size step
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(screen.getByTestId('card-check')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'I have no card' }));

    expect(setAnswer).toHaveBeenCalledTimes(1);
    expect(advance).toHaveBeenCalledTimes(1);
    const { status, answers } = setAnswer.mock.calls[0][0];
    expect(status).toBe(true);

    const { setup } = answers;
    expect(setup.refreshMs).toBeCloseTo(FRAME_MS, 4);
    expect(setup.calibration).toHaveLength(4);
    expect(setup.calibration.map((entry: { targetMs: number }) => entry.targetMs)).toEqual([200, 400, 200, 400]);
    setup.calibration.forEach((entry: { targetMs: number, measuredMs: number }) => {
      expect(Math.abs(entry.measuredMs - entry.targetMs)).toBeLessThan(2 * FRAME_MS);
    });
    expect(setup.medianErrorMs).toBeLessThan(2 * FRAME_MS);
    expect(setup.maxErrorMs).toBeLessThan(2 * FRAME_MS);
    expect(Number.isInteger(setup.sessionSalt)).toBe(true);
    expect(setup.sessionSalt).toBeGreaterThanOrEqual(0);
    expect(setup.sessionSalt).toBeLessThan(2 ** 31);
    expect(setup.fullscreen).toBe(false);
    expect(setup.fullscreenExits).toBe(0);
    expect(typeof setup.userAgent).toBe('string');
    expect(setup.screen).toEqual({ w: 1920, h: 1080, dpr: window.devicePixelRatio });
    // no card: the stimuli keep their nominal size
    expect(setup.pxPerCm).toBeNull();
    expect(setup.cardWidthPx).toBeNull();
    expect(setup.screenInches).toBeNull();
    expect(setup.confirmedImplausible).toBe(false);
  });

  test('stores the card calibration', () => {
    const { setAnswer } = renderSetup();
    completeSetup('done');
    const { setup } = setAnswer.mock.calls[0][0].answers;
    expect(setup.pxPerCm).toBeGreaterThan(30);
    expect(setup.cardWidthPx).toBeGreaterThan(300);
    expect(setup.screenInches).toBeGreaterThan(20);
    expect(setup.confirmedImplausible).toBe(false);
  });

  test('uses the crypto random source for the session salt when it is available', () => {
    const getRandomValues = vi.fn((buffer: Uint32Array) => {
      const filled = buffer;
      filled[0] = 4000000000;
      return filled;
    });
    vi.stubGlobal('crypto', { getRandomValues });

    const { setAnswer } = renderSetup();
    completeSetup();

    expect(getRandomValues).toHaveBeenCalled();
    expect(setAnswer.mock.calls[0][0].answers.setup.sessionSalt).toBe(2000000000);
  });

  test('continues when fullscreen is refused', async () => {
    const requestFullscreen = vi.fn(() => Promise.reject(new Error('denied')));
    Object.defineProperty(document.documentElement, 'requestFullscreen', {
      configurable: true, value: requestFullscreen, writable: true,
    });

    try {
      const { setAnswer } = renderSetup({ calibrationIntervals: 2, refreshSamples: 4 });
      fireEvent.click(screen.getByRole('button', { name: START }));
      expect(requestFullscreen).toHaveBeenCalled();
      // let the refusal settle: it is recorded and the gate no longer blocks
      await act(async () => { await Promise.resolve(); });

      runFrames(400);
      expect(screen.queryByTestId('fullscreen-gate')).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
      fireEvent.click(screen.getByRole('button', { name: 'I have no card' }));
      expect(setAnswer).toHaveBeenCalledTimes(1);
      expect(setAnswer.mock.calls[0][0].answers.setup.fullscreen).toBe(false);
      expect(setAnswer.mock.calls[0][0].answers.setup.calibration).toHaveLength(2);
    } finally {
      Reflect.deleteProperty(document.documentElement, 'requestFullscreen');
    }
  });

  test('falls back to the defaults when no parameters are configured', () => {
    // null rather than undefined, which would pick the helper's default parameters
    const { setAnswer } = renderSetup(null as unknown as undefined);
    completeSetup();
    expect(setAnswer.mock.calls[0][0].answers.setup.calibration).toHaveLength(2);
  });
});
