/**
 * Screen layout of the trial plots, shared by the trials (phase1_gaze, phase2_gaze) and the calibration
 * dots so task-region dots land exactly on the plot and the labels (2026-09-30).
 *
 * The plot SVG has a 710x600 design size (110 px y-label strip + 600 px plot frame), is scaled by
 * plotScale(710, 600, 40, 40) through its viewBox, and is centred in the full-window trial screen.
 * Task 2 (no labels) uses the same frame with an empty label strip, so both tasks put the plot at the
 * same screen position.
 */
import { plotScale } from './plotScale';
import type { NormPoint } from './CalibrationOverlay';

export const TASK_SIZE = { width: 710, height: 600 };
export const TASK_MARGIN = {
  top: 40, right: 40, bottom: 60, left: 170,
};
export const TASK_RESERVED: [number, number] = [40, 40];

const PLOT_W = TASK_SIZE.width - TASK_MARGIN.left - TASK_MARGIN.right;   // 500
const PLOT_H = TASK_SIZE.height - TASK_MARGIN.top - TASK_MARGIN.bottom;  // 500

/** Design-space (SVG viewBox) positions of the calibration targets. */
const SVG_POINTS = {
  plot: [TASK_MARGIN.left + PLOT_W / 2, TASK_MARGIN.top + PLOT_H / 2],        // plot centre
  xLabel: [TASK_MARGIN.left + PLOT_W / 2, TASK_SIZE.height - 17],             // x label text (baseline at height-10, 20 px bold)
  yLabel: [(TASK_MARGIN.left - 155 + TASK_MARGIN.left - 5) / 2, TASK_MARGIN.top + PLOT_H / 2], // y label box centre
  // plot quadrant centres (1/4 and 3/4 of the plot frame)
  q1: [TASK_MARGIN.left + PLOT_W / 4, TASK_MARGIN.top + PLOT_H / 4],
  q2: [TASK_MARGIN.left + (3 * PLOT_W) / 4, TASK_MARGIN.top + PLOT_H / 4],
  q3: [TASK_MARGIN.left + (3 * PLOT_W) / 4, TASK_MARGIN.top + (3 * PLOT_H) / 4],
  q4: [TASK_MARGIN.left + PLOT_W / 4, TASK_MARGIN.top + (3 * PLOT_H) / 4],
} as const;

export type TaskTarget = keyof typeof SVG_POINTS;

/** Current scale of the trial plot (same call as the trials). */
export const taskScale = () => plotScale(TASK_SIZE.width, TASK_SIZE.height, TASK_RESERVED[0], TASK_RESERVED[1]);

/** Normalized screen position ([-0.5, 0.5], viewport centre = 0) of a target at the current window size. */
export function taskPoint(name: TaskTarget): NormPoint & { target: TaskTarget } {
  const s = taskScale();
  const [sx, sy] = SVG_POINTS[name];
  return {
    nx: ((sx - TASK_SIZE.width / 2) * s) / window.innerWidth,
    ny: ((sy - TASK_SIZE.height / 2) * s) / window.innerHeight,
    target: name,
  };
}

/** The 6 task-region calibration dots added to the 9-dot grid: y label, 4 plot quadrants, x label. */
export const taskCalibPoints = () => (['yLabel', 'q1', 'q2', 'q3', 'q4', 'xLabel'] as TaskTarget[]).map(taskPoint);

/** The 3 per-trial drift / fine-tuning dots: plot centre, x label, y label. */
export const trialCheckPoints = () => (['plot', 'xLabel', 'yLabel'] as TaskTarget[]).map(taskPoint);
