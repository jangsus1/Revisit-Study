/**
 * Physical size of the trial stimuli. Everything is generated and stored in design pixels (the
 * 800 x 640 canvas); the trial runner only scales the whole stage uniformly with a CSS transform.
 *
 * With a card calibration (`pxPerCm`, CSS px per cm) the stimulus is made `STIMULUS_WIDTH_CM` wide
 * (21 x 16.8 cm). Without one the scale is 1: CSS pixels are nominally 1/96 inch, so 800 px is
 * about 21 cm on a typical display. Either way the frame must fit the full-screen window with room
 * for the prompt line, and it is never shrunk below `MIN_SCALE`.
 */
export const STIMULUS_WIDTH_CM = 21;
/** Window space kept free around the frame: the prompt line below it, a margin at the sides. */
export const RESERVED_W = 48;
export const RESERVED_H = 120;
export const MIN_SCALE = 0.6;

export interface StimulusScale {
  /** the factor applied to the design canvas */
  scale: number;
  /** the stimulus width in cm at that scale; null without a card calibration */
  widthCm: number | null;
}

export function stimulusScale({
  canvasW, canvasH, viewportW, viewportH, pxPerCm,
}: { canvasW: number; canvasH: number; viewportW: number; viewportH: number; pxPerCm: number | null | undefined }): StimulusScale {
  const calibrated = typeof pxPerCm === 'number' && Number.isFinite(pxPerCm) && pxPerCm > 0;
  const target = calibrated ? (STIMULUS_WIDTH_CM * pxPerCm) / canvasW : 1;
  const fit = viewportW > 0 && viewportH > 0
    ? Math.min((viewportW - RESERVED_W) / canvasW, (viewportH - RESERVED_H) / canvasH)
    : Infinity;
  const raw = Math.max(MIN_SCALE, Math.min(target, fit));
  const scale = Math.round(raw * 10000) / 10000;
  return {
    scale,
    widthCm: calibrated ? Math.round(((canvasW * scale) / pxPerCm) * 100) / 100 : null,
  };
}
