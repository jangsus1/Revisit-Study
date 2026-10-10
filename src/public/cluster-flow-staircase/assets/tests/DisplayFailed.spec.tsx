import { MantineProvider } from '@mantine/core';
import {
  act, cleanup, fireEvent, render, screen,
} from '@testing-library/react';
import {
  afterEach, beforeEach, describe, expect, test, vi,
} from 'vitest';
import type { ParticipantData } from '../../../../parser/types';
import DisplayFailed, { practiceTimingReason } from '../DisplayFailed';
import { ScreenTooSmall, TIMING_TEXT, TIMING_TITLE } from '../ScreenTooSmall';

vi.mock('../ui/studyContext', () => ({ useStudyProgress: () => null, useUpcomingCell: () => null }));
const engine = { rejectCurrentParticipant: vi.fn(() => Promise.resolve()) };
vi.mock('../../../../storage/storageEngineHooks', () => ({ useStorageEngine: () => ({ storageEngine: engine }) }));

const EXACT = {
  fixation: 500, s1: 200, mask: 150, blank: 250, s2: 200, mask2: 150, blank2: 250,
};

function practiceAnswers(measured: Record<string, number>[]): ParticipantData['answers'] {
  return Object.fromEntries(measured.map((m, i) => [`practice-shape-dense_6_practice-trial_${i}`, {
    componentName: 'practice-trial',
    endTime: i + 1,
    answer: { trial: 'first', trialData: { staircaseId: 'practice', measured: m, refreshMs: 1000 / 60 } },
  }])) as unknown as ParticipantData['answers'];
}

beforeEach(() => {
  engine.rejectCurrentParticipant.mockClear();
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
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

describe('DisplayFailed', () => {
  test('counts the off-target practice trials for the rejection reason', () => {
    expect(practiceTimingReason(practiceAnswers([EXACT, { ...EXACT, s1: 400 }, { ...EXACT, mask: 75 }])))
      .toBe('Display timing: 2 of 3 practice trials off target');
  });

  test('shows the timing page, records the rejection, never becomes valid and redirects', async () => {
    const replace = vi.fn();
    vi.stubGlobal('location', { ...window.location, replace });
    const setAnswer = vi.fn();
    render(
      <MantineProvider>
        <DisplayFailed
          parameters={{ prolificCode: 'C14JYDHI', redirectUrl: 'https://example.test/return', redirectDelayMs: 8000 }}
          answers={practiceAnswers([{ ...EXACT, s1: 400 }, { ...EXACT, s2: 100 }, EXACT])}
          setAnswer={setAnswer}
          useTrrack={(() => undefined) as never}
        />
      </MantineProvider>,
    );
    expect(screen.getByRole('heading').textContent).toBe(TIMING_TITLE);
    expect(TIMING_TITLE).toBe('Your computer can\'t show this study reliably');
    expect(screen.getByTestId('screen-too-small-text').textContent).toBe(TIMING_TEXT);
    expect(TIMING_TEXT).not.toMatch(/Hz|refresh|\bframes?\b|\bms\b/);
    expect(screen.getByTestId('screen-too-small-code').textContent).toContain('C14JYDHI');
    expect(engine.rejectCurrentParticipant).toHaveBeenCalledWith('Display timing: 2 of 3 practice trials off target');
    expect(setAnswer).toHaveBeenCalledWith(expect.objectContaining({ status: false }));
    // Enter is swallowed
    const event = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    await act(async () => { vi.advanceTimersByTime(8000); });
    expect(replace).toHaveBeenCalledWith('https://example.test/return');
  });

  test('without a code or redirect (test study) it only asks to return the study', () => {
    render(
      <MantineProvider>
        <ScreenTooSmall reason="timing" timingReason="Display timing: refresh 20 Hz" />
      </MantineProvider>,
    );
    expect(screen.queryByTestId('screen-too-small-code')).toBeNull();
    expect(screen.getByTestId('screen-too-small-text').textContent).toContain('Please return the study on Prolific');
    expect(engine.rejectCurrentParticipant).toHaveBeenCalledWith('Display timing: refresh 20 Hz');
    fireEvent.keyDown(window, { key: 'Enter' });
  });
});
