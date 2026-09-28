/**
 * Adapter for scatterplot_gaze's GazeTracker (the study pipeline: calibration store, deferred fit,
 * pursuit chunks, drift offset), so the bench exercises exactly the code the study runs. One instance
 * wraps the study singleton (RealEye since 2026-09-28), another a separate WebEyeTrack GazeTracker.
 * Output = `raw` (before Kalman smoothing), the same estimate the study validates with.
 */
import { GazeEngineBase } from './types';
import type { EngineInfo, TargetFn } from './types';
import type { CalibResult } from '../webeyetrack/types';

/** The subset of scatterplot_gaze's gazeTracker this adapter needs (passed in, not imported). */
export type WetTracker = {
  init(): Promise<void>;
  stop(): void;
  resetCalibration(): Promise<void>;
  calibStart(nx: number, ny: number, pursuit?: boolean): Promise<void>;
  pursuitEnd(path: number[][], chunks?: number, perChunk?: number): Promise<CalibResult>;
  calibEnd(ptType: 'calib' | 'click', maxSamples?: number, defer?: boolean): Promise<CalibResult>;
  flushCalibration(): Promise<CalibResult>;
  onSample(fn: (s: { t: number; rx: number; ry: number; open: boolean; face: boolean }) => void): () => void;
};

export const STUDY_ENGINE_INFO = {
  realeye: {
    id: 'realeye',
    name: 'RealEye Light 1.1 (study)',
    method: 'landmarks + blendshapes + head pose + 2 eye crops (1,653 features) -> ridge (dual solver); study calibration store',
    license: 'AGPL-3.0 / free academic licence (loaded from jsDelivr)',
    color: '#ea580c',
  },
  webeyetrack: {
    id: 'webeyetrack',
    name: 'WebEyeTrack',
    method: 'MediaPipe face mesh -> eye patch -> BlazeGaze CNN; few-shot MAML + affine fit (worker)',
    license: 'MIT (vendored)',
    color: '#d7263d',
  },
};

export class StudyTrackerEngine extends GazeEngineBase {
  readonly info: EngineInfo;

  private unsub?: () => void;

  private pending?: Promise<void>;

  constructor(private tracker: WetTracker & { engine: 'realeye' | 'webeyetrack' }) {
    super();
    this.info = STUDY_ENGINE_INFO[tracker.engine];
  }

  protected async startImpl() {
    await this.tracker.init();
    this.unsub?.();
    this.unsub = this.tracker.onSample((s) => {
      this.emit(s.t, (s.rx + 0.5) * window.innerWidth, (s.ry + 0.5) * window.innerHeight, s.open && s.face);
    });
  }

  protected stopImpl() {
    this.unsub?.();
    this.unsub = undefined;
    this.tracker.stop();
  }

  protected async resetImpl() {
    await this.tracker.resetCalibration();
  }

  beginPoint(x: number, y: number) {
    this.pending = this.tracker.calibStart(x / window.innerWidth - 0.5, y / window.innerHeight - 0.5);
  }

  async endPoint() {
    await this.pending;
    await this.tracker.calibEnd('calib', 10, true);
  }

  private pursuit: { targetAt: TargetFn; t0: number } | null = null;

  /** The worker buffers timestamped frames; at the end it gets the target path (main-thread clock). */
  beginPursuit(targetAt: TargetFn) {
    this.pursuit = { targetAt, t0: performance.now() };
    this.pending = this.tracker.calibStart(0, 0, true);
  }

  async endPursuit() {
    await this.pending;
    const p = this.pursuit;
    this.pursuit = null;
    if (!p) return;
    const path: number[][] = [];
    for (let t = p.t0; t <= performance.now(); t += 10) {
      const xy = p.targetAt(t);
      if (xy) path.push([t, xy[0] / window.innerWidth - 0.5, xy[1] / window.innerHeight - 0.5]);
    }
    await this.tracker.pursuitEnd(path, 12, 10);
  }

  async finishCalibration() {
    const r = await this.tracker.flushCalibration();
    this.calibTargets = r.distinctTargets;
  }
}
