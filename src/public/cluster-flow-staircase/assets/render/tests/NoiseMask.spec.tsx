import { cleanup, render, screen } from '@testing-library/react';
import {
  afterEach, describe, expect, test, vi,
} from 'vitest';
import { MASK_BLOCK, NoiseMask, fillNoise } from '../NoiseMask';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('fillNoise', () => {
  const width = 10;
  const height = 7;
  const fill = (seed: number) => {
    const data = new Uint8ClampedArray(width * height * 4);
    fillNoise(data, width, height, seed);
    return data;
  };
  const grey = (data: Uint8ClampedArray, x: number, y: number) => data[(y * width + x) * 4];

  test('paints opaque greys in 3 px blocks, partial blocks at the edges included', () => {
    const data = fill(5);
    expect(MASK_BLOCK).toBe(3);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const i = (y * width + x) * 4;
        expect(data[i]).toBe(data[i + 1]);
        expect(data[i]).toBe(data[i + 2]);
        expect(data[i + 3]).toBe(255);
        const bx = Math.floor(x / MASK_BLOCK) * MASK_BLOCK;
        const by = Math.floor(y / MASK_BLOCK) * MASK_BLOCK;
        expect(grey(data, x, y)).toBe(grey(data, bx, by));
      }
    }
  });

  test('is seeded: the same seed repeats, another seed differs, and the greys vary', () => {
    expect(fill(5)).toEqual(fill(5));
    expect(fill(5)).not.toEqual(fill(6));
    const values = new Set<number>();
    fill(5).forEach((v, i) => { if (i % 4 === 0) values.add(v); });
    expect(values.size).toBeGreaterThan(5);
  });
});

describe('NoiseMask', () => {
  test('renders a canvas of the stimulus size and paints it once', () => {
    const putImageData = vi.fn();
    const ctx = {
      createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
      putImageData,
    };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as never);

    const { rerender } = render(<NoiseMask width={30} height={12} seed={9} />);
    const canvas = screen.getByTestId('noise-mask') as HTMLCanvasElement;
    expect(canvas.width).toBe(30);
    expect(canvas.height).toBe(12);
    expect(putImageData).toHaveBeenCalledTimes(1);

    const expected = new Uint8ClampedArray(30 * 12 * 4);
    fillNoise(expected, 30, 12, 9);
    expect(putImageData.mock.calls[0][0].data).toEqual(expected);

    rerender(<NoiseMask width={30} height={12} seed={9} />);
    expect(putImageData).toHaveBeenCalledTimes(1);
  });

  test('stays blank without a 2D context', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    render(<NoiseMask width={30} height={12} seed={9} />);
    expect(screen.getByTestId('noise-mask')).toBeTruthy();
  });
});
