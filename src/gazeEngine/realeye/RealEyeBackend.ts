/**
 * RealEye Webcam EyeTracker Light Open 1.1 (RealEye sp. z o.o.; AGPL-3.0 or the no-fee academic
 * commercial licence) as the scatterplot_gaze tracker, behind the same interface as
 * WebEyeTrackProxy so gazeTracker, the calibration pages and the per-trial recalibration are unchanged.
 *
 * What is RealEye's: face landmarks / blendshapes / head pose (MediaPipe FaceLandmarker) and the
 * 1,653-value feature vector (15 landmarks, 22 blendshapes, head pose, two 40x20 eye crops, bias),
 * with +-1 px eye-crop augmentation for calibration frames. In 1.1 its head-pose compensation is
 * disabled, so a prediction is features . weights, exactly what this class computes.
 * What is ours: the calibration store (one entry per dot / pursuit chunk, 'click' entries expire,
 * at most maxPoints entries, snapshot / restore), a dual-form ridge solver (same weights as
 * RealEye's primal solver, 5-20x faster), a constant drift offset and the Kalman smoothing used
 * with WebEyeTrack. Targets and outputs are normalized screen coordinates ([-0.5, 0.5], y down).
 *
 * The library is loaded at runtime from jsDelivr (pinned), not bundled.
 */
import type { SlimGazeResult, CalibResult } from '../webeyetrack/types';
import type WebcamClient from '../webeyetrack/WebcamClient';
import { KalmanFilter2D } from '../webeyetrack/utils/filter';
import { ridgeDual, dot } from './ridgeDual';

const PKG = 'https://cdn.jsdelivr.net/npm/@realeye-io/webcam-eyetracker-light-open@1.1.0';
// jsDelivr's ESM build resolves @mediapipe/tasks-vision 0.10.35; the library's default wasm is 0.10.18.
const WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm';
// Five eye-crop shifts (RealEye uses nine) keep a full refit near one second: ~9 dots + 12 pursuit
// chunks + per-trial dots, 8 frames each, x5 rows.
const AUGMENT: [number, number][] = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]];
const LAMBDA = 1e-5;             // RealEye's ridgeLambda
const MAX_DOT_FRAMES = 40;
const MAX_PURSUIT_FRAMES = 900;
const BLINK = 0.5;               // mean eyeBlink blendshape above this = eyes closed
// Calibration data is pooled over the whole session (Saxena et al., 2024: pooling calibrations from the
// start, middle and end beat using only the latest one). To keep every refit near a second, a fit uses
// at most FRAME_BUDGET frames (x5 augmented rows): when there is more, every entry is thinned to the
// same evenly spaced subset of its frames, so no calibration target is ever dropped.
const FRAME_BUDGET = 280;

type HeadPose = { yaw: number; pitch: number; roll: number; translationX: number; translationY: number; translationZ: number };
type Detection = {
  boundingBox: unknown; keypoints: unknown; allLandmarks?: unknown[];
  blendshapes?: Record<string, number>; headPose?: HeadPose;
  // MediaPipe's column-major 4x4 split into rows of 4 values (RealEye 1.1 reads it as row-major, so its
  // headPose.translation* are wrong: translationZ is always 0). Translation = transformationMatrix[3][0..2].
  transformationMatrix?: number[][];
};
type Tracker = {
  initialize(): Promise<void>;
  detectFace(img: ImageData): Detection | null;
  getConfig(): { eyeWidth: number; eyeHeight: number };
  dispose(): void;
};
type Features = {
  extractCombinedFeatures(img: ImageData, bb: unknown, kp: unknown, useLandmarks: boolean, lm: unknown, w: number, h: number,
    ew: number, eh: number, bs: unknown, hp: unknown): number[];
  extractAugmentedFeatures(img: ImageData, bb: unknown, kp: unknown, lm: unknown, w: number, h: number,
    ew: number, eh: number, bs: unknown, hp: unknown): number[][];
  setAugmentationOffsets(o: [number, number][]): void;
};

type Frame = { rows: Float32Array[]; t: number };
// One calibration entry = one dot or one pursuit chunk; frames keep their augmented rows and target
type Entry = { frames: { rows: Float32Array[]; target: [number, number] }[]; key: [number, number]; ptType: 'calib' | 'click'; ts: number };

export default class RealEyeBackend {
  onGazeResults: (r: SlimGazeResult) => void = () => {};

  private tracker?: Tracker;

  private fx?: Features;

  private eye: [number, number] = [40, 20];

  private disposed = false;

  private collecting: { x: number; y: number; pursuit: boolean; buf: Frame[] } | null = null;

  private pending: Entry[] = [];

  private entries: Entry[] = [];

  private W: Float64Array[] | null = null;

  private offset: [number, number] = [0, 0];

  private kalman = new KalmanFilter2D(1.0, 2e-3, 1e-2);

  private snap?: { entries: Entry[]; W: Float64Array[] | null; offset: [number, number] };

  constructor(private cam: WebcamClient, private opts: { maxPoints?: number; clickTTL?: number } = {}) {}

