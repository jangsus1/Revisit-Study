import * as tf from '@tensorflow/tfjs';
import { FaceLandmarker } from '@mediapipe/tasks-vision';
import { BlazeGaze } from './BlazeGaze';
import { KalmanFilter2D } from './KalmanFilter2D';
import {
  Vec2, Vec3, estimateFaceWidthCm, extractEyePatch, eyeAspectRatio, faceOrigin, fitAffine,
  headVector, intrinsicsMatrix, perspectiveMatrix, reconstructFace, toMatrix,
} from './geometry';

const FACE_LANDMARKER_MODEL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
const EYES_CLOSED_EAR = 0.2;
const LEARNING_RATE = 1e-5;

export interface FrameFeatures {
  eyePatch: ImageData;
  headVector: Vec3;
  faceOrigin: Vec3;
}

export interface StepResult {
  face: boolean;
  eyesOpen: boolean;
  /** Gaze relative to the screen centre, each axis in [-0.5, 0.5]. */
  gaze: Vec2 | null;
  rawGaze: Vec2 | null;
  features: FrameFeatures | null;
}

export interface CalibrationPoint {
  target: Vec2;
  frames: FrameFeatures[];
}

interface SupportEntry {
  eyePatches: tf.Tensor4D;
  headVectors: tf.Tensor2D;
  faceOrigins: tf.Tensor2D;
  targets: tf.Tensor2D;
  target: Vec2;
}

type WasmFileset = Parameters<typeof FaceLandmarker.createFromOptions>[0];

const clip = (v: number) => Math.max(-0.5, Math.min(0.5, v));

function disposeEntry(e: SupportEntry) {
  tf.dispose([e.eyePatches, e.headVectors, e.faceOrigins, e.targets]);
}

/**
 * WebEyeTrack (Davalos et al.): MediaPipe face landmarks feed BlazeGaze, which is adapted to the participant
 * from calibration points (an affine correction plus a gradient step on the gaze head).
 */
export class WebEyeTrack {
  private landmarker: FaceLandmarker | null = null;

  private readonly blazeGaze = new BlazeGaze();

  private modelUrl = '';

  private faceWidthCm: number | null = null;

  private lastDepth = 60;

  private support: SupportEntry[] = [];

  private affine: tf.Tensor2D | null = null;

  private kalman = new KalmanFilter2D(1, 2e-3, 1e-2);

  constructor(private readonly maxPoints = 25) {}

