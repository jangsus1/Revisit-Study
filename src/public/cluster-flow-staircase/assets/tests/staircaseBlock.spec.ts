import {
  describe, expect, test, vi,
} from 'vitest';
import type { ParticipantData } from '../../../../parser/types';
import type { TrialAnswer, TrialParams } from '../generator/types';
import staircaseBlock, { collectBlockTrials, readSetupAnswer } from '../staircaseBlock';

// The generator is mocked everywhere in these component tests: the block only needs `hashSeed`
// to be deterministic, and the real generator is covered by its own suite.
vi.mock('../generator', () => ({
  hashSeed: (...parts: (string | number)[]) => parts.reduce<number>(
    (acc, part) => String(part).split('').reduce((inner, char) => (inner * 31 + char.charCodeAt(0)) % 2147483647, acc),
    7,
  ),
  CUES: ['none', 'hull', 'rect', 'color', 'edge', 'shape'],
  DENSITIES: ['sparse', 'dense'],
}));

const BLOCK = 'cell-color-sparse';
const STEP = 5;

function trialAnswer(overrides: Partial<TrialAnswer>): TrialAnswer {
  return {
    response: 'first',
    correct: true,
    rtMs: 500,
    nA: 24,
    nB: 34,
    cue: 'color',
    density: 'sparse',
    cellId: 'cell-color-sparse',
    staircaseId: 'above',
    trialIndex: 0,
    seedA: 1,
    seedB: 2,
    attemptsA: 1,
    attemptsB: 1,
    measured: {
      fixation: 500, a: 200, blank1: 400, b: 200, blank2: 400,
    },
    refreshMs: 16.67,
    fullscreen: true,
    ...overrides,
  } as TrialAnswer;
}

function answers(entries: Record<string, unknown>): ParticipantData['answers'] {
  return entries as unknown as ParticipantData['answers'];
}

function blockAnswers(trials: TrialAnswer[]) {
  return Object.fromEntries(trials.map((trial, index) => [
    `${BLOCK}_${STEP}_trial_${index}`,
    { componentName: 'trial', endTime: index + 1, answer: { trial: trial.response, trialData: trial } },
  ]));
}

const params = { cellId: 'cell-color-sparse', cue: 'color' as const, density: 'sparse' as const };

describe('readSetupAnswer', () => {
  test('falls back to a fixed salt and 60 Hz when there is no setup answer', () => {
    expect(readSetupAnswer(answers({}))).toEqual({ sessionSalt: 1, refreshMs: 1000 / 60 });
  });

  test('reads the salt and refresh period written by the setup component', () => {
    const result = readSetupAnswer(answers({
      setup_2: {
        componentName: 'setup',
        endTime: 10,
        answer: { setup: { sessionSalt: 987, refreshMs: 8.33 } },
      },
    }));
    expect(result).toEqual({ sessionSalt: 987, refreshMs: 8.33 });
  });

  test('ignores a nonsensical refresh period', () => {
    const result = readSetupAnswer(answers({
      setup_2: { componentName: 'setup', endTime: 10, answer: { setup: { sessionSalt: 5, refreshMs: 0 } } },
    }));
    expect(result).toEqual({ sessionSalt: 5, refreshMs: 1000 / 60 });
  });
});

describe('collectBlockTrials', () => {
  test('only collects finished trials of this block', () => {
    const collected = collectBlockTrials(answers({
      ...blockAnswers([trialAnswer({ trialIndex: 0 }), trialAnswer({ trialIndex: 1 })]),
      'other-block_9_trial_0': { componentName: 'trial', endTime: 3, answer: { trialData: trialAnswer({ trialIndex: 7 }) } },
      [`${BLOCK}_${STEP}_trial_2`]: { componentName: 'trial', endTime: -1, answer: {} },
      setup_2: { componentName: 'setup', endTime: 1, answer: { setup: { sessionSalt: 3 } } },
    }), BLOCK, STEP);

    expect(collected.map((trial) => trial.trialIndex)).toEqual([0, 1]);
  });
});

