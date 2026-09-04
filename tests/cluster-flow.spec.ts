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
  correct: boolean;
  refreshMs: number;
  staircaseId: string;
  measured: { fixation: number, a: number, blank1: number, b: number, blank2: number };
}

/** Reads every stored trial record of the local (IndexedDB) storage engine. */
async function readStoredTrials(page: Page): Promise<StoredTrialData[]> {
  const assignments = await readStoredValue<Record<string, unknown>>(page, `dev-${STUDY_ID}/sequenceAssignment`);
  const participantId = Object.keys(assignments ?? {})[0];
  expect(participantId, 'a participant should have been assigned a sequence').toBeTruthy();

  const participant = await readStoredValue<{
    answers?: Record<string, { answer?: { trialData?: StoredTrialData } }>;
  }>(page, `dev-${STUDY_ID}/participants/${participantId}_participantData`);

  return Object.values(participant?.answers ?? {})
    .map((answer) => answer.answer?.trialData)
    .filter((trialData): trialData is StoredTrialData => !!trialData && typeof trialData.seedA === 'number');
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
  const gateButton = page.getByRole('button', { name: 'Click to return to fullscreen' });
  const prompt = page.getByTestId('trial-prompt');
  const completed = page.getByText(COMPLETED_MESSAGE, { exact: true });

  let trials = 0;
  const deadline = Date.now() + 45000;
  while (Date.now() < deadline) {
    if (await completed.isVisible()) {
      break;
    }
    if (await gateButton.isVisible()) {
      await gateButton.click();
    } else if (await prompt.isVisible()) {
      await page.keyboard.press(trials % 2 === 0 ? 'i' : 'j');
      trials += 1;
      await prompt.waitFor({ state: 'hidden', timeout: 10000 });
    } else {
      await page.waitForTimeout(50);
    }
  }

  await waitForStudyEndMessage(page);
  // two practice trials plus the shortened cell
  expect(trials).toBeGreaterThanOrEqual(3);

  const stored = await readStoredTrials(page);
  expect(stored.length).toBe(trials);

  const [first] = stored;
  expect(typeof first.seedA).toBe('number');
  expect(first.seedA).not.toBe(first.seedB);
  expect(typeof first.nB).toBe('number');
  expect(typeof first.correct).toBe('boolean');
  expect(['practice', 'above', 'below', 'catch']).toContain(first.staircaseId);

  // Stimulus A is shown for 200 ms; allow two frames of slack for the animation-frame scheduler.
  const tolerance = 2 * first.refreshMs + 5;
  stored.forEach((trial) => {
    expect(Math.abs(trial.measured.a - 200)).toBeLessThanOrEqual(tolerance);
    expect(Math.abs(trial.measured.b - 200)).toBeLessThanOrEqual(tolerance);
  });
});
