/**
 * Session setup, in two stages on the study's Panel pages:
 *  1. Full screen and display timing. One button enters full screen and starts the calibration: the
 *     refresh period is estimated from a burst of animation-frame timestamps and then checked by
 *     presenting blank intervals of 200 ms and 400 ms with the same frame-count scheduler the trials
 *     use, measuring each one paint-to-paint (about a second). A short result and Continue follow.
 *  2. Screen size: the card check (`ui/CardCheck.tsx`) gives CSS px per cm, which sets the
 *     stimulus size of every trial (`stimulusScale.ts`). "I have no card" stores nulls.
 * The setup answer (session salt, timing, card) is written once, at the end, and the page then
 * advances by itself. A refused full-screen request is recorded (`fullscreen: false`), not blocking;
 * leaving full screen after it was entered brings up the full-screen gate.
 */
import { Button, Loader } from '@mantine/core';
import {
  useCallback, useEffect, useRef, useState,
} from 'react';
import type { JsonValue } from '../../../parser/types';
import type { StimulusParams } from '../../../store/types';
import type { SetupAnswer } from './generator';
import { CardCheck, CardResult } from './ui/CardCheck';
import { enterFullscreen, fullscreenSession } from './ui/fullscreen';
import { FullscreenGate, Panel } from './ui/Panel';
import { UI } from './ui/theme';

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

type Timing = Pick<SetupAnswer, 'refreshMs' | 'calibration' | 'medianErrorMs' | 'maxErrorMs'>;

export default function SetupCheck({ parameters, setAnswer, advance }: StimulusParams<SetupCheckParameters | undefined>) {
  const intervalCount = parameters?.calibrationIntervals ?? DEFAULT_INTERVALS;
  const refreshSamples = parameters?.refreshSamples ?? DEFAULT_REFRESH_SAMPLES;

  const [stage, setStage] = useState<'idle' | 'running' | 'timed' | 'card' | 'done'>('idle');
  const [timing, setTiming] = useState<Timing | null>(null);
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

  const finishTiming = useCallback((refreshMs: number, calibration: SetupAnswer['calibration']) => {
    const errors = calibration.map(({ targetMs, measuredMs }) => Math.abs(measuredMs - targetMs));
    setTiming({
      refreshMs,
      calibration,
      medianErrorMs: median(errors),
      maxErrorMs: errors.length === 0 ? 0 : Math.max(...errors),
    });
    setStage('timed');
  }, []);

  const finishSetup = useCallback((card: CardResult | null) => {
    if (!timing) return;
    const answer: SetupAnswer = {
      sessionSalt: randomSalt(),
      ...timing,
      screen: {
        w: typeof window === 'undefined' ? 0 : window.screen?.width ?? 0,
        h: typeof window === 'undefined' ? 0 : window.screen?.height ?? 0,
        dpr: typeof window === 'undefined' ? 1 : window.devicePixelRatio ?? 1,
      },
      userAgent: typeof navigator === 'undefined' ? '' : navigator.userAgent,
      fullscreen: typeof document !== 'undefined' && !!document.fullscreenElement,
      fullscreenExits: fullscreenSession.exits,
      pxPerCm: card?.pxPerCm ?? null,
      cardWidthPx: card?.cardWidthPx ?? null,
      screenInches: card?.screenInches ?? null,
      confirmedImplausible: card?.confirmedImplausible ?? false,
    };
    setStage('done');
    setAnswer({ status: true, answers: { setup: answer as unknown as JsonValue } });
    advance?.();
  }, [advance, setAnswer, timing]);

  // Enter continues from the timing result to the card check (the page answer is not valid yet,
  // so reVISit's own Enter handler does nothing here).
  useEffect(() => {
    if (stage !== 'timed') return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Enter' && !event.repeat) {
        event.preventDefault();
        setStage('card');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [stage]);

  const start = useCallback(() => {
    // A refused request is recorded in the answer (`fullscreen: false`); the calibration runs anyway.
    enterFullscreen();
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
        finishTiming(period, calibration);
        return;
      }
      pendingStart = true;
    };

    rafRef.current = requestAnimationFrame(step);
  }, [finishTiming, intervalCount, refreshSamples]);

  const gate = stage === 'idle' ? null : <FullscreenGate />;

  if (stage === 'idle') {
    return (
      <Panel
        testId="setup-start"
        kicker="Display check · 1 of 2"
        title="Full screen and display timing"
        actions={<Button size="lg" onClick={start}>Enter full screen and start</Button>}
      >
        The diagrams flash for a fifth of a second, so the study runs in full screen and first
        checks how fast your screen refreshes. This takes about a second; please do not switch
        windows.
      </Panel>
    );
  }

  if (stage === 'running' || timing === null) {
    return (
      <>
        <Panel testId="setup-running" kicker="Display check · 1 of 2" title="Measuring your display">
          <Loader color={UI.accent} />
        </Panel>
        {gate}
      </>
    );
  }

  if (stage === 'timed') {
    return (
      <>
        <Panel
          testId="setup-summary"
          kicker="Display check · 1 of 2"
          title="Display timing checked"
          actions={<Button size="lg" onClick={() => setStage('card')}>Continue</Button>}
        >
          <div style={{
            display: 'flex', justifyContent: 'center', gap: 36, marginTop: 4,
          }}
          >
            <div>
              <div style={{ fontSize: 30, fontWeight: 700, color: UI.ink }} data-testid="setup-hz">
                {`${(1000 / timing.refreshMs).toFixed(1)} Hz`}
              </div>
              <div style={{ fontSize: 15 }}>screen refresh</div>
            </div>
            <div>
              <div style={{ fontSize: 30, fontWeight: 700, color: UI.ink }}>{`${timing.medianErrorMs.toFixed(1)} ms`}</div>
              <div style={{ fontSize: 15 }}>timing error</div>
            </div>
          </div>
        </Panel>
        {gate}
      </>
    );
  }

  return (
    <>
      {stage === 'card' ? <CardCheck onDone={finishSetup} /> : <Panel title="Starting" />}
      {gate}
    </>
  );
}
