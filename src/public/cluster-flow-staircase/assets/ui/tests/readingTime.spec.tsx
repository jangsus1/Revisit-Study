import { MantineProvider } from '@mantine/core';
import {
  act, cleanup, fireEvent, render, screen,
} from '@testing-library/react';
import {
  afterEach, beforeEach, describe, expect, test, vi,
} from 'vitest';
import { ReadingButton, useReadingTime } from '../readingTime';

function Page({ seconds, blockedLabel, onClick }: { seconds: number | null; blockedLabel?: string; onClick: () => void }) {
  const reading = useReadingTime(seconds);
  return (
    <MantineProvider>
      <span data-testid="required">{reading.required}</span>
      <ReadingButton reading={reading} blockedLabel={blockedLabel} onClick={onClick}>Continue</ReadingButton>
    </MantineProvider>
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
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
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('useReadingTime and ReadingButton', () => {
  test('disables the button with a countdown for the page\'s fixed time', () => {
    const onClick = vi.fn();
    render(<Page seconds={4} onClick={onClick} />);
    expect(screen.getByTestId('required').textContent).toBe('4');
    const button = screen.getByTestId('primary-button') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.textContent).toBe('Continue · 4 s');
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();

    act(() => { vi.advanceTimersByTime(1000); });
    expect(button.textContent).toBe('Continue · 3 s');
    act(() => { vi.advanceTimersByTime(3000); });
    expect(button.disabled).toBe(false);
    expect(button.textContent).toBe('Continue');
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  test('no time (null or 0) means ready at once', () => {
    render(<Page seconds={null} onClick={() => undefined} />);
    expect((screen.getByTestId('primary-button') as HTMLButtonElement).disabled).toBe(false);
    cleanup();
    render(<Page seconds={0} onClick={() => undefined} />);
    expect(screen.getByTestId('primary-button').textContent).toBe('Continue');
  });

  test('a blocked label waits for the countdown first, then replaces the button text', () => {
    render(<Page seconds={2} blockedLabel="Play both examples to continue" onClick={() => undefined} />);
    const button = screen.getByTestId('primary-button') as HTMLButtonElement;
    expect(button.textContent).toBe('Continue · 2 s');
    act(() => { vi.advanceTimersByTime(2000); });
    expect(button.textContent).toBe('Play both examples to continue');
    expect(button.disabled).toBe(true);
  });
});
