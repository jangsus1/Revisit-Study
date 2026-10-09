import { describe, expect, test } from 'vitest';
import type { StaircaseId } from '../generator/types';
import { mulberry32 } from '../generator/prng';
import { attentionDue, drawAttentionGaps } from '../attention';
import {
  DEFAULT_STAIRCASE_CONFIG,
  DISCARD_REVERSALS,
  StaircaseConfig,
  StaircaseTrial,
  blockCapReached,
  deriveState,
  nextTrial,
  summarise,
  usableReversals,
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
  test('defaults: step 1, 20 reversals, 90 trials per arm, 190 per block, bounds 8 to 48', () => {
    expect(cfg.step).toBe(1);
    expect(cfg.maxReversals).toBe(20);
    expect(cfg.maxTrials).toBe(90);
    expect(cfg.maxBlockTrials).toBe(190);
    expect([cfg.min, cfg.max, cfg.target]).toEqual([8, 48, 24]);
  });

  test('starts both staircases at their configured values', () => {
    const state = deriveState([], cfg);
    expect(state.above.current).toBe(31);
    expect(state.below.current).toBe(17);
    expect(deriveState([], { ...cfg, startAbove: 32, startBelow: 16 }).above.current).toBe(32);
    expect(state.above.done).toBe(false);
    expect(state.below.done).toBe(false);
    expect(state.totalTrials).toBe(0);
    expect(state.attentionTotal).toBe(0);
  });

  test('one correct answer does not move the staircase', () => {
    const { state } = run('above', [true]);
    expect(state.above.current).toBe(31);
    expect(state.above.consecutiveCorrect).toBe(1);
    expect(state.above.trials).toBe(1);
  });

  test('two correct answers step toward the reference and reset the counter', () => {
    const { state } = run('above', [true, true]);
    expect(state.above.current).toBe(30);
    expect(state.above.consecutiveCorrect).toBe(0);
    expect(state.above.lastDirection).toBe(-1);
  });

  test('the ascending staircase steps up toward the reference', () => {
    const { state } = run('below', [true, true]);
    expect(state.below.current).toBe(18);
    expect(state.below.lastDirection).toBe(1);
  });

  test('an incorrect answer steps away from the reference and clears the counter', () => {
    const { state } = run('above', [true, false]);
    expect(state.above.current).toBe(32);
    expect(state.above.consecutiveCorrect).toBe(0);
    expect(state.above.lastDirection).toBe(1);
  });

  test('a direction change after the first move counts as a reversal', () => {
    // down to 30, then wrong -> up: the reversal is recorded at 30.
    const { state } = run('above', [true, true, false]);
    expect(state.above.reversals).toEqual([30]);
    expect(state.above.current).toBe(31);
  });

  test('the very first move is not a reversal', () => {
    const { state } = run('above', [false]);
    expect(state.above.reversals).toEqual([]);
    expect(state.above.current).toBe(32);
  });

  test('reversals alternate as the staircase brackets the threshold', () => {
    const { state } = run('above', [true, true, false, true, true, false]);
    expect(state.above.reversals).toEqual([30, 31, 30]);
  });

  test('a step that would land on the reference continues past it (25 -> 23)', () => {
    // twelve correct answers walk the descending staircase 31 -> 25, two more jump over 24
    const twelve = run('above', new Array(12).fill(true));
    expect(twelve.state.above.current).toBe(25);
    const fourteen = run('above', new Array(14).fill(true));
    expect(fourteen.state.above.current).toBe(23);
    // and from below the reference, two more correct answers jump back up over it
    const sixteen = run('above', new Array(16).fill(true));
    expect(sixteen.state.above.current).toBe(25);
  });

  test('the ascending staircase also skips the reference (23 -> 25)', () => {
    const twelve = run('below', new Array(12).fill(true));
    expect(twelve.state.below.current).toBe(23);
    const fourteen = run('below', new Array(14).fill(true));
    expect(fourteen.state.below.current).toBe(25);
  });

  test('an incorrect answer next to the reference steps away past it too', () => {
    const { state } = run('above', [...new Array(12).fill(true), false]);
    expect(state.above.current).toBe(26);
    const below = run('below', [...new Array(12).fill(true), false]);
    expect(below.state.below.current).toBe(22);
  });

  test('values are clamped to the configured bounds', () => {
    const { state } = run('above', new Array(25).fill(false));
    expect(state.above.current).toBe(48);
    expect(run('below', new Array(12).fill(false)).state.below.current).toBe(8);
    expect(state.above.current).toBeLessThanOrEqual(cfg.max);
  });

  test('is finished after maxReversals reversals', () => {
    const short: StaircaseConfig = { ...cfg, maxReversals: 2 };
    const { state } = run('above', [true, true, false, true, true], short);
    expect(state.above.reversals).toHaveLength(2);
    expect(state.above.done).toBe(true);
  });

  test('by default an arm runs until its 20th reversal', () => {
    // alternating (correct, correct, wrong) reverses on every move after the first
    const pattern = new Array(40).fill(null).flatMap(() => [true, true, false]);
    const trials: StaircaseTrial[] = [];
    let state = deriveState([], cfg);
    for (let i = 0; i < pattern.length && !state.above.done; i += 1) {
      trials.push({
        staircaseId: 'above', nB: state.above.current, correct: pattern[i], trialIndex: i,
      });
      state = deriveState(trials, cfg);
    }
    expect(state.above.done).toBe(true);
    expect(state.above.reversals).toHaveLength(20);
  });

  test('is finished after maxTrials trials', () => {
    const short: StaircaseConfig = { ...cfg, maxTrials: 3 };
    const { state } = run('above', [true, true, true], short);
    expect(state.above.done).toBe(true);
    expect(state.above.trials).toBe(3);
  });

  test('replays trials in trialIndex order regardless of input order', () => {
    const ordered = deriveState(history([['above', 31, true], ['above', 31, true], ['above', 30, false]]), cfg);
    const shuffled = deriveState([
      {
        staircaseId: 'above', nB: 30, correct: false, trialIndex: 2,
      },
      {
        staircaseId: 'above', nB: 31, correct: true, trialIndex: 0,
      },
      {
        staircaseId: 'above', nB: 31, correct: true, trialIndex: 1,
      },
    ], cfg);
    expect(shuffled).toEqual(ordered);
  });

  test('interleaved staircases are independent', () => {
    const state = deriveState(history([
      ['above', 31, true], ['below', 17, false], ['above', 31, true], ['below', 16, true],
    ]), cfg);
    expect(state.above.current).toBe(30);
    expect(state.below.current).toBe(16);
    expect(state.above.trials).toBe(2);
    expect(state.below.trials).toBe(2);
  });

  test('attention checks are excluded from the staircases but counted', () => {
    const state = deriveState(history([
      ['above', 31, true], ['attention', 30, false], ['above', 31, true], ['attention', 30, true],
    ]), cfg);
    // the miss between the two correct answers neither resets nor moves the arm
    expect(state.above.trials).toBe(2);
    expect(state.above.consecutiveCorrect).toBe(0);
    expect(state.above.current).toBe(30);
    expect(state.attentionTotal).toBe(2);
    expect(state.attentionCorrect).toBe(1);
    expect(state.totalTrials).toBe(4);
  });

  test('old catch records are read harmlessly: counted in the total, nowhere else', () => {
    const state = deriveState(history([['above', 31, true], ['catch', 12, false], ['above', 31, true]]), cfg);
    expect(state.above.current).toBe(30);
    expect(state.attentionTotal).toBe(0);
    expect(state.totalTrials).toBe(3);
  });

  test('practice trials do not affect the staircases', () => {
    const state = deriveState(history([['practice', 12, true], ['practice', 40, true]]), cfg);
    expect(state.above.trials).toBe(0);
    expect(state.below.trials).toBe(0);
    expect(state.totalTrials).toBe(2);
  });
});

