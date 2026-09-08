import { MantineProvider } from '@mantine/core';
import { cleanup, render, screen } from '@testing-library/react';
import {
  afterAll, afterEach, beforeAll, describe, expect, test, vi,
} from 'vitest';
import Gallery from '../Gallery';
import { CUES } from '../generator/types';

class ResizeObserverMock {
  observe() {}

  unobserve() {}

  disconnect() {}
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

afterEach(() => cleanup());
afterAll(() => vi.unstubAllGlobals());

describe('Gallery', () => {
  test('renders one A and one B stimulus for every cue', () => {
    const { container } = render(<MantineProvider><Gallery /></MantineProvider>);
    expect(container.querySelectorAll('[data-testid="stimulus-svg"]')).toHaveLength(2 * CUES.length);
    expect(container.querySelectorAll('[data-testid="stimulus-frame"]')).toHaveLength(2 * CUES.length);
    CUES.forEach((cue) => expect(screen.getByText(`cue: ${cue}`)).toBeTruthy());
  });

  test('shows the generator diagnostics for stimulus A', () => {
    render(<MantineProvider><Gallery /></MantineProvider>);
    expect(screen.getAllByText(/sizes \[/).length).toBe(CUES.length);
    expect(screen.getAllByText(/attempts \d/).length).toBe(2 * CUES.length);
  });
});
