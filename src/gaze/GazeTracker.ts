import type { GazeEngine, GazeEstimate } from './types';

/** A gaze estimate with its coordinates in viewport pixels. */
export type GazeSample = GazeEstimate;

export type GazeTrackerState = 'idle' | 'starting' | 'ready' | 'error';

const toPx = (v: number | null, size: number) => (v === null ? null : v * size);

/** Runs a gaze engine on the frames of a webcam stream it does not own. */
export class GazeTracker {
  state: GazeTrackerState = 'idle';

  error: string | null = null;

  private engine: GazeEngine | null = null;

  private video: HTMLVideoElement | null = null;

  private stream: MediaStream | null = null;

  private starting: Promise<void> | null = null;

  private generation = 0;

  private readonly listeners = new Set<(sample: GazeSample) => void>();

  private readonly stateListeners = new Set<() => void>();

  constructor(private readonly createEngine: () => GazeEngine) {}

  /** Starts tracking on `stream`. Calling it again with the same stream reuses the running engine. */
  start(stream: MediaStream): Promise<void> {
    if (this.stream === stream && this.starting) return this.starting;
    this.stop();
    this.stream = stream;
    this.setState('starting');
    this.starting = this.run(stream).catch((err: unknown) => {
      this.error = err instanceof Error ? err.message : String(err);
      this.teardown();
      this.setState('error');
      throw err;
    });
    return this.starting;
  }

  stop(): void {
    this.teardown();
    this.error = null;
    if (this.state !== 'idle') this.setState('idle');
  }

  subscribe(listener: (sample: GazeSample) => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  onStateChange(listener: () => void): () => void {
    this.stateListeners.add(listener);
    return () => { this.stateListeners.delete(listener); };
  }

  /** Starts collecting calibration frames for a target at viewport pixel (x, y). */
  startCalibrationPoint(x: number, y: number): Promise<void> {
    return this.requireEngine().startCalibrationPoint(x / window.innerWidth, y / window.innerHeight);
  }

  endCalibrationPoint(): Promise<number> {
    return this.requireEngine().endCalibrationPoint();
  }

  fit(): Promise<void> {
    return this.requireEngine().fit();
  }

  resetCalibration(): Promise<void> {
    return this.requireEngine().resetCalibration();
  }

  isCalibrated(): boolean {
    return this.engine?.isCalibrated() ?? false;
  }

  private async run(stream: MediaStream): Promise<void> {
    const { generation } = this;
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;bottom:0;right:0;';
    video.srcObject = stream;
    document.body.appendChild(video);
    this.video = video;
    await video.play();
    if (generation !== this.generation) return;

    const engine = this.createEngine();
    this.engine = engine;
    engine.onEstimate = (estimate) => this.emit(estimate);
    await engine.start(video);
    if (generation === this.generation) this.setState('ready');
  }

  private emit(estimate: GazeEstimate): void {
    const { innerWidth: w, innerHeight: h } = window;
    const sample: GazeSample = {
      ...estimate,
      x: toPx(estimate.x, w),
      y: toPx(estimate.y, h),
      rawX: toPx(estimate.rawX, w),
      rawY: toPx(estimate.rawY, h),
    };
    this.listeners.forEach((listener) => listener(sample));
  }

  private requireEngine(): GazeEngine {
    if (!this.engine || this.state !== 'ready') throw new Error('Gaze tracking is not running');
    return this.engine;
  }

  private teardown(): void {
    this.generation += 1;
    this.engine?.dispose();
    this.engine = null;
    this.video?.remove();
    if (this.video) this.video.srcObject = null;
    this.video = null;
    this.stream = null;
    this.starting = null;
  }

  private setState(state: GazeTrackerState): void {
    this.state = state;
    this.stateListeners.forEach((listener) => listener());
  }
}
