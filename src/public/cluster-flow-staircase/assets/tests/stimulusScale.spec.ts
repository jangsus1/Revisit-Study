import { describe, expect, test } from 'vitest';
import {
  MIN_SCALE, RESERVED_H, RESERVED_W, STIMULUS_WIDTH_CM, stimulusScale,
} from '../stimulusScale';

const canvas = { canvasW: 800, canvasH: 640 };

describe('stimulusScale', () => {
  test('makes the stimulus 21 cm wide when the card calibration is known and it fits', () => {
    // 40 px/cm: 21 cm = 840 px -> scale 1.05; a 1920 x 1080 window has room for it
    const { scale, widthCm } = stimulusScale({
      ...canvas, viewportW: 1920, viewportH: 1080, pxPerCm: 40,
    });
    expect(scale).toBeCloseTo((STIMULUS_WIDTH_CM * 40) / 800, 4);
    expect(widthCm).toBeCloseTo(21, 2);
  });

  test('uses scale 1 without a card, and reports no physical width', () => {
    expect(stimulusScale({
      ...canvas, viewportW: 1920, viewportH: 1080, pxPerCm: null,
    })).toEqual({ scale: 1, widthCm: null });
    expect(stimulusScale({
      ...canvas, viewportW: 1920, viewportH: 1080, pxPerCm: undefined,
    }).scale).toBe(1);
    // nonsense calibrations count as no card
    expect(stimulusScale({
      ...canvas, viewportW: 1920, viewportH: 1080, pxPerCm: 0,
    }).widthCm).toBeNull();
    expect(stimulusScale({
      ...canvas, viewportW: 1920, viewportH: 1080, pxPerCm: Number.NaN,
    }).scale).toBe(1);
  });

  test('shrinks the frame to fit the window with room for the prompt', () => {
    // 1280 x 720: (720 - 120) / 640 = 0.9375 limits the height
    const noCard = stimulusScale({
      ...canvas, viewportW: 1280, viewportH: 720, pxPerCm: null,
    });
    expect(noCard.scale).toBeCloseTo((720 - RESERVED_H) / 640, 4);
    // a large calibrated target is clamped the same way, and the reported width follows the clamp
    const card = stimulusScale({
      ...canvas, viewportW: 1280, viewportH: 720, pxPerCm: 60,
    });
    expect(card.scale).toBeCloseTo((720 - RESERVED_H) / 640, 4);
    expect(card.widthCm).toBeCloseTo((800 * card.scale) / 60, 2);
    // a narrow window limits the width instead
    const narrow = stimulusScale({
      ...canvas, viewportW: 700, viewportH: 1200, pxPerCm: null,
    });
    expect(narrow.scale).toBeCloseTo((700 - RESERVED_W) / 800, 4);
  });

  test('never shrinks below the minimum scale', () => {
    expect(stimulusScale({
      ...canvas, viewportW: 400, viewportH: 300, pxPerCm: null,
    }).scale).toBe(MIN_SCALE);
    // a tiny calibrated target (a very dense screen) is floored as well
    expect(stimulusScale({
      ...canvas, viewportW: 1920, viewportH: 1080, pxPerCm: 10,
    }).scale).toBe(MIN_SCALE);
  });

  test('ignores an unknown window size', () => {
    expect(stimulusScale({
      ...canvas, viewportW: 0, viewportH: 0, pxPerCm: 50,
    }).scale).toBeCloseTo((21 * 50) / 800, 4);
  });
});
