import {
  describe, expect, test, vi,
} from 'vitest';
import type { ParticipantData } from '../../../../parser/types';
import type { TrialAnswer, TrialParams } from '../generator/types';
import practiceBlock from '../practiceBlock';
import { PRACTICE_MAX_OFF_TRIALS } from '../timingGuard';
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

const EXACT = {
  fixation: 500, s1: 200, mask: 150, blank: 250, s2: 200, mask2: 150, blank2: 250,
};
/** s1 doubled, as on a display that keeps half the estimated refresh rate */
const DOUBLED = { ...EXACT, s1: 400 };

function storedTrials(count: number, offTarget: number[] = []): ParticipantData['answers'] {
  return Object.fromEntries(new Array(count).fill(null).map((_, index) => [
    `${BLOCK}_${STEP}_practice-trial_${index}`,
    {
      componentName: 'practice-trial',
      endTime: index + 1,
      answer: {
        trial: 'first',
        trialData: {
          staircaseId: 'practice', trialIndex: index, measured: offTarget.includes(index) ? DOUBLED : EXACT, refreshMs: 1000 / 60,
        } as unknown as TrialAnswer,
      },
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
  test('schedules the practice-trial component with the interval it grades against', () => {
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
    const seen = new Array(3).fill(null).map((_, index) => runPractice(index).parameters as unknown as TrialParams);
    expect(seen.map((parameters) => parameters.nB)).toEqual([12, 40, 12]);
    expect(seen.every((parameters) => parameters.cue === 'shape' && parameters.density === 'dense')).toBe(true);
    expect(new Set(seen.map((parameters) => parameters.seedA)).size).toBe(3);
    // with more trials the interval order varies
    const many = new Array(8).fill(null).map((_, index) => runPractice(index, { trials: 8 }).parameters as unknown as TrialParams);
    expect(new Set(many.map((parameters) => parameters.aFirst)).size).toBe(2);
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

  test('only the first practice trial waits for the start gate', () => {
    expect((runPractice(0).parameters as unknown as TrialParams).waitForStart).toBe(true);
    expect((runPractice(1).parameters as unknown as TrialParams).waitForStart).toBe(false);
    expect((runPractice(2).parameters as unknown as TrialParams).waitForStart).toBe(false);
  });

  test('ends after three trials by default', () => {
    expect(runPractice(2).component).toBe('practice-trial');
    expect(runPractice(3)).toEqual({ component: null });
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
          componentName: 'setup', endTime: 1, answer: { setup: { sessionSalt: 555, refreshMs: 10, pxPerCm: 38.2 } },
        },
      } as unknown as ParticipantData['answers'],
      customParameters: CELL,
      currentStep: STEP,
      currentBlock: BLOCK,
    });
    const parameters = withSetup.parameters as unknown as TrialParams;
    expect(parameters.refreshMs).toBe(10);
    expect(parameters.pxPerCm).toBe(38.2);
    expect(parameters.seedA).not.toBe((runPractice(0).parameters as unknown as TrialParams).seedA);
  });
  describe('display-timing backstop', () => {
    // the main config's setting
    const ON = { maxOffTargetTrials: PRACTICE_MAX_OFF_TRIALS };
    function finish(offTarget: number[], overrides: { maxOffTargetTrials?: number } = ON) {
      return practiceBlock({
        answers: storedTrials(3, offTarget), customParameters: { ...CELL, ...overrides }, currentStep: STEP, currentBlock: BLOCK,
      });
    }
    test('none or one of three practice trials off target: on to the main task', () => {
      expect(finish([])).toEqual({ component: null });
      expect(finish([1])).toEqual({ component: null });
    });
    test('two or three of three off target end the session on display-failed', () => {
      expect(finish([0, 2])).toEqual({ component: 'display-failed' });
      expect(finish([0, 1, 2])).toEqual({ component: 'display-failed' });
    });
    test('a reload stays on the end page (it is re-derived from the stored trials)', () => {
      const answers = storedTrials(3, [0, 1]);
      const call = () => practiceBlock({
        answers, customParameters: { ...CELL, ...ON }, currentStep: STEP, currentBlock: BLOCK,
      });
      expect(call()).toEqual({ component: 'display-failed' });
      expect(call()).toEqual({ component: 'display-failed' });
    });
    test('only judged after the last practice trial', () => {
      expect(runPractice(2).component).toBe('practice-trial');
      expect(practiceBlock({
        answers: storedTrials(2, [0, 1]), customParameters: { ...CELL, ...ON }, currentStep: STEP, currentBlock: BLOCK,
      }).component).toBe('practice-trial');
    });
    test('fixation off target does not count; maxOffTargetTrials can switch the backstop off', () => {
      const answers = storedTrials(3);
      Object.values(answers).forEach((record) => {
        (record.answer.trialData as unknown as { measured: Record<string, number> }).measured.fixation = 600;
      });
      expect(practiceBlock({
        answers, customParameters: { ...CELL, ...ON }, currentStep: STEP, currentBlock: BLOCK,
      })).toEqual({ component: null });
      expect(finish([0, 1, 2], { maxOffTargetTrials: 3 })).toEqual({ component: null });
    });
    test('off unless the block sets maxOffTargetTrials (sessions in flight under an older config)', () => {
      expect(finish([0, 1, 2], {})).toEqual({ component: null });
    });
  });
});
