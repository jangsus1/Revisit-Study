/* eslint-disable no-await-in-loop */
import { expect, test, Page } from '@playwright/test';
import {
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
  response: string;
  aFirst: boolean;
  hueOffset: number;
  starts: { above: number, below: number } | null;
  metricsA: { ink: number, meanNN: number };
  metricsB: { ink: number, meanNN: number };
  measured: {
    fixation: number, s1: number, mask: number, blank: number, s2: number, blank2: number,
  };
  displayScale: number;
  stimulusWidthCm: number | null;
  startWaitMs: number | null;
  fullscreenExits: number;
}

/** One stored trial: the platform record around the hidden telemetry. */
interface StoredTrial {
  trial: string;
  trialData: StoredTrialData;
  correctAnswer: { id: string, answer: string }[];
  checkAnswer?: { attemptsUsed: number, correct: boolean };
}

type StoredRecord = {
  componentName?: string,
  answer?: { trial?: string, trialData?: StoredTrialData, setup?: Record<string, unknown> },
  correctAnswer?: { id: string, answer: string }[],
  checkAnswer?: { attemptsUsed: number, correct: boolean },
};

/** Reads every stored answer record of the local (IndexedDB) storage engine. */
async function readStoredRecords(page: Page): Promise<StoredRecord[]> {
  const assignments = await readStoredValue<Record<string, unknown>>(page, `dev-${STUDY_ID}/sequenceAssignment`);
  const participantId = Object.keys(assignments ?? {})[0];
  expect(participantId, 'a participant should have been assigned a sequence').toBeTruthy();

  const participant = await readStoredValue<{ answers?: Record<string, StoredRecord> }>(
    page,
    `dev-${STUDY_ID}/participants/${participantId}_participantData`,
  );
  return Object.values(participant?.answers ?? {});
}

