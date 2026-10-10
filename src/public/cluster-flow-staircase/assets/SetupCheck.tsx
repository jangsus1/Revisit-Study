/**
 * Session setup, in two stages on the study's Panel pages:
 *  1. Full screen and display timing. One button ("Enter full screen") enters full screen and starts
 *     the calibration, silently (the participant only sees "One moment…"): the refresh period is
 *     estimated from a burst of animation-frame timestamps and then checked by presenting blank
 *     intervals of 200 ms and 400 ms with the same frame-count scheduler the trials use, measuring
 *     each one paint-to-paint (about a second). The display test and the card check follow.
 *  2. Screen size: the card check (`ui/CardCheck.tsx`) gives CSS px per cm, which sets the
 *     stimulus size of every trial (`stimulusScale.ts`). "I have no card" stores nulls.
 * Between the two, with `minScreenWidth` / `minScreenHeight` set, the full-screen viewport is checked
 * against the study's minimum (`screenCheck.ts`; the largest viewport seen within `SCREEN_SETTLE_MS`
 * of the end of the calibration, so the full-screen transition has finished): a smaller screen ends
 * the session at once on `ScreenTooSmall` (rejected in reVISit, sent back to Prolific), and so does a
 * phone or tablet that got past reVISit's device rules (portrait viewport or no fine pointer), before the
 * participant spends time on instructions and practice.
 * Display-timing guard (`timingGuard.ts`): a refresh estimate outside 50 to 300 Hz is re-measured once
 * (after a second, in case the full-screen transition disturbed it); a re-measured estimate below
 * 25 Hz or above 300 Hz ends the session at once (`ScreenTooSmall` with reason 'timing'). After the
 * screen check, the silent display test (`DisplayTest.tsx`) runs the real trial timeline three times
 * with real displays; a failed round is repeated once, and a second failure ends the session too.
 * Its results are stored as `displayTest`.
 * The setup answer (session salt, timing, card) is written once, at the end, and the page then
 * advances by itself. A refused full-screen request is recorded (`fullscreen: false`), not blocking;
 * leaving full screen after it was entered brings up the full-screen gate.
 */
