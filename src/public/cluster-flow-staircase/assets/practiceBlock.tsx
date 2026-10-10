/**
 * Dynamic block for the practice phase: a short fixed run of easy trials (N_B 12, 40, 12) in the
 * participant's own cell (cue x density), so they practise exactly the displays of their main
 * block. Feedback is shown inside the trial stream: the trial runner grades the key press against
 * the interval this block marks as correct, shows "Correct" / "Not quite" for about 1.5 s and moves
 * on by itself (no Check Answer step). The block still returns the `correctAnswer`, so reVISit
 * stores it on the record. Its first trial waits for a key press or click before it starts
 * (`waitForStart`).
 *
 * Display-timing backstop (`timingGuard.ts`): once the practice trials are done, if more than
 * `maxOffTargetTrials` (the main config sets `PRACTICE_MAX_OFF_TRIALS`, 1, i.e. two or more of three)
 * had a stimulus or mask off target by more than 25 ms, the block returns the terminal
 * `display-failed` component instead of ending, so the session ends before the main task. It follows
 * from the stored trials, so a reload lands on it again. The backstop is on only when the block sets
 * `maxOffTargetTrials`: a session started under an older config (in flight when this was deployed)
 * has no `display-failed` component and must never be sent to one.
 */
import type { JumpFunctionParameters, JumpFunctionReturnVal } from '../../../store/types';
import type { Cue, Density, TrialParams } from './generator';
import { hashSeed } from './generator';
import { countOffTarget } from './timingGuard';
import {
  collectBlockTrials, correctInterval, drawAFirst, drawHueOffset, readSetupAnswer, waitsForStart,
} from './staircaseBlock';

export interface PracticeBlockParameters {
  cue: Cue;
  density: Density;
  /** number of practice trials; defaults to 3 */
  trials?: number;
  /**
   * the session ends when more practice trials than this were off target; no backstop when unset
   * (the main config sets 1, `PRACTICE_MAX_OFF_TRIALS`)
   */
  maxOffTargetTrials?: number;
}

/** The terminal component the block returns when the practice trials' display timing was off. */
export const DISPLAY_FAILED = 'display-failed';

const PRACTICE_CELL = 'practice';
const PRACTICE_NB = [12, 40];
const DEFAULT_PRACTICE_TRIALS = 3;
const TARGET = 24;

export default function practiceBlock({
  answers, customParameters, currentStep, currentBlock,
}: JumpFunctionParameters<PracticeBlockParameters>): JumpFunctionReturnVal {
  const { cue, density } = customParameters;
  const total = customParameters.trials ?? DEFAULT_PRACTICE_TRIALS;
  const trials = collectBlockTrials(answers, currentBlock, currentStep);
  const trialIndex = trials.length;

  if (trialIndex >= total) {
    const maxOff = customParameters.maxOffTargetTrials;
    // terminal: no parameters, so the page gets its config parameters (Prolific code, redirect)
    return typeof maxOff === 'number' && countOffTarget(trials) > maxOff ? { component: DISPLAY_FAILED } : { component: null };
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
