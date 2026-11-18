import type { GazeEngineName } from '../parser/types';

export type { GazeEngineName };

/** One gaze estimate. Gaze coordinates are relative to the viewport: (0, 0) top left, (1, 1) bottom right. */
export interface GazeEstimate {
  /** `performance.now()` when the video frame was captured. */
  t: number;
  /** Smoothed gaze; null without a face or with the eyes closed. */
  x: number | null;
  y: number | null;
  /** Gaze before smoothing. */
  rawX: number | null;
  rawY: number | null;
  face: boolean;
  eyesOpen: boolean;
  /** Midpoint between the eyes in cm, camera frame; the third value is the distance to the camera. */
  faceOrigin: [number, number, number] | null;
}

export interface GazeEngine {
  onEstimate: (estimate: GazeEstimate) => void;
  /** Starts estimating gaze from the frames of a playing video element. */
  start(video: HTMLVideoElement): Promise<void>;
  /** Starts collecting calibration frames while the participant looks at viewport point (x, y). */
  startCalibrationPoint(x: number, y: number): Promise<void>;
  /** Stops collecting and resolves to the number of usable frames kept for the point. */
  endCalibrationPoint(): Promise<number>;
  /** Fits the model to the points collected since the last fit. */
  fit(): Promise<void>;
  /** Discards all calibration. */
  resetCalibration(): Promise<void>;
  isCalibrated(): boolean;
  dispose(): void;
}
