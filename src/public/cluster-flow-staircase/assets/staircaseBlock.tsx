/**
 * Dynamic block driving one cell (cue x density) of the cluster-flow experiment.
 *
 * The block is stateless: every call re-derives the staircase state from the trials already
 * stored for this block, asks `nextTrial` what to show, and returns the fully specified trial
 * parameters. Seeds are derived from the session salt created in `SetupCheck`, so the whole
 * session can be regenerated from the stored data.
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
}

const DEFAULT_REFRESH_MS = 1000 / 60;
const DEFAULT_SALT = 1;

/** The side that holds the display with more items: B when N_B exceeds the reference, else A. */
export function correctSide(nB: number, aOnLeft: boolean, target: number): 'left' | 'right' {
  const bIsLarger = nB > target;
  const bSide = aOnLeft ? 'right' : 'left';
  const aSide = aOnLeft ? 'left' : 'right';
  return bIsLarger ? bSide : aSide;
}

/** Draws which slot shows stimulus A, from its own seed so the arm-choice draw sequence is unchanged. */
export function drawAOnLeft(sessionSalt: number, cellId: string, trialIndex: number): boolean {
  return mulberry32(hashSeed(sessionSalt, cellId, trialIndex, 'side'))() < 0.5;
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
    cellId, cue, density, maxTrials, maxReversals, catchEvery,
  } = customParameters;

  const cfg: StaircaseConfig = {
    ...DEFAULT_STAIRCASE_CONFIG,
    ...(maxTrials === undefined ? {} : { maxTrials }),
    ...(maxReversals === undefined ? {} : { maxReversals }),
    ...(catchEvery === undefined ? {} : { catchEvery }),
  };

  const { sessionSalt, refreshMs } = readSetupAnswer(answers);
  const trials = collectBlockTrials(answers, currentBlock, currentStep);
  const state = deriveState(trials, cfg);

  const trialIndex = trials.length;
  const rng = mulberry32(hashSeed(sessionSalt, cellId, trialIndex));
  const next = nextTrial(state, cfg, rng);

  if (next === null) {
    return { component: null };
  }

  const aOnLeft = drawAOnLeft(sessionSalt, cellId, trialIndex);
  const parameters: TrialParams = {
    seedA: hashSeed(sessionSalt, cellId, trialIndex, 'A'),
    seedB: hashSeed(sessionSalt, cellId, trialIndex, 'B'),
    nB: next.nB,
    cue,
    density,
    cellId,
    trialIndex,
    staircaseId: next.staircaseId,
    aOnLeft,
    refreshMs,
  };

  return {
    component: 'trial',
    parameters: { ...parameters },
    correctAnswer: [{ id: 'trial', answer: correctSide(next.nB, aOnLeft, cfg.target) }],
  };
}
