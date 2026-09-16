// @ts-nocheck
// Vendored from RedForestAI/WebEyeTrack (MIT) and modified for reVISit:
//  - Vite-native module worker instead of webpack worker-loader
//  - explicit baseUrl (GitHub Pages sub-path) instead of document.baseURI
//  - no global window click listener; calibration is driven explicitly
//  - request/response messages for calibration + reset, dispose()
//  - frames are stamped with performance.now() on the main thread
import WebcamClient from "./WebcamClient";
import { SlimGazeResult, CalibResult } from "./types";

export interface WebEyeTrackProxyOptions {
  baseUrl: string;      // where `web/model.json` lives (with trailing slash)
  maxPoints?: number;   // calibration entries kept (default 13)
  clickTTL?: number;    // seconds a 'click' calibration entry survives (default 90)
}

type Pending = { resolve: (v: any) => void; reject: (e: Error) => void };

export default class WebEyeTrackProxy {
  private worker: Worker;
  private webcamClient: WebcamClient;
  private pending = new Map<number, Pending>();
  private nextId = 1;
  private readyPromise: Promise<void>;
  private resolveReady!: () => void;
  private rejectReady!: (e: Error) => void;
  private disposed = false;

  public status: 'idle' | 'inference' | 'calib' = 'idle';
  public ready = false;

  // Callback for gaze results
  onGazeResults: (gazeResult: SlimGazeResult) => void = () => {};

  constructor(webcamClient: WebcamClient, opts: WebEyeTrackProxyOptions) {
    this.webcamClient = webcamClient;
    this.readyPromise = new Promise<void>((resolve, reject) => {
      this.resolveReady = resolve;
      this.rejectReady = reject;
    });

    this.worker = new Worker(new URL('./WebEyeTrackWorker.ts', import.meta.url), { type: 'module' });

    this.worker.onerror = (ev) => {
      const err = new Error(`[WebEyeTrackWorker] ${ev.message || 'worker error'}`);
      this.rejectReady(err);
      this.pending.forEach((p) => p.reject(err));
      this.pending.clear();
    };

    this.worker.onmessage = (mess) => {
      const data = mess.data || {};
      switch (data.type) {
        case 'ready':
          this.ready = true;
          this.resolveReady();
          break;
        case 'initError':
          this.rejectReady(new Error(data.message || 'tracker init failed'));
          break;
        case 'stepResult':
          this.onGazeResults(data.result as SlimGazeResult);
          break;
        case 'statusUpdate':
          this.status = data.status;
          break;
        case 'response': {
          const p = this.pending.get(data.reqId);
          if (p) {
            this.pending.delete(data.reqId);
            if (data.error) p.reject(new Error(data.error));
            else p.resolve(data.payload);
          }
          break;
        }
        default:
          console.warn(`[WebEyeTrackProxy] Unknown message type: ${data.type}`);
      }
    };

    this.worker.postMessage({
      type: 'init',
      payload: {
        baseUrl: opts.baseUrl,
        maxPoints: opts.maxPoints ?? 13,
        clickTTL: opts.clickTTL ?? 90,
      },
    });
  }

  /** Resolves once the worker has loaded MediaPipe + BlazeGaze and the webcam is streaming frames. */
  async start(): Promise<void> {
    await this.readyPromise;
    await this.webcamClient.startWebcam(async (frame: ImageData) => {
      if (this.disposed) return;
      // Only forward a frame when the worker is idle; the pixel buffer is transferred, not cloned.
      if (this.status === 'idle') {
        this.status = 'inference';
        this.worker.postMessage(
          { type: 'step', payload: { frame, capturedAt: performance.now() } },
          [frame.data.buffer],
        );
      }
    });
  }

  private request<T>(type: string, payload?: unknown): Promise<T> {
    if (this.disposed) return Promise.reject(new Error('proxy disposed'));
    const reqId = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(reqId, { resolve, reject });
      this.worker.postMessage({ type, reqId, payload });
    });
  }

  /** Start buffering eye patches while the participant fixates the target at normalized (x, y). */
  calibStart(x: number, y: number): Promise<void> {
    return this.request<void>('calibStart', { x, y });
  }

  /** Stop buffering and adapt the model with the collected samples. */
  calibEnd(ptType: 'calib' | 'click', maxSamples = 8): Promise<CalibResult> {
    return this.request<CalibResult>('calibEnd', { ptType, maxSamples });
  }

  /** Save the current calibration state so a harmful adapt() can be undone. */
  snapshotCalib(): Promise<void> {
    return this.request<void>('snapshotCalib');
  }

  /** Restore the state saved by snapshotCalib(). */
  restoreCalib(): Promise<{ restored: boolean } & CalibResult> {
    return this.request<{ restored: boolean } & CalibResult>('restoreCalib');
  }

  /** Replace the constant drift correction (normalized units). */
  setOffset(dx: number, dy: number): Promise<{ offset: [number, number] }> {
    return this.request<{ offset: [number, number] }>('setOffset', { dx, dy });
  }

  /** Forget all calibration data and reload pristine model weights. */
  resetCalib(): Promise<void> {
    return this.request<void>('resetCalib');
  }

  dispose(): void {
    this.disposed = true;
    this.webcamClient.stopWebcam();
    this.worker.terminate();
    this.pending.forEach((p) => p.reject(new Error('proxy disposed')));
    this.pending.clear();
  }
}
