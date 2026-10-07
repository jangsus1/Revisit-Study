import { MantineProvider } from '@mantine/core';
import {
  act, cleanup, fireEvent, render, screen,
} from '@testing-library/react';
import { useRef } from 'react';
import {
  afterEach, beforeEach, describe, expect, test, vi,
} from 'vitest';
import {
  READING_WPM, ReadingButton, countWords, countWordsInText, readingSeconds, useReadingTime,
} from '../readingTime';

function Page({
  text, minSeconds, fixedSeconds, onClick,
}: { text: string; minSeconds?: number; fixedSeconds?: number; onClick: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const reading = useReadingTime(ref, { minSeconds, fixedSeconds });
  return (
    <MantineProvider>
      <div ref={ref}><p>{text}</p></div>
      <span data-testid="words">{reading.words}</span>
      <span data-testid="required">{reading.required}</span>
      <ReadingButton reading={reading} onClick={onClick}>Continue</ReadingButton>
    </MantineProvider>
  );
}

const words = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`).join(' ');

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

describe('word count', () => {
  test('counts tokens with a letter or digit, not punctuation', () => {
    expect(countWordsInText('Two diagrams flash — one after the other.')).toBe(7);
    expect(countWordsInText('  ·  ')).toBe(0);
    expect(countWordsInText('0.2 s')).toBe(2);
  });

  test('counts text node by text node, so adjacent labels are not glued together', () => {
    const root = document.createElement('div');
    root.innerHTML = '<span>STEP</span><span>1</span><svg><text>Look at</text><text>the cross</text></svg>';
    // textContent would read "STEP1Look atthe cross" (3 tokens)
    expect(countWords(root)).toBe(6);
    expect(countWords(null)).toBe(0);
  });

  test('reading time is ceil(words / 240 wpm * 60) seconds, never below the floor', () => {
    expect(READING_WPM).toBe(240);
    expect(readingSeconds(240)).toBe(60);
    expect(readingSeconds(241)).toBe(61);
    expect(readingSeconds(10)).toBe(3);
    expect(readingSeconds(10, 8)).toBe(8);
    expect(readingSeconds(0)).toBe(0);
  });
});

describe('useReadingTime and ReadingButton', () => {
  test('counts the rendered words and disables the button with a countdown until they are read', () => {
    const onClick = vi.fn();
    render(<Page text={words(40)} onClick={onClick} />);
    expect(screen.getByTestId('words').textContent).toBe('40');
    expect(screen.getByTestId('required').textContent).toBe('10');
    const button = screen.getByTestId('primary-button') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.textContent).toBe('Continue · 10 s');
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();

    act(() => { vi.advanceTimersByTime(4000); });
    expect(button.textContent).toBe('Continue · 6 s');
    act(() => { vi.advanceTimersByTime(6000); });
    expect(button.disabled).toBe(false);
    expect(button.textContent).toBe('Continue');
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  test('a floor raises a short page\'s time and a fixed override replaces it', () => {
    render(<Page text="Two words" minSeconds={8} onClick={() => undefined} />);
    expect(screen.getByTestId('required').textContent).toBe('8');
    cleanup();
    render(<Page text={words(400)} fixedSeconds={1} onClick={() => undefined} />);
    expect(screen.getByTestId('required').textContent).toBe('1');
  });

  test('a blocked label waits for the countdown first, then replaces the button text', () => {
    function Blocked() {
      const ref = useRef<HTMLDivElement>(null);
      const reading = useReadingTime(ref, { fixedSeconds: 2 });
      return (
        <MantineProvider>
          <div ref={ref} />
          <ReadingButton reading={reading} blockedLabel="Play both examples to continue" onClick={() => undefined}>Continue</ReadingButton>
        </MantineProvider>
      );
    }
    render(<Blocked />);
    const button = screen.getByTestId('primary-button') as HTMLButtonElement;
    expect(button.textContent).toBe('Continue · 2 s');
    act(() => { vi.advanceTimersByTime(2000); });
    expect(button.textContent).toBe('Play both examples to continue');
    expect(button.disabled).toBe(true);
  });
});
