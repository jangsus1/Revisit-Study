import { MantineProvider } from '@mantine/core';
import {
  act, cleanup, fireEvent, render, screen,
} from '@testing-library/react';
import {
  afterEach, beforeEach, describe, expect, test, vi,
} from 'vitest';
import type { ParticipantData } from '../../../../parser/types';
import InfoPage, { InfoPageParameters, PAGES, countMainTrials } from '../InfoPage';

const upcoming = vi.hoisted(() => ({ cell: null as null | { cue: string; density: string; trials?: number } }));

// The pages read reVISit's store only through this module.
vi.mock('../ui/studyContext', () => ({
  useStudyProgress: () => null,
  useUpcomingCell: () => upcoming.cell,
}));

function renderPage(parameters: InfoPageParameters, answers: Record<string, unknown> = {}) {
  const setAnswer = vi.fn();
  const advance = vi.fn();
  render(
    <MantineProvider>
      <InfoPage
        parameters={parameters}
        setAnswer={setAnswer}
        advance={advance}
        answers={answers as unknown as ParticipantData['answers']}
        useTrrack={(() => undefined) as never}
      />
    </MantineProvider>,
  );
  return { setAnswer, advance };
}

/** Lets `seconds` of reading time pass. */
function wait(seconds: number) {
  act(() => { vi.advanceTimersByTime(seconds * 1000); });
}

beforeEach(() => {
  upcoming.cell = null;
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'Date'] });
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
});

