import { MantineProvider } from '@mantine/core';
import {
  act, cleanup, fireEvent, render, screen, within,
} from '@testing-library/react';
import {
  afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi,
} from 'vitest';
import Gallery from '../Gallery';
import { CUES } from '../generator/types';

class ResizeObserverMock {
  observe() {}

  unobserve() {}

  disconnect() {}
}

let frameCallbacks: FrameRequestCallback[] = [];
let clock = 0;

function runFrames(count: number) {
  for (let i = 0; i < count; i += 1) {
    clock += 1000 / 60;
    const pending = frameCallbacks;
    frameCallbacks = [];
    // eslint-disable-next-line no-loop-func
    act(() => {
      pending.forEach((callback) => callback(clock));
    });
  }
}

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverMock);
  vi.stubGlobal('matchMedia', vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })));
});

beforeEach(() => {
  frameCallbacks = [];
  clock = 0;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frameCallbacks.push(callback);
    return frameCallbacks.length;
  });
  vi.stubGlobal('cancelAnimationFrame', () => undefined);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
afterAll(() => vi.unstubAllGlobals());

describe('Gallery', () => {
  test('renders one A and one B stimulus for each of the five cues', () => {
    const { container } = render(<MantineProvider><Gallery /></MantineProvider>);
    expect(CUES).toHaveLength(5);
    expect(container.querySelectorAll('[data-testid="stimulus-svg"]')).toHaveLength(2 * CUES.length);
    CUES.forEach((cue) => expect(screen.getByText(`cue: ${cue}`)).toBeTruthy());
    expect(screen.queryByText('cue: hull')).toBeNull();
  });

  test('shows the generator diagnostics, the metric footers and the B / A ratios', () => {
    render(<MantineProvider><Gallery /></MantineProvider>);
    expect(screen.getAllByText(/sizes \[/).length).toBe(CUES.length);
    expect(screen.getAllByText(/attempts \d/).length).toBe(2 * CUES.length);
    expect(screen.getAllByText(/link target \d/).length).toBe(CUES.length);
    const footers = screen.getAllByTestId('metrics-footer');
    expect(footers).toHaveLength(2 * CUES.length);
    footers.forEach((footer) => {
      expect(footer.textContent).toMatch(/ink \d+ px²/);
      expect(footer.textContent).toMatch(/NN mean [\d.]+ \/ min [\d.]+/);
      expect(footer.textContent).toMatch(/hull area \d+/);
    });
    const ratios = screen.getAllByTestId('ratios-line');
    expect(ratios).toHaveLength(CUES.length);
    ratios.forEach((line) => expect(line.textContent).toMatch(/B \/ A: ink [\d.]+ · mean NN [\d.]+/));
  });

  test('shows the palette strip and the static noise mask', () => {
    render(<MantineProvider><Gallery /></MantineProvider>);
    expect(screen.getByText(/Colour cue palette: tilted CIELAB ellipse .* closest pair [\d.]+ CIEDE2000/)).toBeTruthy();
    expect(within(screen.getByTestId('palette-strip')).getAllByText(/^#[0-9A-F]{6}$/)).toHaveLength(6);
    expect(screen.getAllByTestId('noise-mask')).toHaveLength(1);
  });

  test('Play trial runs the real timeline in place, with the chosen interval order', () => {
    render(<MantineProvider><Gallery /></MantineProvider>);
    const row = screen.getByTestId('gallery-row-color');
    fireEvent.click(within(row).getByText('B first'));
    fireEvent.click(within(row).getByRole('button', { name: 'Play trial' }));

    const preview = screen.getByTestId('trial-preview');
    expect(row.contains(preview)).toBe(true);
    expect(within(preview).getByTestId('layer-s1').getAttribute('data-stimulus')).toBe('B');
    expect(within(preview).getByTestId('layer-s2').getAttribute('data-stimulus')).toBe('A');
    expect(within(preview).getByTestId('layer-fixation').style.visibility).toBe('visible');

    // the refresh estimate and the timeline share the fake frames; run well past the fixation and s1
    runFrames(31 + 13 + 3);
    expect(preview.textContent).toMatch(/phase: (s1|mask)/);
    runFrames(200);
    expect(preview.textContent).toContain('phase: end');
  });
});
