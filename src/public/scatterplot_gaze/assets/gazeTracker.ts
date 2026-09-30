/**
 * Singleton gaze tracker shared by every component of the scatterplot_gaze study within one page
 * session. Engine (since 2026-09-28): RealEye Webcam EyeTracker Light 1.1 (src/gazeEngine/realeye);
 * the vendored WebEyeTrack engine stays available (`new GazeTracker('webeyetrack')`, used by the
 * gaze_playground bench). Both backends expose the same calibration API. The webcam stays on between trials; GazeEnd
 * stops it. Heavy code (tfjs, MediaPipe) is loaded lazily so other studies' bundles stay small.
 */
import { PREFIX } from '../../../utils/Prefix';
import type { SlimGazeResult, CalibResult } from '../../../gazeEngine/webeyetrack/types';

export type EngineName = 'realeye' | 'webeyetrack';

/** What gazeTracker needs from an engine (implemented by WebEyeTrackProxy and RealEyeBackend). */
type Backend = {
  onGazeResults: (r: SlimGazeResult) => void;
  start(): Promise<void>;
  calibStart(x: number, y: number, pursuit?: boolean): Promise<void>;
  calibEnd(ptType: 'calib' | 'click', maxSamples?: number, defer?: boolean): Promise<CalibResult>;
  calibFlush(): Promise<CalibResult & { points: number; fitMs: number }>;
  pursuitEnd(path: number[][], chunks?: number, perChunk?: number): Promise<CalibResult & { frames: number; chunks: number }>;
  snapshotCalib(): Promise<void>;
  restoreCalib(): Promise<{ restored: boolean } & CalibResult>;
  setOffset(dx: number, dy: number): Promise<{ offset: [number, number] }>;
  resetCalib(): Promise<void>;
  dispose(): void;
};

export type GazeSample = {
  t: number;        // performance.now() when the frame was captured
  nx: number;       // normalized gaze, [-0.5, 0.5], origin = screen centre, x right
  ny: number;       // y down
  rx: number;       // same, before Kalman smoothing
  ry: number;
  open: boolean;    // eyes open (blink detection)
  face: boolean;    // a face was detected in the frame
  head: number[] | null;    // unit head-direction vector (null without a face)
  origin: number[] | null;  // 3D face origin in cm, camera frame; [2] = distance to camera
};

/** Mean face origin / head direction over a set of samples (null when no face was seen). */
export type HeadPose = { origin: [number, number, number]; head: [number, number, number]; n: number };
export function meanHeadPose(samples: GazeSample[]): HeadPose | null {
  const ok = samples.filter((s) => s.face && s.origin && s.origin.length === 3 && s.head && s.head.length === 3);
  if (!ok.length) return null;
  const avg = (get: (s: GazeSample) => number) => ok.reduce((a, s) => a + get(s), 0) / ok.length;
  const r = (v: number, d = 10) => Math.round(v * d) / d;
  return {
    origin: [r(avg((s) => s.origin![0])), r(avg((s) => s.origin![1])), r(avg((s) => s.origin![2]))],
    head: [r(avg((s) => s.head![0]), 1000), r(avg((s) => s.head![1]), 1000), r(avg((s) => s.head![2]), 1000)],
    n: ok.length,
  };
}

/** Euclidean distance between two face origins in mm (null when either is missing). */
export function headShiftMm(a: HeadPose | null | undefined, b: HeadPose | null | undefined): number | null {
  if (!a || !b) return null;
  return Math.round(10 * Math.hypot(a.origin[0] - b.origin[0], a.origin[1] - b.origin[1], a.origin[2] - b.origin[2]));
}

export type CalibrationSummary = {
  engine?: EngineName;
  attempts: number;
  accepted: boolean;
  meanErrorPx: number | null;
  meanErrorPctW: number | null;
  meanErrorDeg?: number | null;
  mode?: 'full' | 'recalibrate';
  viewport: [number, number];
};

type Listener = (s: GazeSample) => void;
type TrackerState = 'idle' | 'starting' | 'ready' | 'error';

const STUDY_ID = 'scatterplot_gaze';

/** Assumed true vertical field of view of the webcam (see GazeTracker.distanceScale); tune from pilots. */
export const ASSUMED_CAMERA_VFOV_DEG = 45;

export function normToPx(nx: number, ny: number): [number, number] {
  return [(nx + 0.5) * window.innerWidth, (ny + 0.5) * window.innerHeight];
}

export class GazeTracker {
  constructor(readonly engine: EngineName = 'realeye') {}

  state: TrackerState = 'idle';

  error?: string;

  lastSample?: GazeSample;

  fullCalib?: CalibrationSummary;

  /**
   * Device calibration from the camera page (card -> px per cm, blind spot -> viewing distance), and the
   * factor that turns the tracker's face-distance estimate (assumes a typical webcam lens) into real cm.
   */
  device: {
    pxPerCm: number | null; cardWidthPx: number | null;
    distanceCm: number | null;      // lens-corrected face distance when the camera page was left
    distanceScale: number;
  } | null = null;

  /**
   * MediaPipe's face transform assumes a 63 deg vertical field of view; laptop webcams are narrower
   * (16:9 sensors, ~65-78 deg horizontal -> ~40-48 deg vertical; 640x480 is a horizontal crop of it), so
   * the raw estimate reads too close. Scale = tan(63/2) / tan(ASSUMED_VFOV/2). Logged `origin` stays raw.
   */
  get distanceScale(): number {
    return this.device?.distanceScale ?? Math.tan((63 / 2) * (Math.PI / 180)) / Math.tan((ASSUMED_CAMERA_VFOV_DEG / 2) * (Math.PI / 180));
  }

