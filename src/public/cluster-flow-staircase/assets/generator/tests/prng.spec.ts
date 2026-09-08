import { describe, expect, test } from 'vitest';
import {
  jitterRng, mulberry32, randi, randperm, rnd, uj,
} from '../prng';

describe('mulberry32', () => {
  test('is deterministic and stays in [0, 1)', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 1000; i += 1) {
      const v = a();
      expect(v).toBe(b());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  test('different seeds give different streams', () => {
    const a = Array.from({ length: 10 }, mulberry32(1));
    const b = Array.from({ length: 10 }, mulberry32(2));
    expect(a).not.toEqual(b);
  });

  test('handles the full 32-bit seed range', () => {
    const v = mulberry32(4294967295)();
    expect(Number.isFinite(v)).toBe(true);
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThan(1);
  });

  test('is roughly uniform', () => {
    const r = mulberry32(9);
    const bins = new Array(10).fill(0);
    for (let i = 0; i < 100000; i += 1) bins[Math.floor(r() * 10)] += 1;
    bins.forEach((count) => {
      expect(count).toBeGreaterThan(9000);
      expect(count).toBeLessThan(11000);
    });
  });
});

describe('helpers', () => {
  test('rnd forwards the stream', () => {
    const r = mulberry32(3);
    const s = mulberry32(3);
    expect(rnd(r)).toBe(s());
  });

  test('randi returns 1..n and covers every value', () => {
    const r = mulberry32(5);
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i += 1) {
      const v = randi(r, 6);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(6);
      expect(Number.isInteger(v)).toBe(true);
      seen.add(v);
    }
    expect(seen.size).toBe(6);
  });

  test('randperm returns a 0-indexed permutation', () => {
    const r = mulberry32(11);
    for (let i = 0; i < 200; i += 1) {
      const p = randperm(r, 7);
      expect([...p].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    }
    expect(randperm(r, 0)).toEqual([]);
  });

  test('randperm actually shuffles', () => {
    const r = mulberry32(13);
    const identity = [0, 1, 2, 3, 4, 5];
    const shuffled = Array.from({ length: 50 }, () => randperm(r, 6));
    expect(shuffled.some((p) => p.join() !== identity.join())).toBe(true);
  });

  test('uj stays inside [-r, r]', () => {
    const r = mulberry32(17);
    for (let i = 0; i < 1000; i += 1) {
      const v = uj(r, 15);
      expect(v).toBeGreaterThanOrEqual(-15);
      expect(v).toBeLessThanOrEqual(15);
    }
  });
});

describe('jitterRng', () => {
  test('is a separate, deterministic stream', () => {
    expect(jitterRng(5)()).toBe(jitterRng(5)());
    expect(jitterRng(5)()).not.toBe(mulberry32(5)());
    expect(jitterRng(5)()).not.toBe(jitterRng(6)());
  });

  test('stays exact for large 32-bit seeds', () => {
    const v = jitterRng(4000000000)();
    expect(Number.isFinite(v)).toBe(true);
    expect(jitterRng(4000000000)()).toBe(v);
    expect(jitterRng(4000000001)()).not.toBe(v);
  });
});
