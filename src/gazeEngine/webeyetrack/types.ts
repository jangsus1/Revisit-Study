// @ts-nocheck
// Vendored from RedForestAI/WebEyeTrack (MIT); modified: type-only MediaPipe import, rawPog, slim result types.
import type { NormalizedLandmark, Matrix, Classifications } from "@mediapipe/tasks-vision";

export type Point = number[];

export enum TrackingStatus {
  FAILED = 0,
  SUCCESS = 1,
}

export interface GazeResult {
  // Inputs
  facialLandmarks: NormalizedLandmark[];
  faceRt: Matrix;
  faceBlendshapes: Classifications[];

  // Preprocessing
  eyePatch: ImageData;          // RGB image of the eye region
  headVector: Array<number>;    // [3] head vector in camera coordinates
  faceOrigin3D: Array<number>;  // X, Y, Z (cm)

  metric_transform: Matrix;

  gazeState: 'open' | 'closed';

  // Normalized point of gaze, [-0.5, 0.5] each axis, origin = screen centre, y down
  normPog: Array<number>;       // Kalman-smoothed
  rawPog: Array<number>;        // affine-corrected, before Kalman smoothing

  durations: Record<string, number>;
  timestamp: number;
}

/** What the worker posts to the main thread for every processed frame. */
export interface SlimGazeResult {
  normPog: number[];
  rawPog: number[];
  gazeState: 'open' | 'closed';
  faceDetected: boolean;
  capturedAt: number;           // performance.now() on the main thread when the frame was grabbed
  durations: Record<string, number>;
}

export interface CalibResult {
  n: number;                    // samples used for this calibration point
  entries: number;              // calibration entries currently held
  distinctTargets: number;
  affineFitted: boolean;
}
