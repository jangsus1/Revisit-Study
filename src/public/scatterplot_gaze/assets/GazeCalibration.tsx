import { Button } from '@mantine/core';
import {
  useCallback, useEffect, useRef, useState,
} from 'react';
import { StimulusParams } from '../../../store/types';
import { gazeTracker } from './gazeTracker';
import type { HeadPose } from './gazeTracker';
import {
  CalibrationOverlay, FULL_GRID, VALIDATION_POINTS, meanPose, useDotSequence,
} from './CalibrationOverlay';
import { taskCalibPoints } from './taskLayout';
import type { CalibPointLog, ValidationResult } from './CalibrationOverlay';
import { PositionGuide } from './PositionGuide';
import { useHeadTrace } from './headTrace';
import {
  FullscreenGate, HeadStillNotice, Panel, fullscreenStats,
} from './FullScreen';
import type { PositionState } from './PositionGuide';

// After this long on the guide the participant may start even if the distance never reads "good"
// (the estimate assumes a typical webcam field of view and can be off for unusual cameras).
const OVERRIDE_MS = 30000;

// Calibration dots (2026-09-30): the 3x3 grid (10/50/90 % of the viewport) plus 6 dots on the trial plot
// (y label, 4 plot quadrants, x label; taskLayout.ts), so the fit separates the regions the trials use.
// No smooth pursuit. mode 'recalibrate' (halfway through the trials): keep the calibration collected so
// far and add a new set of the same 15 dots to it (pooled), one attempt, logged as gazeTracker.midCalib.
type Params = { maxAttempts?: number; acceptPctW?: number; mode?: 'full' | 'recalibrate'; title?: string };

type Phase = 'intro' | 'running' | 'retry' | 'done';

type Position = { distanceCm: number | null; ready: boolean; guideMs: number; overridden: boolean };
type Attempt = ValidationResult & { calib?: CalibPointLog[]; head?: HeadPose | null; position?: Position };

