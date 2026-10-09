/**
 * Pure staircase bookkeeping for the cluster-flow experiment.
 *
 * Two interleaved 2-down-1-up staircases run per cell, one starting above the reference count
 * (N_A = 24) and one below it, with a step of one item and 20 reversals each (at most 90 trials
 * per arm, and at most 190 trials in the whole block, attention checks included; the checks
 * themselves are scheduled by `attention.ts` and never feed an arm). The starting levels
 * are drawn per participant by `staircaseBlock` (`drawStarts`) and passed in through the config. The whole state is *derived* from the stored trial history on
 * every call so the dynamic block stays stateless and a reload cannot desynchronise it.
 *
 * The 2-down-1-up correctness rule is a deliberate departure from Yu et al. (2019), who ran one
 * response-based 1-up-1-down staircase per condition (PSE = mean of the last 5 of 20 reversals).
 * Here each arm settles on a 70.7 %-correct level, so `summarise()` is not the PSE; the PSE comes
 * from the planned psychometric fit to all stored trials.
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
  /**
   * the whole block (both arms and the attention checks) ends once it has run this many trials,
   * whatever the arms' state, so a session never exceeds its trial budget (2 x 90 + 10 checks =
   * 190, so it is a safeguard)
   */
  maxBlockTrials: number;
}

export const DEFAULT_STAIRCASE_CONFIG: StaircaseConfig = {
  startAbove: 31,
  startBelow: 17,
  step: 1,
  target: 24,
  min: 8,
  max: 48,
  maxReversals: 20,
  maxTrials: 90,
  maxBlockTrials: 190,
};

/** Reversals discarded from the front of each arm before averaging (the approach phase). */
export const DISCARD_REVERSALS = 4;

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
  /** attention checks run and answered correctly (they do not feed the arms) */
  attentionTotal: number;
  attentionCorrect: number;
  /** every trial of the block, attention checks included */
  totalTrials: number;
}

export interface StaircaseSummary {
  thresholdAbove: number | null;
  thresholdBelow: number | null;
  /** mean of the two arm thresholds (or the one that exists) */
  threshold: number | null;
  reversalsAbove: number;
  reversalsBelow: number;
  attentionCorrect: number;
  attentionTotal: number;
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
 * Attention checks and practice trials do not feed the staircases (nor do the 'catch' trials of
 * blocks run before 2026-10-09, which are counted only in `totalTrials`).
 */
export function deriveState(trials: StaircaseTrial[], cfg: StaircaseConfig = DEFAULT_STAIRCASE_CONFIG): StaircaseState {
  const state: StaircaseState = {
    above: newArm(cfg.startAbove),
    below: newArm(cfg.startBelow),
    attentionTotal: 0,
    attentionCorrect: 0,
    totalTrials: 0,
  };

  const ordered = [...trials].sort((a, b) => a.trialIndex - b.trialIndex);

  ordered.forEach((trial) => {
    state.totalTrials += 1;
    if (trial.staircaseId === 'attention') {
      state.attentionTotal += 1;
      state.attentionCorrect += trial.correct ? 1 : 0;
      return;
    }
    if (trial.staircaseId !== 'above' && trial.staircaseId !== 'below') {
      return;
    }
    applyTrial(state[trial.staircaseId], trial.correct, cfg);
  });

  return state;
}

export interface NextTrialSpec {
  staircaseId: StaircaseId;
  nB: number;
}

/**
 * True once the block has run `maxBlockTrials` trials (attention checks included): it then ends even
 * when an arm has not reached its reversals or its own trial cap.
 */
export function blockCapReached(state: StaircaseState, cfg: StaircaseConfig = DEFAULT_STAIRCASE_CONFIG): boolean {
  return state.totalTrials >= cfg.maxBlockTrials;
}

/**
 * Picks the next staircase trial of a block: a uniform random draw among the staircases that are
 * not finished (`staircaseBlock` decides when an attention check comes first). Returns null when the block is complete: both
 * arms are done, or the block has reached `maxBlockTrials`.
 */
export function nextTrial(
  state: StaircaseState,
  cfg: StaircaseConfig = DEFAULT_STAIRCASE_CONFIG,
  rng: () => number = Math.random,
): NextTrialSpec | null {
  if ((state.above.done && state.below.done) || blockCapReached(state, cfg)) {
    return null;
  }

  const open: ('above' | 'below')[] = [];
  if (!state.above.done) open.push('above');
  if (!state.below.done) open.push('below');

  const pick = open[Math.min(open.length - 1, Math.floor(rng() * open.length))];
  return { staircaseId: pick, nB: state[pick].current };
}

/**
 * The reversal levels an arm's threshold is averaged over: the first `DISCARD_REVERSALS` are
 * dropped, then one more from the front when the remainder is odd, so the average always spans
 * whole down-up cycles.
 */
export function usableReversals(reversals: number[]): number[] {
  const rest = reversals.slice(DISCARD_REVERSALS);
  return rest.length % 2 === 1 ? rest.slice(1) : rest;
}

/**
 * Threshold estimates for a finished (or partial) block. A convenience for monitoring; the planned
 * analysis fits a psychometric function to the stored trials.
 */
export function summarise(state: StaircaseState): StaircaseSummary {
  const thresholdAbove = mean(usableReversals(state.above.reversals));
  const thresholdBelow = mean(usableReversals(state.below.reversals));
  const arms = [thresholdAbove, thresholdBelow].filter((t): t is number => t !== null);
  return {
    thresholdAbove,
    thresholdBelow,
    threshold: mean(arms),
    reversalsAbove: state.above.reversals.length,
    reversalsBelow: state.below.reversals.length,
    attentionCorrect: state.attentionCorrect,
    attentionTotal: state.attentionTotal,
  };
}
