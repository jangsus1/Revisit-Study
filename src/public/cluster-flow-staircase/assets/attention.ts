/**
 * Attention checks of the main block (they replaced the N_B 12 / 40 catch trials on 2026-10-09).
 *
 * After every G staircase trials the block inserts one attention check, each gap G drawn
 * uniformly from the integers `gapMin`..`gapMax` (10..20), at most `maxChecks` (10) per block; a
 * block that ends earlier just has fewer. The gaps are seeded from the session salt and the cell,
 * so the schedule is re-derived from the stored trials on every call like the rest of the block.
 *
 * A check shows two ungrouped displays of `few` (5) and `many` (30) items; the interval with
 * `many` is correct. A correct answer looks like any other trial. A miss shows feedback with the
 * misses still allowed; the participant is rejected on miss `maxMisses + 1` (the 4th).
 *
 * Pure (the only import is the seeded hash and PRNG), so it is unit-testable and the simulated
 * observer can use it.
 */
import { hashSeed } from './generator';
import { mulberry32 } from './generator/prng';

export interface AttentionConfig {
  /** smallest number of staircase trials between two checks (and before the first) */
  gapMin: number;
  /** largest such gap, inclusive */
  gapMax: number;
  /** at most this many checks per block */
  maxChecks: number;
  /** misses allowed; the next one ends the study */
  maxMisses: number;
  /** item counts of the two displays of a check */
  few: number;
  many: number;
}

export const DEFAULT_ATTENTION_CONFIG: AttentionConfig = {
  gapMin: 10,
  gapMax: 20,
  maxChecks: 10,
  maxMisses: 3,
  few: 5,
  many: 30,
};

/** The participant's gaps for a cell: `maxChecks` integers, each uniform in [gapMin, gapMax]. */
export function drawAttentionGaps(sessionSalt: number, cellId: string, cfg: AttentionConfig = DEFAULT_ATTENTION_CONFIG): number[] {
  const rng = mulberry32(hashSeed(sessionSalt, cellId, 'attention'));
  const span = Math.max(0, cfg.gapMax - cfg.gapMin) + 1;
  return Array.from({ length: Math.max(0, cfg.maxChecks) }, () => cfg.gapMin + Math.floor(rng() * span));
}

/**
 * Whether an attention check is due now: `checksDone` checks have been shown and at least the sum
 * of the first `checksDone + 1` gaps of staircase trials have run.
 */
export function attentionDue(staircaseTrials: number, checksDone: number, gaps: number[]): boolean {
  if (checksDone >= gaps.length) return false;
  const dueAfter = gaps.slice(0, checksDone + 1).reduce((a, b) => a + b, 0);
  return staircaseTrials >= dueAfter;
}

/** Checks shown and missed so far, from the block's stored trials. */
export function countAttention(trials: { staircaseId: string; correct: boolean }[]): { checks: number; misses: number } {
  const checks = trials.filter((t) => t.staircaseId === 'attention');
  return { checks: checks.length, misses: checks.filter((t) => !t.correct).length };
}

/** True once more misses than allowed have happened. */
export function isRejected(misses: number, maxMisses: number = DEFAULT_ATTENTION_CONFIG.maxMisses): boolean {
  return misses > maxMisses;
}

/** After the f-th miss (f <= N), K = N + 1 - f more misses end the study. */
export function missesLeft(misses: number, maxMisses: number = DEFAULT_ATTENTION_CONFIG.maxMisses): number {
  return Math.max(0, maxMisses + 1 - misses);
}

/** "3 more missed checks will end the study" / "One more missed check will end the study". */
export function livesMessage(misses: number, maxMisses: number = DEFAULT_ATTENTION_CONFIG.maxMisses): string {
  const k = missesLeft(misses, maxMisses);
  return k === 1 ? 'One more missed check will end the study' : `${k} more missed checks will end the study`;
}
