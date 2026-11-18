import type { GazeEstimate } from '../types';

export type CalibrationOp = 'startPoint' | 'endPoint' | 'fit' | 'reset';

export type ToWorker =
  | { type: 'init'; modelUrl: string }
  | { type: 'frame'; frame: ImageData; t: number }
  | { type: 'request'; id: number; op: CalibrationOp; x?: number; y?: number };

export type FromWorker =
  | { type: 'ready' }
  | { type: 'initError'; message: string }
  | { type: 'estimate'; estimate: GazeEstimate }
  | { type: 'frameDone' }
  | { type: 'response'; id: number; result?: number | boolean; error?: string };
