/**
 * Dynamic block driving the participant's one cell (cue x density) of the cluster-flow experiment.
 *
 * The block is stateless: every call re-derives the staircase state from the trials already
 * stored for this block, asks `nextTrial` what to show, and returns the fully specified trial
 * parameters. Seeds, the interval order, the staircase starting levels and the colour-wheel
 * rotation are all derived from the session salt created in `SetupCheck`, so the whole session can
 * be regenerated from the stored data. Every `restEvery` (50) main-block trials the block inserts the `rest`
 * page before the next trial. The block's first trial and the first trial after each rest wait for a
 * key press or click before they start (`waitForStart`).
 *
 * Attention checks (`attention.ts`) are mixed in after every 15 staircase trials (at most 10 per
 * block): two ungrouped displays of 5 and 30 items, the 30 being correct.
 * They never feed the arms. Once more than `maxAttentionMisses` (3) checks are missed, the block
 * returns the terminal `attention-failed` component, which ends the study for the participant;
 * since that follows from the stored trials, a reload lands on it again.
 */
import type { JumpFunctionParameters, JumpFunctionReturnVal } from '../../../store/types';
import type {
  Cue, Density, SetupAnswer, TrialAnswer, TrialParams,
} from './generator';
import { hashSeed } from './generator';
import { mulberry32 } from './generator/prng';
import {
  AttentionConfig, DEFAULT_ATTENTION_CONFIG, attentionDue, countAttention, isRejected,
} from './attention';
import {
  DEFAULT_STAIRCASE_CONFIG, StaircaseConfig, deriveState, nextTrial,
} from './staircase';

/** The terminal component the block returns once too many attention checks were missed. */
export const ATTENTION_FAILED = 'attention-failed';

export interface StaircaseBlockParameters {
  cellId: string;
  cue: Cue;
  density: Density;
  maxTrials?: number;
  /** hard cap on the whole block, attention checks included; default 190 */
  maxBlockTrials?: number;
  maxReversals?: number;
  /**
   * offer the `rest` page after every this many main-block trials, staircase trials and attention
   * checks together (default 50: rests after trials 50, 100, 150); 0 = never
   */
  restEvery?: number;
  /** attention checks: one after every this many staircase trials (default 15), at most this many (10) */
  attentionEvery?: number;
  maxAttentionChecks?: number;
  /** attention checks allowed to be missed; the next miss ends the study (default 3) */
  maxAttentionMisses?: number;
}

const DEFAULT_REFRESH_MS = 1000 / 60;
const DEFAULT_SALT = 1;

/** Rests come after every this many main-block trials (staircase and attention), so at 50, 100, 150. */
export const DEFAULT_REST_EVERY = 50;

/** The interval that holds the display with more items: B's when N_B exceeds the reference, else A's. */
export function correctInterval(nB: number, aFirst: boolean, target: number): 'first' | 'second' {
  const bIsLarger = nB > target;
  const bInterval = aFirst ? 'second' : 'first';
  const aInterval = aFirst ? 'first' : 'second';
  return bIsLarger ? bInterval : aInterval;
}

/** Draws whether stimulus A is shown first, from its own seed so the arm-choice draws are unchanged. */
export function drawAFirst(sessionSalt: number, cellId: string, trialIndex: number): boolean {
  return mulberry32(hashSeed(sessionSalt, cellId, trialIndex, 'order'))() < 0.5;
}

/**
 * The participant's staircase starting levels for a cell: the ascending arm starts at 16, 17 or 18
 * and the descending arm at 30, 31 or 32, each uniformly and independently.
 */
export function drawStarts(sessionSalt: number, cellId: string): { above: number; below: number } {
  const rng = mulberry32(hashSeed(sessionSalt, cellId, 'starts'));
  const below = 16 + Math.floor(rng() * 3);
  const above = 30 + Math.floor(rng() * 3);
  return { above, below };
}

/** The participant's colour-wheel rotation: a whole number of degrees in [0, 60), one per session. */
export function drawHueOffset(sessionSalt: number): number {
  return Math.floor(mulberry32(hashSeed(sessionSalt, 'hue'))() * 60);
}

/**
 * Reads the session salt, the measured refresh rate and the card calibration (CSS px per cm, null
 * without a card) written by the `setup` component.
 */
export function readSetupAnswer(answers: JumpFunctionParameters<unknown>['answers']): { sessionSalt: number, refreshMs: number, pxPerCm: number | null } {
  const setupEntry = Object.values(answers)
    .find((answer) => answer.componentName === 'setup' && answer.answer && answer.answer.setup);
  const setup = setupEntry?.answer.setup as SetupAnswer | undefined;

  return {
    sessionSalt: typeof setup?.sessionSalt === 'number' ? setup.sessionSalt : DEFAULT_SALT,
    refreshMs: typeof setup?.refreshMs === 'number' && setup.refreshMs > 0 ? setup.refreshMs : DEFAULT_REFRESH_MS,
    pxPerCm: typeof setup?.pxPerCm === 'number' && setup.pxPerCm > 0 ? setup.pxPerCm : null,
  };
}

/**
 * Whether the next trial of this block waits for a key press or click before its fixation: true
 * for the block's first trial and for the first trial after a `rest` page, i.e. when the block has
 * no finished record yet or its latest finished record (by reVISit's `funcIndex`, the last segment
 * of the answer key) is a rest.
 */
