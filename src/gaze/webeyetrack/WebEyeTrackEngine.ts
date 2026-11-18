import type { GazeEngine, GazeEstimate } from '../types';
import { VideoFrameSource } from '../VideoFrameSource';
import type { CalibrationOp, FromWorker, ToWorker } from './protocol';

type Pending = { resolve: (result: number | boolean | undefined) => void; reject: (error: Error) => void };

/** Runs WebEyeTrack in a worker; frames are sent only while the worker is idle. */
export class WebEyeTrackEngine implements GazeEngine {
  onEstimate: (estimate: GazeEstimate) => void = () => {};

  private readonly worker: Worker;

  private readonly ready: Promise<void>;

  private readonly pending = new Map<number, Pending>();

  private nextId = 1;

  private busy = false;

  private calibrated = false;

  private source: VideoFrameSource | null = null;

  private disposed = false;

  constructor(modelUrl: string) {
    this.worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    this.ready = new Promise((resolve, reject) => {
      this.worker.onmessage = (event: MessageEvent<FromWorker>) => {
        const message = event.data;
        if (message.type === 'ready') resolve();
        else if (message.type === 'initError') reject(new Error(message.message));
        else if (message.type === 'estimate') this.onEstimate(message.estimate);
        else if (message.type === 'frameDone') this.busy = false;
        else this.settle(message);
      };
      this.worker.onerror = (event) => {
        const error = new Error(event.message || 'Gaze worker failed');
        reject(error);
        this.rejectAll(error);
      };
    });
    this.ready.catch(() => undefined);
    this.send({ type: 'init', modelUrl });
  }

  async start(video: HTMLVideoElement): Promise<void> {
    await this.ready;
    if (this.disposed) return;
    this.source?.stop();
    const source = new VideoFrameSource(video);
    this.source = source;
    source.start(() => {
      if (this.busy) return;
      const frame = source.capture();
      this.busy = true;
      this.worker.postMessage({ type: 'frame', frame, t: performance.now() } satisfies ToWorker, [frame.data.buffer]);
    });
  }

  async startCalibrationPoint(x: number, y: number): Promise<void> {
    await this.request('startPoint', x, y);
  }

  async endCalibrationPoint(): Promise<number> {
    return Number(await this.request('endPoint'));
  }

  async fit(): Promise<void> {
    this.calibrated = Boolean(await this.request('fit'));
  }

  async resetCalibration(): Promise<void> {
    await this.request('reset');
    this.calibrated = false;
  }

  isCalibrated(): boolean {
    return this.calibrated;
  }

  dispose(): void {
    this.disposed = true;
    this.source?.stop();
    this.worker.terminate();
    this.rejectAll(new Error('Gaze engine disposed'));
  }

  private send(message: ToWorker): void {
    this.worker.postMessage(message);
  }

  private async request(op: CalibrationOp, x?: number, y?: number): Promise<number | boolean | undefined> {
    await this.ready;
    if (this.disposed) throw new Error('Gaze engine disposed');
    const id = this.nextId;
    this.nextId += 1;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.send({
        type: 'request', id, op, x, y,
      });
    });
  }

  private settle(message: Extract<FromWorker, { type: 'response' }>): void {
    const request = this.pending.get(message.id);
    if (!request) return;
    this.pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error));
    else request.resolve(message.result);
  }

  private rejectAll(error: Error): void {
    this.pending.forEach((p) => p.reject(error));
    this.pending.clear();
  }
}