describe('staircaseBlock', () => {
  test('starts with a trial from one of the two staircases', () => {
    const result = staircaseBlock({
      answers: answers({}), customParameters: params, currentStep: STEP, currentBlock: BLOCK,
    });

    const parameters = result.parameters as unknown as TrialParams;
    expect(result.component).toBe('trial');
    expect([34, 14]).toContain(parameters.nB);
    expect(['above', 'below']).toContain(parameters.staircaseId);
    expect(parameters.trialIndex).toBe(0);
    expect(parameters.feedback).toBe(false);
    expect(parameters.cue).toBe('color');
    expect(parameters.density).toBe('sparse');
    expect(parameters.cellId).toBe('cell-color-sparse');
    expect(parameters.refreshMs).toBeCloseTo(1000 / 60, 5);
    expect(parameters.seedA).not.toBe(parameters.seedB);
  });

  test('is deterministic for the same history', () => {
    const call = () => staircaseBlock({
      answers: answers({}), customParameters: params, currentStep: STEP, currentBlock: BLOCK,
    });
    expect(call()).toEqual(call());
  });

  test('uses the session salt and measured refresh rate from setup', () => {
    const withSetup = staircaseBlock({
      answers: answers({ setup_2: { componentName: 'setup', endTime: 1, answer: { setup: { sessionSalt: 424242, refreshMs: 8.33 } } } }),
      customParameters: params,
      currentStep: STEP,
      currentBlock: BLOCK,
    });
    const withoutSetup = staircaseBlock({
      answers: answers({}), customParameters: params, currentStep: STEP, currentBlock: BLOCK,
    });

    const a = withSetup.parameters as unknown as TrialParams;
    const b = withoutSetup.parameters as unknown as TrialParams;
    expect(a.refreshMs).toBeCloseTo(8.33, 5);
    expect(a.seedA).not.toBe(b.seedA);
  });

  test('marks the larger display as the correct answer', () => {
    for (let i = 0; i < 6; i += 1) {
      const result = staircaseBlock({
        answers: answers(blockAnswers(new Array(i).fill(null).map((_, index) => trialAnswer({ trialIndex: index, staircaseId: index % 2 === 0 ? 'above' : 'below' })))),
        customParameters: params,
        currentStep: STEP,
        currentBlock: BLOCK,
      });
      const parameters = result.parameters as unknown as TrialParams;
      expect(result.correctAnswer).toEqual([{ id: 'trial', answer: parameters.nB > 24 ? 'second' : 'first' }]);
    }
  });

  test('advances the trial index as trials are stored', () => {
    const result = staircaseBlock({
      answers: answers(blockAnswers([
        trialAnswer({ trialIndex: 0, staircaseId: 'above' }),
        trialAnswer({ trialIndex: 1, staircaseId: 'below', nB: 14 }),
      ])),
      customParameters: params,
      currentStep: STEP,
      currentBlock: BLOCK,
    });
    expect((result.parameters as unknown as TrialParams).trialIndex).toBe(2);
  });

  test('schedules a catch trial when catchEvery is reached', () => {
    const result = staircaseBlock({
      answers: answers(blockAnswers([
        trialAnswer({ trialIndex: 0, staircaseId: 'above' }),
        trialAnswer({ trialIndex: 1, staircaseId: 'below', nB: 14 }),
      ])),
      customParameters: { ...params, catchEvery: 2 },
      currentStep: STEP,
      currentBlock: BLOCK,
    });
    const parameters = result.parameters as unknown as TrialParams;
    expect(parameters.staircaseId).toBe('catch');
    expect([12, 40]).toContain(parameters.nB);
  });

  test('returns a null component when both staircases are finished', () => {
    const result = staircaseBlock({
      answers: answers(blockAnswers([
        trialAnswer({ trialIndex: 0, staircaseId: 'above' }),
        trialAnswer({ trialIndex: 1, staircaseId: 'below', nB: 14 }),
      ])),
      customParameters: { ...params, maxTrials: 1 },
      currentStep: STEP,
      currentBlock: BLOCK,
    });
    expect(result).toEqual({ component: null });
  });

  test('honours the maxReversals override', () => {
    const trials = [
      trialAnswer({ trialIndex: 0, staircaseId: 'above', correct: true }),
      trialAnswer({ trialIndex: 1, staircaseId: 'above', correct: true }),
      trialAnswer({ trialIndex: 2, staircaseId: 'above', correct: false }),
      trialAnswer({ trialIndex: 3, staircaseId: 'below', correct: true }),
      trialAnswer({ trialIndex: 4, staircaseId: 'below', correct: true }),
      trialAnswer({ trialIndex: 5, staircaseId: 'below', correct: false }),
    ];
    const result = staircaseBlock({
      answers: answers(blockAnswers(trials)),
      customParameters: { ...params, maxReversals: 1, catchEvery: 99 },
      currentStep: STEP,
      currentBlock: BLOCK,
    });
    expect(result).toEqual({ component: null });
  });
});
