/**
 * The white-noise mask shown for 150 ms between the two stimuli of a trial: square blocks of
 * uniformly random grey, the size of the stimulus canvas. It is seeded, so a trial's mask can be
 * regenerated from the stored seeds, and it is painted once, in a layout effect before the trial's
 * timeline starts, so showing it later costs only a visibility change.
 */
import { useLayoutEffect, useRef } from 'react';
import { mulberry32 } from '../generator/prng';

/** Side of one noise block in css px. */
export const MASK_BLOCK = 3;

/**
 * Fills `data` (RGBA, `width` x `height`) with `block`-px squares of uniform grey drawn from a
 * seeded stream, row of blocks by row of blocks. Pure, so it is testable without a canvas.
 */
export function fillNoise(data: Uint8ClampedArray, width: number, height: number, seed: number, block = MASK_BLOCK): void {
  const rng = mulberry32(seed);
  const cols = Math.ceil(width / block);
  const rows = Math.ceil(height / block);
  for (let by = 0; by < rows; by += 1) {
    for (let bx = 0; bx < cols; bx += 1) {
      const grey = Math.floor(rng() * 256);
      const yEnd = Math.min(height, (by + 1) * block);
      const xEnd = Math.min(width, (bx + 1) * block);
      for (let y = by * block; y < yEnd; y += 1) {
        for (let x = bx * block; x < xEnd; x += 1) {
          const i = (y * width + x) * 4;
          data[i] = grey;
          data[i + 1] = grey;
          data[i + 2] = grey;
          data[i + 3] = 255;
        }
      }
    }
  }
}

export function NoiseMask({ width, height, seed }: { width: number; height: number; seed: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    // jsdom (and a browser without 2D canvas) has no context: the mask then stays blank
    const ctx = canvas && typeof canvas.getContext === 'function' ? canvas.getContext('2d') : null;
    if (!ctx) return;
    const image = ctx.createImageData(width, height);
    fillNoise(image.data, width, height, seed);
    ctx.putImageData(image, 0, 0);
  }, [width, height, seed]);

  return (
    <canvas
      ref={canvasRef}
      data-testid="noise-mask"
      data-seed={seed}
      width={width}
      height={height}
      style={{
        display: 'block', width, height, imageRendering: 'pixelated',
      }}
    />
  );
}
