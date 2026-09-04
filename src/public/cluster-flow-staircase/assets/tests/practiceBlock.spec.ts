import {
  describe, expect, test, vi,
} from 'vitest';
import type { ParticipantData } from '../../../../parser/types';
import type { TrialAnswer, TrialParams } from '../generator/types';
import practiceBlock from '../practiceBlock';

vi.mock('../generator', () => ({
  hashSeed: (...parts: (string | number)[]) => parts.reduce<number>(
    (acc, part) => String(part).split('').reduce((inner, char) => (inner * 31 + char.charCodeAt(0)) % 2147483647, acc),
    7,
  ),
  CUES: ['none', 'hull', 'rect', 'color', 'edge', 'shape'],
  DENSITIES: ['sparse', 'dense'],
}));

const BLOCK = 'practice';
const STEP = 4;

function storedTrials(count: number): ParticipantData['answers'] {
  return Object.fromEntries(new Array(count).fill(null).map((_, index) => [
    `${BLOCK}_${STEP}_trial_${index}`,
    {
      componentName: 'trial',
      endTime: index + 1,
      answer: { trial: 'first', trialData: { staircaseId: 'practice', trialIndex: index } as unknown as TrialAnswer },
    },
  ])) as unknown as ParticipantData['answers'];
}

function runPractice(count: number, customParameters?: { trials?: number }) {
  return practiceBlock({
    answers: storedTrials(count), customParameters, currentStep: STEP, currentBlock: BLOCK,
  });
}

describe('practiceBlock', () => {
  test('shows a practice trial with feedback', () => {
    const result = runPractice(0);
    const parameters = result.parameters as unknown as TrialParams;
    expect(result.component).toBe('trial');
    expect(parameters.feedback).toBe(true);
    expect(parameters.staircaseId).toBe('practice');
    expect(parameters.cellId).toBe('practice');
    expect(parameters.trialIndex).toBe(0);
    expect(parameters.refreshMs).toBeCloseTo(1000 / 60, 5);
  });

  test('alternates the easy item counts and cycles the cues', () => {
    const seen = new Array(8).fill(null).map((_, index) => runPractice(index).parameters as unknown as TrialParams);
    expect(seen.map((parameters) => parameters.nB)).toEqual([12, 40, 12, 40, 12, 40, 12, 40]);
    expect(seen.map((parameters) => parameters.cue)).toEqual(['none', 'hull', 'rect', 'color', 'edge', 'shape', 'none', 'hull']);
    expect(seen.map((parameters) => parameters.density)).toEqual([
      'sparse', 'sparse', 'dense', 'dense', 'sparse', 'sparse', 'dense', 'dense',
    ]);
    expect(new Set(seen.map((parameters) => parameters.seedA)).size).toBe(8);
  });

  test('marks the larger display as the correct answer', () => {
    expect(runPractice(0).correctAnswer).toEqual([{ id: 'trial', answer: 'first' }]);
    expect(runPractice(1).correctAnswer).toEqual([{ id: 'trial', answer: 'second' }]);
  });

  test('ends after eight trials by default', () => {
    expect(runPractice(7).component).toBe('trial');
    expect(runPractice(8)).toEqual({ component: null });
  });

  test('honours the trials override', () => {
    expect(runPractice(1, { trials: 2 }).component).toBe('trial');
    expect(runPractice(2, { trials: 2 })).toEqual({ component: null });
  });

  test('uses the session salt when setup has run', () => {
    const withSetup = practiceBlock({
      answers: {
        ...storedTrials(0),
        setup_2: {
          componentName: 'setup', endTime: 1, answer: { setup: { sessionSalt: 555, refreshMs: 10 } },
        },
      } as unknown as ParticipantData['answers'],
      customParameters: undefined,
      currentStep: STEP,
      currentBlock: BLOCK,
    });
    const parameters = withSetup.parameters as unknown as TrialParams;
    expect(parameters.refreshMs).toBe(10);
    expect(parameters.seedA).not.toBe((runPractice(0).parameters as unknown as TrialParams).seedA);
  });
});
