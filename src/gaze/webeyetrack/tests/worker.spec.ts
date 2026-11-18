import {
  beforeEach, describe, expect, test, vi,
} from 'vitest';
import type { FromWorker, ToWorker } from '../protocol';
import '../worker';

const mocks = vi.hoisted(() => {
  const posted: unknown[] = [];
  (globalThis as unknown as { postMessage: (m: unknown) => void }).postMessage = (m: unknown) => { posted.push(m); };
  return {
    posted,
    initialize: vi.fn(async () => undefined),
    step: vi.fn(),
    adapt: vi.fn(async () => undefined),
    reset: vi.fn(async () => undefined),
    calibrated: true,
  };
});

vi.mock('@mediapipe/tasks-vision/vision_wasm_module_internal.js?url', () => ({ default: 'loader.js' }));
vi.mock('@mediapipe/tasks-vision/vision_wasm_module_internal.wasm?url', () => ({ default: 'binary.wasm' }));
vi.mock('../WebEyeTrack', () => ({
  WebEyeTrack: vi.fn(class MockWebEyeTrack {
    initialize = mocks.initialize;

    step = mocks.step;

    adapt = mocks.adapt;

    reset = mocks.reset;

    get calibrated() { return mocks.calibrated; }
  }),
}));

const scope = globalThis as unknown as { onmessage: (event: { data: ToWorker }) => void };
const features = (n: number) => ({ eyePatch: { n }, headVector: [0, 0, -1], faceOrigin: [0, 0, 60] });
const flush = () => new Promise((resolve) => { setTimeout(resolve, 0); });

async function send(message: ToWorker): Promise<FromWorker[]> {
  const start = mocks.posted.length;
  scope.onmessage({ data: message });
  await flush();
  return mocks.posted.slice(start) as FromWorker[];
}

const frame = () => send({ type: 'frame', frame: {} as ImageData, t: 5 });

describe('gaze worker', () => {
  beforeEach(() => {
    mocks.step.mockReset();
  });

  test('initializes the tracker with the bundled MediaPipe files', async () => {
    expect(await send({ type: 'init', modelUrl: 'model.json' })).toEqual([{ type: 'ready' }]);
    expect(mocks.initialize).toHaveBeenCalledWith('model.json', { wasmLoaderPath: 'loader.js', wasmBinaryPath: 'binary.wasm' });
  });

  test('posts an estimate in viewport coordinates for each frame', async () => {
    mocks.step.mockReturnValue({
      face: true, eyesOpen: true, gaze: [0.1, -0.2], rawGaze: [0.2, -0.1], features: features(0),
    });
    const [estimate, done] = await frame();
    expect(estimate).toEqual({
      type: 'estimate',
      estimate: {
        t: 5, x: 0.6, y: 0.3, rawX: 0.7, rawY: 0.4, face: true, eyesOpen: true, faceOrigin: [0, 0, 60],
      },
    });
    expect(done).toEqual({ type: 'frameDone' });
  });

  test('reports a frame without gaze as null coordinates', async () => {
    mocks.step.mockReturnValue({
      face: false, eyesOpen: false, gaze: null, rawGaze: null, features: null,
    });
    const [estimate] = await frame();
    expect(estimate).toMatchObject({ estimate: { x: null, y: null, face: false } });
  });

  test('still releases the frame when processing throws', async () => {
    mocks.step.mockImplementation(() => { throw new Error('bad frame'); });
    expect(await frame()).toEqual([{ type: 'frameDone' }]);
  });

  test('keeps the last open-eye frames of a calibration point and fits them in order', async () => {
    await send({
      type: 'request', id: 1, op: 'startPoint', x: 0.25, y: 0.75,
    });
    for (let i = 0; i < 12; i += 1) {
      mocks.step.mockReturnValueOnce({
        face: true, eyesOpen: i !== 3, gaze: [0, 0], rawGaze: [0, 0], features: features(i),
      });
      // eslint-disable-next-line no-await-in-loop
      await frame();
    }
    const [kept] = await send({ type: 'request', id: 2, op: 'endPoint' });
    expect(kept).toEqual({ type: 'response', id: 2, result: 10 });

    const [fitted] = await send({ type: 'request', id: 3, op: 'fit' });
    expect(fitted).toEqual({ type: 'response', id: 3, result: true });
    const [points] = mocks.adapt.mock.calls[0] as unknown as [{ target: number[]; frames: { eyePatch: { n: number } }[] }[]];
    expect(points).toHaveLength(1);
    expect(points[0].target).toEqual([-0.25, 0.25]);
    expect(points[0].frames.map((f) => f.eyePatch.n)).toEqual([1, 2, 4, 5, 6, 7, 8, 9, 10, 11]);
  });

  test('reports a failed fit as an error response', async () => {
    mocks.adapt.mockRejectedValueOnce(new Error('singular matrix'));
    const [response] = await send({ type: 'request', id: 4, op: 'fit' });
    expect(response).toEqual({ type: 'response', id: 4, error: 'singular matrix' });
  });

  test('reset discards collected points', async () => {
    await send({
      type: 'request', id: 5, op: 'startPoint', x: 0.5, y: 0.5,
    });
    await send({ type: 'request', id: 6, op: 'reset' });
    expect(mocks.reset).toHaveBeenCalled();
    const [kept] = await send({ type: 'request', id: 7, op: 'endPoint' });
    expect(kept).toEqual({ type: 'response', id: 7, result: 0 });
  });
});
