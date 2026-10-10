import { MantineProvider } from '@mantine/core';
import {
  act, cleanup, fireEvent, render, screen,
} from '@testing-library/react';
import {
  afterEach, beforeEach, describe, expect, test, vi,
} from 'vitest';
import ExamplePage, { EXAMPLES, ExamplePageParameters, exampleScale } from '../ExamplePage';

const upcoming = vi.hoisted(() => ({ cell: null as null | { cue: string; density: string } }));
vi.mock('../ui/studyContext', () => ({ useStudyProgress: () => null, useUpcomingCell: () => upcoming.cell }));

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

function renderPage(parameters?: ExamplePageParameters) {
  const setAnswer = vi.fn();
  const advance = vi.fn();
  render(
    <MantineProvider>
      <ExamplePage parameters={parameters} setAnswer={setAnswer} advance={advance} answers={{}} useTrrack={(() => undefined) as never} />
    </MantineProvider>,
  );
  return { setAnswer, advance };
}

beforeEach(() => {
  upcoming.cell = null;
  clock = 0;
  frameCallbacks = [];
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frameCallbacks.push(callback);
    return frameCallbacks.length;
  });
  vi.stubGlobal('cancelAnimationFrame', () => undefined);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
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

describe('ExamplePage', () => {
  test('two easy cases with A first: 24 vs 10 (first had more) and 24 vs 44 (second had more)', () => {
    expect(EXAMPLES.map((e) => [e.nB, e.aFirst])).toEqual([[10, true], [44, true]]);
    renderPage({ cue: 'shape', density: 'dense' });
    expect(screen.getByTestId('example-fewer').getAttribute('data-answer')).toBe('first');
    expect(screen.getByTestId('example-more').getAttribute('data-answer')).toBe('second');
    // the static view marks the diagram with more items
    expect(screen.getByTestId('example-fewer').textContent).toContain('Diagram 1 has more items');
    expect(screen.getByTestId('example-more').textContent).toContain('Diagram 2 has more items');
    // static pair plus the play stage, per card: the participant's own cue is drawn
    expect(screen.getAllByTestId('stimulus-svg').length).toBeGreaterThanOrEqual(4);
  });

  test('plays the real sequence in place, then shows the answer and its key', () => {
    renderPage({ readingSeconds: 1 });
    const stage = () => screen.getAllByTestId('example-stage')[0];
    expect(stage().getAttribute('data-phase')).toBe('idle');
    fireEvent.click(screen.getByTestId('example-fewer-play'));
    runFrames(2);
    expect(stage().getAttribute('data-phase')).toBe('fixation');
    runFrames(31);
    expect(stage().getAttribute('data-phase')).toBe('s1');
    runFrames(13);
    expect(stage().getAttribute('data-phase')).toBe('mask');
    runFrames(120);
    expect(stage().getAttribute('data-phase')).toBe('end');
    expect(screen.getByTestId('example-fewer-answer').textContent).toBe('The first had more');
    // both keys that give the answer: F and ←
    expect(screen.getByTestId('example-fewer-keys').textContent).toBe('For←');
  });

  test('Continue needs both examples played and the reading time', () => {
    const { setAnswer, advance } = renderPage({ readingSeconds: 1 });
    const button = screen.getByTestId('primary-button') as HTMLButtonElement;
    expect(button.textContent).toBe('Continue · 1 s');
    act(() => { vi.advanceTimersByTime(1000); });
    expect(button.textContent).toBe('Play both examples to continue');
    expect(button.disabled).toBe(true);

    fireEvent.click(screen.getByTestId('example-fewer-play'));
    runFrames(200);
    expect(button.disabled).toBe(true);
    expect(setAnswer).toHaveBeenLastCalledWith({ status: false, answers: {} });

    fireEvent.click(screen.getByTestId('example-more-play'));
    runFrames(200);
    expect(screen.getByTestId('example-more-answer').textContent).toBe('The second had more');
    expect(button.disabled).toBe(false);
    expect(button.textContent).toBe('Continue');
    expect(setAnswer).toHaveBeenLastCalledWith({ status: true, answers: {} });
    fireEvent.click(button);
    expect(advance).toHaveBeenCalledTimes(1);
  });

  test('uses the participant\'s cell from the sequence and scales to the window', () => {
    upcoming.cell = { cue: 'color', density: 'sparse' };
    renderPage();
    expect(screen.getByTestId('example-page')).toBeTruthy();
    // 1440 x 900: set by the width, (1440 - 48 - 450) / 2400
    expect(exampleScale(1440, 900)).toBeCloseTo(942 / 2400, 3);
    // a short window is limited by the height
    expect(exampleScale(2560, 800)).toBeCloseTo(440 / 1280, 3);
    expect(exampleScale(2560, 1600)).toBe(0.42);
    // a narrow window is limited by the width, a tiny one by the floor
    expect(exampleScale(1280, 1200)).toBeCloseTo((1280 - 48 - 450) / 2400, 3);
    expect(exampleScale(800, 500)).toBe(0.26);
  });
});
