import wasmLoaderPath from '@mediapipe/tasks-vision/vision_wasm_module_internal.js?url';
import wasmBinaryPath from '@mediapipe/tasks-vision/vision_wasm_module_internal.wasm?url';
import { WebEyeTrack, type CalibrationPoint, type FrameFeatures } from './WebEyeTrack';
import type { FromWorker, ToWorker } from './protocol';

const FRAMES_PER_POINT = 10;
const MAX_BUFFERED_FRAMES = 40;

const scope = globalThis as unknown as {
  postMessage: (message: FromWorker) => void;
  onmessage: ((event: MessageEvent<ToWorker>) => void) | null;
};

const tracker = new WebEyeTrack();
let ready = false;
let collecting: { target: [number, number]; frames: FrameFeatures[] } | null = null;
let pending: CalibrationPoint[] = [];

const post = (message: FromWorker) => scope.postMessage(message);

async function handle(message: ToWorker): Promise<void> {
  if (message.type === 'init') {
    try {
      await tracker.initialize(message.modelUrl, { wasmLoaderPath, wasmBinaryPath });
      ready = true;
      post({ type: 'ready' });
    } catch (err) {
      post({ type: 'initError', message: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  if (message.type === 'frame') {
    try {
      if (!ready) return;
      const r = tracker.step(message.frame);
      if (collecting && r.features && r.eyesOpen) {
        collecting.frames.push(r.features);
        if (collecting.frames.length > MAX_BUFFERED_FRAMES) collecting.frames.shift();
      }
      post({
        type: 'estimate',
        estimate: {
          t: message.t,
          x: r.gaze ? r.gaze[0] + 0.5 : null,
          y: r.gaze ? r.gaze[1] + 0.5 : null,
          rawX: r.rawGaze ? r.rawGaze[0] + 0.5 : null,
          rawY: r.rawGaze ? r.rawGaze[1] + 0.5 : null,
          face: r.face,
          eyesOpen: r.eyesOpen,
          faceOrigin: r.features?.faceOrigin ?? null,
        },
      });
    } catch {
      // A frame that cannot be processed is skipped.
    } finally {
      post({ type: 'frameDone' });
    }
    return;
  }

  const { id, op } = message;
  try {
    let result: number | boolean | undefined;
    if (op === 'startPoint') {
      collecting = { target: [(message.x ?? 0.5) - 0.5, (message.y ?? 0.5) - 0.5], frames: [] };
    } else if (op === 'endPoint') {
      const frames = collecting?.frames.slice(-FRAMES_PER_POINT) ?? [];
      if (collecting && frames.length > 0) pending.push({ target: collecting.target, frames });
      collecting = null;
      result = frames.length;
    } else if (op === 'fit') {
      const points = pending;
      pending = [];
      await tracker.adapt(points);
      result = tracker.calibrated;
    } else {
      collecting = null;
      pending = [];
      await tracker.reset();
    }
    post({ type: 'response', id, result });
  } catch (err) {
    post({ type: 'response', id, error: err instanceof Error ? err.message : String(err) });
  }
}

let queue = Promise.resolve();
scope.onmessage = (event) => {
  queue = queue.then(() => handle(event.data));
};
