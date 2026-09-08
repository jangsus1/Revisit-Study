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

/** Collects the completed trials of this block, in the order they were run. */
export function collectBlockTrials(
  answers: JumpFunctionParameters<unknown>['answers'],
  currentBlock: string,
  currentStep: number,
): TrialAnswer[] {
  return Object.entries(answers)
    .filter(([key, value]) => key.startsWith(`${currentBlock}_${currentStep}_`) && value.endTime > -1)
    .map(([, value]) => value.answer.trialData as unknown as TrialAnswer)
    .filter((trial): trial is TrialAnswer => !!trial && typeof trial.staircaseId === 'string');
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

  const parameters: TrialParams = {
    seedA: hashSeed(sessionSalt, cellId, trialIndex, 'A'),
    seedB: hashSeed(sessionSalt, cellId, trialIndex, 'B'),
    nB: next.nB,
    cue,
    density,
    cellId,
    trialIndex,
    staircaseId: next.staircaseId,
    feedback: false,
    refreshMs,
  };

  return {
    component: 'trial',
    parameters: { ...parameters },
    correctAnswer: [{ id: 'trial', answer: next.nB > cfg.target ? 'second' : 'first' }],
  };
}