describe('nextTrial', () => {
  test('returns null once both staircases are finished', () => {
    const config: StaircaseConfig = { ...cfg, maxTrials: 1 };
    const state = deriveState(history([['above', 31, true], ['below', 17, true]]), config);
    expect(nextTrial(state, config, () => 0)).toBeNull();
  });

  test('picks the first open staircase with a low random draw', () => {
    const state = deriveState([], cfg);
    expect(nextTrial(state, cfg, () => 0)).toEqual({ staircaseId: 'above', nB: 31 });
  });

  test('picks the second open staircase with a high random draw', () => {
    const state = deriveState([], cfg);
    expect(nextTrial(state, cfg, () => 0.99)).toEqual({ staircaseId: 'below', nB: 17 });
  });

  test('only offers the staircase that is still running', () => {
    const config: StaircaseConfig = { ...cfg, maxTrials: 1 };
    const state = deriveState(history([['above', 31, true]]), config);
    expect(nextTrial(state, config, () => 0)?.staircaseId).toBe('below');
    expect(nextTrial(state, config, () => 0.99)?.staircaseId).toBe('below');
  });

  test('never schedules anything but a staircase trial (attention checks are the block\'s job)', () => {
    const state = deriveState(history(new Array(40).fill(null).map((_, i) => [i % 2 ? 'below' : 'above', i % 2 ? 17 : 31, i % 3 !== 0] as [StaircaseId, number, boolean])), cfg);
    for (let r = 0; r < 1; r += 0.1) {
      expect(['above', 'below']).toContain(nextTrial(state, cfg, () => r)?.staircaseId);
    }
  });

  test('the returned nB is the arm\'s current level', () => {
    const { state } = run('below', [true, true]);
    expect(nextTrial(state, cfg, () => 0.99)).toEqual({ staircaseId: 'below', nB: 18 });
  });
});