  async start(): Promise<void> {
    const [idx, fx] = await Promise.all([
      import(/* @vite-ignore */ `${PKG}/+esm`) as Promise<{ WebcamETLight: new (c: object) => Tracker }>,
      import(/* @vite-ignore */ `${PKG}/dist/lib/features/FeatureExtractor.js/+esm`) as Promise<Features>,
    ]);
    fx.setAugmentationOffsets(AUGMENT);
    const make = async (delegate: 'GPU' | 'CPU') => {
      const t = new idx.WebcamETLight({
        delegate, runningMode: 'VIDEO', wasmPath: WASM, faceDetectorMode: 'landmarker', useLandmarks: true,
      });
      await t.initialize();
      return t;
    };
    this.tracker = await make('GPU').catch(() => make('CPU'));   // no WebGL: CPU delegate
    this.fx = fx;
    const c = this.tracker.getConfig();
    this.eye = [c.eyeWidth ?? 40, c.eyeHeight ?? 20];
    await this.cam.startWebcam(async (frame: ImageData) => { if (!this.disposed) this.step(frame); });
  }

  private step(img: ImageData) {
    const capturedAt = performance.now();
    const t0 = capturedAt;
    const tracker = this.tracker!;
    const fx = this.fx!;
    let det: Detection | null = null;
    try { det = tracker.detectFace(img); } catch (e) { console.warn('[RealEyeBackend] detect', e); }
    const t1 = performance.now();
    if (!det || !det.allLandmarks) {
      this.onGazeResults({
        normPog: [0, 0], rawPog: [0, 0], gazeState: 'closed', faceDetected: false, head: null, origin: null, capturedAt, durations: { detect: t1 - t0 },
      });
      return;
    }
    const bs = det.blendshapes ?? {};
    const open = ((bs.eyeBlinkLeft ?? 0) + (bs.eyeBlinkRight ?? 0)) / 2 < BLINK;
    const hp = det.headPose;
    const args = [det.boundingBox, det.keypoints] as const;
    const [ew, eh] = this.eye;
    if (this.collecting && open) {
      const rows = fx.extractAugmentedFeatures(img, ...args, det.allLandmarks, img.width, img.height, ew, eh, det.blendshapes, hp)
        .map((r) => Float32Array.from(r));
      this.collecting.buf.push({ rows, t: capturedAt });
      if (this.collecting.buf.length > (this.collecting.pursuit ? MAX_PURSUIT_FRAMES : MAX_DOT_FRAMES)) this.collecting.buf.shift();
    }
    let raw: number[] = [0, 0];
    let norm: number[] = [0, 0];
    const fitted = this.W !== null;
    if (fitted) {
      const f = fx.extractCombinedFeatures(img, ...args, true, det.allLandmarks, img.width, img.height, ew, eh, det.blendshapes, hp);
      raw = [dot(this.W![0], f) + this.offset[0], dot(this.W![1], f) + this.offset[1]];
      norm = open ? this.kalman.step(raw) : raw;
    }
    // Head position / direction from the raw matrix (column-major: row k of the 4x4 array is column k)
    const m = det.transformationMatrix;
    const origin = m && m.length === 4 ? [m[3][0], m[3][1], Math.abs(m[3][2])] : null;   // cm, camera frame
    const head = m && m.length === 4 ? [m[2][0], m[2][1], m[2][2]] : null;                // face forward axis
    this.onGazeResults({
      normPog: norm,
      rawPog: raw,
      // Uncalibrated frames are reported as 'closed' so nothing treats the placeholder as gaze
      gazeState: open && fitted ? 'open' : 'closed',
      faceDetected: true,
      head,
      origin,
      capturedAt,
      durations: { detect: t1 - t0, total: performance.now() - t0 },
    });
  }

  private stats(): CalibResult {
    const keys = new Set(this.entries.map((e) => `${e.key[0].toFixed(2)},${e.key[1].toFixed(2)}`));
    return {
      n: 0, entries: this.entries.length, distinctTargets: keys.size, affineFitted: this.W !== null,
    };
  }

  private prune() {
    const ttl = (this.opts.clickTTL ?? 0) * 1000;   // 0 = per-trial dots never expire
    const now = Date.now();
    if (ttl > 0) this.entries = this.entries.filter((e) => e.ptType !== 'click' || now - e.ts <= ttl);
    const max = this.opts.maxPoints ?? 500;
    while (this.entries.length > max) {
      const i = this.entries.findIndex((e) => e.ptType === 'click');
      this.entries.splice(i >= 0 ? i : 0, 1);
    }
  }

  /** Refit on every stored entry (needs >= 3 distinct targets; otherwise keep the previous fit). */
  private fit() {
    this.prune();
    const { distinctTargets } = this.stats();
    const X: Float32Array[] = [];
    const xs: number[] = [];
    const ys: number[] = [];
    const total = this.entries.reduce((a, e) => a + e.frames.length, 0);
    const perEntry = total > FRAME_BUDGET ? Math.max(2, Math.floor(FRAME_BUDGET / this.entries.length)) : Infinity;
    this.entries.forEach((e) => {
      const n = e.frames.length;
      const keep = n <= perEntry ? e.frames : Array.from({ length: perEntry }, (_, i) => e.frames[Math.floor(((i + 0.5) * n) / perEntry)]);
      keep.forEach((f) => f.rows.forEach((r) => { X.push(r); xs.push(f.target[0]); ys.push(f.target[1]); }));
    });
    this.lastFitRows = X.length;
    if (distinctTargets < 3 || X.length < 5) return;
    this.W = ridgeDual(X, [xs, ys], LAMBDA);
    this.kalman = new KalmanFilter2D(1.0, 2e-3, 1e-2);
  }

