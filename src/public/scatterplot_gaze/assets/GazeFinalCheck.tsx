/**
 * End-of-session accuracy check (pilot diagnostics): after the last trial, the participant looks at
 * 9 dots at the full-calibration positions. Nothing is recalibrated, so the result measures how far
 * the tracker drifted over the session across the whole screen, with the head pose at every dot.
 * With `parameters.taskDots` (scatterplot_gaze_basic) 7 more dots follow at the trial's areas of interest
 * (plot centre, y label, 4 plot quadrants, x label), logged as `aoiCheck`: end-of-session accuracy where the
 * analysis needs it, measured on dots that were never used for fitting at that moment.
 */
import { Button } from '@mantine/core';
import { useCallback, useEffect, useState } from 'react';
import { StimulusParams } from '../../../store/types';
import { gazeTracker, headShiftMm } from './gazeTracker';
import {
  CalibrationOverlay, FULL_GRID, useDotSequence,
} from './CalibrationOverlay';
import type { ValidationResult } from './CalibrationOverlay';
import {
  FullscreenGate, HeadStillNotice, Panel, fullscreenStats,
} from './FullScreen';
import { taskCalibPoints, taskPoint } from './taskLayout';

type Phase = 'intro' | 'running' | 'done';
const AOI_TARGETS = ['plot', 'yLabel', 'q1', 'q2', 'q3', 'q4', 'xLabel'];

function GazeFinalCheck({ parameters, setAnswer, advance }: StimulusParams<{ taskDots?: boolean } | undefined>) {
  const taskDots = !!parameters?.taskDots;
  const [aoi, setAoi] = useState<ValidationResult | null>(null);
  const [phase, setPhase] = useState<Phase>('intro');
  const [result, setResult] = useState<ValidationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const {
    dot, collecting, message, runValidation,
  } = useDotSequence();

  useEffect(() => {
    const poses = (result?.points ?? []).map((p) => p.pose);
    setAnswer({
      status: phase === 'done',
      answers: {
        finalCheck: JSON.stringify({
          ...(result ?? {}),
          aoiCheck: aoi ? { ...aoi, targets: aoi.points.map((_, i) => AOI_TARGETS[i]), meanErrorDeg: gazeTracker.pxToDeg(aoi.meanErrorPx) } : null,
          headShiftMm: poses.map((p) => headShiftMm(p, gazeTracker.calibHead)),
          calibHead: gazeTracker.calibHead,
          fullCalib: gazeTracker.fullCalib ?? null,
          midCalib: gazeTracker.midCalib ?? null,
          device: gazeTracker.device,
          meanErrorDeg: gazeTracker.pxToDeg(result?.meanErrorPx),
          offsetPx: gazeTracker.offsetPx.map((v) => Math.round(v)),
          lastTrialErrorPx: gazeTracker.lastTrialErrorPx,
          windowPos: [window.screenX, window.screenY, window.outerWidth, window.outerHeight],
          trackerState: gazeTracker.state,
          fullscreen: !!document.fullscreenElement,
          fullscreenExits: fullscreenStats.exits,
          error,
        }),
      },
    });
  }, [phase, result, aoi, error, setAnswer]);

  const run = useCallback(async () => {
    if (gazeTracker.state !== 'ready') {
      setError(`tracker not ready (${gazeTracker.state})`);
      setPhase('done');
      return;
    }
    setPhase('running');
    try {
      setResult(await runValidation(FULL_GRID, 1500, 800, 'Look at the dot. Keep your head still.'));
      if (taskDots) setAoi(await runValidation([taskPoint('plot'), ...taskCalibPoints()], 1500, 800, 'Look at the dot. Keep your head still.'));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
    setPhase('done');
  }, [runValidation, taskDots]);

  // Done: the answer is complete, move on by itself
  useEffect(() => { if (phase === 'done') advance?.(); }, [phase, advance]);

  return (
    <>
      {phase === 'running' && <CalibrationOverlay dot={dot} collecting={collecting} message={message} />}
      {phase === 'intro' && (
        <Panel title="Last accuracy check" actions={<Button size="lg" onClick={run}>Start</Button>}>
          Look at each dot. About 15 seconds.
          <HeadStillNotice>Move only your eyes.</HeadStillNotice>
        </Panel>
      )}
      {phase === 'done' && <Panel title="Thank you" />}
      <FullscreenGate />
    </>
  );
}

export default GazeFinalCheck;
