import { PREFIX } from '../utils/Prefix';
import type { GazeEngine, GazeEngineName } from './types';
import { WebEyeTrackEngine } from './webeyetrack/WebEyeTrackEngine';

export const WEBEYETRACK_MODEL_PATH = 'revisitAssets/webeyetrack/model.json';

export function createGazeEngine(name: GazeEngineName = 'webeyetrack'): GazeEngine {
  if (name === 'webeyetrack') {
    return new WebEyeTrackEngine(new URL(`${PREFIX}${WEBEYETRACK_MODEL_PATH}`, window.location.origin).href);
  }
  throw new Error(`Gaze engine "${name}" is not available`);
}