describe('InfoPage', () => {
  test('keeps the page invalid and its button disabled until the reading time has passed', () => {
    const { setAnswer, advance } = renderPage({ page: 'introduction' });
    // the page answer is invalid, so reVISit's Enter handler cannot advance it either
    expect(setAnswer).toHaveBeenLastCalledWith({ status: false, answers: {} });
    const button = screen.getByTestId('primary-button') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.textContent).toMatch(/^Start · \d+ s$/);
    fireEvent.click(button);
    expect(advance).not.toHaveBeenCalled();

    wait(60);
    expect(setAnswer).toHaveBeenLastCalledWith({ status: true, answers: {} });
    expect(button.disabled).toBe(false);
    expect(button.textContent).toBe('Start');
    fireEvent.click(button);
    expect(advance).toHaveBeenCalledTimes(1);
  });

  test('introduction: the question, five session parts and the session facts', () => {
    renderPage({ page: 'introduction' });
    expect(screen.getByText('Which diagram has more items?')).toBeTruthy();
    expect(screen.getAllByTestId('session-step')).toHaveLength(5);
    expect(screen.getByTestId('session-steps').textContent).toContain('examples + 3 practice trials');
    expect(screen.getByTestId('session-steps').textContent).toContain('about 8 min');
    // without reVISit's sequence (this test) the fallback estimate is shown
    expect(screen.getByTestId('session-meta').textContent).toContain('About 15 minutes');
    expect(screen.getByTestId('session-meta').textContent).toContain('full screen');
  });

  test('instructions: the trial storyboard with durations and the item-count figure', () => {
    renderPage({ page: 'instructions' });
    expect(screen.getByText('How a trial works')).toBeTruthy();
    const storyboard = screen.getByTestId('trial-storyboard');
    ['Look at the cross', 'Diagram 1', 'Noise', 'Diagram 2', 'Which had more items?', '0.2 s', '0.15 s', 'first', 'second']
      .forEach((text) => expect(storyboard.textContent).toContain(text));
    const items = screen.getByTestId('item-count-figure');
    expect(screen.getAllByTestId('count-badge')).toHaveLength(7);
    expect(items.textContent).toContain('arrows are not items');
    expect(items.textContent).toContain('outlines are not items');
    expect(screen.getByTestId('never-equal').textContent).toContain('never have the same number of items');
    expect(screen.getByTestId('primary-button').textContent).toMatch(/^Continue · \d+ s$/);
  });

  test('practice: the feedback storyboard and a real diagram of the participant\'s cue', () => {
    upcoming.cell = { cue: 'shape', density: 'dense' };
    renderPage({ page: 'practice' });
    expect(screen.getByText('3 easy trials with feedback')).toBeTruthy();
    expect(screen.getByTestId('practice-storyboard').textContent).toContain('Instant feedback');
    expect(screen.getByTestId('practice-storyboard').textContent).not.toContain('Enter');
    const preview = screen.getByTestId('stimulus-preview');
    expect(preview.getAttribute('data-cue')).toBe('shape');
    expect(preview.getAttribute('data-density')).toBe('dense');
    expect(preview.querySelector('[data-testid="stimulus-svg"]')).toBeTruthy();
    expect(screen.getByTestId('primary-button').textContent).toMatch(/^Start practice/);
  });

  test('practice: explicit parameters override the sequence, and no cell means no preview', () => {
    renderPage({ page: 'practice', cue: 'color', density: 'sparse' });
    expect(screen.getByTestId('stimulus-preview').getAttribute('data-cue')).toBe('color');
    cleanup();
    upcoming.cell = { cue: 'rect', density: 'sparse', trials: 2 };
    renderPage({ page: 'practice' });
    expect(screen.getByText('2 easy trials with feedback')).toBeTruthy();
    cleanup();
    upcoming.cell = null;
    renderPage({ page: 'practice' });
    expect(screen.queryByTestId('stimulus-preview')).toBeNull();
  });

  test('main: the three rules and the answer keys', () => {
    renderPage({ page: 'main' });
    expect(screen.getByText('Main task')).toBeTruthy();
    const main = screen.getByTestId('info-main');
    ['No feedback from now on', 'first impression', 'Breaks are offered'].forEach((text) => expect(main.textContent).toContain(text));
    expect(screen.getByTestId('answer-keys').textContent).toContain('F');
    expect(screen.getByTestId('answer-keys').textContent).toContain('J');
    expect(screen.getByTestId('primary-button').textContent).toMatch(/^Start the main task/);
  });

  test('rest: the break, the number of main trials done and the keys', () => {
    const record = (staircaseId: string, endTime = 1) => ({ endTime, answer: { trialData: { staircaseId } } });
    const answers = {
      a: record('practice'), b: record('above'), c: record('below'), d: record('catch'), e: record('above', -1), f: { endTime: 1, answer: {} },
    };
    expect(countMainTrials(answers as unknown as ParticipantData['answers'])).toBe(3);
    renderPage({ page: 'rest' }, answers);
    expect(screen.getByText('Short break')).toBeTruthy();
    expect(screen.getByTestId('rest-count').textContent).toBe('3 trials done');
    expect(screen.getByTestId('answer-keys')).toBeTruthy();
  });

  test('pages after the setup block on a closed full screen; the introduction does not', () => {
    let fullscreenElement: Element | null = null;
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => fullscreenElement });
    Object.defineProperty(document.documentElement, 'requestFullscreen', {
      configurable: true, writable: true, value: vi.fn(() => Promise.resolve()),
    });
    try {
      renderPage({ page: 'introduction' });
      expect(screen.queryByTestId('fullscreen-gate')).toBeNull();
      cleanup();

      renderPage({ page: 'rest' });
      expect(screen.getByTestId('fullscreen-gate')).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Return to full screen' }));
      expect(document.documentElement.requestFullscreen).toHaveBeenCalled();
      expect(screen.queryByTestId('fullscreen-gate')).toBeNull();
      fullscreenElement = document.documentElement;
    } finally {
      Reflect.deleteProperty(document, 'fullscreenElement');
      Reflect.deleteProperty(document.documentElement, 'requestFullscreen');
    }
  });

  test('the full-screen gate keeps Enter from advancing the page underneath', () => {
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => null });
    Object.defineProperty(document.documentElement, 'requestFullscreen', {
      configurable: true, writable: true, value: vi.fn(() => Promise.resolve()),
    });
    const seen: string[] = [];
    const listener = (event: KeyboardEvent) => seen.push(event.key);
    window.addEventListener('keydown', listener);
    try {
      renderPage({ page: 'main' });
      fireEvent.keyDown(window, { key: 'Enter' });
      expect(seen).toEqual([]);
    } finally {
      window.removeEventListener('keydown', listener);
      Reflect.deleteProperty(document, 'fullscreenElement');
      Reflect.deleteProperty(document.documentElement, 'requestFullscreen');
    }
  });

  describe('reading time', () => {
    test('each page uses its floor or the word count; the rest page has no timer', () => {
      expect(PAGES.instructions.minReadSeconds).toBe(20);
      expect(PAGES.practice.minReadSeconds).toBe(8);
      expect(PAGES.main.minReadSeconds).toBe(5);
      expect(PAGES.rest.minReadSeconds).toBeNull();

      const { setAnswer } = renderPage({ page: 'rest' });
      expect(setAnswer).toHaveBeenLastCalledWith({ status: true, answers: {} });
      expect((screen.getByTestId('primary-button') as HTMLButtonElement).disabled).toBe(false);
      cleanup();

      // the instructions: the word count of their text and figure labels, at least 20 s
      renderPage({ page: 'instructions' });
      const button = screen.getByTestId('primary-button') as HTMLButtonElement;
      const required = Number((button.textContent as string).match(/(\d+) s$/)?.[1]);
      expect(required).toBeGreaterThanOrEqual(20);
      wait(required - 1);
      expect(button.disabled).toBe(true);
      expect(button.textContent).toBe('Continue · 1 s');
      wait(1);
      expect(button.disabled).toBe(false);
      cleanup();

      // the main-task intro: its words, never under its 5 s floor
      renderPage({ page: 'main' });
      const main = Number((screen.getByTestId('primary-button').textContent as string).match(/(\d+) s$/)?.[1]);
      expect(main).toBeGreaterThanOrEqual(5);
      expect(main).toBeLessThan(15);
    });

    test('a config override replaces the computed time', () => {
      renderPage({ page: 'instructions', readingSeconds: 2 });
      const button = screen.getByTestId('primary-button') as HTMLButtonElement;
      expect(button.textContent).toBe('Continue · 2 s');
      wait(2);
      expect(button.disabled).toBe(false);
    });
  });
});
