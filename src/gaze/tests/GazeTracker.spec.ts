import {
  afterEach, beforeEach, describe, expect, test, vi,
} from 'vitest';
import { GazeTracker } from '../GazeTracker';
import type { GazeEngine, GazeEstimate } from '../types';

function fakeEngine() {
  const engine = {
    onEstimate: (_e: GazeEstimate) => {},
    start: vi.fn(async () => undefined),
    startCalibrationPoint: vi.fn(async () => undefined),
    endCalibrationPoint: vi.fn(async () => 10),
    fit: vi.fn(async () => undefined),
    resetCalibration: vi.fn(async () => undefined),
    isCalibrated: vi.fn(() => true),
    dispose: vi.fn(),
  };
  return engine satisfies GazeEngine;
}

const stream = {} as MediaStream;

beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  vi.stubGlobal('innerWidth', 1000);
  vi.stubGlobal('innerHeight', 500);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('GazeTracker', () => {
  test('starts the engine on a hidden video of the stream', async () => {
    const engine = fakeEngine();
    const tracker = new GazeTracker(() => engine);
    await tracker.start(stream);
    const video = document.querySelector('video')!;
    expect(video.srcObject).toBe(stream);
    expect(video.muted).toBe(true);
    expect(engine.start).toHaveBeenCalledWith(video);
    expect(tracker.state).toBe('ready');
  });

  test('reuses the running engine for the same stream', async () => {
    const create = vi.fn(fakeEngine);
    const tracker = new GazeTracker(create);
    await tracker.start(stream);
    await tracker.start(stream);
    expect(create).toHaveBeenCalledTimes(1);
  });

  test('delivers estimates in viewport pixels', async () => {
    const engine = fakeEngine();
    const tracker = new GazeTracker(() => engine);
    const listener = vi.fn();
    tracker.subscribe(listener);
    await tracker.start(stream);
    engine.onEstimate({
      t: 3, x: 0.5, y: 0.2, rawX: 0.1, rawY: null, face: true, eyesOpen: true, faceOrigin: [0, 0, 60],
    });
    expect(listener).toHaveBeenCalledWith({
      t: 3, x: 500, y: 100, rawX: 100, rawY: null, face: true, eyesOpen: true, faceOrigin: [0, 0, 60],
    });
  });

  test('stops delivering estimates to an unsubscribed listener', async () => {
    const engine = fakeEngine();
    const tracker = new GazeTracker(() => engine);
    const listener = vi.fn();
    const unsubscribe = tracker.subscribe(listener);
    await tracker.start(stream);
    unsubscribe();
    engine.onEstimate({
      t: 0, x: 0, y: 0, rawX: 0, rawY: 0, face: true, eyesOpen: true, faceOrigin: null,
    });
    expect(listener).not.toHaveBeenCalled();
  });

  test('passes calibration targets to the engine as viewport fractions', async () => {
    const engine = fakeEngine();
    const tracker = new GazeTracker(() => engine);
    await tracker.start(stream);
    await tracker.startCalibrationPoint(250, 400);
    expect(engine.startCalibrationPoint).toHaveBeenCalledWith(0.25, 0.8);
    await expect(tracker.endCalibrationPoint()).resolves.toBe(10);
    await tracker.fit();
    expect(tracker.isCalibrated()).toBe(true);
  });

  test('rejects calibration before tracking has started', () => {
    const tracker = new GazeTracker(fakeEngine);
    expect(() => tracker.startCalibrationPoint(0, 0)).toThrow('not running');
    expect(tracker.isCalibrated()).toBe(false);
  });

  test('records the error when the engine fails to start', async () => {
    const engine = fakeEngine();
    engine.start.mockRejectedValueOnce(new Error('model failed'));
    const tracker = new GazeTracker(() => engine);
    await expect(tracker.start(stream)).rejects.toThrow('model failed');
    expect(tracker.state).toBe('error');
    expect(tracker.error).toBe('model failed');
    expect(engine.dispose).toHaveBeenCalled();
    expect(document.querySelector('video')).toBeNull();
  });

  test('stop disposes the engine and removes the video', async () => {
    const engine = fakeEngine();
    const tracker = new GazeTracker(() => engine);
    const onState = vi.fn();
    tracker.onStateChange(onState);
    await tracker.start(stream);
    tracker.stop();
    expect(engine.dispose).toHaveBeenCalled();
    expect(document.querySelector('video')).toBeNull();
    expect(tracker.state).toBe('idle');
    expect(onState).toHaveBeenCalledTimes(3);
  });

  test('a stop during startup leaves no engine running', async () => {
    let resolvePlay: () => void = () => {};
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockReturnValue(new Promise((r) => { resolvePlay = () => r(undefined); }));
    const create = vi.fn(fakeEngine);
    const tracker = new GazeTracker(create);
    const started = tracker.start(stream);
    tracker.stop();
    resolvePlay();
    await started;
    expect(create).not.toHaveBeenCalled();
    expect(tracker.state).toBe('idle');
  });
});
