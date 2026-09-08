/**
 * Session setup: fullscreen, display-timing calibration, and the session salt.
 *
 * The refresh period is estimated from a burst of animation-frame timestamps and then checked by
 * presenting blank intervals of 200 ms and 400 ms with the same frame-count scheduler the trials
 * use, measuring each one paint-to-paint. The whole check takes about a second. The component
 * reports success to reVISit (which enables the Next button) only while the page is in
 * fullscreen; leaving fullscreen disables Next again until it is re-entered.
 */
import {
  Button, Stack, Table, Text, Title,
} from '@mantine/core';
import {
  useCallback, useEffect, useRef, useState,
} from 'react';
import type { JsonValue } from '../../../parser/types';
import type { StimulusParams } from '../../../store/types';
import type { SetupAnswer } from './generator';

export interface SetupCheckParameters {
  /** how many blank intervals to measure; defaults to 2 (one 200 ms, one 400 ms) */
  calibrationIntervals?: number;
  /** how many animation frames to time when estimating the refresh period; defaults to 20 */
  refreshSamples?: number;
}

const DEFAULT_REFRESH_MS = 1000 / 60;
const DEFAULT_INTERVALS = 2;
const DEFAULT_REFRESH_SAMPLES = 20;
const INTERVAL_TARGETS = [200, 400];

/** True when the page is fullscreen, or when the browser has no Fullscreen API (tests, jsdom). */
function fullscreenSatisfied(): boolean {
  if (typeof document === 'undefined') {
    return true;
  }
  if (typeof document.documentElement?.requestFullscreen !== 'function') {
    return true;
  }
  return !!document.fullscreenElement;
}

