import { MantineProvider } from '@mantine/core';
import {
  act, cleanup, fireEvent, render, screen,
} from '@testing-library/react';
import {
  afterEach, beforeEach, describe, expect, test, vi,
} from 'vitest';
import SetupCheck, { SetupCheckParameters } from '../SetupCheck';

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

function renderSetup(parameters: SetupCheckParameters = { calibrationIntervals: 4, refreshSamples: 6 }) {
  const setAnswer = vi.fn();
  render(
    <MantineProvider>
      <SetupCheck
        parameters={parameters}
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
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('SetupCheck', () => {
  test('offers the calibration button and does not answer before it runs', () => {
    const setAnswer = renderSetup();
    expect(screen.getByRole('button', { name: 'Enter fullscreen and start calibration' })).toBeTruthy();
    runFrames(50);
    expect(setAnswer).not.toHaveBeenCalled();
  });

  test('measures the refresh rate and the calibration intervals', () => {
    const setAnswer = renderSetup();
    fireEvent.click(screen.getByRole('button', { name: 'Enter fullscreen and start calibration' }));
    expect(screen.getByTestId('setup-running')).toBeTruthy();

    runFrames(400);

    expect(setAnswer).toHaveBeenCalledTimes(1);
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
    expect(typeof setup.userAgent).toBe('string');
    expect(setup.screen).toEqual({
      w: window.screen.width, h: window.screen.height, dpr: window.devicePixelRatio,
    });
  });

  test('shows the summary and the Enter hint when it is done', () => {
    renderSetup();
    fireEvent.click(screen.getByRole('button', { name: 'Enter fullscreen and start calibration' }));
    runFrames(400);

    expect(screen.getByTestId('setup-summary')).toBeTruthy();
    expect(screen.getByText('Press Enter to continue')).toBeTruthy();
    expect(screen.getByText(/60\.0 Hz/)).toBeTruthy();
  });

  test('uses the crypto random source for the session salt when it is available', () => {
    const getRandomValues = vi.fn((buffer: Uint32Array) => {
      const filled = buffer;
      filled[0] = 4000000000;
      return filled;
    });
    vi.stubGlobal('crypto', { getRandomValues });

    const setAnswer = renderSetup();
    fireEvent.click(screen.getByRole('button', { name: 'Enter fullscreen and start calibration' }));
    runFrames(400);

    expect(getRandomValues).toHaveBeenCalled();
    expect(setAnswer.mock.calls[0][0].answers.setup.sessionSalt).toBe(2000000000);
  });

  test('continues when fullscreen is refused', () => {
    const requestFullscreen = vi.fn(() => Promise.reject(new Error('denied')));
    Object.defineProperty(document.documentElement, 'requestFullscreen', {
      configurable: true, value: requestFullscreen, writable: true,
    });

    try {
      const setAnswer = renderSetup({ calibrationIntervals: 2, refreshSamples: 4 });
      fireEvent.click(screen.getByRole('button', { name: 'Enter fullscreen and start calibration' }));
      expect(requestFullscreen).toHaveBeenCalled();

      runFrames(400);
      expect(setAnswer).toHaveBeenCalledTimes(1);
      expect(setAnswer.mock.calls[0][0].answers.setup.fullscreen).toBe(false);
      expect(setAnswer.mock.calls[0][0].answers.setup.calibration).toHaveLength(2);
    } finally {
      Reflect.deleteProperty(document.documentElement, 'requestFullscreen');
    }
  });

  test('falls back to the defaults when no parameters are configured', () => {
    const setAnswer = vi.fn();
    render(
      <MantineProvider>
        <SetupCheck
          parameters={undefined}
          setAnswer={setAnswer}
          answers={{}}
          useTrrack={(() => undefined) as never}
        />
      </MantineProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Enter fullscreen and start calibration' }));
    runFrames(3000);
    expect(setAnswer.mock.calls[0][0].answers.setup.calibration).toHaveLength(40);
  });
});
