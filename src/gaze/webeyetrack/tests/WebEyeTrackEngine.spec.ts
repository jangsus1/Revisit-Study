import {
  afterEach, beforeEach, describe, expect, test, vi,
} from 'vitest';
import { WebEyeTrackEngine } from '../WebEyeTrackEngine';
import type { FromWorker } from '../protocol';

const sourceStart = vi.fn();
const sourceStop = vi.fn();
const capture = vi.fn(() => ({ data: { buffer: new ArrayBuffer(4) } }));

vi.mock('../../VideoFrameSource', () => ({
  VideoFrameSource: vi.fn(class MockVideoFrameSource {
    start = sourceStart;

    stop = sourceStop;

    capture = capture;
  }),
}));

class FakeWorker {
  static last: FakeWorker;

  posted: unknown[] = [];

  onmessage: ((event: MessageEvent<FromWorker>) => void) | null = null;

  onerror: ((event: ErrorEvent) => void) | null = null;

  terminate = vi.fn();

  constructor() {
    FakeWorker.last = this;
  }

  postMessage(message: unknown) {
    this.posted.push(message);
  }

  reply(message: FromWorker) {
    this.onmessage?.({ data: message } as MessageEvent<FromWorker>);
  }
}

const flush = () => new Promise((resolve) => { setTimeout(resolve, 0); });

beforeEach(() => {
  vi.stubGlobal('Worker', FakeWorker);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('WebEyeTrackEngine', () => {
  test('initializes the worker with the model URL', () => {
    const engine = new WebEyeTrackEngine('https://host/model.json');
    expect(FakeWorker.last.posted[0]).toEqual({ type: 'init', modelUrl: 'https://host/model.json' });
    engine.dispose();
  });

  test('sends a frame only while the worker is idle', async () => {
    const engine = new WebEyeTrackEngine('m');
    const worker = FakeWorker.last;
    worker.reply({ type: 'ready' });
    await engine.start({} as HTMLVideoElement);
    const onFrame = sourceStart.mock.calls[0][0] as () => void;

    onFrame();
    onFrame();
    expect(worker.posted.filter((m) => (m as { type: string }).type === 'frame')).toHaveLength(1);

    worker.reply({ type: 'frameDone' });
    onFrame();
    expect(worker.posted.filter((m) => (m as { type: string }).type === 'frame')).toHaveLength(2);
    engine.dispose();
  });

  test('forwards estimates', () => {
    const engine = new WebEyeTrackEngine('m');
    const onEstimate = vi.fn();
    engine.onEstimate = onEstimate;
    const estimate = {
      t: 1, x: 0.5, y: 0.5, rawX: 0.5, rawY: 0.5, face: true, eyesOpen: true, faceOrigin: null,
    };
    FakeWorker.last.reply({ type: 'estimate', estimate });
    expect(onEstimate).toHaveBeenCalledWith(estimate);
    engine.dispose();
  });

  test('resolves calibration requests with the worker response', async () => {
    const engine = new WebEyeTrackEngine('m');
    const worker = FakeWorker.last;
    worker.reply({ type: 'ready' });

    const kept = engine.endCalibrationPoint();
    await flush();
    const request = worker.posted[1] as { id: number; op: string };
    expect(request.op).toBe('endPoint');
    worker.reply({ type: 'response', id: request.id, result: 10 });
    await expect(kept).resolves.toBe(10);

    const fit = engine.fit();
    await flush();
    worker.reply({ type: 'response', id: (worker.posted[2] as { id: number }).id, result: true });
    await fit;
    expect(engine.isCalibrated()).toBe(true);
    engine.dispose();
  });

  test('rejects a request the worker reports as failed', async () => {
    const engine = new WebEyeTrackEngine('m');
    const worker = FakeWorker.last;
    worker.reply({ type: 'ready' });
    const fit = engine.fit();
    await flush();
    worker.reply({ type: 'response', id: (worker.posted[1] as { id: number }).id, error: 'singular' });
    await expect(fit).rejects.toThrow('singular');
    expect(engine.isCalibrated()).toBe(false);
    engine.dispose();
  });

  test('start rejects when the worker fails to initialize', async () => {
    const engine = new WebEyeTrackEngine('m');
    FakeWorker.last.reply({ type: 'initError', message: 'no webgl' });
    await expect(engine.start({} as HTMLVideoElement)).rejects.toThrow('no webgl');
    engine.dispose();
  });

  test('dispose stops frames, terminates the worker and rejects pending requests', async () => {
    const engine = new WebEyeTrackEngine('m');
    const worker = FakeWorker.last;
    worker.reply({ type: 'ready' });
    await engine.start({} as HTMLVideoElement);
    const pending = engine.endCalibrationPoint();
    await flush();
    engine.dispose();
    await expect(pending).rejects.toThrow('disposed');
    expect(sourceStop).toHaveBeenCalled();
    expect(worker.terminate).toHaveBeenCalled();
  });
});