describe('usableReversals', () => {
  test('drops the first four reversals, then one more if an odd number remain', () => {
    expect(DISCARD_REVERSALS).toBe(4);
    expect(usableReversals([1, 2, 3])).toEqual([]);
    expect(usableReversals([1, 2, 3, 4])).toEqual([]);
    expect(usableReversals([1, 2, 3, 4, 5])).toEqual([]);
    expect(usableReversals([1, 2, 3, 4, 5, 6])).toEqual([5, 6]);
    expect(usableReversals([1, 2, 3, 4, 5, 6, 7])).toEqual([6, 7]);
    expect(usableReversals(new Array(20).fill(0).map((_, i) => i))).toHaveLength(16);
  });
});

describe('summarise', () => {
  test('averages each arm\'s usable reversals and the two arm thresholds', () => {
    const state = deriveState([], cfg);
    state.above.reversals = [31, 26, 29, 25, 27, 25, 26];
    state.below.reversals = [17, 22, 19, 21, 20, 22];
    state.attentionTotal = 3;
    state.attentionCorrect = 2;

    const summary = summarise(state);
    expect(summary.thresholdAbove).toBe(25.5);
    expect(summary.thresholdBelow).toBe(21);
    expect(summary.threshold).toBe((25.5 + 21) / 2);
    expect(summary.reversalsAbove).toBe(7);
    expect(summary.reversalsBelow).toBe(6);
    expect(summary.attentionCorrect).toBe(2);
    expect(summary.attentionTotal).toBe(3);
  });

  test('uses the one arm that has a threshold when the other has none', () => {
    const state = deriveState([], cfg);
    state.above.reversals = [31, 26, 29, 25, 27, 25];
    expect(summarise(state).threshold).toBe(26);
    expect(summarise(state).thresholdBelow).toBeNull();
  });

  test('reports null thresholds when there are too few reversals', () => {
    const summary = summarise(deriveState([], cfg));
    expect(summary.thresholdAbove).toBeNull();
    expect(summary.thresholdBelow).toBeNull();
    expect(summary.threshold).toBeNull();
    expect(summary.reversalsAbove).toBe(0);
  });
});

/**
 * A simulated observer: the probability of judging B more numerous than A is a logistic function
 * of N_B with its point of subjective equality at 22 (A looks like 22 items) and a scale of 2.5
 * items (a Weber fraction of roughly 0.15 at 24 items).
 */
