/**
 * Two feature-regression trackers built on the shared MediaPipe FaceLandmarker. Both use the
 * generic calibration mechanism: store (features, target) for every frame of the fixation window,
 * refit a regression after every dot.
 *
 *  - IrisRidgeEngine: geometric features (iris position inside each eye, normalized by eye width,
 *    averaged over both eyes; eyelid opening; head yaw/pitch), 2nd-order polynomial + ridge.
 *    The classic "9-point polynomial calibration" of video eye trackers, with head-pose terms.
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

type Pt = { x: number; y: number };

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
    // Needs >= 3 distinct targets before the fit is meaningful
    if (this.targets.size >= 3 && this.X.length >= 10) this.model.fit(this.X, this.Y);
  }
}

const px = (f: FaceFrame, i: number): Pt => ({ x: f.lm![i].x * f.w, y: f.lm![i].y * f.h });

/** Iris centre inside one eye: (u along the corner axis, v perpendicular), both / eye width. */
function eyeCoords(f: FaceFrame, cornerA: number, cornerB: number, upper: number, lower: number, iris: number) {
  const a = px(f, cornerA);
  const b = px(f, cornerB);
  const w = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const ex = { x: (b.x - a.x) / w, y: (b.y - a.y) / w };
  const ey = { x: -ex.y, y: ex.x };
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const c = px(f, iris);
  const up = px(f, upper);
  const lo = px(f, lower);
  return {
    u: ((c.x - mid.x) * ex.x + (c.y - mid.y) * ex.y) / w,
    v: ((c.x - mid.x) * ey.x + (c.y - mid.y) * ey.y) / w,
    open: Math.hypot(lo.x - up.x, lo.y - up.y) / w,
  };
}

/** Yaw / pitch in degrees from MediaPipe's column-major 4x4 facial transformation matrix. */
function headAngles(m: number[]): [number, number] {
  const R = (r: number, c: number) => m[c * 4 + r];
  const yaw = Math.asin(Math.max(-1, Math.min(1, -R(2, 0))));
  const pitch = Math.atan2(R(2, 1), R(2, 2));
  return [(yaw * 180) / Math.PI, (pitch * 180) / Math.PI];
}

export class IrisRidgeEngine extends LandmarkEngine {
  readonly info = {
    id: 'iris-ridge',
    name: 'Iris + head pose (polynomial ridge)',
    method: 'MediaPipe iris centre in eye frame (both eyes) + eyelid opening + head yaw/pitch -> 2nd-order polynomial ridge',
    license: 'own code; MediaPipe Apache-2.0',
    color: '#16a34a',
  };

  // features: u, v, u^2, v^2, uv, open, yaw, pitch; floors keep near-constant terms from exploding
  protected model = new RidgeMap(1e-3, [0.01, 0.01, 0.001, 0.001, 0.001, 0.01, 2, 2]);

  protected features(f: FaceFrame): number[] | null {
    if (!f.lm || f.lm.length < 478) return null;
    const r = eyeCoords(f, 33, 133, 159, 145, 468);
    const l = eyeCoords(f, 362, 263, 386, 374, 473);
    const open = (r.open + l.open) / 2;
    if (open < 0.12) return null;   // blink
    const u = (r.u + l.u) / 2;
    const v = (r.v + l.v) / 2;
    const [yaw, pitch] = f.matrix ? headAngles(f.matrix) : [0, 0];
    return [u, v, u * u, v * v, u * v, open, yaw, pitch];
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
