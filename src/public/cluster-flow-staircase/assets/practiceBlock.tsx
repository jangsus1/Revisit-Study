/**
 * Dynamic block for the practice phase: a short fixed run of easy trials in the participant's own
 * cell (cue x density), so they practise exactly the displays of their main block. Feedback is
 * reVISit's own Check Answer flow: the `practice-trial` component has `provideFeedback` and this
 * block supplies the `correctAnswer` it grades against.
 */
import type { JumpFunctionParameters, JumpFunctionReturnVal } from '../../../store/types';
import type { Cue, Density, TrialParams } from './generator';
import { hashSeed } from './generator';
import {
  collectBlockTrials, correctInterval, drawAFirst, drawHueOffset, readSetupAnswer,
} from './staircaseBlock';

export interface PracticeBlockParameters {
  cue: Cue;
  density: Density;
  /** number of practice trials; defaults to 8 */
  trials?: number;
}

const PRACTICE_CELL = 'practice';
const PRACTICE_NB = [12, 40];
const DEFAULT_PRACTICE_TRIALS = 8;
const TARGET = 24;

export default function practiceBlock({
  answers, customParameters, currentStep, currentBlock,
}: JumpFunctionParameters<PracticeBlockParameters>): JumpFunctionReturnVal {
  const { cue, density } = customParameters;
  const total = customParameters.trials ?? DEFAULT_PRACTICE_TRIALS;
  const trialIndex = collectBlockTrials(answers, currentBlock, currentStep).length;

  if (trialIndex >= total) {
    return { component: null };
  }

  const { sessionSalt, refreshMs } = readSetupAnswer(answers);
  const nB = PRACTICE_NB[trialIndex % PRACTICE_NB.length];

  const aFirst = drawAFirst(sessionSalt, PRACTICE_CELL, trialIndex);
  const parameters: TrialParams = {
    seedA: hashSeed(sessionSalt, PRACTICE_CELL, trialIndex, 'A'),
    seedB: hashSeed(sessionSalt, PRACTICE_CELL, trialIndex, 'B'),
    nB,
    cue,
    density,
    cellId: PRACTICE_CELL,
    trialIndex,
    staircaseId: 'practice',
    aFirst,
    hueOffset: drawHueOffset(sessionSalt),
    starts: null,
    refreshMs,
  };

  return {
    component: 'practice-trial',
    parameters: { ...parameters },
    correctAnswer: [{ id: 'trial', answer: correctInterval(nB, aFirst, TARGET) }],
  };
}