function simulateBlock(seed: number, pse = 22, scale = 2.5) {
  const rng = mulberry32(seed);
  const config: StaircaseConfig = {
    ...cfg,
    startAbove: 30 + Math.floor(rng() * 3),
    startBelow: 16 + Math.floor(rng() * 3),
  };
  // attention checks as staircaseBlock schedules them; this observer never misses one
  const gaps = drawAttentionGaps(seed, 'sim');
  const trials: StaircaseTrial[] = [];
  let state = deriveState(trials, config);
  let next = nextTrial(state, config, rng);
  while (next !== null) {
    const staircaseTrials = state.above.trials + state.below.trials;
    if (attentionDue(staircaseTrials, state.attentionTotal, gaps)) {
      trials.push({
        staircaseId: 'attention', nB: 30, correct: true, trialIndex: trials.length,
      });
      state = deriveState(trials, config);
      next = nextTrial(state, config, rng);
      // eslint-disable-next-line no-continue
      continue;
    }
    const pB = 1 / (1 + Math.exp(-(next.nB - pse) / scale));
    const choseB = rng() < pB;
    const correct = choseB === next.nB > config.target;
    trials.push({
      staircaseId: next.staircaseId, nB: next.nB, correct, trialIndex: trials.length,
    });
    state = deriveState(trials, config);
    next = nextTrial(state, config, rng);
  }
  return { state, trials };
}

describe('block cap', () => {
  test('nextTrial ends the block once maxBlockTrials trials have run, attention checks included', () => {
    expect(cfg.maxBlockTrials).toBe(190);
    const config: StaircaseConfig = { ...cfg, maxBlockTrials: 5 };
    const trials: StaircaseTrial[] = [{
      staircaseId: 'attention', nB: 30, correct: true, trialIndex: 0,
    }];
    let next = nextTrial(deriveState(trials, config), config, mulberry32(3));
    while (next !== null) {
      trials.push({
        staircaseId: next.staircaseId, nB: next.nB, correct: true, trialIndex: trials.length,
      });
      next = nextTrial(deriveState(trials, config), config, mulberry32(3 + trials.length));
    }
    const state = deriveState(trials, config);
    expect(trials).toHaveLength(5);
    expect(blockCapReached(state, config)).toBe(true);
    // the arms themselves are not finished
    expect(state.above.done || state.below.done).toBe(false);
  });

  test('is not reached below the cap', () => {
    const state = deriveState([{
      staircaseId: 'above', nB: 31, correct: true, trialIndex: 0,
    }], cfg);
    expect(blockCapReached(state, cfg)).toBe(false);
    expect(nextTrial(state, cfg, () => 0)).not.toBeNull();
  });
});

describe('simulated observer', () => {
  const runs = Array.from({ length: 60 }, (_, i) => simulateBlock(1000 + i));
  const totals = runs.map(({ trials }) => trials.length).sort((a, b) => a - b);
  const medianTotal = (totals[29] + totals[30]) / 2;

  test('a block (staircase trials and attention checks) finishes in a median of under 160 trials, never past 190', () => {
    expect(medianTotal).toBeLessThan(160);
    expect(totals[totals.length - 1]).toBeLessThanOrEqual(190);
    runs.forEach(({ trials }) => {
      const checks = trials.filter((t) => t.staircaseId === 'attention').length;
      expect(checks).toBeGreaterThanOrEqual(5);
      expect(checks).toBeLessThanOrEqual(10);
    });
    runs.forEach(({ state }) => {
      expect((state.above.done && state.below.done) || blockCapReached(state, cfg)).toBe(true);
    });
  });

  test('both arms usually finish on their 20 reversals, not on a trial cap', () => {
    const capped = runs.filter(({ state }) => state.above.reversals.length < 20 || state.below.reversals.length < 20);
    expect(capped.length).toBeLessThan(runs.length / 10);
  });

  test('a slow observer (scale 3.5) never runs past 190 trials either', () => {
    // two arms of at most 90 plus at most 10 attention checks is 190, so the block cap is a
    // safeguard (it is exercised directly in the block-cap tests above)
    const slow = Array.from({ length: 60 }, (_, i) => simulateBlock(5000 + i, 22, 3.5));
    slow.forEach(({ trials }) => expect(trials.length).toBeLessThanOrEqual(190));
  });

  test('the averaged threshold shows the observer\'s bias toward fewer items in A', () => {
    const thresholds = runs.map(({ state }) => summarise(state).threshold as number);
    const meanThreshold = thresholds.reduce((a, b) => a + b, 0) / thresholds.length;
    // Correctness-based arms both settle on the 70.7 %-correct point on the harder side of 24:
    // with the PSE at 22 that is PSE - 0.88 x scale, about 19.8, for both arms. The reversal
    // average is therefore below 24 but is not the PSE itself; the planned psychometric fit is.
    expect(meanThreshold).toBeGreaterThan(18.5);
    expect(meanThreshold).toBeLessThan(22);
  });
});
