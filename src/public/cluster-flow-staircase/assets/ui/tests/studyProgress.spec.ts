import { describe, expect, test } from 'vitest';
import {
  EXPECTED_MAIN_TRIALS, MAIN_BLOCK_MINUTES, SECONDS_PER_TRIAL, blockEstimate, pageSeconds, progressLabel, progressSummary,
} from '../studyProgress';

const FLAT = ['introduction', 'consent', 'setup', 'instructions', 'examples', 'practice-intro', 'practice-color-sparse',
  'block-intro', 'cell-color-sparse', 'demographics'];

describe('blockEstimate', () => {
  test('practice blocks are 3 trials by default, or their `trials`', () => {
    expect(blockEstimate('practice-color-sparse')?.steps).toBe(3);
    expect(blockEstimate('practice-color-sparse', { trials: 2 })?.steps).toBe(2);
    expect(blockEstimate('practice-intro')).toBeNull();
  });

  test('the main block is about 150 trials (7-8 min) plus its rest pages', () => {
    const main = blockEstimate('cell-edge-dense');
    expect(main?.steps).toBe(EXPECTED_MAIN_TRIALS + 2);
    expect(main?.seconds).toBeGreaterThanOrEqual(7 * 60);
    expect(main?.seconds).toBeLessThanOrEqual(8.5 * 60);
    expect(main?.seconds).toBeGreaterThanOrEqual(EXPECTED_MAIN_TRIALS * SECONDS_PER_TRIAL);
    // shortened test blocks are estimated from maxTrials
    expect(blockEstimate('cell-color-sparse', { maxTrials: 3 })?.steps).toBe(7);
  });

  test('pages have fixed weights and unknown pages 10 s', () => {
    expect(pageSeconds('consent')).toBe(150);
    expect(pageSeconds('examples')).toBe(50);
    expect(pageSeconds('end')).toBe(0);
    expect(pageSeconds('something-else')).toBe(10);
  });
});

describe('progressSummary', () => {
  test('starts at 0 and the whole session is about 15-16 minutes', () => {
    const p = progressSummary(FLAT, 0, null);
    expect(p?.fraction).toBe(0);
    expect(p?.minutesLeft).toBeGreaterThan(14);
    expect(p?.minutesLeft).toBeLessThan(17);
    // the main block is about 8 minutes
    expect(MAIN_BLOCK_MINUTES).toBe(8);
  });

  test('counts the pages before the current one', () => {
    const atInstructions = progressSummary(FLAT, 3, null);
    expect(atInstructions?.done).toBe(20 + 150 + 60);
  });

  test('moves through a dynamic block by its funcIndex, capped below the block end', () => {
    const start = progressSummary(FLAT, 8, 0)!;
    const half = progressSummary(FLAT, 8, 76)!;
    const over = progressSummary(FLAT, 8, 400)!;
    const after = progressSummary(FLAT, 9, null)!;
    expect(half.done).toBeGreaterThan(start.done);
    expect(half.done - start.done).toBeCloseTo(pageSeconds('cell-color-sparse') * 0.5, 0);
    expect(over.done).toBeLessThan(after.done);
  });

  test('uses block parameters when given', () => {
    const p = progressSummary(FLAT, 6, 1, (name) => (name.startsWith('practice-') ? { trials: 2 } : undefined))!;
    const before = progressSummary(FLAT, 6, null, (name) => (name.startsWith('practice-') ? { trials: 2 } : undefined))!;
    expect(p.done - before.done).toBeCloseTo(4.5, 5);
  });

  test('returns null for an empty sequence', () => {
    expect(progressSummary([], 0, null)).toBeNull();
  });
});

describe('progressLabel', () => {
  test('rounds the percentage and the minutes left', () => {
    expect(progressLabel({
      done: 50, total: 200, fraction: 0.25, minutesLeft: 2.5,
    })).toBe('25 % done · About 3 min left');
    expect(progressLabel({
      done: 190, total: 200, fraction: 0.95, minutesLeft: 0.2,
    })).toBe('95 % done · Almost done');
  });
});
