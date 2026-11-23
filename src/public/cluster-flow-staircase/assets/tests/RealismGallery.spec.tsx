import { MantineProvider } from '@mantine/core';
import { render, screen } from '@testing-library/react';
import {
  afterAll, beforeAll, describe, expect, test, vi,
} from 'vitest';
import { REALISM_PRESETS } from '../generator/flowRealism';
import RealismGallery from '../RealismGallery';

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
afterAll(() => vi.unstubAllGlobals());

describe('RealismGallery', () => {
  test('shows one row of three panels per preset', () => {
    render(<MantineProvider><RealismGallery /></MantineProvider>);
    REALISM_PRESETS.forEach((preset) => expect(screen.getByTestId(`realism-row-${preset.key}`)).toBeTruthy());
    expect(screen.getAllByTestId('realism-svg')).toHaveLength(REALISM_PRESETS.length * 3);
  }, 120000);
});
