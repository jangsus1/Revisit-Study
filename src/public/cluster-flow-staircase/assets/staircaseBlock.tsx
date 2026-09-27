/**
 * Dynamic block driving the participant's one cell (cue x density) of the cluster-flow experiment.
 *
 * The block is stateless: every call re-derives the staircase state from the trials already
 * stored for this block, asks `nextTrial` what to show, and returns the fully specified trial
 * parameters. Seeds, the interval order, the staircase starting levels and the colour-wheel
 * rotation are all derived from the session salt created in `SetupCheck`, so the whole session can
 * be regenerated from the stored data. Every `restEvery` main trials the block inserts the `rest`
 * page before the next trial.
 */
import type { JumpFunctionParameters, JumpFunctionReturnVal } from '../../../store/types';
import type {
  Cue, Density, SetupAnswer, TrialAnswer, TrialParams,
} from './generator';
import { hashSeed } from './generator';
import { mulberry32 } from './generator/prng';
import {
  DEFAULT_STAIRCASE_CONFIG, StaircaseConfig, deriveState, nextTrial,
} from './staircase';

export interface StaircaseBlockParameters {
  cellId: string;
  cue: Cue;
  density: Density;
  maxTrials?: number;
  maxReversals?: number;
  catchEvery?: number;
  /** offer the `rest` page after every this many main (non-catch) trials; default 60, 0 = never */
  restEvery?: number;
}

const DEFAULT_REFRESH_MS = 1000 / 60;
const DEFAULT_SALT = 1;

const DEFAULT_REST_EVERY = 60;

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

/** Reads the session salt and measured refresh rate written by the `setup` component. */
export function readSetupAnswer(answers: JumpFunctionParameters<unknown>['answers']): { sessionSalt: number, refreshMs: number } {
  const setupEntry = Object.values(answers)
    .find((answer) => answer.componentName === 'setup' && answer.answer && answer.answer.setup);
  const setup = setupEntry?.answer.setup as SetupAnswer | undefined;

  return {
    sessionSalt: typeof setup?.sessionSalt === 'number' ? setup.sessionSalt : DEFAULT_SALT,
    refreshMs: typeof setup?.refreshMs === 'number' && setup.refreshMs > 0 ? setup.refreshMs : DEFAULT_REFRESH_MS,
  };
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
    cellId, cue, density, maxTrials, maxReversals, catchEvery, restEvery,
  } = customParameters;

  const { sessionSalt, refreshMs } = readSetupAnswer(answers);
  const starts = drawStarts(sessionSalt, cellId);

  const cfg: StaircaseConfig = {
    ...DEFAULT_STAIRCASE_CONFIG,
    startAbove: starts.above,
    startBelow: starts.below,
    ...(maxTrials === undefined ? {} : { maxTrials }),
    ...(maxReversals === undefined ? {} : { maxReversals }),
    ...(catchEvery === undefined ? {} : { catchEvery }),
  };

  const trials = collectBlockTrials(answers, currentBlock, currentStep);
  const state = deriveState(trials, cfg);

  const trialIndex = trials.length;
  const rng = mulberry32(hashSeed(sessionSalt, cellId, trialIndex));
  const next = nextTrial(state, cfg, rng);

  if (next === null) {
    return { component: null };
  }

  // A rest is due once another `restEvery` main trials have run since the last one.
  const every = restEvery ?? DEFAULT_REST_EVERY;
  if (every > 0) {
    const mainTrials = trials.filter((t) => t.staircaseId === 'above' || t.staircaseId === 'below').length;
    if (Math.floor(mainTrials / every) > countRests(answers, currentBlock, currentStep)) {
      return { component: 'rest' };
    }
  }

  const aFirst = drawAFirst(sessionSalt, cellId, trialIndex);
  const parameters: TrialParams = {
    seedA: hashSeed(sessionSalt, cellId, trialIndex, 'A'),
    seedB: hashSeed(sessionSalt, cellId, trialIndex, 'B'),
    nB: next.nB,
    cue,
    density,
    cellId,
    trialIndex,
    staircaseId: next.staircaseId,
    aFirst,
    hueOffset: drawHueOffset(sessionSalt),
    starts,
    refreshMs,
  };

  return {
    component: 'trial',
    parameters: { ...parameters },
    correctAnswer: [{ id: 'trial', answer: correctInterval(next.nB, aFirst, cfg.target) }],
  };
}
