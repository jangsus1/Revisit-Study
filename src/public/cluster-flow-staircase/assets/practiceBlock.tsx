/**
 * Dynamic block for the practice phase: a short fixed run of easy trials (N_B 12, 40, 12) in the
 * participant's own cell (cue x density), so they practise exactly the displays of their main
 * block. Feedback is shown inside the trial stream: the trial runner grades the key press against
 * the interval this block marks as correct, shows "Correct" / "Not quite" for about 1.5 s and moves
 * on by itself (no Check Answer step). The block still returns the `correctAnswer`, so reVISit
 * stores it on the record. Its first trial waits for a key press or click before it starts
 * (`waitForStart`).
 */
import type { JumpFunctionParameters, JumpFunctionReturnVal } from '../../../store/types';
import type { Cue, Density, TrialParams } from './generator';
import { hashSeed } from './generator';
import {
  collectBlockTrials, correctInterval, drawAFirst, drawHueOffset, readSetupAnswer, waitsForStart,
} from './staircaseBlock';

export interface PracticeBlockParameters {
  cue: Cue;
  density: Density;
  /** number of practice trials; defaults to 3 */
  trials?: number;
}

const PRACTICE_CELL = 'practice';
const PRACTICE_NB = [12, 40];
const DEFAULT_PRACTICE_TRIALS = 3;
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

  const { sessionSalt, refreshMs, pxPerCm } = readSetupAnswer(answers);
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
    pxPerCm,
    waitForStart: waitsForStart(answers, currentBlock, currentStep),
  };

  return {
    component: 'practice-trial',
    parameters: { ...parameters },
    correctAnswer: [{ id: 'trial', answer: correctInterval(nB, aFirst, TARGET) }],
  };
}
