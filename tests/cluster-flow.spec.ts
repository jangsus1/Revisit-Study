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
    fixation: number, s1: number, mask: number, blank: number, s2: number, mask2: number, blank2: number,
  };
  displayScale: number;
  stimulusWidthCm: number | null;
  startWaitMs: number | null;
  fullscreenExits: number;
  correct?: boolean;
  feedbackShownMs?: number;
  nA?: number;
  attentionMisses?: number;
  respondedDuring?: string;
  rtFromS2OffsetMs?: number;
  rtMs: number;
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
  test.setTimeout(150000);
  await resetClientStudyState(page);
  await page.goto(`/${STUDY_ID}`);

  // Introduction (a TSX page in the Panel layout, advanced by its own button once the reading time,
  // shortened to 1 s in the test study, has passed; Enter does nothing before that)
  await expect(page.getByRole('heading', { name: 'Which diagram has more items?' })).toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId('session-step')).toHaveCount(5);
  const primary = page.getByTestId('primary-button');
  await expect(primary).toBeDisabled();
  await expect(primary).toHaveText(/^Start · 1 s$/);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Which diagram has more items?' })).toBeVisible();
  await expect(primary).toBeEnabled({ timeout: 5000 });
  await primary.click();

  // Setup: full screen + timing, then the screen-size card check ("I have no card").
  // (the timing is measured silently: "One moment…", then straight to the card check)
  await page.getByRole('button', { name: 'Enter full screen', exact: true }).click();
  await expect(page.getByTestId('card-check')).toBeVisible({ timeout: 20000 });
  await expect(page.getByTestId('setup-summary')).toHaveCount(0);
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
  await expect(primary).toBeEnabled({ timeout: 5000 });
  await primary.click();

  // Examples: Continue needs both demos played. Each plays the real sequence in place and then
  // shows the answer: the first had more (24 vs 10), the second had more (24 vs 44).
  await expect(page.getByTestId('example-page')).toBeVisible({ timeout: 10000 });
  await expect(primary).toHaveText('Play both examples to continue', { timeout: 5000 });
  await page.getByTestId('example-fewer-play').click();
  await expect(page.getByTestId('example-fewer-answer')).toHaveText('The first had more', { timeout: 10000 });
  await expect(primary).toBeDisabled();
  await page.getByTestId('example-more-play').click();
  await expect(page.getByTestId('example-more-answer')).toHaveText('The second had more', { timeout: 10000 });
  await expect(primary).toBeEnabled();
  await primary.click();

  // Practice and the shortened staircase cell. Correctness does not matter, so the keys alternate.
  // Practice trials show their feedback in the stream for 1.5 s and move on by themselves; main
  // trials advance as soon as the key is pressed. The block starts and the trial after each rest
  // wait on the start gate; F is pressed there, and must not count as an answer. Attention checks
  // (5 vs 30 items, after every 3 staircase trials in the test study) are answered correctly
  // except the first, which is missed on purpose: its feedback shows the misses left and waits for
  // a key press.
  const fullscreenGate = page.getByTestId('fullscreen-gate');
  const startGate = page.getByTestId('start-gate');
  const prompt = page.getByTestId('trial-prompt');
  const feedback = page.getByTestId('practice-feedback');
  const attentionFeedback = page.getByTestId('attention-feedback');
  const runner = page.getByTestId('trial-runner');
  const completed = page.getByText(COMPLETED_MESSAGE, { exact: true });
  const practiceIntro = page.getByTestId('info-page-practice');
  const blockIntro = page.getByTestId('info-page-main');
  const rest = page.getByTestId('info-page-rest');

  let trials = 0;
  let practiceTrials = 0;
  let rests = 0;
  let intros = 0;
  let gates = 0;
  let checks = 0;
  let missesShown = 0;
  const deadline = Date.now() + 110000;
  while (Date.now() < deadline) {
    if (await completed.isVisible()) {
      break;
    }
    if (await fullscreenGate.isVisible()) {
      await page.getByRole('button', { name: 'Return to full screen' }).click();
    } else if (await practiceIntro.isVisible()) {
      intros += 1;
      await expect(primary).toBeEnabled({ timeout: 5000 });
      await primary.click();
      await expect(practiceIntro).toBeHidden({ timeout: 10000 });
    } else if (await blockIntro.isVisible()) {
      intros += 1;
      await expect(primary).toBeEnabled({ timeout: 5000 });
      await primary.click();
      await expect(blockIntro).toBeHidden({ timeout: 10000 });
    } else if (await rest.isVisible()) {
      rests += 1;
      await page.getByRole('button', { name: 'Continue' }).click();
      await expect(rest).toBeHidden({ timeout: 10000 });
    } else if (await startGate.isVisible()) {
      gates += 1;
      await page.keyboard.press('f');
      await expect(startGate).toBeHidden({ timeout: 10000 });
    } else if (await prompt.isVisible()) {
      if (await runner.getAttribute('data-kind') === 'attention') {
        // the 30-item display is the correct one; miss the first check on purpose
        const n1 = Number(await page.getByTestId('layer-s1').getAttribute('data-n'));
        const n2 = Number(await page.getByTestId('layer-s2').getAttribute('data-n'));
        expect([n1, n2].sort((a, b) => a - b)).toEqual([5, 30]);
        const right = n1 > n2 ? 'f' : 'j';
        const wrong = right === 'f' ? 'j' : 'f';
        await page.keyboard.press(checks === 0 ? wrong : right);
        checks += 1;
        trials += 1;
        await prompt.waitFor({ state: 'hidden', timeout: 10000 });
        if (checks === 1) {
          await expect(attentionFeedback).toBeVisible();
          await expect(page.getByTestId('attention-lives-text')).toHaveText('3 more missed checks will end the study');
          // a key press at once is ignored; after 1.5 s one moves on, with no start gate
          await page.keyboard.press('k');
          await expect(attentionFeedback).toBeVisible();
          await page.waitForTimeout(1700);
          await page.keyboard.press('k');
          await expect(attentionFeedback).toBeHidden({ timeout: 5000 });
          missesShown += 1;
        } else {
          await expect(attentionFeedback).toBeHidden();
        }
        // eslint-disable-next-line no-continue
        continue;
      }
      await page.keyboard.press(trials % 2 === 0 ? 'f' : 'ArrowRight');
      trials += 1;
      await prompt.waitFor({ state: 'hidden', timeout: 10000 });
      if (await feedback.isVisible()) {
        // practice: the feedback is part of the trial and goes away by itself (Enter is ignored)
        practiceTrials += 1;
        await page.keyboard.press('Enter');
        await feedback.waitFor({ state: 'hidden', timeout: 10000 });
      }
    } else {
      await page.waitForTimeout(50);
    }
  }

  await waitForStudyEndMessage(page);
  // three practice trials plus the shortened cell (8 staircase trials and 2 attention checks, after
  // staircase trials 3 and 6), with its two intro pages and rests after every 4 main-block trials
  expect(practiceTrials).toBe(3);
  expect(checks).toBe(2);
  expect(rests).toBe(2);
  expect(missesShown).toBe(1);
  expect(trials).toBe(3 + 8 + checks);
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
  expect(['practice', 'above', 'below', 'attention']).toContain(first.trialData.staircaseId);
  const attention = stored.filter((trial) => trial.trialData.staircaseId === 'attention');
  expect(attention).toHaveLength(checks);
  attention.forEach((trial, i) => {
    expect(trial.trialData.nA).toBe(5);
    expect(trial.trialData.nB).toBe(30);
    expect(trial.trialData.correct).toBe(i > 0);
    expect(trial.trialData.correct).toBe(trial.trial === trial.correctAnswer[0].answer);
  });
  // the running miss count: 0 before the first check, 1 from it on
  stored.filter((trial) => trial.trialData.staircaseId !== 'practice').forEach((trial) => {
    expect([0, 1]).toContain(trial.trialData.attentionMisses);
  });
  expect(stored.filter((t) => t.trialData.staircaseId === 'catch')).toHaveLength(0);

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
      // practice answers are graded in the trial for the in-stream feedback, not by Check Answer
      expect(trial.checkAnswer).toBeUndefined();
      expect(trial.trialData.correct).toBe(trial.trial === trial.correctAnswer[0].answer);
      expect(Math.abs((trial.trialData.feedbackShownMs ?? 0) - 1500)).toBeLessThan(250);
    } else if (trial.trialData.staircaseId !== 'attention') {
      expect(trial.trialData.correct).toBeUndefined();
    }

    expect(Math.abs(trial.trialData.measured.s1 - 200)).toBeLessThanOrEqual(tolerance);
    expect(Math.abs(trial.trialData.measured.mask - 150)).toBeLessThanOrEqual(tolerance);
    expect(Math.abs(trial.trialData.measured.s2 - 200)).toBeLessThanOrEqual(tolerance);
    // the second mask after the second display, then a 250 ms blank; this test answers at the prompt
    expect(Math.abs(trial.trialData.measured.mask2 - 150)).toBeLessThanOrEqual(tolerance);
    expect(Math.abs(trial.trialData.measured.blank2 - 250)).toBeLessThanOrEqual(tolerance);
    expect(trial.trialData.respondedDuring).toBe('prompt');
    expect(trial.trialData.rtFromS2OffsetMs).toBeGreaterThan(trial.trialData.rtMs);
  });
});
