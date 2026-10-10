import { MantineProvider } from '@mantine/core';
import {
  act, cleanup, fireEvent, render, screen,
} from '@testing-library/react';
import {
  afterEach, beforeEach, describe, expect, test, vi,
} from 'vitest';
import SetupCheck, { SetupCheckParameters } from '../SetupCheck';

vi.mock('../ui/studyContext', () => ({ useStudyProgress: () => null, useUpcomingCell: () => null }));
const engine = { rejectCurrentParticipant: vi.fn(() => Promise.resolve()) };
vi.mock('../../../../storage/storageEngineHooks', () => ({ useStorageEngine: () => ({ storageEngine: engine }) }));

const START = 'Enter full screen';

const FRAME_MS = 1000 / 60;

let clock = 0;
let frameCallbacks: FrameRequestCallback[] = [];
/** the time between two animation frames of the simulated display, ms */
let frameMs = FRAME_MS;

function runFrames(count: number) {
  for (let i = 0; i < count; i += 1) {
    clock += frameMs;
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

/** Advances timers and frames together until `done()` holds. */
function runUntil(done: () => boolean, maxSteps = 2000) {
  for (let i = 0; i < maxSteps && !done(); i += 1) {
    act(() => { vi.advanceTimersByTime(50); });
    runFrames(3);
  }
}

const cardShown = () => screen.queryByTestId('card-check') !== null;
const endShown = () => screen.queryByTestId('screen-too-small') !== null;

/** Runs the timing stage and the display test, continues to the card check and answers it. */
function completeSetup(card: 'no-card' | 'done' = 'no-card') {
  fireEvent.click(screen.getByRole('button', { name: START }));
  runUntil(cardShown);
  fireEvent.click(screen.getByRole('button', { name: card === 'no-card' ? 'I have no card' : 'Done' }));
}

beforeEach(() => {
  clock = 0;
  frameMs = FRAME_MS;
  frameCallbacks = [];
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  engine.rejectCurrentParticipant.mockClear();
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
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('SetupCheck', () => {
  test('offers the start button and does not answer before it runs', () => {
    const { setAnswer, advance } = renderSetup();
    expect(screen.getByRole('button', { name: START })).toBeTruthy();
    // plain wording: no refresh rates or timing for the participant
    expect(screen.getByTestId('setup-start').textContent).toContain('The study runs in full screen.');
    expect(screen.getByTestId('setup-start').textContent).not.toMatch(/refresh|timing|second/i);
    runFrames(50);
    expect(setAnswer).not.toHaveBeenCalled();
    expect(advance).not.toHaveBeenCalled();
  });

  test('measures the timing silently and only answers after the card step', () => {
    const { setAnswer, advance } = renderSetup();
    fireEvent.click(screen.getByRole('button', { name: START }));
    expect(screen.getByTestId('setup-running')).toBeTruthy();

    // the timing is measured silently: no numbers, straight on to the screen-size step
    expect(screen.getByTestId('setup-running').textContent).toContain('One moment');
    expect(screen.getByTestId('setup-running').textContent).not.toMatch(/Hz|refresh|timing/i);
    runFrames(400);
    expect(screen.queryByTestId('setup-summary')).toBeNull();
    // then the display test, which says what it is
    expect(screen.getByTestId('display-test').textContent).toContain('Display test');
    expect(screen.getByTestId('display-test-text').textContent).toBe('A few diagrams will flash for about 10 seconds. Nothing to do.');
    runUntil(cardShown);
    expect(setAnswer).not.toHaveBeenCalled();
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

      runUntil(cardShown);
      expect(screen.queryByTestId('fullscreen-gate')).toBeNull();
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

  describe('full-screen size check', () => {
    const MIN = {
      calibrationIntervals: 2, refreshSamples: 6, minScreenWidth: 1280, minScreenHeight: 800,
    };
    function setViewport(width: number, height: number) {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: height });
    }
    beforeEach(() => {
      // a laptop: a fine pointer is present
      vi.stubGlobal('matchMedia', (query: string) => ({
        matches: query.includes('pointer: fine'),
        media: query,
        onchange: null,
        addListener: () => undefined,
        removeListener: () => undefined,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        dispatchEvent: () => false,
      }));
    });

    test('a screen below the minimum ends the session at once and records the rejection', async () => {
      setViewport(1200, 700);
      const replace = vi.fn();
      vi.stubGlobal('location', { ...window.location, replace });
      const { setAnswer, advance } = renderSetup({
        ...MIN, prolificCode: 'C14JYDHI', redirectUrl: 'https://example.test/return', redirectDelayMs: 8000,
      });
      fireEvent.click(screen.getByRole('button', { name: START }));
      runFrames(400);
      expect(screen.queryByTestId('card-check')).toBeNull();
      await act(async () => { vi.advanceTimersByTime(1000); });
      expect(screen.getByTestId('screen-too-small').textContent).toContain('1200 x 700');
      expect(screen.getByTestId('screen-too-small-code').textContent).toContain('C14JYDHI');
      expect(engine.rejectCurrentParticipant).toHaveBeenCalledWith(expect.stringContaining('Screen too small: 1200 x 700'));
      await act(async () => { await Promise.resolve(); vi.advanceTimersByTime(8000); });
      expect(replace).toHaveBeenCalledWith('https://example.test/return');
      expect(setAnswer).not.toHaveBeenCalled();
      expect(advance).not.toHaveBeenCalled();
    });

    test('a large enough screen (judged by the largest size during the transition) goes on to the card check', async () => {
      setViewport(1280, 700);
      renderSetup(MIN);
      fireEvent.click(screen.getByRole('button', { name: START }));
      runFrames(400);
      // the full-screen transition finishes during the settle window
      setViewport(1440, 900);
      act(() => { window.dispatchEvent(new Event('resize')); });
      await act(async () => { vi.advanceTimersByTime(1000); });
      // the display test comes after the screen check
      expect(screen.getByTestId('display-test')).toBeTruthy();
      runUntil(cardShown);
      expect(screen.getByTestId('card-check')).toBeTruthy();
      expect(engine.rejectCurrentParticipant).not.toHaveBeenCalled();
    });

    test('a portrait screen is treated as a phone or tablet', async () => {
      setViewport(1366, 2000);
      renderSetup(MIN);
      fireEvent.click(screen.getByRole('button', { name: START }));
      runFrames(400);
      await act(async () => { vi.advanceTimersByTime(1000); });
      expect(screen.getByTestId('screen-too-small').textContent).toContain('laptop or desktop');
      expect(engine.rejectCurrentParticipant).toHaveBeenCalledWith(expect.stringContaining('Unsupported device'));
    });

    test('a touch-only device (no fine pointer) is treated as a phone or tablet', async () => {
      vi.stubGlobal('matchMedia', (query: string) => ({
        matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined,
      }));
      setViewport(1366, 1024);
      renderSetup(MIN);
      fireEvent.click(screen.getByRole('button', { name: START }));
      runFrames(400);
      await act(async () => { vi.advanceTimersByTime(1000); });
      expect(screen.getByTestId('screen-too-small').textContent).toContain('phone or tablet');
      expect(engine.rejectCurrentParticipant).toHaveBeenCalledWith(expect.stringContaining('fine pointer no'));
    });

    test('without a minimum there is no check', () => {
      setViewport(800, 500);
      renderSetup({ calibrationIntervals: 2, refreshSamples: 6 });
      fireEvent.click(screen.getByRole('button', { name: START }));
      runUntil(cardShown);
      expect(screen.getByTestId('card-check')).toBeTruthy();
    });
  });
  describe('display-timing guard', () => {
    const PARAMS = { calibrationIntervals: 2, refreshSamples: 6 };
    const testShown = () => screen.queryByTestId('display-test') !== null;
    const round = () => Number(screen.getByTestId('display-test').getAttribute('data-round'));

    test('a normal 60 Hz display passes the display test in one round, and the results are stored', () => {
      const { setAnswer } = renderSetup(PARAMS);
      completeSetup();
      const { setup } = setAnswer.mock.calls[0][0].answers;
      expect(setup.refreshEstimatesMs).toHaveLength(1);
      const result = setup.displayTest;
      expect(result).toMatchObject({
        cue: 'proximity', density: 'dense', nB: 24, maxOffRuns: 1, repeated: false, passed: true, restarts: 0,
      });
      expect(result.seeds).toHaveLength(3);
      expect(result.rounds).toHaveLength(1);
      expect(result.rounds[0]).toMatchObject({ offRuns: 0, passed: true });
      expect(result.rounds[0].runs).toHaveLength(3);
      result.rounds[0].runs.forEach((run: { measured: Record<string, number>, offPhases: string[] }) => {
        expect(run.offPhases).toEqual([]);
        expect(run.measured.s1).toBeCloseTo(200, 5);
        expect(run.measured.mask).toBeCloseTo(150, 5);
        expect(run.measured.s2).toBeCloseTo(200, 5);
        expect(run.measured.mask2).toBeCloseTo(150, 5);
        expect(run.measured.blank2).toBeCloseTo(250, 5);
      });
      expect(engine.rejectCurrentParticipant).not.toHaveBeenCalled();
    });

    test('a failed first round is repeated, and a passing repeat goes on to the card check', () => {
      const { setAnswer } = renderSetup(PARAMS);
      fireEvent.click(screen.getByRole('button', { name: START }));
      runUntil(testShown);
      // the display drops every other frame: every phase runs twice as long
      frameMs = 2 * FRAME_MS;
      runUntil(() => round() === 2);
      frameMs = FRAME_MS;
      runUntil(cardShown);
      fireEvent.click(screen.getByRole('button', { name: 'I have no card' }));
      const result = setAnswer.mock.calls[0][0].answers.setup.displayTest;
      expect(result.repeated).toBe(true);
      expect(result.passed).toBe(true);
      expect(result.rounds.map((r: { offRuns: number }) => r.offRuns)).toEqual([3, 0]);
      expect(result.rounds[0].runs[0].offPhases).toEqual(['s1', 'mask', 's2', 'mask2']);
      expect(engine.rejectCurrentParticipant).not.toHaveBeenCalled();
    });

    test('two failed rounds end the session with the timing page and reason', async () => {
      const replace = vi.fn();
      vi.stubGlobal('location', { ...window.location, replace });
      const { setAnswer, advance } = renderSetup({
        ...PARAMS, prolificCode: 'C14JYDHI', redirectUrl: 'https://example.test/return', redirectDelayMs: 8000,
      });
      fireEvent.click(screen.getByRole('button', { name: START }));
      runUntil(testShown);
      frameMs = 2 * FRAME_MS;
      runUntil(endShown);
      expect(screen.getByRole('heading').textContent).toBe('Your computer can\'t show this study reliably');
      expect(screen.getByTestId('screen-too-small-text').textContent).toBe(
        'The diagrams must flash for exact fractions of a second, and your display could not keep that timing. Please return the study on Prolific. Thank you for your time.',
      );
      expect(screen.getByTestId('screen-too-small-code').textContent).toContain('C14JYDHI');
      expect(engine.rejectCurrentParticipant).toHaveBeenCalledWith('Display timing: 3 of 3 test trials off target');
      // the redirect follows once the rejection is stored
      await act(async () => { await Promise.resolve(); await Promise.resolve(); });
      await act(async () => { vi.advanceTimersByTime(8000); });
      expect(replace).toHaveBeenCalledWith('https://example.test/return');
      expect(setAnswer).not.toHaveBeenCalled();
      expect(advance).not.toHaveBeenCalled();
    });

    test('a refresh estimate the display does not keep (119 Hz on a 60 Hz display) fails the display test', () => {
      renderSetup(PARAMS);
      frameMs = 1000 / 119;
      fireEvent.click(screen.getByRole('button', { name: START }));
      runUntil(testShown);
      frameMs = FRAME_MS;
      runUntil(endShown);
      expect(engine.rejectCurrentParticipant).toHaveBeenCalledWith('Display timing: 3 of 3 test trials off target');
    });

    test('a refresh rate below 25 Hz is re-measured once and then ends the session', () => {
      const { setAnswer } = renderSetup(PARAMS);
      frameMs = 1000 / 20;
      fireEvent.click(screen.getByRole('button', { name: START }));
      // the first estimate (7 frames) does not end the session: it is measured again a second later
      runFrames(8);
      expect(endShown()).toBe(false);
      expect(screen.getByTestId('setup-running')).toBeTruthy();
      runFrames(30);
      expect(endShown()).toBe(true);
      expect(screen.getByRole('heading').textContent).toBe('Your computer can\'t show this study reliably');
      expect(engine.rejectCurrentParticipant).toHaveBeenCalledWith('Display timing: refresh 20 Hz');
      expect(setAnswer).not.toHaveBeenCalled();
    });

    test('a refresh rate above 300 Hz is re-measured once and then ends the session', () => {
      renderSetup(PARAMS);
      frameMs = 2;
      fireEvent.click(screen.getByRole('button', { name: START }));
      runFrames(8);
      expect(endShown()).toBe(false);
      runFrames(600);
      expect(engine.rejectCurrentParticipant).toHaveBeenCalledWith('Display timing: refresh 500 Hz');
    });

    test('a low first estimate that re-measures at 60 Hz goes on, and both estimates are stored', () => {
      const { setAnswer } = renderSetup(PARAMS);
      frameMs = 1000 / 40;
      fireEvent.click(screen.getByRole('button', { name: START }));
      runFrames(7);
      frameMs = FRAME_MS;
      runUntil(cardShown);
      fireEvent.click(screen.getByRole('button', { name: 'I have no card' }));
      const { setup } = setAnswer.mock.calls[0][0].answers;
      expect(setup.refreshEstimatesMs).toHaveLength(2);
      expect(setup.refreshEstimatesMs[0]).toBeCloseTo(25, 5);
      expect(setup.refreshMs).toBeCloseTo(FRAME_MS, 5);
      expect(engine.rejectCurrentParticipant).not.toHaveBeenCalled();
    });

    test('25 to 50 Hz goes on to the display test, which a steady 30 Hz display passes', () => {
      const { setAnswer } = renderSetup(PARAMS);
      frameMs = 1000 / 30;
      completeSetup();
      const { setup } = setAnswer.mock.calls[0][0].answers;
      expect(setup.refreshEstimatesMs).toHaveLength(2);
      expect(setup.refreshMs).toBeCloseTo(1000 / 30, 5);
      // the 150 ms masks last 5 frames (167 ms) at 30 Hz: within 25 ms
      expect(setup.displayTest.passed).toBe(true);
      expect(setup.displayTest.rounds[0].runs[0].measured.mask).toBeCloseTo(166.67, 1);
      expect(engine.rejectCurrentParticipant).not.toHaveBeenCalled();
    });

    test('configured thresholds can switch the guards off (the test study)', () => {
      const { setAnswer } = renderSetup({
        ...PARAMS, refreshEndBelowHz: 1, refreshEndAboveHz: 100000, displayTestMaxOffRuns: 3,
      });
      fireEvent.click(screen.getByRole('button', { name: START }));
      runUntil(testShown);
      frameMs = 2 * FRAME_MS;
      runUntil(cardShown);
      fireEvent.click(screen.getByRole('button', { name: 'I have no card' }));
      const result = setAnswer.mock.calls[0][0].answers.setup.displayTest;
      expect(result).toMatchObject({ passed: true, repeated: false, maxOffRuns: 3 });
      expect(result.rounds[0].offRuns).toBe(3);
    });
  });
});
