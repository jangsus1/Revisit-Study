import { Button } from '@mantine/core';
import { useCallback, useEffect, useState } from 'react';
import { StimulusParams } from '../../../store/types';
import { gazeTracker } from './gazeTracker';
import type { HeadPose } from './gazeTracker';
import {
  CalibrationOverlay, FULL_GRID, PURSUIT_MS, VALIDATION_POINTS, useDotSequence,
} from './CalibrationOverlay';
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

// mode 'recalibrate' (halfway through the trials): keep the calibration collected so far and add a new
// dots + pursuit set to it (pooled), one attempt, logged as gazeTracker.midCalib.
type Params = { maxAttempts?: number; acceptPctW?: number; mode?: 'full' | 'recalibrate'; title?: string };

type Phase = 'intro' | 'running' | 'retry' | 'done';

type Position = { distanceCm: number | null; ready: boolean; guideMs: number; overridden: boolean };
type Attempt = ValidationResult & { calib?: CalibPointLog[]; head?: HeadPose | null; position?: Position };

/** Mean of the per-dot head poses of a validation run (reference pose for later head-shift checks). */
function meanPose(points: ValidationResult['points']): HeadPose | null {
  const ps = points.map((p) => p.pose).filter((p): p is HeadPose => !!p);
  if (!ps.length) return null;
  const m = (f: (p: HeadPose) => number, d: number) => Math.round((ps.reduce((a, p) => a + f(p), 0) / ps.length) * d) / d;
  return {
    origin: [m((p) => p.origin[0], 10), m((p) => p.origin[1], 10), m((p) => p.origin[2], 10)],
    head: [m((p) => p.head[0], 1000), m((p) => p.head[1], 1000), m((p) => p.head[2], 1000)],
    n: ps.reduce((a, p) => a + p.n, 0),
  };
}

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
    dot, collecting, message, setMessage, runCalibration, runValidation, fitting, pursuitOn, pursuitDotRef,
  } = useDotSequence();
  // head position over the whole page, marked by screen (incl. right after the dots / while fitting)
  const headLog = useHeadTrace(`${phase}${pursuitOn ? ':pursuit' : ''}${fitting ? ':fitting' : ''}${dot ? ':dots' : ''}`);

  const last = attempts[attempts.length - 1];
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
          ...headLog(),
          trackerError: error,
          device: gazeTracker.device,
          fullscreen: !!document.fullscreenElement,
          fullscreenExits: fullscreenStats.exits,
        }),
      },
    });
  }, [phase, attempts, accepted, last, setAnswer, acceptPctW, error, headLog]);

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
    try {
      await gazeTracker.init();
      // Full calibration starts from scratch; the halfway one adds to (pools with) what is there. Either
      // way the drift offset goes: the refit maps raw estimates straight onto the targets.
      if (recal) await gazeTracker.setOffsetPx(0, 0); else await gazeTracker.resetCalibration();
      setMessage('Follow the dot with your eyes. Keep your head still.');
      // 9 fixation dots, then 20 s of smooth pursuit; the tracker fits all of it on the "Calibrating…" screen
      const calib = await runCalibration(FULL_GRID, 'calib', 1800, 1000, PURSUIT_MS);
      const validation = await runValidation(VALIDATION_POINTS, 1500, 800, 'Checking accuracy');
      const result: Attempt = {
        ...validation, calib, head: meanPose(validation.points), position,
      };
      setAttempts((prev) => {
        const next = [...prev, result];
        const ok = result.meanErrorPctW !== null && result.meanErrorPctW <= acceptPctW;
        setPhase(ok || next.length >= maxAttempts ? 'done' : 'retry');
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setAttempts((prev) => {
        setPhase(prev.length + 1 >= maxAttempts ? 'done' : 'retry');
        return [...prev, {
          points: [], meanErrorPx: null, meanErrorPctW: null, meanOffsetPx: null, viewport: [window.innerWidth, window.innerHeight], hz: 0, position,
        }];
      });
    }
  }, [acceptPctW, maxAttempts, runCalibration, runValidation, setMessage, pos, guideSince, recal]);

  const startLabel = (label: string) => (pos?.ready || !canOverride ? label : `${label} anyway`);

  return (
    <>
      {phase === 'running' && (
        <CalibrationOverlay dot={dot} collecting={collecting} message={message} fitting={fitting} pursuitOn={pursuitOn} pursuitDotRef={pursuitDotRef} />
      )}

      {phase === 'intro' && (
        <Panel
          title={parameters?.title ?? (recal ? "Halfway: short recalibration" : "Calibration")}
          actions={<Button size="lg" onClick={runOnce} disabled={!pos?.ready && !canOverride}>{startLabel('Start')}</Button>}
        >
          Look at each dot, then follow the moving dot.
          <div style={{ marginTop: 22 }}><PositionGuide onChange={setPos} compact /></div>
          <HeadStillNotice />
        </Panel>
      )}

      {phase === 'retry' && (
        <Panel
          title="Let's try again"
          actions={<Button size="lg" onClick={runOnce} disabled={!pos?.ready && !canOverride}>{startLabel(`Recalibrate (${attempts.length + 1}/${maxAttempts})`)}</Button>}
        >
          Follow the dots with your eyes only.
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
