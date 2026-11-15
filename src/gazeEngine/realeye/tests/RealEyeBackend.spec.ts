import { describe, expect, test } from 'vitest';
import RealEyeBackend from '../RealEyeBackend';
import type WebcamClient from '../../webeyetrack/WebcamClient';
import { dot } from '../ridgeDual';

// Synthetic features: a fixed random linear map of the target plus noise, so ridge recovers the target and a
// model only sees the targets of the entries it was fitted on.
const P = 64;
function rng(seed: number) {
  let s = seed;
  return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296 - 0.5; };
}
const r = rng(7);
const A = Array.from({ length: P }, () => [r(), r(), r()]);
const feat = (x: number, y: number) => Float32Array.from(A.map(([a, b, c]) => a * x + b * y + c + 0.01 * r()));

type Internals = { entries: unknown[]; fit(): void; variants: { name: string; W: Float64Array[] }[]; W: Float64Array[] | null };

function backendWith(points: { x: number; y: number; tag: string }[]) {
  const be = new RealEyeBackend({} as unknown as WebcamClient);
  const internals = be as unknown as Internals;
  internals.entries = points.map((p) => ({
    frames: Array.from({ length: 6 }, () => ({ rows: [feat(p.x, p.y)], target: [p.x, p.y] })),
    key: [p.x, p.y],
    ptType: 'calib',
    ts: 0,
    tag: p.tag,
  }));
  internals.fit();
  return { be, internals };
}

const grid = [-0.4, 0, 0.4].flatMap((y) => [-0.4, 0, 0.4].map((x) => ({ x, y, tag: 'grid' })));
const aoi = [[-0.25, 0], [-0.1, -0.15], [0.1, -0.15], [0.1, 0.15], [-0.1, 0.15], [0, 0.3]].map(([x, y]) => ({ x, y, tag: 'aoi' }));
const ctrl = [-0.25, 0, 0.25].flatMap((y) => [{ x: -0.45, y, tag: 'ctrl' }, { x: 0.45, y, tag: 'ctrl' }]);

describe('RealEyeBackend.fitVariants', () => {
  test('fits one model per tag subset, keeps the main model, and survives get/setState', async () => {
    const { be, internals } = backendWith([...grid, ...aoi, ...ctrl]);
    const mainW = internals.W;
    expect(mainW).not.toBeNull();
    const out = await be.fitVariants({ grid: ['grid'], aoi: ['grid', 'aoi'], ctrl: ['grid', 'ctrl'] });
    expect(out.map((o) => [o.name, o.entries, o.fitted])).toEqual([['grid', 9, true], ['aoi', 15, true], ['ctrl', 15, true]]);
    expect(internals.W).toBe(mainW);
    // each variant predicts a held-out point close to its target
    const f = feat(0.05, -0.05);
    internals.variants.forEach((v) => {
      expect(Math.abs(dot(v.W[0], f) - 0.05)).toBeLessThan(0.05);
      expect(Math.abs(dot(v.W[1], f) + 0.05)).toBeLessThan(0.05);
    });
    const st = be.getState();
    await be.resetCalib();
    expect(internals.variants).toHaveLength(0);
    be.setState(st);
    expect(internals.variants.map((v) => v.name)).toEqual(['grid', 'aoi', 'ctrl']);
  });

  test('a variant with fewer than 3 distinct targets is reported unfitted', async () => {
    const { be } = backendWith([...grid, { x: 0.2, y: 0.2, tag: 'aoi' }]);
    const out = await be.fitVariants({ only: ['aoi'] });
    expect(out[0]).toMatchObject({ name: 'only', entries: 1, fitted: false });
  });
});