  async initialize(modelUrl: string, fileset: WasmFileset): Promise<void> {
    this.modelUrl = modelUrl;
    this.landmarker = await FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: FACE_LANDMARKER_MODEL, delegate: 'GPU' },
      outputFacialTransformationMatrixes: true,
      runningMode: 'IMAGE',
      numFaces: 1,
    });
    await this.blazeGaze.load(modelUrl);
  }

  get calibrated(): boolean {
    return this.affine !== null;
  }

  step(frame: ImageData): StepResult {
    if (!this.landmarker) throw new Error('WebEyeTrack is not initialized');
    const result = this.landmarker.detect(frame);
    const landmarks = result.faceLandmarks[0];
    const transform = result.facialTransformationMatrixes?.[0];
    if (!landmarks || !transform) {
      return {
        face: false, eyesOpen: false, gaze: null, rawGaze: null, features: null,
      };
    }

    const { width, height } = frame;
    const pixels = landmarks.map((l): Vec2 => [Math.floor(l.x * width), Math.floor(l.y * height)]);
    const faceRt = toMatrix(transform);
    if (this.faceWidthCm === null) this.faceWidthCm = estimateFaceWidthCm(pixels);
    const face = reconstructFace(
      perspectiveMatrix(width / height),
      landmarks.map((l): Vec2 => [l.x, l.y]),
      faceRt,
      intrinsicsMatrix(width, height),
      this.faceWidthCm,
      width,
      height,
      this.lastDepth,
    );
    const features: FrameFeatures = {
      eyePatch: extractEyePatch(frame, pixels),
      headVector: headVector(faceRt),
      faceOrigin: faceOrigin(face),
    };
    [, , this.lastDepth] = features.faceOrigin;

    const eyesOpen = eyeAspectRatio(landmarks, 'left') >= EYES_CLOSED_EAR
      && eyeAspectRatio(landmarks, 'right') >= EYES_CLOSED_EAR;
    if (!eyesOpen) {
      return {
        face: true, eyesOpen, gaze: null, rawGaze: null, features,
      };
    }

    const prediction = tf.tidy(() => {
      const out = this.blazeGaze.predict(
        tf.browser.fromPixels(features.eyePatch).toFloat().div(255).expandDims(0),
        tf.tensor2d([features.headVector]),
        tf.tensor2d([features.faceOrigin]),
      );
      return this.affine ? this.applyAffine(out) : out;
    });
    const [raw] = prediction.arraySync() as number[][];
    prediction.dispose();
    const smoothed = this.kalman.step(raw);
    return {
      face: true,
      eyesOpen,
      gaze: [clip(smoothed[0]), clip(smoothed[1])],
      rawGaze: [clip(raw[0]), clip(raw[1])],
      features,
    };
  }

  /** Adds the points to the support set in order, refitting after each one. */
  async adapt(points: CalibrationPoint[]): Promise<void> {
    await points.reduce((prev, point) => prev.then(() => this.adaptPoint(point)), Promise.resolve());
  }

  async reset(): Promise<void> {
    this.support.forEach(disposeEntry);
    this.support = [];
    this.affine?.dispose();
    this.affine = null;
    this.kalman = new KalmanFilter2D(1, 2e-3, 1e-2);
    await this.blazeGaze.load(this.modelUrl);
  }

  dispose(): void {
    this.support.forEach(disposeEntry);
    this.support = [];
    this.affine?.dispose();
    this.blazeGaze.dispose();
    this.landmarker?.close();
  }

  private applyAffine(gaze: tf.Tensor): tf.Tensor {
    const points = gaze.reshape([-1, 2]);
    const homogeneous = tf.concat([points, tf.ones([points.shape[0], 1])], 1);
    return tf.matMul(homogeneous, this.affine!.transpose()).reshape(gaze.shape);
  }

  private distinctTargets(): number {
    return new Set(this.support.map((e) => `${e.target[0].toFixed(2)},${e.target[1].toFixed(2)}`)).size;
  }

  private async adaptPoint({ target, frames }: CalibrationPoint): Promise<void> {
    if (frames.length === 0) return;
    while (this.support.length >= this.maxPoints) disposeEntry(this.support.shift()!);
    this.support.push({
      eyePatches: tf.tidy(() => tf.stack(frames.map((f) => tf.browser.fromPixels(f.eyePatch))).toFloat().div(255) as tf.Tensor4D),
      headVectors: tf.tensor2d(frames.map((f) => f.headVector)),
      faceOrigins: tf.tensor2d(frames.map((f) => f.faceOrigin)),
      targets: tf.tensor2d(frames.map(() => target)),
      target,
    });

    const eyePatches = tf.concat(this.support.map((e) => e.eyePatches));
    const headVectors = tf.concat(this.support.map((e) => e.headVectors));
    const faceOrigins = tf.concat(this.support.map((e) => e.faceOrigins));
    const targets = tf.concat(this.support.map((e) => e.targets));

    if (eyePatches.shape[0] > 3 && this.distinctTargets() >= 4) {
      const predictions = tf.tidy(() => this.blazeGaze.predict(eyePatches, headVectors, faceOrigins));
      const [src, dst] = await Promise.all([
        predictions.array() as Promise<number[][]>,
        targets.array() as Promise<number[][]>,
      ]);
      predictions.dispose();
      this.affine?.dispose();
      this.affine = tf.tensor2d(fitAffine(src, dst));
    }

    const optimizer = tf.train.adam(LEARNING_RATE, 0.85, 0.9, 1e-8);
    tf.tidy(() => {
      const { grads } = tf.variableGrads(() => {
        const predictions = this.blazeGaze.predict(eyePatches, headVectors, faceOrigins);
        const mapped = this.affine ? this.applyAffine(predictions) : predictions;
        return tf.losses.meanSquaredError(targets, mapped).asScalar();
      });
      optimizer.applyGradients(Object.entries(grads).map(([name, tensor]) => ({ name, tensor })));
    });
    optimizer.dispose();
    tf.dispose([eyePatches, headVectors, faceOrigins, targets]);
  }
}
