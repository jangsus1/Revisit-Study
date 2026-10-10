/**
 * Minimum time on a page before its primary button works. The button stays disabled, and shows a
 * countdown ("Continue · 4 s"), until the page has been open for a fixed number of seconds set per
 * page (introduction 5, instructions 15, examples 5, practice intro 4, main-task intro 3; none on
 * consent, rest, setup or screen size). Until 2026-10-09 the time came from the page's word count
 * at 240 words per minute, with floors; pilot 1 found that too long.
 *
 * The page answer must stay invalid (`status: false`) until `ready`, so reVISit's Enter handler
 * cannot advance the page either; the pages do that with `ready`.
 */
import { Button } from '@mantine/core';
import { ReactNode, useEffect, useState } from 'react';

export interface ReadingTime {
  /** seconds the page must stay open */
  required: number;
  /** whole seconds still to wait */
  remaining: number;
  ready: boolean;
}

/** Counts down `seconds` from the first render; null or 0 means no wait. */
export function useReadingTime(seconds: number | null | undefined): ReadingTime {
  const required = typeof seconds === 'number' && seconds > 0 ? seconds : 0;
  const [start] = useState(() => Date.now());
  const [elapsed, setElapsed] = useState(0);

  // the interval stops once the required time has passed
  useEffect(() => {
    if (elapsed >= required) return undefined;
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 250);
    return () => clearInterval(id);
  }, [elapsed, required, start]);

  const remaining = Math.max(0, required - elapsed);
  return { required, remaining, ready: remaining === 0 };
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
