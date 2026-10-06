import { MantineProvider } from '@mantine/core';
import {
  cleanup, fireEvent, render, screen,
} from '@testing-library/react';
import {
  afterEach, beforeEach, describe, expect, test, vi,
} from 'vitest';
import {
  CARD_W_CM, CardCheck, NOMINAL_CARD_PX, cardResult, impliedScreenInches, isPlausible,
} from '../CardCheck';

vi.mock('../studyContext', () => ({ useStudyProgress: () => null, useUpcomingCell: () => null }));

function setScreen(width: number, height: number) {
  Object.defineProperty(window, 'screen', { configurable: true, value: { width, height } });
}

beforeEach(() => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  }));
  vi.stubGlobal('ResizeObserver', class {
    observe() { return this; }

    unobserve() { return this; }

    disconnect() { return this; }
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderCard() {
  const onDone = vi.fn();
  render(<MantineProvider><CardCheck onDone={onDone} /></MantineProvider>);
  return onDone;
}

describe('card geometry', () => {
  test('converts a matched card width to px per cm and a screen diagonal', () => {
    // a 1440 x 900 screen at 50 px/cm is 1698 px / 50 / 2.54 = 13.4 inches
    const w = 50 * CARD_W_CM;
    expect(impliedScreenInches(w, 1440, 900)).toBeCloseTo(Math.hypot(1440, 900) / 50 / 2.54, 5);
    const result = cardResult(w, 1440, 900, false);
    expect(result.pxPerCm).toBeCloseTo(50, 3);
    expect(result.cardWidthPx).toBe(w);
    expect(result.screenInches).toBe(13.4);
    expect(result.confirmedImplausible).toBe(false);
  });

  test('accepts screens from 11 to 34 inches', () => {
    expect(isPlausible(10.9)).toBe(false);
    expect(isPlausible(11)).toBe(true);
    expect(isPlausible(34)).toBe(true);
    expect(isPlausible(40)).toBe(false);
  });
});

describe('CardCheck', () => {
  test('reports the nominal card size when it implies a plausible screen', () => {
    // 1920 x 1080 at 96 dpi (37.8 px/cm) is about 23 inches
    setScreen(1920, 1080);
    const onDone = renderCard();
    expect(screen.getByTestId('card-picture').getAttribute('width')).toBe(String(NOMINAL_CARD_PX));
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(onDone).toHaveBeenCalledTimes(1);
    const result = onDone.mock.calls[0][0];
    expect(result.cardWidthPx).toBe(NOMINAL_CARD_PX);
    expect(result.pxPerCm).toBeCloseTo(NOMINAL_CARD_PX / CARD_W_CM, 2);
    expect(result.screenInches).toBeGreaterThan(20);
    expect(result.confirmedImplausible).toBe(false);
  });

  test('asks for a second look at an implausible size and records the confirmation', () => {
    // a 4000 px wide screen at 96 dpi would be about 48 inches
    setScreen(4000, 2500);
    const onDone = renderCard();
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(onDone).not.toHaveBeenCalled();
    expect(screen.getByTestId('card-warning')).toBeTruthy();

    // going back hides the warning, then confirming keeps the size
    fireEvent.click(screen.getByRole('button', { name: 'Check the card again' }));
    expect(screen.queryByTestId('card-warning')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    fireEvent.click(screen.getByRole('button', { name: 'My screen really is this size' }));
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onDone.mock.calls[0][0].confirmedImplausible).toBe(true);
    expect(onDone.mock.calls[0][0].screenInches).toBeGreaterThan(34);
  });

  test('"I have no card" reports null', () => {
    setScreen(1920, 1080);
    const onDone = renderCard();
    fireEvent.click(screen.getByRole('button', { name: 'I have no card' }));
    expect(onDone).toHaveBeenCalledWith(null);
  });
});
