import {
  describe, expect, test, vi,
} from 'vitest';
import type { ParticipantData } from '../../../../parser/types';
import type { TrialAnswer, TrialParams } from '../generator/types';
import staircaseBlock, {
  collectBlockTrials, correctInterval, countRests, drawAFirst, drawHueOffset, drawStarts, readSetupAnswer, waitsForStart,
} from '../staircaseBlock';

// The generator is mocked everywhere in these component tests: the block only needs `hashSeed`
// to be deterministic, and the real generator is covered by its own suite.
vi.mock('../generator', () => ({
  hashSeed: (...parts: (string | number)[]) => parts.reduce<number>(
    (acc, part) => String(part).split('').reduce((inner, char) => (inner * 31 + char.charCodeAt(0)) % 2147483647, acc),
    7,
  ),
  CUES: ['proximity', 'rect', 'color', 'shape', 'edge'],
  DENSITIES: ['sparse', 'dense'],
}));

const BLOCK = 'cell-color-sparse';
const STEP = 5;

/** A stored trial plus the correctness the fixture should encode through `answer.trial` vs `correctAnswer`. */
type FixtureTrial = TrialAnswer & { correct: boolean };

function trialAnswer(overrides: Partial<FixtureTrial>): FixtureTrial {
  return {
    response: 'first',
    aFirst: true,
    hueOffset: 0,
    starts: { above: 31, below: 17 },
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
      fixation: 500, s1: 200, mask: 150, blank: 250, s2: 200, blank2: 400,
    },
    refreshMs: 16.67,
    fullscreen: true,
    ...overrides,
  } as FixtureTrial;
}

function answers(entries: Record<string, unknown>): ParticipantData['answers'] {
  return entries as unknown as ParticipantData['answers'];
}

/**
 * Builds the platform records for a run of trials. The expected answer is chosen so that the
 * participant's `trial` answer is correct exactly when the fixture says so.
 */
function blockAnswers(trials: FixtureTrial[]) {
  return Object.fromEntries(trials.map(({ correct, ...trial }, index) => {
    const other = trial.response === 'first' ? 'second' : 'first';
    return [
      `${BLOCK}_${STEP}_trial_${index}`,
      {
        componentName: 'trial',
        endTime: index + 1,
        answer: { trial: trial.response, trialData: trial },
        correctAnswer: [{ id: 'trial', answer: correct ? trial.response : other }],
      },
    ];
  }));
}

const params = { cellId: 'cell-color-sparse', cue: 'color' as const, density: 'sparse' as const };

describe('readSetupAnswer', () => {
  test('falls back to a fixed salt and 60 Hz when there is no setup answer', () => {
    expect(readSetupAnswer(answers({}))).toEqual({ sessionSalt: 1, refreshMs: 1000 / 60, pxPerCm: null });
  });

  test('reads the salt and refresh period written by the setup component', () => {
    const result = readSetupAnswer(answers({
      setup_2: {
        componentName: 'setup',
        endTime: 10,
        answer: { setup: { sessionSalt: 987, refreshMs: 8.33 } },
      },
    }));
    expect(result).toEqual({ sessionSalt: 987, refreshMs: 8.33, pxPerCm: null });
  });

  test('ignores a nonsensical refresh period', () => {
    const result = readSetupAnswer(answers({
      setup_2: { componentName: 'setup', endTime: 10, answer: { setup: { sessionSalt: 5, refreshMs: 0 } } },
    }));
    expect(result).toEqual({ sessionSalt: 5, refreshMs: 1000 / 60, pxPerCm: null });
  });

  test('reads the card calibration and ignores a missing or nonsensical one', () => {
    const withCard = readSetupAnswer(answers({
      setup_2: { componentName: 'setup', endTime: 10, answer: { setup: { sessionSalt: 5, refreshMs: 10, pxPerCm: 47.5 } } },
    }));
    expect(withCard.pxPerCm).toBe(47.5);
    const noCard = readSetupAnswer(answers({
      setup_2: { componentName: 'setup', endTime: 10, answer: { setup: { sessionSalt: 5, refreshMs: 10, pxPerCm: null } } },
    }));
    expect(noCard.pxPerCm).toBeNull();
    const zero = readSetupAnswer(answers({
      setup_2: { componentName: 'setup', endTime: 10, answer: { setup: { sessionSalt: 5, refreshMs: 10, pxPerCm: 0 } } },
    }));
    expect(zero.pxPerCm).toBeNull();
  });
});