import { Button, Loader } from '@mantine/core';
import {
  useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import type { JsonValue } from '../../../parser/types';
import type { StimulusParams } from '../../../store/types';
import type { SetupAnswer } from './generator';
import { DisplayTest } from './DisplayTest';
import { ScreenTooSmall } from './ScreenTooSmall';
import {
  MinScreen, SCREEN_SETTLE_MS, deviceUnsupported, hasFinePointer, screenTooSmall,
} from './screenCheck';
import {
  DEFAULT_REFRESH_LIMITS, DISPLAY_TEST_MAX_OFF_RUNS, REFRESH_RETRY_DELAY_MS, RefreshLimits,
  displayTestRejectionReason, refreshEndsSession, refreshNeedsRemeasure, refreshRejectionReason,
} from './timingGuard';
import { CardCheck, CardResult } from './ui/CardCheck';
import { enterFullscreen, fullscreenSession, useFullscreenGate } from './ui/fullscreen';
import { FullscreenGate, FullscreenGatePanel, Panel } from './ui/Panel';
import { UI } from './ui/theme';

export interface SetupCheckParameters {
  /** how many blank intervals to measure; defaults to 2 (one 200 ms, one 400 ms) */
  calibrationIntervals?: number;
  /** how many animation frames to time when estimating the refresh period; defaults to 20 */
  refreshSamples?: number;
  /** minimum full-screen viewport, CSS px; no screen check unless both are set */
  minScreenWidth?: number;
  minScreenHeight?: number;
  /** shown and used on the screen-too-small page (main config only) */
  prolificCode?: string;
  redirectUrl?: string;
  redirectDelayMs?: number;
  /**
   * display-timing guard thresholds (`timingGuard.ts`); the defaults are the study's. The test study
   * sets values that cannot trip in CI.
   */
  refreshRemeasureBelowHz?: number;
  refreshEndBelowHz?: number;
  refreshEndAboveHz?: number;
  /** a display-test round fails with more off-target runs than this (default 1, i.e. 2 of 3) */
  displayTestMaxOffRuns?: number;
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

type Timing = Pick<SetupAnswer, 'refreshMs' | 'refreshEstimatesMs' | 'calibration' | 'medianErrorMs' | 'maxErrorMs'>;
type Stage = 'idle' | 'running' | 'checking' | 'tooSmall' | 'displayTest' | 'timingFailed' | 'card' | 'done';

export default function SetupCheck({ parameters, setAnswer, advance }: StimulusParams<SetupCheckParameters | undefined>) {
  const intervalCount = parameters?.calibrationIntervals ?? DEFAULT_INTERVALS;
  const refreshSamples = parameters?.refreshSamples ?? DEFAULT_REFRESH_SAMPLES;

  const minW = parameters?.minScreenWidth;
  const minH = parameters?.minScreenHeight;
  const minScreen: MinScreen | null = useMemo(() => (minW && minH ? { width: minW, height: minH } : null), [minW, minH]);
  const refreshRemeasureBelowHz = parameters?.refreshRemeasureBelowHz ?? DEFAULT_REFRESH_LIMITS.remeasureBelowHz;
  const refreshEndBelowHz = parameters?.refreshEndBelowHz ?? DEFAULT_REFRESH_LIMITS.endBelowHz;
  const refreshEndAboveHz = parameters?.refreshEndAboveHz ?? DEFAULT_REFRESH_LIMITS.endAboveHz;
  const refreshLimits: RefreshLimits = useMemo(() => ({
    remeasureBelowHz: refreshRemeasureBelowHz, endBelowHz: refreshEndBelowHz, endAboveHz: refreshEndAboveHz,
  }), [refreshRemeasureBelowHz, refreshEndBelowHz, refreshEndAboveHz]);
  const displayTestMaxOffRuns = parameters?.displayTestMaxOffRuns ?? DISPLAY_TEST_MAX_OFF_RUNS;
  const [stage, setStage] = useState<Stage>('idle');
  const [viewport, setViewport] = useState<{ width: number, height: number, device: boolean, fine: boolean } | null>(null);
  const [timing, setTiming] = useState<Timing | null>(null);
  const [displayTest, setDisplayTest] = useState<SetupAnswer['displayTest'] | null>(null);
  const [timingReason, setTimingReason] = useState<string | null>(null);
  // the display test pauses while full screen is left; this page's own gate shares the hook's state
  const { blocked, returnToFullscreen } = useFullscreenGate();
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

  const finishTiming = useCallback((refreshMs: number, refreshEstimatesMs: number[], calibration: SetupAnswer['calibration']) => {
    const errors = calibration.map(({ targetMs, measuredMs }) => Math.abs(measuredMs - targetMs));
    setTiming({
      refreshMs,
      refreshEstimatesMs,
      calibration,
      medianErrorMs: median(errors),
      maxErrorMs: errors.length === 0 ? 0 : Math.max(...errors),
    });
    // the timing is measured silently: on to the full-screen size check (if any), the display test,
    // then the card check
    setStage(minScreen ? 'checking' : 'displayTest');
  }, [minScreen]);

  const endForTiming = useCallback((reason: string) => {
    setTimingReason(reason);
    setStage('timingFailed');
  }, []);

  const onDisplayTestDone = useCallback((result: NonNullable<SetupAnswer['displayTest']>) => {
    setDisplayTest(result);
    if (result.passed) {
      setStage('card');
    } else {
      const last = result.rounds[result.rounds.length - 1];
      endForTiming(displayTestRejectionReason(last?.offRuns ?? 0, last?.runs.length));
    }
  }, [endForTiming]);

  // Judge the full-screen viewport by the largest size seen within SCREEN_SETTLE_MS (full screen only
  // ever grows the viewport, and its transition may still be running when the calibration ends).
  useEffect(() => {
    if (stage !== 'checking' || !minScreen || typeof window === 'undefined') return undefined;
    let width = window.innerWidth;
    let height = window.innerHeight;
    const onResize = () => {
      width = Math.max(width, window.innerWidth);
      height = Math.max(height, window.innerHeight);
    };
    window.addEventListener('resize', onResize);
    const id = setTimeout(() => {
      onResize();
      const fine = hasFinePointer();
      const device = deviceUnsupported(width, height, fine);
      setViewport({
        width, height, device, fine,
      });
      setStage(device || screenTooSmall(width, height, minScreen) ? 'tooSmall' : 'displayTest');
    }, SCREEN_SETTLE_MS);
    return () => {
      window.removeEventListener('resize', onResize);
      clearTimeout(id);
    };
  }, [stage, minScreen]);

  const finishSetup = useCallback((card: CardResult | null) => {
    if (!timing) return;
    const answer: SetupAnswer = {
      sessionSalt: randomSalt(),
      ...timing,
      ...(displayTest ? { displayTest } : {}),
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
  }, [advance, displayTest, setAnswer, timing]);

  const start = useCallback(() => {
    // A refused request is recorded in the answer (`fullscreen: false`); the calibration runs anyway.
    enterFullscreen();
    setStage('running');

    let samples: number[] = [];
    const estimates: number[] = [];
    const calibration: SetupAnswer['calibration'] = [];
    let period = DEFAULT_REFRESH_MS;
    let measuringRefresh = true;
    let retryAt: number | null = null;
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
        // the re-measurement waits REFRESH_RETRY_DELAY_MS first
        if (retryAt !== null && now < retryAt) return;
        samples.push(now);
        if (samples.length > refreshSamples) {
          const deltas = samples.slice(1)
            .map((time, index) => time - samples[index])
            .filter((delta) => delta > 0);
          period = deltas.length > 0 ? median(deltas) : DEFAULT_REFRESH_MS;
          estimates.push(period);
          // refresh guard: re-measure an estimate outside 50-300 Hz once; end below 25 or above 300 Hz
          if (estimates.length === 1 && refreshNeedsRemeasure(period, refreshLimits)) {
            samples = [];
            retryAt = now + REFRESH_RETRY_DELAY_MS;
            return;
          }
          if (estimates.length > 1 && refreshEndsSession(period, refreshLimits)) {
            finished = true;
            cancelAnimationFrame(rafRef.current);
            endForTiming(refreshRejectionReason(period));
            return;
          }
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
        finishTiming(period, estimates, calibration);
        return;
      }
      pendingStart = true;
    };

    rafRef.current = requestAnimationFrame(step);
  }, [endForTiming, finishTiming, intervalCount, refreshLimits, refreshSamples]);

  const gate = stage === 'idle' ? null : <FullscreenGate />;

  if (stage === 'idle') {
    return (
      <Panel
        testId="setup-start"
        title="Full screen"
        actions={<Button size="lg" onClick={start}>Enter full screen</Button>}
      >
        The study runs in full screen.
      </Panel>
    );
  }

  if (stage === 'tooSmall' && viewport && minScreen) {
    return (
      <ScreenTooSmall
        width={viewport.width}
        height={viewport.height}
        min={minScreen}
        reason={viewport.device ? 'device' : 'size'}
        finePointer={viewport.fine}
        prolificCode={parameters?.prolificCode}
        redirectUrl={parameters?.redirectUrl}
        redirectDelayMs={parameters?.redirectDelayMs}
      />
    );
  }

  if (stage === 'timingFailed' && timingReason) {
    return (
      <ScreenTooSmall
        reason="timing"
        timingReason={timingReason}
        prolificCode={parameters?.prolificCode}
        redirectUrl={parameters?.redirectUrl}
        redirectDelayMs={parameters?.redirectDelayMs}
      />
    );
  }

  if (stage === 'displayTest' && timing) {
    return (
      <>
        <DisplayTest
          refreshMs={timing.refreshMs}
          maxOffRuns={displayTestMaxOffRuns}
          blocked={blocked}
          onDone={onDisplayTestDone}
        />
        {blocked && <FullscreenGatePanel onReturn={returnToFullscreen} />}
      </>
    );
  }

  if (stage === 'running' || stage === 'checking' || timing === null) {
    return (
      <>
        <Panel testId="setup-running" title="One moment…">
          <Loader color={UI.accent} />
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
