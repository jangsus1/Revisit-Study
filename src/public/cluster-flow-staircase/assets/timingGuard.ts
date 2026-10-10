/**
 * The display-timing guard: checks that end a session early when the participant's display cannot
 * show the stimuli for the right time, so nobody spends 15 minutes on a session that would be excluded.
 *
 * Pilot evidence (50 participants, 2026-10): 9 (18 %) were excluded for timing under the pilot rule
 * (any of fixation, s1, mask, blank, s2 off its nominal duration by more than one frame + 0.5 ms, or a
 * refresh rate below 50 Hz). A closer look showed that most of them were off only in the fixation,
 * whose length does not matter perceptually, and that only two had wrong stimulus exposures:
 *  - one measured 119 Hz on what behaved like a 60 Hz display, so every phase ran double (s1 about
 *    400 ms, +200 ms);
 *  - one measured 20 Hz, and every phase ran at half length (s1 about 100 ms, -100 ms).
 * Two at 30 and 32 Hz were off by only 12 to 17 ms on s1 and mask, and one at 67 Hz by +17 ms on
 * every phase: acceptable. The setup's blank-interval calibration (200 / 400 ms) caught only two
 * sessions, and the three practice trials separated the excluded participants almost perfectly.
 *
 * So the guard judges only the stimulus-critical phases, the two exposures and the two masks
 * (`JUDGED_PHASES`), and calls a phase off target when it differs from its nominal duration by more
 * than `OFF_TARGET_MS` (25 ms): that passes the 30 / 32 Hz and +17 ms sessions and fails the doubled
 * and halved ones (a ratio rule for s1 / s2 such as [0.75, 1.25] would add nothing at 200 ms, since
 * 25 ms is already 0.125 of it). Three checks use it:
 *  1. Refresh guard (setup): an estimate outside 50 to 300 Hz is re-measured once; a second estimate
 *     below 25 Hz or above 300 Hz ends the session, one of 25 to 50 Hz goes on to the display test,
 *     which judges the exposures themselves.
 *  2. Display test (setup, `DisplayTest.tsx`): the real trial timeline three times; two or more of
 *     three runs off target fail the round, which is repeated once. It also cross-checks the refresh
 *     estimate: the phases are frame-counted from it, so a wrong estimate (119 Hz on a 60 Hz display)
 *     doubles or halves every phase and fails the test.
 *  3. Practice backstop (`practiceBlock.tsx`): two or more of the three practice trials off target
 *     end the session.
 */
import type { MeasuredDurations } from './generator/types';
import { TRIAL_TIMELINE, TimedPhase } from './useTrialTimeline';

/** A refresh estimate outside [REFRESH_REMEASURE_BELOW_HZ, REFRESH_END_ABOVE_HZ] is re-measured once. */
export const REFRESH_REMEASURE_BELOW_HZ = 50;
/** The re-measured estimate ends the session below this rate (the 20 Hz pilot session ran every phase at half length). */
export const REFRESH_END_BELOW_HZ = 25;
/** ... or above this one (no real display; a broken frame clock). */
export const REFRESH_END_ABOVE_HZ = 300;
/** The re-measurement waits this long first (a full-screen transition may still be running), ms. */
export const REFRESH_RETRY_DELAY_MS = 1000;

/** A judged phase is off target when |measured - nominal| exceeds this, ms. */
export const OFF_TARGET_MS = 25;
/** The phases the guard judges: the two exposures and the two masks (fixation and blanks are not critical). */
export const JUDGED_PHASES: readonly TimedPhase[] = ['s1', 'mask', 's2', 'mask2'];

/** Trials per display-test round. */
export const DISPLAY_TEST_RUNS = 3;
/**
 * A display-test round fails when more than this many of its runs have an off-target phase (two or
 * more of three); a failed first round is repeated once, and a second failure ends the session.
 */
export const DISPLAY_TEST_MAX_OFF_RUNS = 1;
/** The practice backstop ends the session when more than this many practice trials were off target (two or more of three). */
export const PRACTICE_MAX_OFF_TRIALS = 1;