describe('waitsForStart', () => {
  const record = (componentName: string, endTime = 1) => ({ componentName, endTime, answer: {} });

  test('the block\'s first trial waits', () => {
    expect(waitsForStart(answers({}), BLOCK, STEP)).toBe(true);
    // records of other blocks, and the unfinished record of the trial being scheduled, do not count
    expect(waitsForStart(answers({
      'practice-color-sparse_4_practice-trial_0': record('practice-trial'),
      [`${BLOCK}_${STEP}_trial_0`]: record('trial', -1),
    }), BLOCK, STEP)).toBe(true);
  });

  test('later trials do not wait', () => {
    expect(waitsForStart(answers({
      [`${BLOCK}_${STEP}_trial_0`]: record('trial'),
    }), BLOCK, STEP)).toBe(false);
  });

  test('the first trial after a rest waits, the one after it does not', () => {
    const base = {
      [`${BLOCK}_${STEP}_trial_0`]: record('trial'),
      [`${BLOCK}_${STEP}_trial_1`]: record('trial'),
      [`${BLOCK}_${STEP}_rest_2`]: record('rest'),
    };
    expect(waitsForStart(answers(base), BLOCK, STEP)).toBe(true);
    expect(waitsForStart(answers({ ...base, [`${BLOCK}_${STEP}_trial_3`]: record('trial') }), BLOCK, STEP)).toBe(false);
  });

  test('orders records by funcIndex, not by insertion or string order', () => {
    expect(waitsForStart(answers({
      [`${BLOCK}_${STEP}_trial_10`]: record('trial'),
      [`${BLOCK}_${STEP}_rest_9`]: record('rest'),
    }), BLOCK, STEP)).toBe(false);
    expect(waitsForStart(answers({
      [`${BLOCK}_${STEP}_trial_9`]: record('trial'),
      [`${BLOCK}_${STEP}_rest_10`]: record('rest'),
    }), BLOCK, STEP)).toBe(true);
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

  test('derives correctness from the stored answer and the platform correctAnswer', () => {
    const collected = collectBlockTrials(answers(blockAnswers([
      trialAnswer({ trialIndex: 0, response: 'first', correct: true }),
      trialAnswer({ trialIndex: 1, response: 'second', correct: false }),
    ])), BLOCK, STEP);

    expect(collected.map((trial) => trial.correct)).toEqual([true, false]);
    expect(collected.map((trial) => trial.response)).toEqual(['first', 'second']);
  });

  test('skips records that carry no correctAnswer', () => {
    const { correct: _ignored, ...trial } = trialAnswer({ trialIndex: 0 });
    const collected = collectBlockTrials(answers({
      [`${BLOCK}_${STEP}_trial_0`]: { componentName: 'trial', endTime: 1, answer: { trial: 'first', trialData: trial } },
    }), BLOCK, STEP);
    expect(collected).toEqual([]);
  });
});

describe('correctInterval', () => {
  test('names the interval holding the larger display', () => {
    // B larger, A first -> B is second
    expect(correctInterval(34, true, 24)).toBe('second');
    // B larger, A second -> B is first
    expect(correctInterval(34, false, 24)).toBe('first');
    // A larger, A first
    expect(correctInterval(14, true, 24)).toBe('first');
    // A larger, A second
    expect(correctInterval(14, false, 24)).toBe('second');
    // just either side of the reference
    expect(correctInterval(25, true, 24)).toBe('second');
    expect(correctInterval(23, true, 24)).toBe('first');
  });
});

describe('drawAFirst', () => {
  test('is deterministic and varies across trials', () => {
    expect(drawAFirst(7, 'cell-x', 3)).toBe(drawAFirst(7, 'cell-x', 3));
    const orders = new Array(40).fill(null).map((_, index) => drawAFirst(7, 'cell-x', index));
    expect(orders).toContain(true);
    expect(orders).toContain(false);
  });
});

describe('drawStarts', () => {
  test('draws the ascending start from 16 to 18 and the descending one from 30 to 32', () => {
    const seenBelow = new Set<number>();
    const seenAbove = new Set<number>();
    for (let salt = 0; salt < 200; salt += 1) {
      const { above, below } = drawStarts(salt, 'cell-x');
      seenBelow.add(below);
      seenAbove.add(above);
    }
    expect([...seenBelow].sort()).toEqual([16, 17, 18]);
    expect([...seenAbove].sort()).toEqual([30, 31, 32]);
    expect(drawStarts(5, 'cell-x')).toEqual(drawStarts(5, 'cell-x'));
  });
});

describe('drawHueOffset', () => {
  test('is a whole number of degrees in [0, 60), fixed per session', () => {
    const seen = new Set<number>();
    for (let salt = 0; salt < 300; salt += 1) {
      const h = drawHueOffset(salt);
      expect(Number.isInteger(h)).toBe(true);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(60);
      seen.add(h);
    }
    expect(seen.size).toBeGreaterThan(30);
    expect(drawHueOffset(9)).toBe(drawHueOffset(9));
  });
});

describe('countRests', () => {
  test('counts the finished rest pages of this block only', () => {
    expect(countRests(answers({
      [`${BLOCK}_${STEP}_rest_4`]: { componentName: 'rest', endTime: 5, answer: {} },
      [`${BLOCK}_${STEP}_rest_9`]: { componentName: 'rest', endTime: -1, answer: {} },
      [`${BLOCK}_${STEP}_trial_0`]: { componentName: 'trial', endTime: 5, answer: {} },
      other_3_rest_1: { componentName: 'rest', endTime: 5, answer: {} },
    }), BLOCK, STEP)).toBe(1);
  });
});

describe('staircaseBlock', () => {
  test('starts with a trial from one of the two staircases at the participant\'s drawn starts', () => {
    const result = staircaseBlock({
      answers: answers({}), customParameters: params, currentStep: STEP, currentBlock: BLOCK,
    });

    const parameters = result.parameters as unknown as TrialParams;
    const starts = drawStarts(1, 'cell-color-sparse');
    expect(result.component).toBe('trial');
    expect(parameters.starts).toEqual(starts);
    expect([starts.above, starts.below]).toContain(parameters.nB);
    expect(['above', 'below']).toContain(parameters.staircaseId);
    expect(parameters.nB).toBe(parameters.staircaseId === 'above' ? starts.above : starts.below);
    expect(parameters.trialIndex).toBe(0);
    expect(parameters.cue).toBe('color');
    expect(parameters.density).toBe('sparse');
    expect(parameters.cellId).toBe('cell-color-sparse');
    expect(parameters.refreshMs).toBeCloseTo(1000 / 60, 5);
    expect(parameters.seedA).not.toBe(parameters.seedB);
    expect(parameters.hueOffset).toBe(drawHueOffset(1));
    expect(typeof parameters.aFirst).toBe('boolean');
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
    expect(a.hueOffset).toBe(drawHueOffset(424242));
    expect(a.starts).toEqual(drawStarts(424242, 'cell-color-sparse'));
    expect(a.pxPerCm).toBeNull();
    expect(b.pxPerCm).toBeNull();
  });

  test('passes the card calibration on to the trial', () => {
    const result = staircaseBlock({
      answers: answers({ setup_2: { componentName: 'setup', endTime: 1, answer: { setup: { sessionSalt: 3, refreshMs: 10, pxPerCm: 40 } } } }),
      customParameters: params,
      currentStep: STEP,
      currentBlock: BLOCK,
    });
    expect((result.parameters as unknown as TrialParams).pxPerCm).toBe(40);
  });

  test('marks the interval of the larger display as the correct answer', () => {
    for (let i = 0; i < 6; i += 1) {
      const result = staircaseBlock({
        answers: answers(blockAnswers(new Array(i).fill(null).map((_, index) => trialAnswer({ trialIndex: index, staircaseId: index % 2 === 0 ? 'above' : 'below' })))),
        customParameters: params,
        currentStep: STEP,
        currentBlock: BLOCK,
      });
      const parameters = result.parameters as unknown as TrialParams;
      expect(parameters.aFirst).toBe(drawAFirst(1, 'cell-color-sparse', i));
      expect(result.correctAnswer).toEqual([{ id: 'trial', answer: correctInterval(parameters.nB, parameters.aFirst, 24) }]);
    }
  });

  test('advances the trial index as trials are stored', () => {
    const result = staircaseBlock({
      answers: answers(blockAnswers([
        trialAnswer({ trialIndex: 0, staircaseId: 'above' }),
        trialAnswer({ trialIndex: 1, staircaseId: 'below', nB: 17 }),
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
        trialAnswer({ trialIndex: 1, staircaseId: 'below', nB: 17 }),
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
        trialAnswer({ trialIndex: 1, staircaseId: 'below', nB: 17 }),
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

  describe('rest breaks', () => {
    const mainTrials = (count: number) => new Array(count).fill(null).map((_, index) => trialAnswer({
      trialIndex: index, staircaseId: index % 2 === 0 ? 'above' : 'below', nB: index % 2 === 0 ? 31 : 17,
    }));
    const call = (entries: Record<string, unknown>, restEvery?: number) => staircaseBlock({
      answers: answers(entries),
      customParameters: {
        ...params, catchEvery: 999, ...(restEvery === undefined ? {} : { restEvery }),
      },
      currentStep: STEP,
      currentBlock: BLOCK,
    });

    test('offers the rest page after every 60 main trials by default', () => {
      expect(call(blockAnswers(mainTrials(59))).component).toBe('trial');
      expect(call(blockAnswers(mainTrials(60)))).toEqual({ component: 'rest' });
    });

    test('shows each rest once, then carries on with the next trial', () => {
      const afterRest = call({
        ...blockAnswers(mainTrials(60)),
        [`${BLOCK}_${STEP}_rest_60`]: { componentName: 'rest', endTime: 61, answer: {} },
      });
      expect(afterRest.component).toBe('trial');
      expect((afterRest.parameters as unknown as TrialParams).trialIndex).toBe(60);
      // the first trial after a rest waits for a key press or click
      expect((afterRest.parameters as unknown as TrialParams).waitForStart).toBe(true);
    });

    test('only the block\'s first trial and the first after a rest wait for the start gate', () => {
      expect((call({}).parameters as unknown as TrialParams).waitForStart).toBe(true);
      expect((call(blockAnswers(mainTrials(1))).parameters as unknown as TrialParams).waitForStart).toBe(false);
      expect((call(blockAnswers(mainTrials(59))).parameters as unknown as TrialParams).waitForStart).toBe(false);
    });

    test('honours the restEvery override and 0 turns rests off', () => {
      expect(call(blockAnswers(mainTrials(2)), 2)).toEqual({ component: 'rest' });
      expect(call(blockAnswers(mainTrials(2)), 0).component).toBe('trial');
    });

    test('catch trials do not count toward a rest', () => {
      const trials = [...mainTrials(1), trialAnswer({ trialIndex: 1, staircaseId: 'catch', nB: 12 })];
      expect(call(blockAnswers(trials), 2).component).toBe('trial');
    });

    test('no rest is offered once the block is finished', () => {
      const result = staircaseBlock({
        answers: answers(blockAnswers(mainTrials(2))),
        customParameters: {
          ...params, maxTrials: 1, restEvery: 2,
        },
        currentStep: STEP,
        currentBlock: BLOCK,
      });
      expect(result).toEqual({ component: null });
    });
  });
});
