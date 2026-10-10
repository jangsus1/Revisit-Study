/**
 * The setup's silent display test: the real trial timeline (`useTrialTimeline`) on the real trial
 * stage (`TrialStage`), with real displays from `generateTrialPair`, run `DISPLAY_TEST_RUNS` (3)
 * times back to back, each run a fresh mount like a trial. The participant's cue is not known to
 * the setup, so every participant sees the same mid-load case (dense proximity, N_B 24, fixed seeds),
 * at the scale the trials would use without a card. Each phase is measured paint-to-paint exactly as
 * in trials and judged by the guard's off-target rule (`timingGuard.ts`: s1, mask, s2 and mask2 within 25 ms).
 *
 * A round with more than `maxOffRuns` off-target runs is repeated once; the outcome of the last round
 * decides (`displayTestOutcome`). Leaving full screen during a round drops that round's runs and
 * restarts it once full screen is back (the transition itself would disturb the timing).
 *
 * The page says what happens ("Display test" and one line); there is nothing to do.
 */
import {
  CSSProperties, useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import type { Display, DisplayTestResult, DisplayTestRun } from './generator';
import { generateTrialPair, hashSeed } from './generator';
import { GENERATOR_CONFIG as C } from './generator/config';
import type { MeasuredDurations } from './generator/types';
import { TrialStage } from './render/TrialStage';
import { StimulusFrame } from './render/StimulusSVG';
import { stimulusScale } from './stimulusScale';
import {
  DISPLAY_TEST_MAX_OFF_RUNS, DISPLAY_TEST_RUNS, displayTestOutcome, offTargetPhases,
} from './timingGuard';
import { UI } from './ui/theme';
import { useTrialTimeline } from './useTrialTimeline';

/** The displays of the test: the same for every participant. */
export const DISPLAY_TEST_CASE = {
  cue: 'proximity', density: 'dense', nB: 24, hueOffset: 0,
} as const;
export const DISPLAY_TEST_SEEDS: readonly [number, number][] = [[910001, 910002], [920001, 920002], [930001, 930002]];
/** Blank frame before a round's first run, and between runs (about a trial's prompt and answer), ms. */
export const LEAD_IN_MS = 1500;
export const GAP_MS = 800;

export const DISPLAY_TEST_TITLE = 'Display test';
export const DISPLAY_TEST_TEXT = 'A few diagrams will flash for about 10 seconds. Nothing to do.';

const overlayStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 3000,
  background: C.SURROUND,
  color: C.INK,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 16,
  fontFamily: UI.font,
};

interface Pair { displayA: Display; displayB: Display; maskSeed: number; mask2Seed: number }

/** One run: mounts, runs the trial timeline once and reports the measured durations. */
function DisplayTestRunStage({
  pair, refreshMs, scale, onEnd,
}: { pair: Pair; refreshMs: number; scale: number; onEnd: (measured: MeasuredDurations) => void }) {
  const timeline = useTrialTimeline(true, refreshMs);
  const reported = useRef(false);
  const { phase, measured } = timeline;
  useEffect(() => {
    if (phase === 'end' && !reported.current) {
      reported.current = true;
      onEnd({ ...measured.current });
    }
  }, [phase, measured, onEnd]);
  return (
    <TrialStage
      first={pair.displayA}
      second={pair.displayB}
      maskSeed={pair.maskSeed}
      mask2Seed={pair.mask2Seed}
      phase={phase}
      scale={scale}
    />
  );
}

/** The empty frame shown between runs, at the stage's size. */
function BlankStage({ scale }: { scale: number }) {
  const { width, height } = C.CANVAS;
  return (
    <div data-testid="display-test-blank" style={{ width: width * scale, height: height * scale, flex: 'none' }}>
      <div style={{
        width, height, transform: `scale(${scale})`, transformOrigin: 'top left',
      }}
      >
        <StimulusFrame />
      </div>
    </div>
  );
}

export interface DisplayTestProps {
  refreshMs: number;
  maxOffRuns?: number;
  /** full screen was left (the full-screen gate is up): the round pauses and restarts */
  blocked?: boolean;
  onDone: (result: DisplayTestResult) => void;
}

