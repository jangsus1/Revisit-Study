/** Engines for the gaze_playground comparison bench. Import dynamically (pulls in MediaPipe). */
export { GazeEngineBase } from './types';
export type { EngineSample, EngineInfo, EngineState } from './types';
export { WebEyeTrackEngine } from './webeyetrackEngine';
export { WebGazerEngine } from './webgazerEngine';
export { IrisRidgeEngine, EyeGesturesEngine } from './landmarkEngines';
export { runMetrics } from './metrics';
export { RealEyeEngine } from './realeyeEngine';
