/**
 * Time-weighted progress through a cluster-flow session (pure; the header is `StudyProgress.tsx`).
 *
 * Every page of the participant's flat sequence gets its expected duration in seconds. The two
 * dynamic blocks appear in the flat sequence as one entry each (their trial counts are not known in
 * advance), so they are weighted by an estimate: practice is 3 trials of about 4.5 s including the
 * 1.5 s feedback, the main block about 150 trials of about 2.8 s plus a break every 60 (it is
 * capped at 196 trials). Inside a
 * dynamic block the reVISit `funcIndex` (one per trial or rest page) says how far along it is; the
 * fraction is capped below 1 because the staircase may run longer than the estimate.
 */

/** Expected seconds per main or practice trial: 2.7 s timeline (incl. the 1.2 s pre-stimulus) plus a quick answer. */
export const SECONDS_PER_TRIAL = 2.8;
/** A practice trial also shows its feedback for about 1.5 s. */
export const SECONDS_PER_PRACTICE_TRIAL = 4.5;
/** The main block's expected length in trials, attention checks included (simulated median about 147). */
export const EXPECTED_MAIN_TRIALS = 150;
export const DEFAULT_PRACTICE_TRIALS = 3;
const SECONDS_PER_REST = 20;
const REST_EVERY = 60;
/** The main block's expected length in whole minutes (the introduction's "about N min"). */
export const MAIN_BLOCK_MINUTES = Math.round(
  (EXPECTED_MAIN_TRIALS * SECONDS_PER_TRIAL + Math.floor(EXPECTED_MAIN_TRIALS / REST_EVERY) * SECONDS_PER_REST) / 60,
);
/** Fallback for the introduction when reVISit's sequence is not available (reviewer pages, tests). */
export const DEFAULT_SESSION_MINUTES = 15;
/** A dynamic block never shows more than this fraction done before it ends. */
const BLOCK_CAP = 0.97;

const PAGE_SECONDS: [RegExp, number][] = [
  [/^end$/, 0],
  [/^introduction$/, 20],
  // the consent page has no minimum reading time; most people skim it
  [/^consent$/, 45],
  [/^setup$/, 60],
  [/^instructions$/, 45],
  [/^examples$/, 50],
  [/^practice-intro$/, 20],
  [/^block-intro$/, 15],
  [/^demographics$/, 90],
];

export interface BlockInfo {
  /** `trials` of a practice block */
  trials?: number;
  /** `maxTrials` of a staircase block (per arm) */
  maxTrials?: number;
}

/** Expected number of dynamic-block steps (trials and rest pages) and seconds for a block id. */
export function blockEstimate(name: string, info: BlockInfo = {}): { steps: number; seconds: number } | null {
  if (/^practice-/.test(name) && name !== 'practice-intro') {
    const trials = info.trials ?? DEFAULT_PRACTICE_TRIALS;
    return { steps: trials, seconds: trials * SECONDS_PER_PRACTICE_TRIAL };
  }
  if (/^cell-/.test(name)) {
    // a shortened block (tests) caps each arm at maxTrials; attention checks add about one in fifteen
    const trials = info.maxTrials === undefined
      ? EXPECTED_MAIN_TRIALS
      : Math.min(EXPECTED_MAIN_TRIALS, Math.ceil(2 * info.maxTrials * (16 / 15)));
    const rests = Math.floor(trials / REST_EVERY);
    return { steps: trials + rests, seconds: trials * SECONDS_PER_TRIAL + rests * SECONDS_PER_REST };
  }
  return null;
}

export function pageSeconds(name: string, info?: BlockInfo): number {
  const block = blockEstimate(name, info);
  if (block) return block.seconds;
  const hit = PAGE_SECONDS.find(([re]) => re.test(name));
  return hit ? hit[1] : 10;
}

export interface ProgressSummary {
  /** seconds done and in total, by the estimates above */
  done: number;
  total: number;
  fraction: number;
  minutesLeft: number;
}

/**
 * Progress at flat-sequence position `step`, `funcIndex` steps into it when it is a dynamic block.
 * `blockInfo` returns a block's parameters by id.
 */
export function progressSummary(
  flat: string[],
  step: number,
  funcIndex: number | null,
  blockInfo: (name: string) => BlockInfo | undefined = () => undefined,
): ProgressSummary | null {
  if (flat.length === 0 || step < 0) return null;
  const seconds = flat.map((name) => pageSeconds(name, blockInfo(name)));
  const total = seconds.reduce((a, b) => a + b, 0);
  if (total <= 0) return null;
  let done = seconds.slice(0, step).reduce((a, b) => a + b, 0);
  const current = flat[step];
  const block = current === undefined ? null : blockEstimate(current, blockInfo(current));
  if (block && funcIndex !== null && funcIndex > 0) {
    done += seconds[step] * Math.min(BLOCK_CAP, funcIndex / block.steps);
  }
  done = Math.min(done, total);
  return {
    done, total, fraction: done / total, minutesLeft: (total - done) / 60,
  };
}

/** "37 % done · About 9 min left" */
export function progressLabel(p: ProgressSummary): string {
  const left = p.minutesLeft < 1 ? 'Almost done' : `About ${Math.ceil(p.minutesLeft)} min left`;
  return `${Math.round(100 * p.fraction)} % done · ${left}`;
}
