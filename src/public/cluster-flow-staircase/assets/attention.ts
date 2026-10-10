/**
 * Attention checks of the main block (they replaced the N_B 12 / 40 catch trials on 2026-10-09).
 *
 * After every `every` (15) staircase trials the block inserts one attention check, at most
 * `maxChecks` (10) per block; a block that ends earlier just has fewer. (A first version drew each
 * gap at random from 10..20; pilot 1 ran with that.) The schedule follows from the stored trials,
 * so it is re-derived on every call like the rest of the block.
 *
 * A check shows two ungrouped displays of `few` (5) and `many` (30) items; the interval with
 * `many` is correct. A correct answer looks like any other trial. A miss shows feedback with the
 * misses still allowed; the participant is rejected on miss `maxMisses + 1` (the 4th).
 *
 * Pure, so it is unit-testable and the simulated observer can use it.
 */

export interface AttentionConfig {
  /** staircase trials between two checks (and before the first) */
  every: number;
  /** at most this many checks per block */
  maxChecks: number;
  /** misses allowed; the next one ends the study */
  maxMisses: number;
  /** item counts of the two displays of a check */
  few: number;
  many: number;
}

export const DEFAULT_ATTENTION_CONFIG: AttentionConfig = {
  every: 15,
  maxChecks: 10,
  maxMisses: 3,
  few: 5,
  many: 30,
};

/**
 * Whether an attention check is due now: `checksDone` checks have been shown, fewer than
 * `maxChecks`, and at least (checksDone + 1) x `every` staircase trials have run.
 */
export function attentionDue(staircaseTrials: number, checksDone: number, cfg: AttentionConfig = DEFAULT_ATTENTION_CONFIG): boolean {
  if (checksDone >= cfg.maxChecks || cfg.every <= 0) return false;
  return staircaseTrials >= (checksDone + 1) * cfg.every;
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