  /** Rows used by the last fit (after thinning). */
  lastFitRows = 0;

  private toEntry(frames: Frame[], targets: [number, number][], ptType: 'calib' | 'click'): Entry {
    return {
      frames: frames.map((f, i) => ({ rows: f.rows, target: targets[i] })),
      key: targets[0],
      ptType,
      ts: Date.now(),
    };
  }

  // ---- WebEyeTrackProxy-compatible API ----

  async calibStart(x: number, y: number, pursuit = false): Promise<void> {
    this.collecting = {
      x, y, pursuit, buf: [],
    };
  }

  async calibEnd(ptType: 'calib' | 'click', maxSamples = 8, defer = false): Promise<CalibResult> {
    const c = this.collecting;
    this.collecting = null;
    if (!c) return { ...this.stats(), n: 0 };
    const frames = c.buf.slice(-maxSamples);
    if (frames.length) {
      const e = this.toEntry(frames, frames.map(() => [c.x, c.y] as [number, number]), ptType);
      if (defer) this.pending.push(e);
      else { this.entries.push(e); this.fit(); }
    }
    return { ...this.stats(), n: frames.length, deferred: defer };
  }

  /** path = [[t_ms, nx, ny], ...] (performance.now clock, lag already applied). */
  async pursuitEnd(path: number[][], chunks = 12, perChunk = 8): Promise<CalibResult & { frames: number; chunks: number }> {
    const c = this.collecting;
    this.collecting = null;
    if (!c || path.length < 2) return { ...this.stats(), n: 0, frames: 0, chunks: 0 };
    const at = (t: number): [number, number] | null => {
      if (t < path[0][0] || t > path[path.length - 1][0]) return null;
      let lo = 0;
      let hi = path.length - 1;
      while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (path[mid][0] <= t) lo = mid; else hi = mid; }
      const a = path[lo];
      const b = path[hi];
      const w = b[0] > a[0] ? (t - a[0]) / (b[0] - a[0]) : 0;
      return [a[1] + w * (b[1] - a[1]), a[2] + w * (b[2] - a[2])];
    };
    const frames = c.buf.map((f) => ({ f, tg: at(f.t) })).filter((x): x is { f: Frame; tg: [number, number] } => x.tg !== null);
    const nChunks = Math.max(1, Math.min(chunks, frames.length));
    let used = 0;
    for (let k = 0; k < nChunks; k += 1) {
      const seg = frames.slice(Math.floor((k * frames.length) / nChunks), Math.floor(((k + 1) * frames.length) / nChunks));
      if (seg.length) {
        const step = Math.max(1, seg.length / perChunk);
        const pick: typeof seg = [];
        for (let i = 0; i < seg.length && pick.length < perChunk; i += step) pick.push(seg[Math.floor(i)]);
        this.pending.push(this.toEntry(pick.map((p) => p.f), pick.map((p) => p.tg), 'calib'));
        used += pick.length;
      }
    }
    return {
      ...this.stats(), n: used, frames: frames.length, chunks: nChunks, deferred: true,
    };
  }

  async calibFlush(): Promise<CalibResult & { points: number; fitMs: number }> {
    const points = this.pending.length;
    this.entries.push(...this.pending);
    this.pending = [];
    const t0 = performance.now();
    if (points) this.fit();
    return {
      ...this.stats(), points, fitMs: Math.round(performance.now() - t0), rows: this.lastFitRows,
    };
  }

  async snapshotCalib(): Promise<void> {
    this.snap = { entries: [...this.entries], W: this.W, offset: [...this.offset] };
  }

  async restoreCalib(): Promise<{ restored: boolean } & CalibResult> {
    this.collecting = null;
    this.pending = [];
    if (!this.snap) return { restored: false, ...this.stats() };
    this.entries = this.snap.entries;
    this.W = this.snap.W;
    this.offset = this.snap.offset;
    this.kalman = new KalmanFilter2D(1.0, 2e-3, 1e-2);
    return { restored: true, ...this.stats() };
  }

  async setOffset(dx: number, dy: number): Promise<{ offset: [number, number] }> {
    this.offset = [dx, dy];
    return { offset: this.offset };
  }

  async resetCalib(): Promise<void> {
    this.collecting = null;
    this.pending = [];
    this.entries = [];
    this.W = null;
    this.offset = [0, 0];
    this.snap = undefined;
    this.kalman = new KalmanFilter2D(1.0, 2e-3, 1e-2);
  }

  dispose(): void {
    this.disposed = true;
    this.cam.stopWebcam();
    try { this.tracker?.dispose(); } catch { /* already closed */ }
    this.tracker = undefined;
  }
}