  /** Visual angle (deg) of a length in CSS px at the measured distance; null without device calibration. */
  pxToDeg(px: number | null | undefined): number | null {
    const d = this.device;
    if (px === null || px === undefined || !d?.pxPerCm || !d.distanceCm) return null;
    return Math.round(((2 * Math.atan(px / d.pxPerCm / 2 / d.distanceCm) * 180) / Math.PI) * 100) / 100;
  }

  /** Halfway recalibration (pooled with the first one), when it has run. */
  midCalib?: CalibrationSummary;

  /** Mean head pose during the validation of the last full calibration (reference for head shift). */
  calibHead: HeadPose | null = null;

  /** Centre-dot error (px) measured at the start/end of the previous trial's short calibration. */
  lastTrialErrorPx: number | null = null;

  sampleCount = 0;

  private proxy?: Backend;

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

    const { default: WebcamClient } = await import('../../../gazeEngine/webeyetrack/WebcamClient');
    this.cam = new WebcamClient(video);
    if (this.engine === 'realeye') {
      // RealEye: every calibration entry of the session is kept and pooled (no expiry, thinned to a frame budget)
      const { default: RealEyeBackend } = await import('../../../gazeEngine/realeye/RealEyeBackend');
      this.proxy = new RealEyeBackend(this.cam, { maxPoints: 500, clickTTL: 0 });
    } else {
      const { default: WebEyeTrackProxy } = await import('../../../gazeEngine/webeyetrack/WebEyeTrackProxy');
      // WebEyeTrack (bench): MAML support set of 9 dots + 12 pursuit chunks + per-trial dots (90 s expiry)
      const baseUrl = `${window.location.origin}${PREFIX}${STUDY_ID}/`;
      this.proxy = new WebEyeTrackProxy(this.cam, { baseUrl, maxPoints: 25, clickTTL: 90 });
    }
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
      head: r.head ?? null,
      origin: r.origin ?? null,
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
  async calibrate(nx: number, ny: number, ms: number, ptType: 'calib' | 'click', defer = false): Promise<CalibResult> {
    if (!this.proxy) throw new Error('tracker not started');
    await this.proxy.calibStart(nx, ny);
    await new Promise((resolve) => { setTimeout(resolve, ms); });
    return this.proxy.calibEnd(ptType, 10, defer);
  }

  /** Adapt to all points collected with defer=true (call once the dots are gone). */
  async flushCalibration(): Promise<CalibResult & { points: number; fitMs: number }> {
    if (!this.proxy) throw new Error('tracker not started');
    return this.proxy.calibFlush();
  }

  /** Split form of calibrate() for callers that time the fixation themselves (gaze_playground bench). */
  calibStart(nx: number, ny: number, pursuit = false): Promise<void> {
    if (!this.proxy) return Promise.reject(new Error('tracker not started'));
    return this.proxy.calibStart(nx, ny, pursuit);
  }

  /** Close a smooth-pursuit recording; path = [[t_ms (performance.now), nx, ny], ...]. Fit on flush. */
  pursuitEnd(path: number[][], chunks = 12, perChunk = 10): Promise<CalibResult & { frames: number; chunks: number }> {
    if (!this.proxy) return Promise.reject(new Error('tracker not started'));
    return this.proxy.pursuitEnd(path, chunks, perChunk);
  }

  calibEnd(ptType: 'calib' | 'click', maxSamples = 10, defer = false): Promise<CalibResult> {
    if (!this.proxy) return Promise.reject(new Error('tracker not started'));
    return this.proxy.calibEnd(ptType, maxSamples, defer);
  }

  /** Current drift correction in normalized units (mirrors the worker's value). */
  offset: [number, number] = [0, 0];

  async snapshotCalibration(): Promise<void> {
    if (!this.proxy) throw new Error('tracker not started');
    await this.proxy.snapshotCalib();
    this.snapshotOffset = this.offset;
  }

  async restoreCalibration(): Promise<boolean> {
    if (!this.proxy) throw new Error('tracker not started');
    const r = await this.proxy.restoreCalib();
    if (r.restored) this.offset = this.snapshotOffset;
    return r.restored;
  }

  private snapshotOffset: [number, number] = [0, 0];

  /** Set the drift correction in viewport pixels (added to every estimate, raw and smoothed). */
  async setOffsetPx(dx: number, dy: number): Promise<void> {
    if (!this.proxy) throw new Error('tracker not started');
    const off: [number, number] = [dx / window.innerWidth, dy / window.innerHeight];
    await this.proxy.setOffset(off[0], off[1]);
    this.offset = off;
  }

  get offsetPx(): [number, number] {
    return [this.offset[0] * window.innerWidth, this.offset[1] * window.innerHeight];
  }

  async resetCalibration(): Promise<void> {
    if (!this.proxy) throw new Error('tracker not started');
    await this.proxy.resetCalib();
    this.offset = [0, 0];
    this.snapshotOffset = [0, 0];
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
if (!g.__scatterplotGazeTracker) g.__scatterplotGazeTracker = new GazeTracker('realeye');
export const gazeTracker: GazeTracker = g.__scatterplotGazeTracker;

if (import.meta.hot) {
  import.meta.hot.dispose(() => { gazeTracker.stop(); });
}