export function DisplayTest({
  refreshMs, maxOffRuns = DISPLAY_TEST_MAX_OFF_RUNS, blocked = false, onDone,
}: DisplayTestProps) {
  const pairs = useMemo<Pair[]>(() => DISPLAY_TEST_SEEDS.map(([seedA, seedB]) => ({
    ...generateTrialPair(seedA, seedB, DISPLAY_TEST_CASE),
    maskSeed: hashSeed(seedA, seedB, 'mask'),
    mask2Seed: hashSeed(seedA, seedB, 'mask2'),
  })), []);

  // the trials' scale without a card, fixed at mount like a trial's
  const [{ scale }] = useState(() => stimulusScale({
    canvasW: C.CANVAS.width,
    canvasH: C.CANVAS.height,
    viewportW: typeof window === 'undefined' ? 0 : window.innerWidth,
    viewportH: typeof window === 'undefined' ? 0 : window.innerHeight,
    pxPerCm: null,
  }));

  const [rounds, setRounds] = useState<DisplayTestRun[][]>([[]]);
  const [running, setRunning] = useState(false);
  const [restarts, setRestarts] = useState(0);
  const [done, setDone] = useState(false);
  const current = rounds[rounds.length - 1];

  // Leaving full screen drops the current round's runs; it restarts once full screen is back.
  useEffect(() => {
    if (!blocked || done) return;
    setRunning(false);
    if (current.length > 0) {
      setRestarts((r) => r + 1);
      setRounds((prev) => [...prev.slice(0, -1), []]);
    }
  }, [blocked, done, current.length]);

  // The next run starts after the lead-in (a round's first run) or the gap between runs.
  useEffect(() => {
    if (running || blocked || done || current.length >= DISPLAY_TEST_RUNS) return undefined;
    const id = setTimeout(() => setRunning(true), current.length === 0 ? LEAD_IN_MS : GAP_MS);
    return () => clearTimeout(id);
  }, [running, blocked, done, current.length]);

  const onEnd = useCallback((measured: MeasuredDurations) => {
    const run: DisplayTestRun = { measured, offPhases: offTargetPhases(measured) };
    setRounds((prev) => [...prev.slice(0, -1), [...prev[prev.length - 1], run]]);
    setRunning(false);
  }, []);

  // A finished round: go on, repeat it once, or end.
  useEffect(() => {
    if (done || current.length < DISPLAY_TEST_RUNS) return;
    const offRuns = rounds.map((runs) => runs.filter((run) => run.offPhases.length > 0).length);
    const outcome = displayTestOutcome(offRuns, maxOffRuns);
    if (outcome === 'repeat') {
      setRounds((prev) => [...prev, []]);
      return;
    }
    setDone(true);
    onDone({
      cue: DISPLAY_TEST_CASE.cue,
      density: DISPLAY_TEST_CASE.density,
      nB: DISPLAY_TEST_CASE.nB,
      seeds: DISPLAY_TEST_SEEDS.map(([a, b]) => [a, b]),
      scale,
      refreshMs,
      maxOffRuns,
      rounds: rounds.map((runs, i) => ({ runs, offRuns: offRuns[i], passed: offRuns[i] <= maxOffRuns })),
      repeated: rounds.length > 1,
      passed: outcome === 'pass',
      restarts,
    });
  }, [current.length, done, maxOffRuns, onDone, refreshMs, restarts, rounds, scale]);

  const runIndex = current.length;
  return (
    <div
      style={overlayStyle}
      data-testid="display-test"
      data-round={rounds.length}
      data-run={runIndex}
      data-scale={scale}
    >
      <div style={{ textAlign: 'center' }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>{DISPLAY_TEST_TITLE}</h1>
        <div data-testid="display-test-text" style={{ fontSize: 17, color: UI.muted, marginTop: 4 }}>{DISPLAY_TEST_TEXT}</div>
      </div>
      {running && !blocked && runIndex < DISPLAY_TEST_RUNS
        ? (
          <DisplayTestRunStage
            key={`${rounds.length}-${runIndex}-${restarts}`}
            pair={pairs[runIndex % pairs.length]}
            refreshMs={refreshMs}
            scale={scale}
            onEnd={onEnd}
          />
        )
        : <BlankStage scale={scale} />}
    </div>
  );
}