function median(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** A 31-bit positive integer, from the crypto RNG when it is available. */
function randomSalt(): number {
  const cryptoObj = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined;
  if (cryptoObj && typeof cryptoObj.getRandomValues === 'function') {
    const buffer = new Uint32Array(1);
    cryptoObj.getRandomValues(buffer);
    return Math.floor(buffer[0] / 2);
  }
  return Math.floor(Math.random() * 2147483647);
}

export default function SetupCheck({ parameters, setAnswer }: StimulusParams<SetupCheckParameters | undefined>) {
  const intervalCount = parameters?.calibrationIntervals ?? DEFAULT_INTERVALS;
  const refreshSamples = parameters?.refreshSamples ?? DEFAULT_REFRESH_SAMPLES;

  const [stage, setStage] = useState<'idle' | 'running' | 'done'>('idle');
  const [result, setResult] = useState<SetupAnswer | null>(null);
  const [fullscreen, setFullscreen] = useState(fullscreenSatisfied);
  const rafRef = useRef(0);
  const cancelledRef = useRef(false);

  // React 18 mounts effects twice in development, so the flag is reset on every mount.
  useEffect(() => {
    cancelledRef.current = false;
    return () => {
      cancelledRef.current = true;
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const finish = useCallback((refreshMs: number, calibration: SetupAnswer['calibration']) => {
    const errors = calibration.map(({ targetMs, measuredMs }) => Math.abs(measuredMs - targetMs));
    const answer: SetupAnswer = {
      sessionSalt: randomSalt(),
      refreshMs,
      calibration,
      medianErrorMs: median(errors),
      maxErrorMs: errors.length === 0 ? 0 : Math.max(...errors),
      screen: {
        w: typeof window === 'undefined' ? 0 : window.screen?.width ?? 0,
        h: typeof window === 'undefined' ? 0 : window.screen?.height ?? 0,
        dpr: typeof window === 'undefined' ? 1 : window.devicePixelRatio ?? 1,
      },
      userAgent: typeof navigator === 'undefined' ? '' : navigator.userAgent,
      fullscreen: typeof document !== 'undefined' && !!document.fullscreenElement,
    };

    setResult(answer);
    setStage('done');
    setAnswer({ status: fullscreenSatisfied(), answers: { setup: answer as unknown as JsonValue } });
  }, [setAnswer]);

  // Next is only enabled while fullscreen is active: leaving it invalidates the setup answer.
  useEffect(() => {
    if (typeof document === 'undefined') {
      return undefined;
    }
    const onChange = () => {
      const ok = fullscreenSatisfied();
      setFullscreen(ok);
      if (result) {
        const updated = { ...result, fullscreen: ok };
        setResult(updated);
        setAnswer({ status: ok, answers: { setup: updated as unknown as JsonValue } });
      }
    };
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, [result, setAnswer]);

  const start = useCallback(() => {
    if (typeof document !== 'undefined' && typeof document.documentElement?.requestFullscreen === 'function' && !document.fullscreenElement) {
      // A refused request keeps Next disabled; the summary tells the participant to retry.
      document.documentElement.requestFullscreen().catch(() => undefined);
    }
    setStage('running');

    const samples: number[] = [];
    const calibration: SetupAnswer['calibration'] = [];
    let period = DEFAULT_REFRESH_MS;
    let measuringRefresh = true;
    let intervalIndex = 0;
    let frames = 0;
    let intervalStart = 0;
    let pendingStart = true;
    let finished = false;

    const step = (now: number) => {
      if (cancelledRef.current || finished) {
        return;
      }
      rafRef.current = requestAnimationFrame(step);

      if (measuringRefresh) {
        samples.push(now);
        if (samples.length > refreshSamples) {
          const deltas = samples.slice(1)
            .map((time, index) => time - samples[index])
            .filter((delta) => delta > 0);
          period = deltas.length > 0 ? median(deltas) : DEFAULT_REFRESH_MS;
          measuringRefresh = false;
          pendingStart = true;
        }
        return;
      }

      if (pendingStart) {
        intervalStart = now;
        frames = 0;
        pendingStart = false;
        return;
      }

      frames += 1;
      const targetMs = INTERVAL_TARGETS[intervalIndex % INTERVAL_TARGETS.length];
      if (frames < Math.max(1, Math.round(targetMs / period))) {
        return;
      }

      calibration.push({ targetMs, measuredMs: now - intervalStart });
      intervalIndex += 1;

      if (intervalIndex >= intervalCount) {
        finished = true;
        cancelAnimationFrame(rafRef.current);
        finish(period, calibration);
        return;
      }
      pendingStart = true;
    };

    rafRef.current = requestAnimationFrame(step);
  }, [finish, intervalCount, refreshSamples]);

  if (stage === 'idle') {
    return (
      <Stack align="center" gap="md" mt="xl">
        <Text ta="center" maw={560}>
          The study runs in fullscreen and shows displays for a fifth of a second, so we first
          measure how quickly your screen refreshes. This takes about a second. Please do not
          switch windows while it runs.
        </Text>
        <Button onClick={start}>Enter fullscreen and start calibration</Button>
      </Stack>
    );
  }

  if (stage === 'running' || result === null) {
    return (
      <Stack align="center" gap="md" mt="xl">
        <Text data-testid="setup-running">Measuring your display, please wait.</Text>
      </Stack>
    );
  }

  return (
    <Stack align="center" gap="md" mt="xl" data-testid="setup-summary">
      <Title order={3}>Display check complete</Title>
      <Table withTableBorder w={420}>
        <Table.Tbody>
          <Table.Tr>
            <Table.Td>Refresh period</Table.Td>
            <Table.Td>
              {`${result.refreshMs.toFixed(2)} ms (${(1000 / result.refreshMs).toFixed(1)} Hz)`}
            </Table.Td>
          </Table.Tr>
          <Table.Tr>
            <Table.Td>Intervals measured</Table.Td>
            <Table.Td>{result.calibration.length}</Table.Td>
          </Table.Tr>
          <Table.Tr>
            <Table.Td>Median timing error</Table.Td>
            <Table.Td>{`${result.medianErrorMs.toFixed(1)} ms`}</Table.Td>
          </Table.Tr>
          <Table.Tr>
            <Table.Td>Largest timing error</Table.Td>
            <Table.Td>{`${result.maxErrorMs.toFixed(1)} ms`}</Table.Td>
          </Table.Tr>
          <Table.Tr>
            <Table.Td>Fullscreen</Table.Td>
            <Table.Td>{fullscreen ? 'yes' : 'no'}</Table.Td>
          </Table.Tr>
        </Table.Tbody>
      </Table>
      {fullscreen ? (
        <Text fw={700}>Press Enter to continue</Text>
      ) : (
        <Stack align="center" gap="xs">
          <Text c="red" fw={700} data-testid="setup-fullscreen-required">
            The study can only continue in fullscreen.
          </Text>
          <Button onClick={() => document.documentElement.requestFullscreen().catch(() => undefined)}>
            Return to fullscreen
          </Button>
        </Stack>
      )}
    </Stack>
  );
}
