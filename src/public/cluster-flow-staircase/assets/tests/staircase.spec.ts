import { describe, expect, test } from 'vitest';
import type { StaircaseId } from '../generator/types';
import {
  DEFAULT_STAIRCASE_CONFIG,
  StaircaseConfig,
  StaircaseTrial,
  deriveState,
  nextTrial,
  summarise,
} from '../staircase';

const cfg = DEFAULT_STAIRCASE_CONFIG;

/** Builds a trial history from `[staircaseId, nB, correct]` triples. */
function history(entries: [StaircaseId, number, boolean][]): StaircaseTrial[] {
  return entries.map(([staircaseId, nB, correct], trialIndex) => ({
    staircaseId, nB, correct, trialIndex,
  }));
}

/** Runs `results` on one staircase, using the state's own current value for each trial. */
function run(id: 'above' | 'below', results: boolean[], config: StaircaseConfig = cfg) {
  const trials: StaircaseTrial[] = [];
  results.forEach((correct, trialIndex) => {
    const state = deriveState(trials, config);
    trials.push({
      staircaseId: id, nB: state[id].current, correct, trialIndex,
    });
  });
  return { state: deriveState(trials, config), trials };
}

describe('deriveState', () => {
  test('starts both staircases at their configured values', () => {
    const state = deriveState([], cfg);
    expect(state.above.current).toBe(34);
    expect(state.below.current).toBe(14);
    expect(state.above.done).toBe(false);
    expect(state.below.done).toBe(false);
    expect(state.totalTrials).toBe(0);
    expect(state.mainTrialsSinceCatch).toBe(0);
  });

  test('one correct answer does not move the staircase', () => {
    const { state } = run('above', [true]);
    expect(state.above.current).toBe(34);
    expect(state.above.consecutiveCorrect).toBe(1);
    expect(state.above.trials).toBe(1);
  });

  test('two correct answers step toward the reference and reset the counter', () => {
    const { state } = run('above', [true, true]);
    expect(state.above.current).toBe(32);
    expect(state.above.consecutiveCorrect).toBe(0);
    expect(state.above.lastDirection).toBe(-1);
  });

  test('the ascending staircase steps up toward the reference', () => {
    const { state } = run('below', [true, true]);
    expect(state.below.current).toBe(16);
    expect(state.below.lastDirection).toBe(1);
  });

  test('an incorrect answer steps away from the reference and clears the counter', () => {
    const { state } = run('above', [true, false]);
    expect(state.above.current).toBe(36);
    expect(state.above.consecutiveCorrect).toBe(0);
    expect(state.above.lastDirection).toBe(1);
  });

  test('a direction change after the first move counts as a reversal', () => {
    // down to 32, then wrong -> up: the reversal is recorded at 32.
    const { state } = run('above', [true, true, false]);
    expect(state.above.reversals).toEqual([32]);
    expect(state.above.current).toBe(34);
  });

  test('the very first move is not a reversal', () => {
    const { state } = run('above', [false]);
    expect(state.above.reversals).toEqual([]);
    expect(state.above.current).toBe(36);
  });

  test('reversals alternate as the staircase brackets the threshold', () => {
    const { state } = run('above', [true, true, false, true, true, false]);
    expect(state.above.reversals).toEqual([32, 34, 32]);
  });

  test('a step that would land on the reference continues past it', () => {
    // ten correct answers walk the descending staircase 34 -> 26 and then over the reference
    const eight = run('above', [true, true, true, true, true, true, true, true]);
    expect(eight.state.above.current).toBe(26);
    const ten = run('above', new Array(10).fill(true));
    expect(ten.state.above.current).toBe(22);
  });

  test('the ascending staircase also skips the reference', () => {
    const eight = run('below', [true, true, true, true, true, true, true, true]);
    expect(eight.state.below.current).toBe(22);
    const ten = run('below', new Array(10).fill(true));
    expect(ten.state.below.current).toBe(26);
  });

  test('values are clamped to the configured bounds', () => {
    const { state } = run('above', [false, false, false, false, false, false, false, false]);
    expect(state.above.current).toBe(48);
    expect(state.above.current).toBeLessThanOrEqual(cfg.max);
  });

  test('is finished after maxReversals reversals', () => {
    const short: StaircaseConfig = { ...cfg, maxReversals: 2 };
    const { state } = run('above', [true, true, false, true, true], short);
    expect(state.above.reversals).toHaveLength(2);
    expect(state.above.done).toBe(true);
  });

  test('is finished after maxTrials trials', () => {
    const short: StaircaseConfig = { ...cfg, maxTrials: 3 };
    const { state } = run('above', [true, true, true], short);
    expect(state.above.done).toBe(true);
    expect(state.above.trials).toBe(3);
  });

  test('replays trials in trialIndex order regardless of input order', () => {
    const ordered = deriveState(history([['above', 34, true], ['above', 34, true], ['above', 32, false]]), cfg);
    const shuffled = deriveState([
      {
        staircaseId: 'above', nB: 32, correct: false, trialIndex: 2,
      },
      {
        staircaseId: 'above', nB: 34, correct: true, trialIndex: 0,
      },
      {
        staircaseId: 'above', nB: 34, correct: true, trialIndex: 1,
      },
    ], cfg);
    expect(shuffled).toEqual(ordered);
  });

  test('interleaved staircases are independent', () => {
    const state = deriveState(history([
      ['above', 34, true], ['below', 14, false], ['above', 34, true], ['below', 16, true],
    ]), cfg);
    expect(state.above.current).toBe(32);
    expect(state.below.current).toBe(12);
    expect(state.above.trials).toBe(2);
    expect(state.below.trials).toBe(2);
  });

  test('catch trials are excluded from the staircases but counted', () => {
    const state = deriveState(history([
      ['above', 34, true], ['catch', 12, true], ['above', 34, true], ['catch', 40, false],
    ]), cfg);
    expect(state.above.trials).toBe(2);
    expect(state.above.consecutiveCorrect).toBe(0);
    expect(state.above.current).toBe(32);
    expect(state.catchTotal).toBe(2);
    expect(state.catchCorrect).toBe(1);
    expect(state.totalTrials).toBe(4);
  });

  test('practice trials do not affect the staircases', () => {
    const state = deriveState(history([['practice', 12, true], ['practice', 40, true]]), cfg);
    expect(state.above.trials).toBe(0);
    expect(state.below.trials).toBe(0);
    expect(state.totalTrials).toBe(2);
  });

  test('a catch trial resets the main-trial counter', () => {
    const state = deriveState(history([
      ['above', 34, true], ['below', 14, true], ['catch', 12, true], ['above', 34, true],
    ]), cfg);
    expect(state.mainTrialsSinceCatch).toBe(1);
  });
});

