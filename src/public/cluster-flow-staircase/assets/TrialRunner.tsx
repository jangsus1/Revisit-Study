/**
 * One two-interval forced-choice trial of the cluster-flow experiment.
 *
 * Timeline (`useTrialTimeline`; every duration is a whole number of frames of the measured refresh
 * period):
 *   fixation 500 ms -> stimulus 1 200 ms -> noise mask 150 ms -> blank 250 ms -> stimulus 2 200 ms
 *   -> blank 400 ms -> prompt (until a key).
 *
 * Both stimuli appear at one screen location. Which interval holds A is drawn per trial (`aFirst`)
 * and the answer names an interval: F / left arrow for the first, J / right arrow for the second.
 * The 150 ms white-noise mask between the two stimuli wipes the first display's afterimage.
 *
 * What is reVISit's and what is ours: the key press is read here (the platform has no keypress
 * response type) and written to the `trial` reactive response, which is what enables Next. Main
 * trials then call the platform's `advance()`; practice trials leave the platform's Check Answer
 * flow (`provideFeedback` on the `practice-trial` component) to grade the answer and show feedback.
 */
import { Button } from '@mantine/core';
import {
  CSSProperties, useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import type { JsonValue } from '../../../parser/types';
import type { StimulusParams } from '../../../store/types';
import type { TrialAnswer, TrialParams } from './generator';
import { generateTrialPair, hashSeed, measureDisplay } from './generator';
import { GENERATOR_CONFIG as C } from './generator/config';
import { TrialStage } from './render/TrialStage';
import { useTrialTimeline } from './useTrialTimeline';

type Phase = 'gate' | 'running' | 'prompt' | 'done';

export const PROMPT_TEXT = 'Which one had more items?  Press  F  or  ←  (first)  /  J  or  →  (second)';

/** Keys that answer "first" and "second": f / j on the home row, or the left / right arrows. */
const FIRST_KEYS = new Set(['f', 'arrowleft']);
const SECOND_KEYS = new Set(['j', 'arrowright']);

/** The trial owns the whole viewport: a plain ground, the frame centred, and nothing else. */
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
  fontFamily: 'system-ui, sans-serif',
  fontSize: 18,
};

/** After a practice answer the overlay gives way to reVISit's response block, feedback and Next. */
const practiceDoneStyle: CSSProperties = {
  background: C.SURROUND,
  color: C.INK,
  padding: '24px 32px',
  borderRadius: 8,
  fontFamily: 'system-ui, sans-serif',
  fontSize: 18,
  textAlign: 'center',
};

function canRequestFullscreen(): boolean {
  return typeof document !== 'undefined' && typeof document.documentElement?.requestFullscreen === 'function';
}

function isFullscreen(): boolean {
  return typeof document !== 'undefined' && !!document.fullscreenElement;
}

