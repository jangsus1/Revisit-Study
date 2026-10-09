import { describe, expect, test } from 'vitest';
import {
  DEFAULT_ATTENTION_CONFIG, attentionDue, countAttention, drawAttentionGaps, isRejected, livesMessage, missesLeft,
} from '../attention';

describe('drawAttentionGaps', () => {
  test('ten gaps, each a whole number from 10 to 20', () => {
    expect(DEFAULT_ATTENTION_CONFIG).toMatchObject({
      gapMin: 10, gapMax: 20, maxChecks: 10, maxMisses: 3, few: 5, many: 30,
    });
    const seen = new Set<number>();
    for (let salt = 0; salt < 200; salt += 1) {
      const gaps = drawAttentionGaps(salt, 'cell-color-sparse');
      expect(gaps).toHaveLength(10);
      gaps.forEach((g) => {
        expect(Number.isInteger(g)).toBe(true);
        expect(g).toBeGreaterThanOrEqual(10);
        expect(g).toBeLessThanOrEqual(20);
        seen.add(g);
      });
    }
    // every value in the range occurs
    expect(seen.size).toBe(11);
  });

  test('is deterministic per session and cell, and differs between them', () => {
    expect(drawAttentionGaps(7, 'cell-a')).toEqual(drawAttentionGaps(7, 'cell-a'));
    expect(drawAttentionGaps(7, 'cell-a')).not.toEqual(drawAttentionGaps(8, 'cell-a'));
    expect(drawAttentionGaps(7, 'cell-a')).not.toEqual(drawAttentionGaps(7, 'cell-b'));
  });

  test('honours a config override of the range and the count', () => {
    const gaps = drawAttentionGaps(3, 'x', {
      ...DEFAULT_ATTENTION_CONFIG, gapMin: 2, gapMax: 3, maxChecks: 4,
    });
    expect(gaps).toHaveLength(4);
    gaps.forEach((g) => expect([2, 3]).toContain(g));
  });
});

describe('attentionDue', () => {
  const gaps = [12, 10, 20];
  test('a check is due once the cumulative gap has run, one at a time, at most one per gap', () => {
    expect(attentionDue(11, 0, gaps)).toBe(false);
    expect(attentionDue(12, 0, gaps)).toBe(true);
    expect(attentionDue(12, 1, gaps)).toBe(false);
    expect(attentionDue(21, 1, gaps)).toBe(false);
    expect(attentionDue(22, 1, gaps)).toBe(true);
    expect(attentionDue(42, 2, gaps)).toBe(true);
    // no more than there are gaps
    expect(attentionDue(500, 3, gaps)).toBe(false);
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
