/**
 * Adapter for the study's own tracker (the `gazeTracker` singleton around vendored WebEyeTrack),
 * so the bench exercises exactly the code the scatterplot_gaze study runs. Output = `raw`
 * (affine-corrected, before Kalman smoothing), the same estimate the study validates with.
 */
import { GazeEngineBase } from './types';
import type { CalibResult } from '../webeyetrack/types';

/** The subset of scatterplot_gaze's gazeTracker this adapter needs (passed in, not imported). */
export type WetTracker = {
  init(): Promise<void>;
  stop(): void;
  resetCalibration(): Promise<void>;
  calibStart(nx: number, ny: number): Promise<void>;
  calibEnd(ptType: 'calib' | 'click', maxSamples?: number, defer?: boolean): Promise<CalibResult>;
  flushCalibration(): Promise<CalibResult>;
  onSample(fn: (s: { t: number; rx: number; ry: number; open: boolean; face: boolean }) => void): () => void;
};

export class WebEyeTrackEngine extends GazeEngineBase {
  readonly info = {
    id: 'webeyetrack',
    name: 'WebEyeTrack (study)',
    method: 'MediaPipe face mesh -> eye patch -> BlazeGaze CNN; few-shot MAML + affine fit on calibration dots',
    license: 'MIT (vendored, runs in a worker)',
    color: '#d7263d',
  };

  private unsub?: () => void;

  private pending?: Promise<void>;

  constructor(private tracker: WetTracker) { super(); }

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

  async finishCalibration() {
    const r = await this.tracker.flushCalibration();
    this.calibTargets = r.distinctTargets;
  }
}
