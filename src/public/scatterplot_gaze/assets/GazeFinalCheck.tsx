/**
 * End-of-session accuracy check (pilot diagnostics): after the last trial, the participant looks at
 * 9 dots at the full-calibration positions. Nothing is recalibrated, so the result measures how far
 * the tracker drifted over the session across the whole screen, with the head pose at every dot.
 */
import {
  Box, Button, List, Text, Title,
} from '@mantine/core';
import { useCallback, useEffect, useState } from 'react';
import { StimulusParams } from '../../../store/types';
import { gazeTracker, headShiftMm } from './gazeTracker';
import {
  CalibrationOverlay, FULL_GRID, useDotSequence,
} from './CalibrationOverlay';
import type { ValidationResult } from './CalibrationOverlay';

type Phase = 'intro' | 'running' | 'done';

function GazeFinalCheck({ setAnswer }: StimulusParams<undefined>) {
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

  return (
    <Box p="md" maw={760}>
      {phase === 'running' && <CalibrationOverlay dot={dot} collecting={collecting} message={message} />}

      {phase === 'intro' && (
        <>
          <Title order={2}>Last accuracy check</Title>
          <Text mt="sm">
            One final step before the camera turns off: a dot will appear at 9 positions. Look directly at
            each dot until it moves. This takes about 15 seconds.
          </Text>
          <List mt="sm" spacing="xs">
            <List.Item><strong>Keep your head as still as possible</strong> and move only your eyes.</List.Item>
            <List.Item>Do not move the mouse while the dots are shown.</List.Item>
          </List>
          <Button mt="md" onClick={run}>Start</Button>
        </>
      )}

      {phase === 'done' && (
        <>
          <Title order={2}>Thank you</Title>
          <Text mt="sm">Press <strong>Next</strong> to turn off the camera.</Text>
        </>
      )}
    </Box>
  );
}

export default GazeFinalCheck;