function GazeCalibration({ parameters, setAnswer, advance }: StimulusParams<Params>) {
  const recal = parameters?.mode === 'recalibrate';
  const maxAttempts = recal ? 1 : parameters?.maxAttempts ?? 3;
  const acceptPctW = parameters?.acceptPctW ?? 0.08;

  const [phase, setPhase] = useState<Phase>('intro');
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pos, setPos] = useState<PositionState | null>(null);
  const [guideSince, setGuideSince] = useState(() => performance.now());
  const [canOverride, setCanOverride] = useState(false);
  const {
    dot, collecting, message, setMessage, runCalibration, runValidation, fitting,
  } = useDotSequence();
  // head position over the whole page, marked by screen (incl. right after the dots / while fitting)
  const headLog = useHeadTrace(`${phase}${fitting ? ':fitting' : ''}${dot ? ':dots' : ''}`);

  // The model in use at the end is the best-validated attempt (a later, worse attempt no longer replaces a
  // better one; 2026-09-30). usedIdx = index of that attempt; `last` below is that attempt.
  const [usedIdx, setUsedIdx] = useState<number | null>(null);
  const [rolledBack, setRolledBack] = useState(false);
  const attemptsRef = useRef<Attempt[]>([]);
  const bestRef = useRef<{ idx: number; err: number; state: unknown; offset: [number, number] } | null>(null);
  const last = attempts[usedIdx ?? attempts.length - 1];
  const accepted = last?.meanErrorPctW !== null && last?.meanErrorPctW !== undefined && last.meanErrorPctW <= acceptPctW;

  // Block Next until the calibration procedure has finished (accepted or attempts exhausted)
  useEffect(() => {
    const finished = phase === 'done';
    const summary = {
      engine: gazeTracker.engine,
      mode: (recal ? 'recalibrate' : 'full') as 'recalibrate' | 'full',
      attempts: attempts.length,
      accepted,
      meanErrorPx: last?.meanErrorPx ?? null,
      meanErrorPctW: last?.meanErrorPctW ?? null,
      meanErrorDeg: gazeTracker.pxToDeg(last?.meanErrorPx),
      viewport: [window.innerWidth, window.innerHeight] as [number, number],
    };
    if (finished) {
      if (recal) gazeTracker.midCalib = summary; else gazeTracker.fullCalib = summary;
      // a "Recalibrate briefly" request is served by this calibration
      gazeTracker.userRecalRequested = false;
      // head-shift reference = pose at the latest full calibration
      gazeTracker.calibHead = last?.head ?? gazeTracker.calibHead ?? null;
    }
    setAnswer({
      status: finished,
      answers: {
        calibration: JSON.stringify({
          ...summary,
          acceptPctW,
          windowPos: [window.screenX, window.screenY, window.outerWidth, window.outerHeight],
          screen: [window.screen.width, window.screen.height],
          dpr: window.devicePixelRatio,
          inferenceHz: Math.round(gazeTracker.hz * 10) / 10,
          perAttempt: attempts,
          usedAttempt: usedIdx === null ? null : usedIdx + 1,
          rolledBack,
          frameErrors: gazeTracker.frameErrors,
          cameraLostCount: gazeTracker.cameraLostCount,
          ...headLog(),
          trackerError: error,
          device: gazeTracker.device,
          fullscreen: !!document.fullscreenElement,
          fullscreenExits: fullscreenStats.exits,
        }),
      },
    });
  }, [phase, attempts, accepted, last, setAnswer, acceptPctW, error, headLog, usedIdx, rolledBack]);

  // Camera is normally already on (webcamPermission page); start it here otherwise so the guide has video
  useEffect(() => { gazeTracker.init().catch(() => {}); }, []);

  // The guide is shown on the intro and retry screens; allow "start anyway" after OVERRIDE_MS there
  useEffect(() => {
    if (phase !== 'intro' && phase !== 'retry') return undefined;
    setGuideSince(performance.now());
    setCanOverride(false);
    const t = setTimeout(() => setCanOverride(true), OVERRIDE_MS);
    return () => clearTimeout(t);
  }, [phase]);

  const runOnce = useCallback(async () => {
    const position: Position = {
      distanceCm: pos?.distanceCm === null || pos?.distanceCm === undefined ? null : Math.round(pos.distanceCm),
      ready: !!pos?.ready,
      guideMs: Math.round(performance.now() - guideSince),
      overridden: !pos?.ready,
    };
    setPhase('running');
    setError(null);
    const idx = attemptsRef.current.length;
    let before: { state: unknown; offset: [number, number] } | null = null;
    const finish = (result: Attempt) => {
      const next = [...attemptsRef.current, result];
      attemptsRef.current = next;
      const err = result.meanErrorPx;
      if (!recal && err !== null && (!bestRef.current || err < bestRef.current.err)) {
        bestRef.current = {
          idx, err, state: gazeTracker.getCalibState(), offset: [...gazeTracker.offset] as [number, number],
        };
      }
      const ok = result.meanErrorPctW !== null && result.meanErrorPctW <= acceptPctW;
      const done = ok || next.length >= maxAttempts;
      let used = idx;
      if (done && !recal && bestRef.current && bestRef.current.idx !== idx) {
        // keep the best attempt's model, not the last one
        gazeTracker.setCalibState(bestRef.current.state, bestRef.current.offset);
        used = bestRef.current.idx;
      }
      if (done && recal && err === null && before) {
        // the halfway recalibration produced nothing usable: go back to the model before it
        gazeTracker.setCalibState(before.state, before.offset);
        setRolledBack(true);
      }
      setAttempts(next);
      setUsedIdx(used);
      setPhase(done ? 'done' : 'retry');
    };
    try {
      await gazeTracker.init();
      if (recal) before = { state: gazeTracker.getCalibState(), offset: [...gazeTracker.offset] as [number, number] };
      // Full calibration starts from scratch; the halfway one adds to (pools with) what is there. Either
      // way the drift offset goes: the refit maps raw estimates straight onto the targets.
      if (recal) await gazeTracker.setOffsetPx(0, 0); else await gazeTracker.resetCalibration();
      setMessage('Look at each dot. Keep your head still.');
      // 9 grid dots + 6 task-region dots; the tracker fits all of it on the "Calibrating…" screen
      const calib = await runCalibration([...FULL_GRID, ...taskCalibPoints()], 'calib', 1800, 1000);
      const validation = await runValidation(VALIDATION_POINTS, 1500, 800, 'Checking accuracy');
      finish({
        ...validation, calib, head: meanPose(validation.points), position,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      finish({
        points: [], meanErrorPx: null, meanErrorPctW: null, meanOffsetPx: null, viewport: [window.innerWidth, window.innerHeight], hz: 0, position,
      });
    }
  }, [acceptPctW, maxAttempts, runCalibration, runValidation, setMessage, pos, guideSince, recal]);

  const startLabel = (label: string) => (pos?.ready || !canOverride ? label : `${label} anyway`);

  return (
    <>
      {phase === 'running' && (
        <CalibrationOverlay dot={dot} collecting={collecting} message={message} fitting={fitting} />
      )}

      {phase === 'intro' && (
        <Panel
          title={parameters?.title ?? (recal ? "Halfway: short recalibration" : "Calibration")}
          actions={<Button size="lg" onClick={runOnce} disabled={!pos?.ready && !canOverride}>{startLabel('Start')}</Button>}
        >
          Look at each dot until it disappears.
          <div style={{ marginTop: 22 }}><PositionGuide onChange={setPos} compact /></div>
          <HeadStillNotice />
        </Panel>
      )}

      {phase === 'retry' && (
        <Panel
          title="Let's try again"
          actions={<Button size="lg" onClick={runOnce} disabled={!pos?.ready && !canOverride}>{startLabel(`Recalibrate (${attempts.length + 1}/${maxAttempts})`)}</Button>}
        >
          Look at each dot with your eyes only.
          <div style={{ marginTop: 22 }}><PositionGuide onChange={setPos} compact /></div>
          <HeadStillNotice />
        </Panel>
      )}

      {phase === 'done' && (
        <Panel title="Calibration done" actions={<Button size="lg" onClick={() => advance?.()}>Continue</Button>}>
          <HeadStillNotice>Stay exactly in this position. Move only your eyes.</HeadStillNotice>
        </Panel>
      )}
      <FullscreenGate />
    </>
  );
}

export default GazeCalibration;