/** Reads every stored trial record. */
async function readStoredTrials(page: Page): Promise<StoredTrial[]> {
  return (await readStoredRecords(page))
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

  // Introduction (a TSX page in the Panel layout, advanced by its own button)
  await expect(page.getByRole('heading', { name: 'Which diagram has more items?' })).toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId('session-step')).toHaveCount(5);
  await page.getByRole('button', { name: 'Start', exact: true }).click();

  // Setup: full screen + timing, then the screen-size card check ("I have no card").
  await page.getByRole('button', { name: 'Enter full screen and start' }).click();
  await expect(page.getByTestId('setup-summary')).toBeVisible({ timeout: 20000 });
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByTestId('card-check')).toBeVisible();
  await page.getByRole('button', { name: 'I have no card' }).click();

  // Instructions: storyboard and item figure. Leaving full screen here brings up the gate, which
  // keeps Enter from advancing the page underneath.
  await expect(page.getByRole('heading', { name: 'How a trial works' })).toBeVisible({ timeout: 10000 });
  await expect(page.getByTestId('trial-storyboard')).toBeVisible();
  await expect(page.getByTestId('item-count-figure')).toBeVisible();
  const fullscreenGranted = await page.evaluate(() => !!document.fullscreenElement);
  if (fullscreenGranted) {
    await page.evaluate(() => document.exitFullscreen());
    await expect(page.getByTestId('fullscreen-gate')).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: 'How a trial works' })).toBeVisible();
    await page.getByRole('button', { name: 'Return to full screen' }).click();
    await expect(page.getByTestId('fullscreen-gate')).toBeHidden();
  }
  await page.getByRole('button', { name: 'Continue' }).click();

  // Practice and the shortened staircase cell. Correctness does not matter, so the keys alternate.
  // Practice trials hand over to reVISit's Check Answer flow: Enter grades, Enter again moves on.
  // Main trials advance on their own once the key is pressed. The block starts and the trial after
  // each rest wait on the start gate; F is pressed there, and must not count as an answer.
  const fullscreenGate = page.getByTestId('fullscreen-gate');
  const startGate = page.getByTestId('start-gate');
  const prompt = page.getByTestId('trial-prompt');
  const practiceDone = page.getByTestId('practice-done');
  const feedback = page.getByText(/Correct Answer|Incorrect Answer/);
  const completed = page.getByText(COMPLETED_MESSAGE, { exact: true });
  const practiceIntro = page.getByTestId('info-page-practice');
  const blockIntro = page.getByTestId('info-page-main');
  const rest = page.getByTestId('info-page-rest');

  let trials = 0;
  let practiceTrials = 0;
  let rests = 0;
  let intros = 0;
  let gates = 0;
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    if (await completed.isVisible()) {
      break;
    }
    if (await fullscreenGate.isVisible()) {
      await page.getByRole('button', { name: 'Return to full screen' }).click();
    } else if (await practiceIntro.isVisible()) {
      intros += 1;
      await page.getByRole('button', { name: 'Start practice' }).click();
      await expect(practiceIntro).toBeHidden({ timeout: 10000 });
    } else if (await blockIntro.isVisible()) {
      intros += 1;
      await page.getByRole('button', { name: 'Start the main task' }).click();
      await expect(blockIntro).toBeHidden({ timeout: 10000 });
    } else if (await rest.isVisible()) {
      rests += 1;
      await page.getByRole('button', { name: 'Continue' }).click();
      await expect(rest).toBeHidden({ timeout: 10000 });
    } else if (await startGate.isVisible()) {
      gates += 1;
      await page.keyboard.press('f');
      await expect(startGate).toBeHidden({ timeout: 10000 });
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
  // two practice trials plus the shortened cell, with its two intro pages and at least one rest
  expect(practiceTrials).toBe(2);
  expect(trials).toBeGreaterThanOrEqual(3);
  expect(intros).toBe(2);
  expect(rests).toBeGreaterThanOrEqual(1);
  // one start gate at the start of practice, one at the start of the main block, one after each rest
  expect(gates).toBe(2 + rests);

  const records = await readStoredRecords(page);
  const setup = records.find((record) => record.componentName === 'setup')?.answer?.setup;
  expect(setup?.pxPerCm).toBeNull();
  expect(setup?.cardWidthPx).toBeNull();
  expect(setup?.screenInches).toBeNull();
  expect(setup?.confirmedImplausible).toBe(false);
  expect(typeof setup?.fullscreenExits).toBe('number');

  // the gate's key press was not an answer: every stored trial matches one prompt answer
  const stored = await readStoredTrials(page);
  expect(stored.length).toBe(trials);
  expect(stored.filter((trial) => trial.trialData.startWaitMs !== null)).toHaveLength(gates);

  const [first] = stored;
  expect(typeof first.trialData.seedA).toBe('number');
  expect(first.trialData.seedA).not.toBe(first.trialData.seedB);
  expect(typeof first.trialData.nB).toBe('number');
  expect(['practice', 'above', 'below', 'catch']).toContain(first.trialData.staircaseId);

  // The stimuli are shown for 200 ms and the mask for 150 ms; allow two frames of slack for the
  // animation-frame scheduler.
  const tolerance = 2 * first.trialData.refreshMs + 5;
  const hueOffsets = new Set(stored.map((trial) => trial.trialData.hueOffset));
  expect(hueOffsets.size).toBe(1);
  stored.forEach((trial) => {
    // the graded answer and the block's expected answer live on the platform record
    expect(['first', 'second']).toContain(trial.trial);
    expect(trial.trialData.response).toBe(trial.trial);
    expect(typeof trial.trialData.aFirst).toBe('boolean');
    expect(trial.correctAnswer).toHaveLength(1);
    expect(['first', 'second']).toContain(trial.correctAnswer[0].answer);
    // the larger display's interval: B's when N_B > 24, else A's
    const bInterval = trial.trialData.aFirst ? 'second' : 'first';
    const aInterval = trial.trialData.aFirst ? 'first' : 'second';
    expect(trial.correctAnswer[0].answer).toBe(trial.trialData.nB > 24 ? bInterval : aInterval);
    expect(trial.trialData.metricsA.ink).toBeGreaterThan(0);
    expect(trial.trialData.metricsB.meanNN).toBeGreaterThan(0);
    // no card: nominal size (scale 1 unless the window is too small), no physical width
    expect(trial.trialData.displayScale).toBeGreaterThanOrEqual(0.6);
    expect(trial.trialData.displayScale).toBeLessThanOrEqual(1);
    expect(trial.trialData.stimulusWidthCm).toBeNull();
    expect(trial.trialData.fullscreenExits).toBe(fullscreenGranted ? 1 : 0);

    if (trial.trialData.staircaseId === 'practice') {
      expect(trial.trialData.starts).toBeNull();
    } else {
      expect(trial.trialData.starts?.above).toBeGreaterThanOrEqual(30);
      expect(trial.trialData.starts?.below).toBeLessThanOrEqual(18);
    }

    if (trial.trialData.staircaseId === 'practice') {
      // practice answers were graded by reVISit's Check Answer
      expect(trial.checkAnswer?.attemptsUsed).toBe(1);
      expect(trial.checkAnswer?.correct).toBe(trial.trial === trial.correctAnswer[0].answer);
    }

    expect(Math.abs(trial.trialData.measured.s1 - 200)).toBeLessThanOrEqual(tolerance);
    expect(Math.abs(trial.trialData.measured.mask - 150)).toBeLessThanOrEqual(tolerance);
    expect(Math.abs(trial.trialData.measured.s2 - 200)).toBeLessThanOrEqual(tolerance);
  });
});
