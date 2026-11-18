import { describe, expect, test } from 'vitest';
import { KalmanFilter2D } from '../KalmanFilter2D';

describe('KalmanFilter2D', () => {
  test('converges to a constant measurement', () => {
    const filter = new KalmanFilter2D(1, 2e-3, 1e-2);
    let out: [number, number] = [0, 0];
    for (let i = 0; i < 50; i += 1) out = filter.step([0.2, -0.1]);
    expect(out[0]).toBeCloseTo(0.2, 3);
    expect(out[1]).toBeCloseTo(-0.1, 3);
  });

  test('smooths a single outlier', () => {
    const filter = new KalmanFilter2D(1, 2e-3, 1e-2);
    for (let i = 0; i < 30; i += 1) filter.step([0, 0]);
    const [x] = filter.step([0.4, 0]);
    expect(x).toBeGreaterThan(0);
    expect(x).toBeLessThan(0.4);
  });
});
