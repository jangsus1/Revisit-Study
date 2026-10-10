import { describe, expect, test } from 'vitest';
import {
  DEFAULT_ATTENTION_CONFIG, attentionDue, countAttention, isRejected, livesMessage, missesLeft,
} from '../attention';

describe('attentionDue', () => {
  test('defaults: one check after every 15 staircase trials, at most 10, 5 vs 30, 3 misses allowed', () => {
    expect(DEFAULT_ATTENTION_CONFIG).toEqual({
      every: 15, maxChecks: 10, maxMisses: 3, few: 5, many: 30,
    });
  });

  test('a check is due after 15, 30, 45 ... staircase trials, one at a time', () => {
    expect(attentionDue(14, 0)).toBe(false);
    expect(attentionDue(15, 0)).toBe(true);
    expect(attentionDue(15, 1)).toBe(false);
    expect(attentionDue(29, 1)).toBe(false);
    expect(attentionDue(30, 1)).toBe(true);
    expect(attentionDue(149, 9)).toBe(false);
    expect(attentionDue(150, 9)).toBe(true);
  });

  test('never more than maxChecks, whatever the block length', () => {
    expect(attentionDue(500, 10)).toBe(false);
    expect(attentionDue(10, 4, {
      ...DEFAULT_ATTENTION_CONFIG, every: 2, maxChecks: 5,
    })).toBe(true);
    expect(attentionDue(100, 5, {
      ...DEFAULT_ATTENTION_CONFIG, every: 2, maxChecks: 5,
    })).toBe(false);
    expect(attentionDue(100, 0, { ...DEFAULT_ATTENTION_CONFIG, every: 0 })).toBe(false);
  });
});

describe('misses and lives', () => {
  test('counts checks and misses from the stored trials only', () => {
    expect(countAttention([
      { staircaseId: 'above', correct: false },
      { staircaseId: 'attention', correct: true },
      { staircaseId: 'attention', correct: false },
      { staircaseId: 'catch', correct: false },
    ])).toEqual({ checks: 2, misses: 1 });
  });

  test('after the f-th miss, K = 4 - f more misses end the study', () => {
    expect([1, 2, 3].map((f) => missesLeft(f))).toEqual([3, 2, 1]);
    expect(livesMessage(1)).toBe('3 more missed checks will end the study');
    expect(livesMessage(2)).toBe('2 more missed checks will end the study');
    expect(livesMessage(3)).toBe('One more missed check will end the study');
  });

  test('the participant is rejected on the 4th miss, not before', () => {
    expect(isRejected(3)).toBe(false);
    expect(isRejected(4)).toBe(true);
    expect(isRejected(1, 0)).toBe(true);
  });
});
