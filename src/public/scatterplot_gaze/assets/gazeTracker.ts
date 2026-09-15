/**
 * Singleton wrapper around the vendored WebEyeTrack engine, shared by every component of the
 * scatterplot_gaze study within one page session. The webcam stays on between trials; GazeEnd
 * stops it. Heavy code (tfjs, MediaPipe) is loaded lazily so other studies' bundles stay small.
 */
import { PREFIX } from '../../../utils/Prefix';
import type { SlimGazeResult, CalibResult } from '../../../gazeEngine/webeyetrack/types';

export type GazeSample = {
  t: number;        // performance.now() when the frame was captured
  nx: number;       // normalized gaze, [-0.5, 0.5], origin = screen centre, x right
  ny: number;       // y down
  rx: number;       // same, before Kalman smoothing
  ry: number;
  open: boolean;    // eyes open (blink detection)
  face: boolean;    // a face was detected in the frame
};

export type CalibrationSummary = {
  attempts: number;
  accepted: boolean;
  meanErrorPx: number | null;
  meanErrorPctW: number | null;
  viewport: [number, number];
};

type Listener = (s: GazeSample) => void;
type TrackerState = 'idle' | 'starting' | 'ready' | 'error';

const STUDY_ID = 'scatterplot_gaze';

export function normToPx(nx: number, ny: number): [number, number] {
  return [(nx + 0.5) * window.innerWidth, (ny + 0.5) * window.innerHeight];
}

class GazeTracker {
  state: TrackerState = 'idle';

  error?: string;

  lastSample?: GazeSample;

  fullCalib?: CalibrationSummary;

  sampleCount = 0;

  private proxy?: import('../../../gazeEngine/webeyetrack/WebEyeTrackProxy').default;

  private cam?: import('../../../gazeEngine/webeyetrack/WebcamClient').default;

  private video?: HTMLVideoElement;

  private initPromise?: Promise<void>;

  private listeners = new Set<Listener>();

  private stateListeners = new Set<() => void>();

  private recentTimes: number[] = [];

  /** Idempotent: safe under React StrictMode double effects and repeated calls. */
  init(): Promise<void> {
    if (this.initPromise) return this.initPromise;
    this.state = 'starting';
    this.error = undefined;
    this.notify();
    this.initPromise = this.doInit().catch((err: unknown) => {
      this.state = 'error';
      this.error = err instanceof Error ? err.message : String(err);
      this.notify();
      this.teardown();
      this.initPromise = undefined;
      throw err;
    });
    return this.initPromise;
  }

  private async doInit(): Promise<void> {
    const video = document.createElement('video');
    video.autoplay = true;
    video.muted = true;
    video.playsInline = true;
    video.setAttribute('playsinline', '');
    Object.assign(video.style, {
      position: 'fixed', width: '1px', height: '1px', opacity: '0', pointerEvents: 'none', bottom: '0', right: '0',
    });
    document.body.appendChild(video);
    this.video = video;

    const [{ default: WebcamClient }, { default: WebEyeTrackProxy }] = await Promise.all([
      import('../../../gazeEngine/webeyetrack/WebcamClient'),
      import('../../../gazeEngine/webeyetrack/WebEyeTrackProxy'),
    ]);

    const baseUrl = `${window.location.origin}${PREFIX}${STUDY_ID}/`;
    this.cam = new WebcamClient(video);
    this.proxy = new WebEyeTrackProxy(this.cam, { baseUrl, maxPoints: 13, clickTTL: 90 });
    this.proxy.onGazeResults = (r: SlimGazeResult) => this.handleResult(r);
    await this.proxy.start();
    this.state = 'ready';
    this.notify();
  }

  private handleResult(r: SlimGazeResult) {
    const sample: GazeSample = {
      t: r.capturedAt,
      nx: r.normPog[0],
      ny: r.normPog[1],
      rx: r.rawPog?.[0] ?? r.normPog[0],
      ry: r.rawPog?.[1] ?? r.normPog[1],
      open: r.gazeState === 'open',
      face: r.faceDetected,
    };
    this.lastSample = sample;
    this.sampleCount += 1;
    this.recentTimes.push(r.capturedAt);
    if (this.recentTimes.length > 60) this.recentTimes.shift();
    this.listeners.forEach((fn) => fn(sample));
  }

  /** Approximate current sampling rate in Hz over the last ~60 frames. */
  get hz(): number {
    const n = this.recentTimes.length;
    if (n < 2) return 0;
    const span = this.recentTimes[n - 1] - this.recentTimes[0];
    return span > 0 ? ((n - 1) * 1000) / span : 0;
  }

  getStream(): MediaStream | undefined {
    return this.cam?.getStream();
  }

  onSample(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }

  onStateChange(fn: () => void): () => void {
    this.stateListeners.add(fn);
    return () => { this.stateListeners.delete(fn); };
  }

  private notify() {
    this.stateListeners.forEach((fn) => fn());
  }

  /** Collect gaze samples for `ms` while the participant fixates normalized (nx, ny), then adapt. */
  async calibrate(nx: number, ny: number, ms: number, ptType: 'calib' | 'click'): Promise<CalibResult> {
    if (!this.proxy) throw new Error('tracker not started');
    await this.proxy.calibStart(nx, ny);
    await new Promise((resolve) => { setTimeout(resolve, ms); });
    return this.proxy.calibEnd(ptType, 10);
  }

  async resetCalibration(): Promise<void> {
    if (!this.proxy) throw new Error('tracker not started');
    await this.proxy.resetCalib();
  }

  stop(): void {
    this.teardown();
    this.state = 'idle';
    this.initPromise = undefined;
    this.notify();
  }

  private teardown() {
    this.proxy?.dispose();
    this.proxy = undefined;
    this.cam?.stopWebcam();
    this.cam = undefined;
    this.video?.remove();
    this.video = undefined;
  }
}

const g = globalThis as unknown as { __scatterplotGazeTracker?: GazeTracker };
if (!g.__scatterplotGazeTracker) g.__scatterplotGazeTracker = new GazeTracker();
export const gazeTracker: GazeTracker = g.__scatterplotGazeTracker;

if (import.meta.hot) {
  import.meta.hot.dispose(() => { gazeTracker.stop(); });
}
