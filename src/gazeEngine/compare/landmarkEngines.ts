/**
 * Feature-regression tracker built on the shared MediaPipe FaceLandmarker, using the generic
 * calibration mechanism: store (features, target) for every frame of the fixation window, refit
 * a regression after every dot.
 *
 *  - EyeGesturesEngine: re-implementation of EyeGesturesLite's method (NativeSensors, 2024):
 *    30 eye-contour + pupil landmarks normalized to the face bounding box and scaled by face size
 *    relative to the first frame, plus face scale/size/shift, multivariate linear regression.
 *    Re-implemented from the description (not their code); their UI runs 25 dots, here all engines
 *    get the same dots.
 */
import { GazeEngineBase } from './types';
import { RidgeMap } from './ridge';
import { faceSource } from './faceLandmarks';
import type { FaceFrame } from './faceLandmarks';

abstract class LandmarkEngine extends GazeEngineBase {
  protected X: number[][] = [];

  protected Y: number[][] = [];

  protected targets = new Set<string>();

  private target: [number, number] | null = null;

  private framesInPoint = 0;

  private unsub?: () => void;

  protected abstract model: RidgeMap;

  /** Feature vector for a frame, or null when the frame is unusable (no face, blink). */
  protected abstract features(f: FaceFrame): number[] | null;

  protected async startImpl() {
    await faceSource.start();
    this.unsub?.();
    this.unsub = faceSource.subscribe((f) => {
      const x = this.features(f);
      if (x && this.target) { this.X.push(x); this.Y.push([...this.target]); this.framesInPoint += 1; }
      if (!x || !this.model.fitted) { this.emit(f.t, NaN, NaN, false); return; }
      const [px, py] = this.model.predict(x);
      this.emit(f.t, px, py, true);
    });
  }

  protected stopImpl() {
    this.unsub?.();
    this.unsub = undefined;
    this.clear();
  }

  protected async resetImpl() { this.clear(); }

  private clear() {
    this.X = [];
    this.Y = [];
    this.targets.clear();
    this.model.fitted = false;
    this.onClear();
  }

  protected onClear() { /* engine-specific state */ }

  beginPoint(x: number, y: number) { this.target = [x, y]; this.framesInPoint = 0; }

  async endPoint() {
    if (this.target && this.framesInPoint > 0) this.targets.add(this.target.map(Math.round).join(','));
    this.target = null;
    this.calibTargets = this.targets.size;
  }

  async finishCalibration() {
    // Needs >= 3 distinct targets before the fit is meaningful
    if (this.targets.size >= 3 && this.X.length >= 10) this.model.fit(this.X, this.Y);
  }
}

// EyeGesturesLite landmark lists (their LEFT_/RIGHT_EYE_KEYPOINTS, pupil last)
const EG_A = [33, 133, 160, 159, 158, 157, 173, 155, 154, 153, 144, 145, 153, 246, 468];
const EG_B = [362, 263, 387, 386, 385, 384, 398, 382, 381, 380, 374, 373, 374, 466, 473];

export class EyeGesturesEngine extends LandmarkEngine {
  readonly info = {
    id: 'eyegestures',
    name: 'EyeGesturesLite method',
    method: '30 eye landmarks normalized to the face box and scaled by face size + face scale/shift -> linear regression',
    license: 're-implemented (original: EyeGesturesLite license, logo required)',
    color: '#9333ea',
  };

  protected model = new RidgeMap(1e-6, 1e-9);

  private start0: { w: number; h: number; x: number; y: number } | null = null;

  protected onClear() { this.start0 = null; }

  protected features(f: FaceFrame): number[] | null {
    if (!f.lm || f.lm.length < 478) return null;
    let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
    f.lm.forEach((p) => {
      minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
    });
    const w = maxX - minX;
    const h = maxY - minY;
    if (!this.start0) this.start0 = { w, h, x: minX, y: minY };
    const sx = w / this.start0.w;
    const sy = h / this.start0.h;
    const out: number[] = [];
    [...EG_A, ...EG_B].forEach((i) => { out.push(((f.lm![i].x - minX) / w) * sx, ((f.lm![i].y - minY) / h) * sy); });
    out.push(sx, sy, w, h, minX * sx - this.start0.x, minY * sx - this.start0.y);
    return out;
  }
}
