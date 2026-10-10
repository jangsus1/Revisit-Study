import { describe, expect, test } from 'vitest';
import {
  DEFAULT_REFRESH_LIMITS, JUDGED_PHASES, OFF_TARGET_MS, countOffTarget, displayTestOutcome, displayTestRejectionReason,
  offTargetPhases, practiceRejectionReason, refreshEndsSession, refreshNeedsRemeasure, refreshRejectionReason,
} from '../timingGuard';

const EXACT = {
  fixation: 500, s1: 200, mask: 150, blank: 250, s2: 200, mask2: 150, blank2: 250,
};

describe('refresh guard', () => {
  test('60 to 300 Hz needs nothing; below 50 Hz or above 300 Hz is re-measured', () => {
    [1000 / 60, 1000 / 120, 1000 / 144, 1000 / 240, 1000 / 50].forEach((ms) => expect(refreshNeedsRemeasure(ms)).toBe(false));
    [1000 / 49, 1000 / 30, 1000 / 20, 1000 / 301, 0, Number.NaN].forEach((ms) => expect(refreshNeedsRemeasure(ms)).toBe(true));
  });
  test('a re-measured estimate ends the session only below 25 Hz or above 300 Hz', () => {
    [1000 / 25, 1000 / 30, 1000 / 32, 1000 / 49, 1000 / 300].forEach((ms) => expect(refreshEndsSession(ms)).toBe(false));
    [1000 / 20, 1000 / 24, 1000 / 301, 2, 0].forEach((ms) => expect(refreshEndsSession(ms)).toBe(true));
  });
  test('limits are configurable', () => {
    const off = { ...DEFAULT_REFRESH_LIMITS, endBelowHz: 1, endAboveHz: 100000 };
    expect(refreshEndsSession(1000 / 20, off)).toBe(false);
    expect(refreshEndsSession(2, off)).toBe(false);
  });
  test('reason names the rate', () => {
    expect(refreshRejectionReason(50)).toBe('Display timing: refresh 20 Hz');
    expect(refreshRejectionReason(1000 / 119.6)).toBe('Display timing: refresh 120 Hz');
  });
});

describe('off-target rule', () => {
  test('judges only the exposures and the masks, within 25 ms', () => {
    expect(JUDGED_PHASES).toEqual(['s1', 'mask', 's2', 'mask2']);
    expect(OFF_TARGET_MS).toBe(25);
    expect(offTargetPhases(EXACT)).toEqual([]);
    // fixation and blanks never count (pilot: fixation +100 ms with exact stimuli)
    expect(offTargetPhases({
      ...EXACT, fixation: 600, blank: 150, blank2: 100,
    })).toEqual([]);
    expect(offTargetPhases({ ...EXACT, s1: 225 })).toEqual([]);
    expect(offTargetPhases({ ...EXACT, s1: 225.1 })).toEqual(['s1']);
  });
  test('passes the pilot\'s acceptable sessions and fails the doubled and halved ones', () => {
    // 30 / 32 Hz: 12 to 17 ms off on s1 and mask; 67 Hz: +17 ms on every phase
    expect(offTargetPhases({ ...EXACT, s1: 216.7, mask: 166.7 })).toEqual([]);
    expect(offTargetPhases({
      fixation: 517, s1: 217, mask: 167, blank: 267, s2: 217, mask2: 167, blank2: 267,
    })).toEqual([]);
    // 119 Hz estimate on a 60 Hz display: every phase doubled
    expect(offTargetPhases({
      fixation: 1000, s1: 400, mask: 300, blank: 500, s2: 400, mask2: 300, blank2: 500,
    })).toEqual(['s1', 'mask', 's2', 'mask2']);
    // 20 Hz: every phase halved
    expect(offTargetPhases({
      fixation: 250, s1: 100, mask: 100, blank: 150, s2: 100, mask2: 100, blank2: 150,
    })).toEqual(['s1', 'mask', 's2', 'mask2']);
  });
  test('mask2 cut short by an early answer is not judged, nor are missing phases', () => {
    expect(offTargetPhases({ ...EXACT, mask2: 40, blank2: 0 }, 'mask2')).toEqual([]);
    expect(offTargetPhases({ ...EXACT, mask2: 40 }, 'prompt')).toEqual(['mask2']);
    expect(offTargetPhases({ s1: 200, mask: 150, s2: 200 })).toEqual([]);
    expect(offTargetPhases(undefined)).toEqual([]);
  });
  test('counts off-target trials', () => {
    expect(countOffTarget([{ measured: EXACT }, { measured: { ...EXACT, s2: 260 } }, { measured: { ...EXACT, mask: 100 } }])).toBe(2);
  });
});

describe('display-test rule', () => {
  test('pass, repeat once, then fail', () => {
    expect(displayTestOutcome([0])).toBe('pass');
    expect(displayTestOutcome([1])).toBe('pass');
    expect(displayTestOutcome([2])).toBe('repeat');
    expect(displayTestOutcome([3])).toBe('repeat');
    expect(displayTestOutcome([2, 1])).toBe('pass');
    expect(displayTestOutcome([3, 2])).toBe('fail');
    expect(displayTestOutcome([3, 3], 3)).toBe('pass');
  });
  test('reasons', () => {
    expect(displayTestRejectionReason(2)).toBe('Display timing: 2 of 3 test trials off target');
    expect(practiceRejectionReason(2, 3)).toBe('Display timing: 2 of 3 practice trials off target');
  });
});
