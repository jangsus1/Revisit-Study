import {
  Box, Button, List, Text, Title,
} from '@mantine/core';
import { useCallback, useEffect, useState } from 'react';
import { StimulusParams } from '../../../store/types';
import { gazeTracker } from './gazeTracker';
import type { HeadPose } from './gazeTracker';
import {
  CalibrationOverlay, FULL_GRID, PURSUIT_MS, VALIDATION_POINTS, useDotSequence,
} from './CalibrationOverlay';
import type { CalibPointLog, ValidationResult } from './CalibrationOverlay';
import { PositionGuide } from './PositionGuide';
import type { PositionState } from './PositionGuide';

// After this long on the guide the participant may start even if the distance never reads "good"
// (the estimate assumes a typical webcam field of view and can be off for unusual cameras).
const OVERRIDE_MS = 30000;

type Params = { maxAttempts?: number; acceptPctW?: number };

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

function GazeCalibration({ parameters, setAnswer }: StimulusParams<Params>) {
  const maxAttempts = parameters?.maxAttempts ?? 3;
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

  const last = attempts[attempts.length - 1];
  const accepted = last?.meanErrorPctW !== null && last?.meanErrorPctW !== undefined && last.meanErrorPctW <= acceptPctW;

  // Block Next until the calibration procedure has finished (accepted or attempts exhausted)
  useEffect(() => {
    const finished = phase === 'done';
    const summary = {
      attempts: attempts.length,
      accepted,
      meanErrorPx: last?.meanErrorPx ?? null,
      meanErrorPctW: last?.meanErrorPctW ?? null,
      viewport: [window.innerWidth, window.innerHeight] as [number, number],
    };
    if (finished) {
      gazeTracker.fullCalib = summary;
      gazeTracker.calibHead = last?.head ?? null;
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
          trackerError: error,
        }),
      },
    });
  }, [phase, attempts, accepted, last, setAnswer, acceptPctW, error]);

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
      await gazeTracker.resetCalibration();
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
  }, [acceptPctW, maxAttempts, runCalibration, runValidation, setMessage, pos, guideSince]);

  const errText = last?.meanErrorPx !== null && last?.meanErrorPx !== undefined
    ? `${Math.round(last.meanErrorPx)} px (${(100 * (last.meanErrorPctW ?? 0)).toFixed(1)} % of screen width)`
    : 'could not be measured';

  return (
    <Box p="md" maw={760}>
      {phase === 'running' && (
        <CalibrationOverlay dot={dot} collecting={collecting} message={message} fitting={fitting} pursuitOn={pursuitOn} pursuitDotRef={pursuitDotRef} />
      )}

      {phase === 'intro' && (
        <>
          <Title order={2}>Eye-tracking calibration</Title>
          <Title order={4} mt="md">1. Adjust your position</Title>
          <Box mt="xs"><PositionGuide onChange={setPos} /></Box>
          <Title order={4} mt="lg">2. Calibrate</Title>
          <Text mt="xs">
            A dot will appear at 9 positions on the screen: look directly at each one until it moves.
            Then the dot will glide slowly around the screen for 20 seconds: follow it with your eyes.
            After a short pause, 5 more dots check the accuracy. The whole procedure takes about a minute.
          </Text>
          <List mt="sm" spacing="xs">
            <List.Item><strong>Keep your head as still as possible</strong>; move only your eyes. Stay in this position until the task ends.</List.Item>
            <List.Item>Do not move the mouse or touch the keyboard while the dots are shown.</List.Item>
            <List.Item>Try not to blink while a dot turns red.</List.Item>
          </List>
          <StartButton ready={!!pos?.ready} canOverride={canOverride} onClick={runOnce} label="Start calibration" />
        </>
      )}

      {phase === 'retry' && (
        <>
          <Title order={2}>Let&apos;s try that again</Title>
          <Text mt="sm">
            Accuracy on attempt {attempts.length}: {errText}. Please sit still, face the screen, and
            follow the dots with your eyes only.
          </Text>
          {error && <Text c="red" mt="xs">{error}</Text>}
          <Box mt="md"><PositionGuide onChange={setPos} /></Box>
          <StartButton ready={!!pos?.ready} canOverride={canOverride} onClick={runOnce} label={`Recalibrate (${attempts.length + 1} / ${maxAttempts})`} />
        </>
      )}

      {phase === 'done' && (
        <>
          <Title order={2}>Calibration complete</Title>
          <Text mt="sm">
            {accepted
              ? 'Your eye tracking is calibrated.'
              : 'We recorded the best calibration we could obtain.'}
            {' '}
            Before every plot in the next task, a dot in the centre checks the accuracy (and a few
            more dots appear if needed). <strong>Please keep your head in this position</strong> until the
            task ends. Press <strong>Next</strong> to continue.
          </Text>
        </>
      )}
    </Box>
  );
}

function StartButton({
  ready, canOverride, onClick, label,
}: { ready: boolean; canOverride: boolean; onClick: () => void; label: string }) {
  return (
    <>
      <Button mt="md" onClick={onClick} disabled={!ready && !canOverride}>
        {ready || !canOverride ? label : `${label} anyway`}
      </Button>
      {!ready && (
        <Text size="xs" c="dimmed" mt={4}>
          {canOverride
            ? 'If the distance never turns green even though you sit about an arm\'s length away, you can start anyway.'
            : 'The button unlocks once your position is good.'}
        </Text>
      )}
    </>
  );
}

export default GazeCalibration;
