import { MantineProvider } from '@mantine/core';
import {
  cleanup, fireEvent, render, screen,
} from '@testing-library/react';
import {
  afterEach, beforeEach, describe, expect, test, vi,
} from 'vitest';
import AttentionFailed, { AttentionFailedParameters, rejectionReason } from '../AttentionFailed';

const engine = vi.hoisted(() => ({ rejectCurrentParticipant: vi.fn(() => Promise.resolve()) }));
vi.mock('../../../../storage/storageEngineHooks', () => ({ useStorageEngine: () => ({ storageEngine: engine }) }));
vi.mock('../ui/studyContext', () => ({ useStudyProgress: () => null, useUpcomingCell: () => null }));

function renderPage(parameters?: AttentionFailedParameters) {
  const setAnswer = vi.fn();
  const advance = vi.fn();
  render(
    <MantineProvider>
      <AttentionFailed parameters={parameters} setAnswer={setAnswer} advance={advance} answers={{}} useTrrack={(() => undefined) as never} />
    </MantineProvider>,
  );
  return { setAnswer, advance };
}

beforeEach(() => {
  engine.rejectCurrentParticipant.mockClear();
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
});