describe('nextTrial', () => {
  test('returns null once both staircases are finished', () => {
    const config: StaircaseConfig = { ...cfg, maxTrials: 1 };
    const state = deriveState(history([['above', 34, true], ['below', 14, true]]), config);
    expect(nextTrial(state, config, () => 0)).toBeNull();
  });

  test('picks the first open staircase with a low random draw', () => {
    const state = deriveState([], cfg);
    expect(nextTrial(state, cfg, () => 0)).toEqual({ staircaseId: 'above', nB: 34 });
  });

  test('picks the second open staircase with a high random draw', () => {
    const state = deriveState([], cfg);
    expect(nextTrial(state, cfg, () => 0.99)).toEqual({ staircaseId: 'below', nB: 14 });
  });

  test('only offers the staircase that is still running', () => {
    const config: StaircaseConfig = { ...cfg, maxTrials: 1 };
    const state = deriveState(history([['above', 34, true]]), config);
    expect(nextTrial(state, config, () => 0)?.staircaseId).toBe('below');
    expect(nextTrial(state, config, () => 0.99)?.staircaseId).toBe('below');
  });

  test('schedules a catch trial once enough main trials have run', () => {
    const config: StaircaseConfig = { ...cfg, catchEvery: 2 };
    const state = deriveState(history([['above', 34, true], ['below', 14, true]]), config);
    expect(nextTrial(state, config, () => 0)).toEqual({ staircaseId: 'catch', nB: 12 });
  });

  test('alternates the catch values', () => {
    const config: StaircaseConfig = { ...cfg, catchEvery: 2 };
    const state = deriveState(history([
      ['above', 34, true], ['below', 14, true], ['catch', 12, true],
      ['above', 34, true], ['below', 14, true],
    ]), config);
    expect(nextTrial(state, config, () => 0)).toEqual({ staircaseId: 'catch', nB: 40 });
  });

  test('the returned nB is the arm\'s current level', () => {
    const { state } = run('below', [true, true]);
    expect(nextTrial(state, cfg, () => 0.99)).toEqual({ staircaseId: 'below', nB: 16 });
  });
});

describe('summarise', () => {
  test('averages the reversal levels of each staircase and of both together', () => {
    const state = deriveState([], cfg);
    state.above.reversals = [32, 34, 32];
    state.below.reversals = [16, 18];
    state.catchTotal = 3;
    state.catchCorrect = 2;

    const summary = summarise(state);
    expect(summary.thresholdAbove).toBeCloseTo(32.6667, 3);
    expect(summary.thresholdBelow).toBe(17);
    expect(summary.threshold).toBeCloseTo((32 + 34 + 32 + 16 + 18) / 5, 6);
    expect(summary.catchCorrect).toBe(2);
    expect(summary.catchTotal).toBe(3);
  });

  test('reports null thresholds when there are no reversals', () => {
    const summary = summarise(deriveState([], cfg));
    expect(summary.thresholdAbove).toBeNull();
    expect(summary.thresholdBelow).toBeNull();
    expect(summary.threshold).toBeNull();
  });
});