export interface RefreshLimits {
  /** re-measure an estimate below this rate (or above `endAboveHz`) */
  remeasureBelowHz: number;
  /** end the session when the re-measured estimate is below this rate */
  endBelowHz: number;
  /** ... or above this one */
  endAboveHz: number;
}

export const DEFAULT_REFRESH_LIMITS: RefreshLimits = {
  remeasureBelowHz: REFRESH_REMEASURE_BELOW_HZ,
  endBelowHz: REFRESH_END_BELOW_HZ,
  endAboveHz: REFRESH_END_ABOVE_HZ,
};

function hz(refreshMs: number): number {
  return refreshMs > 0 && Number.isFinite(refreshMs) ? 1000 / refreshMs : 0;
}

/** True when a first refresh estimate (ms) should be measured again. */
export function refreshNeedsRemeasure(refreshMs: number, limits: RefreshLimits = DEFAULT_REFRESH_LIMITS): boolean {
  const rate = hz(refreshMs);
  return rate < limits.remeasureBelowHz || rate > limits.endAboveHz;
}

/** True when a re-measured refresh estimate (ms) ends the session. */
export function refreshEndsSession(refreshMs: number, limits: RefreshLimits = DEFAULT_REFRESH_LIMITS): boolean {
  const rate = hz(refreshMs);
  return rate < limits.endBelowHz || rate > limits.endAboveHz;
}

/** The reason stored with reVISit's rejection when the refresh rate ends the session. */
export function refreshRejectionReason(refreshMs: number): string {
  return `Display timing: refresh ${Math.round(hz(refreshMs))} Hz`;
}

/** The nominal duration of a timeline phase, ms. */
export function nominalMs(phase: TimedPhase): number {
  return TRIAL_TIMELINE.find((p) => p.phase === phase)?.ms ?? 0;
}

/**
 * The judged phases of one run or trial that are off target. A phase without a measurement is
 * skipped, and so is mask2 when the answer came during it (`respondedDuring: 'mask2'` cuts it short).
 */
export function offTargetPhases(
  measured: Partial<MeasuredDurations> | undefined,
  respondedDuring?: string,
): TimedPhase[] {
  if (!measured) return [];
  return JUDGED_PHASES.filter((phase) => {
    if (phase === 'mask2' && respondedDuring === 'mask2') return false;
    const value = measured[phase];
    return typeof value === 'number' && value > 0 && Math.abs(value - nominalMs(phase)) > OFF_TARGET_MS;
  });
}

/** What follows a display-test round: go on, repeat the round once, or end the session. */
export type DisplayTestOutcome = 'pass' | 'repeat' | 'fail';

/**
 * Decides after a round, from the off-target run counts of the rounds so far: a round passes with at
 * most `maxOffRuns` off runs; the first failed round is repeated, the second ends the session.
 */
export function displayTestOutcome(offRunsPerRound: number[], maxOffRuns = DISPLAY_TEST_MAX_OFF_RUNS): DisplayTestOutcome {
  const last = offRunsPerRound[offRunsPerRound.length - 1] ?? 0;
  if (last <= maxOffRuns) return 'pass';
  return offRunsPerRound.length < 2 ? 'repeat' : 'fail';
}

export function displayTestRejectionReason(offRuns: number, runs = DISPLAY_TEST_RUNS): string {
  return `Display timing: ${offRuns} of ${runs} test trials off target`;
}

export function practiceRejectionReason(offTrials: number, trials: number): string {
  return `Display timing: ${offTrials} of ${trials} practice trials off target`;
}

/** A stored practice trial, as far as the backstop needs it. */
export interface TimedTrial {
  measured?: Partial<MeasuredDurations>;
  respondedDuring?: string;
}

/** How many of the trials have an off-target phase. */
export function countOffTarget(trials: TimedTrial[]): number {
  return trials.filter((trial) => offTargetPhases(trial.measured, trial.respondedDuring).length > 0).length;
}