export default function TrialRunner({ parameters, setAnswer, advance }: StimulusParams<TrialParams>) {
  const {
    seedA, seedB, nB, cue, density, cellId, trialIndex, staircaseId, aFirst, hueOffset, starts, refreshMs,
  } = parameters;
  const isPractice = staircaseId === 'practice';

  const { displayA, displayB } = useMemo(() => generateTrialPair(seedA, seedB, {
    cue, density, nB, hueOffset,
  }), [seedA, seedB, cue, density, nB, hueOffset]);
  const maskSeed = useMemo(() => hashSeed(seedA, seedB, 'mask'), [seedA, seedB]);

  // Without the Fullscreen API (jsdom, and any browser that refuses it) the gate is skipped.
  const [running, setRunning] = useState(() => !(canRequestFullscreen() && !isFullscreen()));
  const [response, setResponse] = useState<TrialAnswer['response'] | null>(null);
  const timeline = useTrialTimeline(running, refreshMs);

  let phase: Phase = 'running';
  if (!running) phase = 'gate';
  else if (response !== null) phase = 'done';
  else if (timeline.phase === 'end') phase = 'prompt';

  // Fullscreen state is tracked live so the answer records what was true at the key press. Losing
  // fullscreen mid-trial does not abort the trial; the next trial mounts fresh and gates again.
  const fullscreenRef = useRef(isFullscreen());
  useEffect(() => {
    if (typeof document === 'undefined') {
      return undefined;
    }
    const onChange = () => {
      fullscreenRef.current = isFullscreen();
    };
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const respondedRef = useRef(false);

  const startTrial = useCallback(() => {
    if (canRequestFullscreen() && !isFullscreen()) {
      // Proceed even when the request is refused: a refused fullscreen is recorded, not blocking.
      document.documentElement.requestFullscreen().catch(() => undefined);
    }
    setRunning(true);
  }, []);

  // Until the answer is in, Enter must not reach the study's `nextOnEnter` handler: the stimulus is
  // still invalid, and the platform would surface a validation message over the display.
  useEffect(() => {
    if (phase === 'done') {
      return undefined;
    }
    const swallowEnter = (event: KeyboardEvent) => {
      if (event.key === 'Enter') {
        event.stopImmediatePropagation();
        event.preventDefault();
      }
    };
    window.addEventListener('keydown', swallowEnter, true);
    return () => window.removeEventListener('keydown', swallowEnter, true);
  }, [phase]);

  const { measured, endedAt } = timeline;

  // Response collection: only f / left arrow and j / right arrow count, and only while the prompt is up.
  useEffect(() => {
    if (phase !== 'prompt') {
      return undefined;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (respondedRef.current || (!FIRST_KEYS.has(key) && !SECOND_KEYS.has(key))) {
        return;
      }
      event.preventDefault();
      respondedRef.current = true;

      const chosen: TrialAnswer['response'] = FIRST_KEYS.has(key) ? 'first' : 'second';
      const trialAnswer: TrialAnswer = {
        response: chosen,
        aFirst,
        hueOffset,
        starts,
        rtMs: performance.now() - endedAt.current,
        nA: displayA.n,
        nB,
        cue,
        density,
        cellId,
        staircaseId,
        trialIndex,
        seedA,
        seedB,
        attemptsA: displayA.attempts,
        attemptsB: displayB.attempts,
        measured: { ...measured.current },
        refreshMs,
        fullscreen: fullscreenRef.current,
        metricsA: measureDisplay(displayA),
        metricsB: measureDisplay(displayB),
        displayA,
        displayB,
      };

      // `trial` is the graded response; `trialData` is the hidden telemetry record.
      setAnswer({
        status: true,
        answers: {
          trial: chosen,
          trialData: trialAnswer as unknown as JsonValue,
        },
      });
      setResponse(chosen);

      // Practice trials are graded by the platform (Check Answer on Enter); main trials move on.
      if (!isPractice) {
        advance?.();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    advance, aFirst, cellId, cue, density, displayA, displayB, endedAt, hueOffset, isPractice, measured, nB,
    phase, refreshMs, seedA, seedB, setAnswer, staircaseId, starts, trialIndex,
  ]);

  if (phase === 'gate') {
    return (
      <div style={overlayStyle} data-testid="fullscreen-gate">
        <p style={{ maxWidth: 480, textAlign: 'center' }}>
          This study runs in fullscreen so that the timing of the displays is accurate.
        </p>
        <Button onClick={startTrial}>Click to return to fullscreen</Button>
      </div>
    );
  }

  if (phase === 'done' && isPractice) {
    return (
      <div style={practiceDoneStyle} data-testid="practice-done">
        <p>
          You answered
          {' '}
          <strong>{response === 'first' ? 'first' : 'second'}</strong>
          .
        </p>
        <p>
          Press
          {' '}
          <strong>Enter</strong>
          {' '}
          to check your answer, then
          {' '}
          <strong>Enter</strong>
          {' '}
          again to continue.
        </p>
      </div>
    );
  }

  return (
    <div style={overlayStyle} data-testid="trial-runner">
      <TrialStage
        first={aFirst ? displayA : displayB}
        second={aFirst ? displayB : displayA}
        maskSeed={maskSeed}
        phase={phase === 'running' ? timeline.phase : 'end'}
      />

      <div style={{
        height: 48, marginTop: 24, display: 'flex', alignItems: 'center',
      }}
      >
        {phase === 'prompt' && <span data-testid="trial-prompt">{PROMPT_TEXT}</span>}
      </div>
    </div>
  );
}
