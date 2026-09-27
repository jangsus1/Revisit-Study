import {
  describe, expect, test, vi,
} from 'vitest';
import type { ParticipantData } from '../../../../parser/types';
import type { TrialAnswer, TrialParams } from '../generator/types';
import practiceBlock from '../practiceBlock';
import { correctInterval, drawHueOffset } from '../staircaseBlock';

vi.mock('../generator', () => ({
  hashSeed: (...parts: (string | number)[]) => parts.reduce<number>(
    (acc, part) => String(part).split('').reduce((inner, char) => (inner * 31 + char.charCodeAt(0)) % 2147483647, acc),
    7,
  ),
  CUES: ['proximity', 'rect', 'color', 'shape', 'edge'],
  DENSITIES: ['sparse', 'dense'],
}));

const BLOCK = 'practice';
const STEP = 4;

function storedTrials(count: number): ParticipantData['answers'] {
  return Object.fromEntries(new Array(count).fill(null).map((_, index) => [
    `${BLOCK}_${STEP}_practice-trial_${index}`,
    {
      componentName: 'practice-trial',
      endTime: index + 1,
      answer: { trial: 'first', trialData: { staircaseId: 'practice', trialIndex: index } as unknown as TrialAnswer },
      correctAnswer: [{ id: 'trial', answer: 'first' }],
    },
  ])) as unknown as ParticipantData['answers'];
}

const CELL = { cue: 'shape' as const, density: 'dense' as const };

function runPractice(count: number, overrides: { trials?: number } = {}) {
  return practiceBlock({
    answers: storedTrials(count), customParameters: { ...CELL, ...overrides }, currentStep: STEP, currentBlock: BLOCK,
  });
}

describe('practiceBlock', () => {
  test('schedules the practice-trial component, which carries the platform feedback', () => {
    const result = runPractice(0);
    const parameters = result.parameters as unknown as TrialParams;
    expect(result.component).toBe('practice-trial');
    expect(parameters.staircaseId).toBe('practice');
    expect(parameters.cellId).toBe('practice');
    expect(parameters.trialIndex).toBe(0);
    expect(parameters.refreshMs).toBeCloseTo(1000 / 60, 5);
    expect(parameters.starts).toBeNull();
    expect(parameters.hueOffset).toBe(drawHueOffset(1));
  });

  test('alternates the easy item counts, always in the participant\'s own cell', () => {
    const seen = new Array(8).fill(null).map((_, index) => runPractice(index).parameters as unknown as TrialParams);
    expect(seen.map((parameters) => parameters.nB)).toEqual([12, 40, 12, 40, 12, 40, 12, 40]);
    expect(seen.every((parameters) => parameters.cue === 'shape' && parameters.density === 'dense')).toBe(true);
    expect(new Set(seen.map((parameters) => parameters.seedA)).size).toBe(8);
    expect(new Set(seen.map((parameters) => parameters.aFirst)).size).toBe(2);
  });

  test('marks the interval of the larger display as the correct answer', () => {
    const easyA = runPractice(0);
    const easyB = runPractice(1);
    const aFirst0 = (easyA.parameters as unknown as TrialParams).aFirst;
    const aFirst1 = (easyB.parameters as unknown as TrialParams).aFirst;
    // trial 0 has nB = 12 (A larger), trial 1 has nB = 40 (B larger)
    expect(easyA.correctAnswer).toEqual([{ id: 'trial', answer: correctInterval(12, aFirst0, 24) }]);
    expect(easyB.correctAnswer).toEqual([{ id: 'trial', answer: correctInterval(40, aFirst1, 24) }]);
    expect(easyA.correctAnswer?.[0].answer).toBe(aFirst0 ? 'first' : 'second');
    expect(easyB.correctAnswer?.[0].answer).toBe(aFirst1 ? 'second' : 'first');
  });

  test('ends after eight trials by default', () => {
    expect(runPractice(7).component).toBe('practice-trial');
    expect(runPractice(8)).toEqual({ component: null });
  });

  test('honours the trials override', () => {
    expect(runPractice(1, { trials: 2 }).component).toBe('practice-trial');
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
      customParameters: CELL,
      currentStep: STEP,
      currentBlock: BLOCK,
    });
    const parameters = withSetup.parameters as unknown as TrialParams;
    expect(parameters.refreshMs).toBe(10);
    expect(parameters.seedA).not.toBe((runPractice(0).parameters as unknown as TrialParams).seedA);
  });
});