export function waitsForStart(
  answers: JumpFunctionParameters<unknown>['answers'],
  currentBlock: string,
  currentStep: number,
): boolean {
  const prefix = `${currentBlock}_${currentStep}_`;
  const latest = Object.entries(answers)
    .filter(([key, value]) => key.startsWith(prefix) && value.endTime > -1)
    .map(([key, value]) => ({ funcIndex: Number(key.slice(key.lastIndexOf('_') + 1)), componentName: value.componentName }))
    .filter(({ funcIndex }) => Number.isFinite(funcIndex))
    .reduce<{ funcIndex: number; componentName: string } | null>(
      (best, record) => (best === null || record.funcIndex > best.funcIndex ? record : best),
      null,
    );
  return latest === null || latest.componentName === 'rest';
}

/** A stored trial with its correctness derived from the platform record. */
export type BlockTrial = TrialAnswer & { correct: boolean };

/** How many `rest` pages this block has already shown (finished records only). */
export function countRests(
  answers: JumpFunctionParameters<unknown>['answers'],
  currentBlock: string,
  currentStep: number,
): number {
  return Object.entries(answers)
    .filter(([key, value]) => key.startsWith(`${currentBlock}_${currentStep}_`)
      && value.componentName === 'rest'
      && value.endTime > -1)
    .length;
}

/**
 * Collects the completed trials of this block, in the order they were run. Correctness comes from
 * reVISit's own record: the `trial` answer compared with the `correctAnswer` the block returned when
 * it scheduled that trial. Records lacking either are skipped.
 */
export function collectBlockTrials(
  answers: JumpFunctionParameters<unknown>['answers'],
  currentBlock: string,
  currentStep: number,
): BlockTrial[] {
  return Object.entries(answers)
    .filter(([key, value]) => key.startsWith(`${currentBlock}_${currentStep}_`) && value.endTime > -1)
    .map(([, value]) => {
      const trialData = value.answer.trialData as unknown as TrialAnswer | undefined;
      const response = value.answer.trial;
      const expected = value.correctAnswer?.find((entry) => entry.id === 'trial')?.answer;
      if (!trialData || typeof trialData.staircaseId !== 'string' || expected === undefined) {
        return null;
      }
      return { ...trialData, correct: response === expected };
    })
    .filter((trial): trial is BlockTrial => trial !== null);
}

export default function staircaseBlock({
  answers, customParameters, currentStep, currentBlock,
}: JumpFunctionParameters<StaircaseBlockParameters>): JumpFunctionReturnVal {
  const {
    cellId, cue, density, maxTrials, maxBlockTrials, maxReversals, restEvery,
    attentionEvery, maxAttentionChecks, maxAttentionMisses,
  } = customParameters;

  const { sessionSalt, refreshMs, pxPerCm } = readSetupAnswer(answers);
  const starts = drawStarts(sessionSalt, cellId);

  const cfg: StaircaseConfig = {
    ...DEFAULT_STAIRCASE_CONFIG,
    startAbove: starts.above,
    startBelow: starts.below,
    ...(maxTrials === undefined ? {} : { maxTrials }),
    ...(maxBlockTrials === undefined ? {} : { maxBlockTrials }),
    ...(maxReversals === undefined ? {} : { maxReversals }),
  };
  const attention: AttentionConfig = {
    ...DEFAULT_ATTENTION_CONFIG,
    ...(attentionEvery === undefined ? {} : { every: attentionEvery }),
    ...(maxAttentionChecks === undefined ? {} : { maxChecks: maxAttentionChecks }),
    ...(maxAttentionMisses === undefined ? {} : { maxMisses: maxAttentionMisses }),
  };

  const trials = collectBlockTrials(answers, currentBlock, currentStep);
  const { checks, misses } = countAttention(trials);
  if (isRejected(misses, attention.maxMisses)) {
    // terminal: the study ends here, and re-deriving from the stored trials keeps it so. No
    // parameters, so the page gets its own config parameters (Prolific code, redirect); it reads
    // the misses from the stored trials.
    return { component: ATTENTION_FAILED };
  }
  const state = deriveState(trials, cfg);

  const trialIndex = trials.length;
  const rng = mulberry32(hashSeed(sessionSalt, cellId, trialIndex));
  const next = nextTrial(state, cfg, rng);

  if (next === null) {
    return { component: null };
  }

  // A rest is due once another `restEvery` main-block trials (staircase and attention) have run.
  const staircaseTrials = trials.filter((t) => t.staircaseId === 'above' || t.staircaseId === 'below').length;
  const every = restEvery ?? DEFAULT_REST_EVERY;
  if (every > 0) {
    if (Math.floor(trials.length / every) > countRests(answers, currentBlock, currentStep)) {
      return { component: 'rest' };
    }
  }

  const aFirst = drawAFirst(sessionSalt, cellId, trialIndex);
  const common = {
    seedA: hashSeed(sessionSalt, cellId, trialIndex, 'A'),
    seedB: hashSeed(sessionSalt, cellId, trialIndex, 'B'),
    cue,
    density,
    cellId,
    trialIndex,
    aFirst,
    hueOffset: drawHueOffset(sessionSalt),
    starts,
    refreshMs,
    pxPerCm,
    waitForStart: waitsForStart(answers, currentBlock, currentStep),
    attentionMisses: misses,
    maxAttentionMisses: attention.maxMisses,
  };

  // An attention check comes before the next staircase trial once its gap has run.
  if (attentionDue(staircaseTrials, checks, attention)) {
    const parameters: TrialParams = {
      ...common, staircaseId: 'attention', nA: attention.few, nB: attention.many,
    };
    return {
      component: 'trial',
      parameters: { ...parameters },
      correctAnswer: [{ id: 'trial', answer: correctInterval(attention.many, aFirst, attention.few) }],
    };
  }

  const parameters: TrialParams = { ...common, staircaseId: next.staircaseId, nB: next.nB };
  return {
    component: 'trial',
    parameters: { ...parameters },
    correctAnswer: [{ id: 'trial', answer: correctInterval(next.nB, aFirst, cfg.target) }],
  };
}
