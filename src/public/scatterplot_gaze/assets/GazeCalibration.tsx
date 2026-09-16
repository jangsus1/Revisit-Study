import {
  Box, Button, List, Text, Title,
} from '@mantine/core';
import { useCallback, useEffect, useState } from 'react';
import { StimulusParams } from '../../../store/types';
import { gazeTracker } from './gazeTracker';
import {
  CalibrationOverlay, FULL_GRID, VALIDATION_POINTS, useDotSequence,
} from './CalibrationOverlay';
import type { ValidationResult } from './CalibrationOverlay';

type Params = { maxAttempts?: number; acceptPctW?: number };

type Phase = 'intro' | 'running' | 'retry' | 'done';

function GazeCalibration({ parameters, setAnswer }: StimulusParams<Params>) {
  const maxAttempts = parameters?.maxAttempts ?? 3;
  const acceptPctW = parameters?.acceptPctW ?? 0.08;

  const [phase, setPhase] = useState<Phase>('intro');
  const [attempts, setAttempts] = useState<ValidationResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const {
    dot, collecting, message, setMessage, runCalibration, runValidation,
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
    if (finished) gazeTracker.fullCalib = summary;
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

  const runOnce = useCallback(async () => {
    setPhase('running');
    setError(null);
    try {
      await gazeTracker.init();
      await gazeTracker.resetCalibration();
      setMessage('Follow the dot with your eyes. Keep your head still.');
      await runCalibration(FULL_GRID, 'calib');
      const result = await runValidation(VALIDATION_POINTS, 1500, 800, 'Checking accuracy');
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
          points: [], meanErrorPx: null, meanErrorPctW: null, meanOffsetPx: null, viewport: [window.innerWidth, window.innerHeight], hz: 0,
        }];
      });
    }
  }, [acceptPctW, maxAttempts, runCalibration, runValidation, setMessage]);

  const errText = last?.meanErrorPx !== null && last?.meanErrorPx !== undefined
    ? `${Math.round(last.meanErrorPx)} px (${(100 * (last.meanErrorPctW ?? 0)).toFixed(1)} % of screen width)`
    : 'could not be measured';

  return (
    <Box p="md" maw={760}>
      {phase === 'running' && (
        <CalibrationOverlay dot={dot} collecting={collecting} message={message} />
      )}

      {phase === 'intro' && (
        <>
          <Title order={2}>Eye-tracking calibration</Title>
          <Text mt="sm">
            A dot will appear at 9 positions on the screen, then at 5 more to check accuracy.
            Look directly at each dot until it moves. The whole procedure takes about 30 seconds.
          </Text>
          <List mt="sm" spacing="xs">
            <List.Item>Keep your head still; move only your eyes.</List.Item>
            <List.Item>Do not move the mouse or touch the keyboard while the dots are shown.</List.Item>
            <List.Item>Try not to blink while a dot turns red.</List.Item>
          </List>
          <Button mt="md" onClick={runOnce}>
            {gazeTracker.state === 'ready' ? 'Start calibration' : 'Start camera and calibration'}
          </Button>
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
          <Button mt="md" onClick={runOnce}>Recalibrate ({attempts.length + 1} / {maxAttempts})</Button>
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
            Before every plot in the next task, three quick dots will refresh the calibration.
            Press <strong>Next</strong> to continue.
          </Text>
        </>
      )}
    </Box>
  );
}

export default GazeCalibration;
