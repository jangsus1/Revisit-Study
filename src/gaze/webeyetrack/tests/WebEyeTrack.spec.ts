import * as tf from '@tensorflow/tfjs';
import {
  afterAll, beforeAll, beforeEach, describe, expect, test, vi,
} from 'vitest';
import { WebEyeTrack } from '../WebEyeTrack';
import type { CalibrationPoint, FrameFeatures } from '../WebEyeTrack';

const mocks = vi.hoisted(() => ({
  detect: vi.fn(),
  close: vi.fn(),
  load: vi.fn(async () => undefined),
  ear: 0.3,
  weights: null as unknown as { variable: import('@tensorflow/tfjs').Variable },
}));

vi.mock('@mediapipe/tasks-vision', () => ({
  FaceLandmarker: { createFromOptions: vi.fn(async () => ({ detect: mocks.detect, close: mocks.close })) },
}));

vi.mock('../BlazeGaze', () => ({
  BlazeGaze: vi.fn(class MockBlazeGaze {
    load = mocks.load;

    dispose = vi.fn();

    // Gaze from the head vector through a trainable 3 x 2 map.
    predict = (_eyes: tf.Tensor, head: tf.Tensor) => tf.matMul(head, mocks.weights.variable);
  }),
}));

vi.mock('../geometry', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../geometry')>()),
  estimateFaceWidthCm: () => 14,
  reconstructFace: () => [[0, 0, 60]],
  faceOrigin: () => [1, 2, 55],
  headVector: () => [0.1, 0.2, -1],
  extractEyePatch: () => ({ width: 2, height: 1, data: new Uint8Array(8) }),
  eyeAspectRatio: () => mocks.ear,
}));

const landmarks = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
const transform = { rows: 4, columns: 4, data: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] };
const frame = { width: 640, height: 480 } as ImageData;

function features(head: [number, number, number]): FrameFeatures {
  return { eyePatch: { width: 2, height: 1, data: new Uint8Array(8) } as unknown as ImageData, headVector: head, faceOrigin: [0, 0, 60] };
}

function point(x: number, y: number): CalibrationPoint {
  return { target: [x, y], frames: [features([x, y, -1]), features([x + 0.01, y, -1])] };
}

beforeAll(async () => {
  await tf.setBackend('cpu');
  mocks.weights = { variable: tf.variable(tf.tensor2d([[1, 0], [0, 1], [0, 0]])) };
});

afterAll(() => {
  mocks.weights.variable.dispose();
});

beforeEach(() => {
  mocks.detect.mockReset();
  mocks.ear = 0.3;
});

async function tracker(maxPoints = 25) {
  const t = new WebEyeTrack(maxPoints);
  await t.initialize('model.json', { wasmLoaderPath: 'l', wasmBinaryPath: 'b' });
  return t;
}

describe('WebEyeTrack.step', () => {
  test('reports no face when MediaPipe finds none', async () => {
    mocks.detect.mockReturnValue({ faceLandmarks: [], facialTransformationMatrixes: [] });
    const r = (await tracker()).step(frame);
    expect(r).toEqual({
      face: false, eyesOpen: false, gaze: null, rawGaze: null, features: null,
    });
  });

  test('returns features but no gaze when the eyes are closed', async () => {
    mocks.detect.mockReturnValue({ faceLandmarks: [landmarks], facialTransformationMatrixes: [transform] });
    mocks.ear = 0.1;
    const r = (await tracker()).step(frame);
    expect(r.face).toBe(true);
    expect(r.eyesOpen).toBe(false);
    expect(r.gaze).toBeNull();
    expect(r.features?.faceOrigin).toEqual([1, 2, 55]);
  });

  test('estimates gaze for open eyes', async () => {
    mocks.detect.mockReturnValue({ faceLandmarks: [landmarks], facialTransformationMatrixes: [transform] });
    const r = (await tracker()).step(frame);
    expect(r.eyesOpen).toBe(true);
    expect(r.rawGaze?.[0]).toBeCloseTo(0.1);
    expect(r.rawGaze?.[1]).toBeCloseTo(0.2);
    expect(r.gaze).toHaveLength(2);
  });
});

describe('WebEyeTrack.adapt', () => {
  test('fits the affine correction only once four distinct targets are known', async () => {
    const t = await tracker();
    await t.adapt([point(-0.3, -0.3), point(0.3, -0.3), point(0, 0)]);
    expect(t.calibrated).toBe(false);
    await t.adapt([point(0.3, 0.3)]);
    expect(t.calibrated).toBe(true);
  });

  test('ignores points without frames', async () => {
    const t = await tracker();
    await t.adapt([-0.3, -0.1, 0.1, 0.3].map((x) => ({ target: [x, x] as [number, number], frames: [] })));
    expect(t.calibrated).toBe(false);
  });

  test('keeps at most maxPoints calibration points', async () => {
    const t = await tracker(4);
    const before = tf.memory().numTensors;
    await t.adapt([point(-0.3, -0.3), point(0.3, -0.3), point(0, 0), point(0.3, 0.3)]);
    const atCap = tf.memory().numTensors;
    await t.adapt([point(-0.2, 0.2), point(0.2, 0.2)]);
    expect(tf.memory().numTensors).toBe(atCap);
    expect(atCap).toBeGreaterThan(before);
  });

  test('reset forgets the calibration and reloads the model', async () => {
    const t = await tracker();
    await t.adapt([point(-0.3, -0.3), point(0.3, -0.3), point(0, 0), point(0.3, 0.3)]);
    await t.reset();
    expect(t.calibrated).toBe(false);
    expect(mocks.load).toHaveBeenLastCalledWith('model.json');
  });
});
