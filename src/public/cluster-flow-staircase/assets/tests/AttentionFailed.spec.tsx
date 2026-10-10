import { MantineProvider } from '@mantine/core';
import {
  act, cleanup, fireEvent, render, screen,
} from '@testing-library/react';
import {
  afterEach, beforeEach, describe, expect, test, vi,
} from 'vitest';
import AttentionFailed, {
  AttentionFailedParameters, REJECTION_WAIT_MS, rejectionReason, storedMisses,
} from '../AttentionFailed';

const engine = vi.hoisted(() => ({ rejectCurrentParticipant: vi.fn((): Promise<void> => Promise.resolve()) }));
vi.mock('../../../../storage/storageEngineHooks', () => ({ useStorageEngine: () => ({ storageEngine: engine }) }));
vi.mock('../ui/studyContext', () => ({ useStudyProgress: () => null, useUpcomingCell: () => null }));

function renderPage(parameters?: AttentionFailedParameters, answers: Record<string, unknown> = {}) {
  const setAnswer = vi.fn();
  const advance = vi.fn();
  render(
    <MantineProvider>
      <AttentionFailed parameters={parameters} setAnswer={setAnswer} advance={advance} answers={answers as never} useTrrack={(() => undefined) as never} />
    </MantineProvider>,
  );
  return { setAnswer, advance };
}

const replace = vi.fn();

beforeEach(() => {
  engine.rejectCurrentParticipant.mockReset();
  engine.rejectCurrentParticipant.mockImplementation(() => Promise.resolve());
  replace.mockReset();
  vi.stubGlobal('location', { ...window.location, replace });
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
});

describe('AttentionFailed', () => {
  test('ends the study: the message, the contact, and nothing to continue to', () => {
    const { setAnswer, advance } = renderPage({ misses: 4, maxMisses: 3 });
    const page = screen.getByTestId('attention-failed');
    expect(page.textContent).toContain('The study has ended');
    expect(page.textContent).toContain('You missed more than 3 attention checks, so we cannot use your responses.');
    expect(page.textContent).toContain('Please return the study on Prolific.');
    expect(page.textContent).toContain('minsuk@gatech.edu');
    expect(screen.queryByRole('button')).toBeNull();
    // the page answer is never valid, and Enter is swallowed
    expect(setAnswer).toHaveBeenCalledWith({ status: false, answers: { attention: { rejected: true, misses: 4, maxMisses: 3 } } });
    const seen: string[] = [];
    const bubble = (event: KeyboardEvent) => { seen.push(event.key); };
    window.addEventListener('keydown', bubble);
    fireEvent.keyDown(window, { key: 'Enter' });
    window.removeEventListener('keydown', bubble);
    expect(seen).toEqual([]);
    expect(advance).not.toHaveBeenCalled();
  });

  test('marks the participant rejected in reVISit once, with the number of misses', () => {
    renderPage({ misses: 4, maxMisses: 3 });
    expect(engine.rejectCurrentParticipant).toHaveBeenCalledTimes(1);
    expect(engine.rejectCurrentParticipant).toHaveBeenCalledWith(rejectionReason(4, 3));
    expect(rejectionReason(4, 3)).toBe('Missed 4 attention checks (more than 3 allowed)');
  });

  test('reads the misses from the stored trials when the block passes no parameters', () => {
    const answers = {
      a: { endTime: 1, answer: { trialData: { staircaseId: 'above', attentionMisses: 3 } } },
      b: { endTime: 1, answer: { trialData: { staircaseId: 'attention', attentionMisses: 4 } } },
      c: { endTime: 1, answer: {} },
    };
    expect(storedMisses(answers as never)).toBe(4);
    expect(storedMisses({} as never)).toBeNull();
    renderPage(undefined, answers);
    expect(screen.getByTestId('attention-failed').textContent).toContain('You missed more than 3 attention checks');
    expect(engine.rejectCurrentParticipant).toHaveBeenCalledWith(rejectionReason(4, 3));
  });

  test('without a code or URL (the test study) it shows no code and never redirects', async () => {
    vi.useFakeTimers();
    try {
      renderPage({ misses: 4, maxMisses: 3 });
      expect(screen.queryByTestId('attention-failed-code')).toBeNull();
      await act(async () => { await vi.advanceTimersByTimeAsync(REJECTION_WAIT_MS + 20000); });
      expect(replace).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  test('shows the Prolific code and redirects only after the rejection is stored and the delay has passed', async () => {
    vi.useFakeTimers();
    let resolve: () => void = () => undefined;
    engine.rejectCurrentParticipant.mockImplementation(() => new Promise<void>((r) => { resolve = r; }));
    try {
      renderPage({
        misses: 4, maxMisses: 3, prolificCode: 'C14JYDHI', redirectUrl: 'https://example.test/cc=C14JYDHI', redirectDelayMs: 8000,
      });
      expect(screen.getByTestId('attention-failed-code').textContent)
        .toBe('Your Prolific code is C14JYDHI. You will be taken back to Prolific in a few seconds; please return your submission there.');
      // the rejection is still being stored: no redirect, however long the delay
      await act(async () => { await vi.advanceTimersByTimeAsync(9000); });
      expect(replace).not.toHaveBeenCalled();
      await act(async () => { resolve(); await Promise.resolve(); });
      await act(async () => { await vi.advanceTimersByTimeAsync(7900); });
      expect(replace).not.toHaveBeenCalled();
      await act(async () => { await vi.advanceTimersByTimeAsync(200); });
      expect(replace).toHaveBeenCalledWith('https://example.test/cc=C14JYDHI');
    } finally {
      vi.useRealTimers();
    }
  });

  test('redirects anyway when storing the rejection hangs', async () => {
    vi.useFakeTimers();
    engine.rejectCurrentParticipant.mockImplementation(() => new Promise<void>(() => {}));
    try {
      renderPage({ misses: 4, maxMisses: 3, redirectUrl: 'https://example.test/x' });
      await act(async () => { await vi.advanceTimersByTimeAsync(REJECTION_WAIT_MS); });
      await act(async () => { await vi.advanceTimersByTimeAsync(7900); });
      expect(replace).not.toHaveBeenCalled();
      await act(async () => { await vi.advanceTimersByTimeAsync(200); });
      expect(replace).toHaveBeenCalledWith('https://example.test/x');
    } finally {
      vi.useRealTimers();
    }
  });
});
