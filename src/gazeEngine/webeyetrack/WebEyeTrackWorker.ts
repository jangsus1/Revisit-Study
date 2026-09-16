// @ts-nocheck
// Vendored from RedForestAI/WebEyeTrack (MIT) and modified for reVISit:
//  - explicit calibration protocol (calibStart / calibEnd / resetCalib) with request ids
//  - all messages are processed sequentially so adapt() never races step()
//  - only a slim GazeResult is posted back to the main thread
import WebEyeTrack from './WebEyeTrack';

// MediaPipe's FilesetResolver loads its wasm glue script with importScripts(), which throws a
// TypeError inside an ES-module worker (which is what Vite produces), leaving `ModuleFactory`
// unset. Polyfill importScripts with a synchronous fetch + indirect eval so the glue script's
// top-level `var ModuleFactory` still lands on the worker global scope.
(() => {
  const g = self as any;
  const original = g.importScripts;
  g.importScripts = (...urls: string[]) => {
    for (const url of urls) {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', url, false);
      xhr.send();
      if (xhr.status < 200 || xhr.status >= 300) {
        throw new Error(`importScripts polyfill: ${url} -> HTTP ${xhr.status}`);
      }
      // eslint-disable-next-line no-eval
      (0, eval)(`${xhr.responseText}\n//# sourceURL=${url}`);
    }
  };
  void original;
})();

let tracker: WebEyeTrack;
let baseUrl = '';
let status: 'idle' | 'inference' | 'calib' = 'idle';
let queue: Promise<void> = Promise.resolve();

// Samples buffered between calibStart and calibEnd
let collecting: {
  x: number; y: number;
  buf: { eye: ImageData; head: number[]; origin: number[] }[];
} | null = null;

function setStatus(s: typeof status) {
  status = s;
  self.postMessage({ type: 'statusUpdate', status });
}

function respond(reqId: number, payload?: unknown, error?: string) {
  self.postMessage({ type: 'response', reqId, payload, error });
}

async function handle(e: MessageEvent) {
  const { type, payload, reqId } = e.data;
  switch (type) {
    case 'init': {
      try {
        baseUrl = payload?.baseUrl ?? '';
        tracker = new WebEyeTrack(payload?.maxPoints ?? 13, payload?.clickTTL ?? 90);
        await tracker.initialize(baseUrl);
        self.postMessage({ type: 'ready' });
        setStatus('idle');
      } catch (err) {
        self.postMessage({ type: 'initError', message: String(err?.message ?? err) });
      }
      break;
    }
    case 'step': {
      if (!tracker?.loaded) { setStatus('idle'); break; }
      try {
        const result = await tracker.step(payload.frame as ImageData, payload.capturedAt);
        const faceDetected = result.facialLandmarks.length > 0;
        if (collecting && faceDetected && result.gazeState === 'open') {
          collecting.buf.push({ eye: result.eyePatch, head: result.headVector, origin: result.faceOrigin3D });
          if (collecting.buf.length > 40) collecting.buf.shift();
        }
        self.postMessage({
          type: 'stepResult',
          result: {
            normPog: result.normPog,
            rawPog: result.rawPog,
            gazeState: result.gazeState,
            faceDetected,
            capturedAt: payload.capturedAt,
            durations: result.durations,
          },
        });
      } catch (err) {
        console.error('[WebEyeTrackWorker] step failed', err);
      }
      setStatus('idle');
      break;
    }
    case 'calibStart': {
      collecting = { x: payload.x, y: payload.y, buf: [] };
      respond(reqId);
      break;
    }
    case 'calibEnd': {
      const c = collecting;
      collecting = null;
      if (!c) { respond(reqId, { n: 0, ...tracker.calibStats() }); break; }
      setStatus('calib');
      try {
        const buf = c.buf.slice(-(payload?.maxSamples ?? 8));
        if (buf.length > 0) {
          await tracker.adapt(
            buf.map((b) => b.eye),
            buf.map((b) => b.head),
            buf.map((b) => b.origin),
            buf.map(() => [c.x, c.y]),
            1,
            1e-5,
            payload?.ptType ?? 'calib',
          );
        }
        respond(reqId, { n: buf.length, ...tracker.calibStats() });
      } catch (err) {
        respond(reqId, undefined, String(err?.message ?? err));
      }
      setStatus('idle');
      break;
    }
    case 'snapshotCalib': {
      try { tracker.snapshotCalib(); respond(reqId); } catch (err) { respond(reqId, undefined, String(err?.message ?? err)); }
      break;
    }
    case 'restoreCalib': {
      collecting = null;
      try { respond(reqId, { restored: tracker.restoreCalib(), ...tracker.calibStats() }); } catch (err) { respond(reqId, undefined, String(err?.message ?? err)); }
      break;
    }
    case 'setOffset': {
      tracker.setOffset(payload?.dx ?? 0, payload?.dy ?? 0);
      respond(reqId, { offset: tracker.offset });
      break;
    }
    case 'resetCalib': {
      collecting = null;
      setStatus('calib');
      try {
        await tracker.resetCalib(baseUrl);
        respond(reqId);
      } catch (err) {
        respond(reqId, undefined, String(err?.message ?? err));
      }
      setStatus('idle');
      break;
    }
    default:
      console.warn(`[WebEyeTrackWorker] Unknown message type: ${type}`);
  }
}

self.onmessage = (e: MessageEvent) => {
  queue = queue.then(() => handle(e)).catch((err) => console.error('[WebEyeTrackWorker]', err));
};

export {};
