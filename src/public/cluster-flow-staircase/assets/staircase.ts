/**
 * Pure staircase bookkeeping for the cluster-flow experiment.
 *
 * Two interleaved 2-down-1-up staircases run per cell, one starting above the reference count
 * (N_A = 24) and one below it. The whole state is *derived* from the stored trial history on
 * every call so the dynamic block stays stateless and a reload cannot desynchronise it.
 *
 * No React, no generator imports at runtime (the StaircaseId type import is erased at compile
 * time), so this module is trivially unit-testable.
 */
import type { StaircaseId } from './generator';

/** Every tunable of the staircase. `staircaseBlock` overrides a few of these from the config. */
export interface StaircaseConfig {
  /** starting N_B of the descending staircase */
  startAbove: number;
  /** starting N_B of the ascending staircase */
  startBelow: number;
  /** constant step size in items */
  step: number;
  /** the reference count, N_A; a staircase never lands on it */
  target: number;
  /** lower clamp for N_B */
  min: number;
  /** upper clamp for N_B */
  max: number;
  /** a staircase is done after this many reversals */
  maxReversals: number;
  /** ... or after this many trials, whichever comes first */
  maxTrials: number;
  /** insert a catch trial after this many main trials */
  catchEvery: number;
  /** the N_B values used by catch trials, used alternately */
  catchValues: number[];
}

export const DEFAULT_STAIRCASE_CONFIG: StaircaseConfig = {
  startAbove: 34,
  startBelow: 14,
  step: 2,
  target: 24,
  min: 8,
  max: 48,
  maxReversals: 5,
  maxTrials: 30,
  catchEvery: 15,
  catchValues: [12, 40],
};

/** The minimal shape of a stored trial that the staircase needs. `TrialAnswer` satisfies it. */
export interface StaircaseTrial {
  staircaseId: StaircaseId;
  nB: number;
  correct: boolean;
  trialIndex: number;
}

/** The state of one of the two interleaved staircases. */
export interface ArmState {
  /** the N_B the next trial of this staircase would use */
  current: number;
  /** how many correct answers in a row since the last move */
  consecutiveCorrect: number;
  /** the direction of the last move: -1 down, +1 up, 0 = no move yet */
  lastDirection: -1 | 0 | 1;
  /** the N_B levels at which the direction reversed */
  reversals: number[];
  /** trials run on this staircase */
  trials: number;
  done: boolean;
}

export interface StaircaseState {
  above: ArmState;
  below: ArmState;
  /** main (non-catch) trials since the last catch trial */
  mainTrialsSinceCatch: number;
  catchTotal: number;
  catchCorrect: number;
  /** every trial of the block, catch trials included */
  totalTrials: number;
}

export interface StaircaseSummary {
  thresholdAbove: number | null;
  thresholdBelow: number | null;
  threshold: number | null;
  catchCorrect: number;
  catchTotal: number;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function mean(values: number[]): number | null {
  return values.length === 0 ? null : values.reduce((a, b) => a + b, 0) / values.length;
}

function newArm(start: number): ArmState {
  return {
    current: start,
    consecutiveCorrect: 0,
    lastDirection: 0,
    reversals: [],
    trials: 0,
    done: false,
  };
}

/** Moves one step in `direction`, skipping the reference value and clamping to the bounds. */
function stepValue(current: number, direction: -1 | 1, cfg: StaircaseConfig): number {
  let next = current + direction * cfg.step;
  if (next === cfg.target) {
    next += direction * cfg.step;
  }
  return clamp(next, cfg.min, cfg.max);
}

function applyTrial(arm: ArmState, correct: boolean, cfg: StaircaseConfig): void {
  arm.trials += 1;

  // 2-down-1-up: two correct in a row make the task harder (N_B toward N_A), one incorrect makes
  // it easier (N_B away from N_A).
  let direction: -1 | 1 | null = null;
  if (correct) {
    arm.consecutiveCorrect += 1;
    if (arm.consecutiveCorrect >= 2) {
      arm.consecutiveCorrect = 0;
      direction = arm.current > cfg.target ? -1 : 1;
    }
  } else {
    arm.consecutiveCorrect = 0;
    direction = arm.current > cfg.target ? 1 : -1;
  }

  if (direction !== null) {
    if (arm.lastDirection !== 0 && direction !== arm.lastDirection) {
      // The reversal is recorded at the level where the direction changed.
      arm.reversals.push(arm.current);
    }
    arm.current = stepValue(arm.current, direction, cfg);
    arm.lastDirection = direction;
  }

  arm.done = arm.reversals.length >= cfg.maxReversals || arm.trials >= cfg.maxTrials;
}

/**
 * Replays the block's trial history (in `trialIndex` order) and returns the resulting state.
 * Catch and practice trials do not feed the staircases; catch trials reset the catch counter.
 */
export function deriveState(trials: StaircaseTrial[], cfg: StaircaseConfig = DEFAULT_STAIRCASE_CONFIG): StaircaseState {
  const state: StaircaseState = {
    above: newArm(cfg.startAbove),
    below: newArm(cfg.startBelow),
    mainTrialsSinceCatch: 0,
    catchTotal: 0,
    catchCorrect: 0,
    totalTrials: 0,
  };

  const ordered = [...trials].sort((a, b) => a.trialIndex - b.trialIndex);

  ordered.forEach((trial) => {
    state.totalTrials += 1;
    if (trial.staircaseId === 'catch') {
      state.catchTotal += 1;
      state.catchCorrect += trial.correct ? 1 : 0;
      state.mainTrialsSinceCatch = 0;
      return;
    }
    if (trial.staircaseId !== 'above' && trial.staircaseId !== 'below') {
      return;
    }
    state.mainTrialsSinceCatch += 1;
    applyTrial(state[trial.staircaseId], trial.correct, cfg);
  });

  return state;
}

export interface NextTrialSpec {
  staircaseId: StaircaseId;
  nB: number;
}

/**
 * Picks the next trial of a block: a catch trial when one is due, otherwise a uniform random
 * draw among the staircases that are not finished. Returns null when the block is complete.
 */
export function nextTrial(
  state: StaircaseState,
  cfg: StaircaseConfig = DEFAULT_STAIRCASE_CONFIG,
  rng: () => number = Math.random,
): NextTrialSpec | null {
  if (state.above.done && state.below.done) {
    return null;
  }

  if (state.mainTrialsSinceCatch >= cfg.catchEvery && cfg.catchValues.length > 0) {
    return {
      staircaseId: 'catch',
      nB: cfg.catchValues[state.catchTotal % cfg.catchValues.length],
    };
  }

  const open: ('above' | 'below')[] = [];
  if (!state.above.done) open.push('above');
  if (!state.below.done) open.push('below');

  const pick = open[Math.min(open.length - 1, Math.floor(rng() * open.length))];
  return { staircaseId: pick, nB: state[pick].current };
}

/** Threshold estimates for a finished (or partial) block. */
export function summarise(state: StaircaseState): StaircaseSummary {
  return {
    thresholdAbove: mean(state.above.reversals),
    thresholdBelow: mean(state.below.reversals),
    threshold: mean([...state.above.reversals, ...state.below.reversals]),
    catchCorrect: state.catchCorrect,
    catchTotal: state.catchTotal,
  };
}
