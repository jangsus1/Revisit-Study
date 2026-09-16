/**
 * Dynamic block for the practice phase: a short fixed run of easy trials, cycling through the cues
 * and densities so the participant sees what the task looks like. Feedback is reVISit's own
 * Check Answer flow: the `practice-trial` component has `provideFeedback` and this block supplies
 * the `correctAnswer` it grades against.
 */
import type { JumpFunctionParameters, JumpFunctionReturnVal } from '../../../store/types';
import type { Density, TrialParams } from './generator';
import { CUES, DENSITIES, hashSeed } from './generator';
import { collectBlockTrials, readSetupAnswer } from './staircaseBlock';

export interface PracticeBlockParameters {
  /** number of practice trials; defaults to 8 */
  trials?: number;
}

const PRACTICE_CELL = 'practice';
const PRACTICE_NB = [12, 40];
const DEFAULT_PRACTICE_TRIALS = 8;
const TARGET = 24;

export default function practiceBlock({
  answers, customParameters, currentStep, currentBlock,
}: JumpFunctionParameters<PracticeBlockParameters | undefined>): JumpFunctionReturnVal {
  const total = customParameters?.trials ?? DEFAULT_PRACTICE_TRIALS;
  const trialIndex = collectBlockTrials(answers, currentBlock, currentStep).length;

  if (trialIndex >= total) {
    return { component: null };
  }

  const { sessionSalt, refreshMs } = readSetupAnswer(answers);
  const nB = PRACTICE_NB[trialIndex % PRACTICE_NB.length];
  const density: Density = DENSITIES[Math.floor(trialIndex / PRACTICE_NB.length) % DENSITIES.length];

  const parameters: TrialParams = {
    seedA: hashSeed(sessionSalt, PRACTICE_CELL, trialIndex, 'A'),
    seedB: hashSeed(sessionSalt, PRACTICE_CELL, trialIndex, 'B'),
    nB,
    cue: CUES[trialIndex % CUES.length],
    density,
    cellId: PRACTICE_CELL,
    trialIndex,
    staircaseId: 'practice',
    refreshMs,
  };

  return {
    component: 'practice-trial',
    parameters: { ...parameters },
    correctAnswer: [{ id: 'trial', answer: nB > TARGET ? 'second' : 'first' }],
  };
}
