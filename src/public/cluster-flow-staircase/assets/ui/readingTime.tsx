/**
 * Minimum reading time for text-heavy pages. The page's primary button stays disabled, and shows
 * a countdown ("Continue · 12 s"), until the participant has had the page open for
 * N = ceil(words / 240 * 60) seconds, where words are counted from the page's rendered text
 * (silent reading of English non-fiction runs at about 240 words per minute; Brysbaert, 2019,
 * J. Mem. Lang. 109). Figure-heavy pages set a floor instead of relying on the word count.
 *
 * The page answer must stay invalid (`status: false`) until `ready`, so reVISit's Enter handler
 * cannot advance the page either; the pages do that with `ready`.
 */
import { Button } from '@mantine/core';
import {
  ReactNode, RefObject, useEffect, useLayoutEffect, useState,
} from 'react';

export const READING_WPM = 240;

/** Words in `text`: whitespace-separated tokens containing a letter or digit. */
export function countWordsInText(text: string): number {
  return text.split(/\s+/).filter((token) => /[\p{L}\p{N}]/u.test(token)).length;
}

/**
 * Words rendered under `root`, counted text node by text node, so SVG labels and adjacent
 * elements without whitespace between them are not glued together.
 */
export function countWords(root: Node | null): number {
  if (!root) return 0;
  if (root.nodeType === 3) return countWordsInText(root.textContent ?? '');
  let total = 0;
  root.childNodes.forEach((child) => {
    total += countWords(child);
  });
  return total;
}

/** Seconds to read `words` at `READING_WPM`, never below `minSeconds`. */
export function readingSeconds(words: number, minSeconds = 0): number {
  return Math.max(minSeconds, Math.ceil((words / READING_WPM) * 60));
}

export interface ReadingTime {
  /** words counted on the page */
  words: number;
  /** seconds the page must stay open */
  required: number;
  /** whole seconds still to wait */
  remaining: number;
  ready: boolean;
}

/**
 * Counts the words under `ref` once, after the first layout, and counts down from the required
 * reading time. `minSeconds` is the floor for figure-heavy pages; `fixedSeconds` replaces the
 * computed time altogether (a config override, used by the shortened test study); `enabled:
 * false` turns the timer off (ready at once).
 */
export function useReadingTime(
  ref: RefObject<Element | null>,
  { minSeconds = 0, fixedSeconds, enabled = true }: { minSeconds?: number; fixedSeconds?: number; enabled?: boolean } = {},
): ReadingTime {
  const [words, setWords] = useState(0);
  const [required, setRequired] = useState(enabled ? fixedSeconds ?? minSeconds : 0);
  const [elapsed, setElapsed] = useState(0);

  useLayoutEffect(() => {
    if (!enabled) return;
    const counted = countWords(ref.current);
    setWords(counted);
    setRequired(typeof fixedSeconds === 'number' ? fixedSeconds : readingSeconds(counted, minSeconds));
  }, [enabled, fixedSeconds, minSeconds, ref]);

  // Counts from the first render; the interval stops once the required time has passed.
  const [start] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled || elapsed >= required) return undefined;
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 250);
    return () => clearInterval(id);
  }, [enabled, elapsed, required, start]);

  const remaining = enabled ? Math.max(0, required - elapsed) : 0;
  return {
    words, required, remaining, ready: remaining === 0,
  };
}

/** The page's primary button: disabled with a countdown until the reading time has passed. */
export function ReadingButton({
  reading, onClick, children, blockedLabel, testId = 'primary-button',
}: {
  reading: ReadingTime;
  onClick: () => void;
  children: ReactNode;
  /** shown instead of the countdown when something else still blocks the button */
  blockedLabel?: string;
  testId?: string;
}) {
  const waiting = !reading.ready;
  let label: ReactNode = children;
  if (waiting) label = `${children} · ${reading.remaining} s`;
  else if (blockedLabel) label = blockedLabel;
  return (
    <Button
      size="lg"
      data-testid={testId}
      data-ready={!waiting && !blockedLabel}
      disabled={waiting || !!blockedLabel}
      onClick={onClick}
      styles={{ label: { fontVariantNumeric: 'tabular-nums' } }}
    >
      {label}
    </Button>
  );
}
