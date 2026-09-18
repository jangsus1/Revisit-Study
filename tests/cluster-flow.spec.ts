/* eslint-disable no-await-in-loop */
import { expect, test, Page } from '@playwright/test';
import {
  nextClick,
  readStoredValue,
  resetClientStudyState,
  waitForStudyEndMessage,
} from './utils';

const STUDY_ID = 'test-cluster-flow';
const COMPLETED_MESSAGE = 'Thank you for completing the study. You may close this window now.';

interface StoredTrialData {
  seedA: number;
  seedB: number;
  nB: number;
  refreshMs: number;
  staircaseId: string;
  measured: { fixation: number, a: number, blank1: number, b: number, blank2: number };
}

/** One stored trial: the platform record around the hidden telemetry. */
interface StoredTrial {
  trial: string;
  trialData: StoredTrialData;
  correctAnswer: { id: string, answer: string }[];
  checkAnswer?: { attemptsUsed: number, correct: boolean };
}

/** Reads every stored trial record of the local (IndexedDB) storage engine. */
async function readStoredTrials(page: Page): Promise<StoredTrial[]> {
  const assignments = await readStoredValue<Record<string, unknown>>(page, `dev-${STUDY_ID}/sequenceAssignment`);
  const participantId = Object.keys(assignments ?? {})[0];
  expect(participantId, 'a participant should have been assigned a sequence').toBeTruthy();

  const participant = await readStoredValue<{
    answers?: Record<string, {
      answer?: { trial?: string, trialData?: StoredTrialData },
      correctAnswer?: { id: string, answer: string }[],
      checkAnswer?: { attemptsUsed: number, correct: boolean },
    }>;
  }>(page, `dev-${STUDY_ID}/participants/${participantId}_participantData`);

  return Object.values(participant?.answers ?? {})
    .filter((answer) => !!answer.answer?.trialData && typeof answer.answer.trialData.seedA === 'number')
    .map((answer) => ({
      trial: answer.answer?.trial ?? '',
      trialData: answer.answer?.trialData as StoredTrialData,
      correctAnswer: answer.correctAnswer ?? [],
      checkAnswer: answer.checkAnswer,
    }));
}

test('cluster-flow staircase runs a shortened session and stores full trial records', async ({ page }) => {
  await resetClientStudyState(page);
  await page.goto(`/${STUDY_ID}`);

  // Introduction
  await expect(page.getByRole('heading', { name: 'Counting items in flow diagrams' })).toBeVisible({ timeout: 15000 });
  await nextClick(page);

  // Setup: the calibration never blocks, even when headless Chromium refuses fullscreen.
  await page.getByRole('button', { name: 'Enter fullscreen and start calibration' }).click();
  await expect(page.getByTestId('setup-summary')).toBeVisible({ timeout: 20000 });
  await expect(page.getByText('Press Enter to continue')).toBeVisible();
  await page.keyboard.press('Enter');

  // Practice and the shortened staircase cell. Correctness does not matter, so the keys alternate.
  // Practice trials hand over to reVISit's Check Answer flow: Enter grades, Enter again moves on.
  // Main trials advance on their own once the key is pressed.
  const gateButton = page.getByRole('button', { name: 'Click to return to fullscreen' });
  const prompt = page.getByTestId('trial-prompt');
  const practiceDone = page.getByTestId('practice-done');
  const feedback = page.getByText(/Correct Answer|Incorrect Answer/);
  const completed = page.getByText(COMPLETED_MESSAGE, { exact: true });

  let trials = 0;
  let practiceTrials = 0;
  const deadline = Date.now() + 45000;
  while (Date.now() < deadline) {
    if (await completed.isVisible()) {
      break;
    }
    if (await gateButton.isVisible()) {
      await gateButton.click();
    } else if (await practiceDone.isVisible()) {
      practiceTrials += 1;
      await page.keyboard.press('Enter');
      await expect(feedback).toBeVisible({ timeout: 10000 });
      await page.keyboard.press('Enter');
      await practiceDone.waitFor({ state: 'hidden', timeout: 10000 });
    } else if (await prompt.isVisible()) {
      await page.keyboard.press(trials % 2 === 0 ? 'f' : 'ArrowRight');
      trials += 1;
      await prompt.waitFor({ state: 'hidden', timeout: 10000 });
    } else {
      await page.waitForTimeout(50);
    }
  }

  await waitForStudyEndMessage(page);
  // two practice trials plus the shortened cell
  expect(practiceTrials).toBe(2);
  expect(trials).toBeGreaterThanOrEqual(3);

  const stored = await readStoredTrials(page);
  expect(stored.length).toBe(trials);

  const [first] = stored;
  expect(typeof first.trialData.seedA).toBe('number');
  expect(first.trialData.seedA).not.toBe(first.trialData.seedB);
  expect(typeof first.trialData.nB).toBe('number');
  expect(['practice', 'above', 'below', 'catch']).toContain(first.trialData.staircaseId);

  // Stimulus A is shown for 200 ms; allow two frames of slack for the animation-frame scheduler.
  const tolerance = 2 * first.trialData.refreshMs + 5;
  stored.forEach((trial) => {
    // the graded answer and the block's expected answer live on the platform record
    expect(['left', 'right']).toContain(trial.trial);
    expect(trial.correctAnswer).toHaveLength(1);
    expect(['left', 'right']).toContain(trial.correctAnswer[0].answer);

    if (trial.trialData.staircaseId === 'practice') {
      // practice answers were graded by reVISit's Check Answer
      expect(trial.checkAnswer?.attemptsUsed).toBe(1);
      expect(trial.checkAnswer?.correct).toBe(trial.trial === trial.correctAnswer[0].answer);
    }

    expect(Math.abs(trial.trialData.measured.a - 200)).toBeLessThanOrEqual(tolerance);
    expect(Math.abs(trial.trialData.measured.b - 200)).toBeLessThanOrEqual(tolerance);
  });
});
