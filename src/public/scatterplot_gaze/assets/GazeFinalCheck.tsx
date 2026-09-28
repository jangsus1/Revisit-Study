/**
 * End-of-session accuracy check (pilot diagnostics): after the last trial, the participant looks at
 * 9 dots at the full-calibration positions. Nothing is recalibrated, so the result measures how far
 * the tracker drifted over the session across the whole screen, with the head pose at every dot.
 */
import { Button } from '@mantine/core';
import { useCallback, useEffect, useState } from 'react';
import { StimulusParams } from '../../../store/types';
import { gazeTracker, headShiftMm } from './gazeTracker';
import {
  CalibrationOverlay, FULL_GRID, useDotSequence,
} from './CalibrationOverlay';
import type { ValidationResult } from './CalibrationOverlay';
import { FullscreenGate, Panel, fullscreenStats } from './FullScreen';

type Phase = 'intro' | 'running' | 'done';

function GazeFinalCheck({ setAnswer, advance }: StimulusParams<undefined>) {
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
          headShiftMm: poses.map((p) => headShiftMm(p, gazeTracker.calibHead)),
          calibHead: gazeTracker.calibHead,
          fullCalib: gazeTracker.fullCalib ?? null,
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
  }, [phase, result, error, setAnswer]);

  const run = useCallback(async () => {
    if (gazeTracker.state !== 'ready') {
      setError(`tracker not ready (${gazeTracker.state})`);
      setPhase('done');
      return;
    }
    setPhase('running');
    try {
      setResult(await runValidation(FULL_GRID, 1500, 800, 'Look at the dot. Keep your head still.'));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
    setPhase('done');
  }, [runValidation]);

  // Done: the answer is complete, move on by itself
  useEffect(() => { if (phase === 'done') advance?.(); }, [phase, advance]);

  return (
    <>
      {phase === 'running' && <CalibrationOverlay dot={dot} collecting={collecting} message={message} />}
      {phase === 'intro' && (
        <Panel title="Last accuracy check" actions={<Button size="lg" onClick={run}>Start</Button>}>
          Look at each dot. About 15 seconds.
          <br />
          <strong>Keep your head still.</strong>
        </Panel>
      )}
      {phase === 'done' && <Panel title="Thank you" />}
      <FullscreenGate />
    </>
  );
}

export default GazeFinalCheck;
