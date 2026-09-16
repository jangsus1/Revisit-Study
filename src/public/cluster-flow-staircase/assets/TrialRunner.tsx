/**
 * One two-interval forced-choice trial of the cluster-flow experiment.
 *
 * Timeline (all durations are converted to whole frames of the measured refresh period so the
 * stimulus durations are integer multiples of the display's frame time):
 *   fixation 500 ms -> A 200 ms -> blank 400 ms -> B 200 ms -> blank 400 ms -> prompt (until a key).
 *
 * Both stimuli are mounted for the whole trial and only their `visibility` is toggled, so a phase
 * change costs a paint and not a layout. Phase starts are timestamped in the animation frame that
 * follows the state commit, which makes the recorded durations paint-to-paint.
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
import type { MeasuredDurations, TrialAnswer, TrialParams } from './generator';
import { generateDisplay } from './generator';
import { GENERATOR_CONFIG as C } from './generator/config';
import { StimulusFrame } from './render/StimulusSVG';

type Phase = 'gate' | 'fixation' | 'a' | 'blank1' | 'b' | 'blank2' | 'prompt' | 'done';
type TimedPhase = keyof MeasuredDurations;

const TIMELINE: { phase: TimedPhase, ms: number }[] = [
  { phase: 'fixation', ms: 500 },
  { phase: 'a', ms: 200 },
  { phase: 'blank1', ms: 400 },
  { phase: 'b', ms: 200 },
  { phase: 'blank2', ms: 400 },
];

const DEFAULT_REFRESH_MS = 1000 / 60;

const PROMPT_TEXT = 'Which one has more items?  Press  F  or  ←  (first)  /  J  or  →  (second)';

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
    seedA, seedB, nB, cue, density, cellId, trialIndex, staircaseId, refreshMs,
  } = parameters;
  const isPractice = staircaseId === 'practice';

  const displayA = useMemo(() => generateDisplay(seedA, { kind: 'A', cue, density }), [seedA, cue, density]);
  const displayB = useMemo(() => generateDisplay(seedB, {
    kind: 'B', cue, density, nB,
  }), [seedB, cue, density, nB]);

  // Without the Fullscreen API (jsdom, and any browser that refuses it) the gate is skipped.
  const [phase, setPhase] = useState<Phase>(() => (canRequestFullscreen() && !isFullscreen() ? 'gate' : 'fixation'));
  const [running, setRunning] = useState(() => !(canRequestFullscreen() && !isFullscreen()));
  const [response, setResponse] = useState<TrialAnswer['response'] | null>(null);

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

  const measuredRef = useRef<MeasuredDurations>({
    fixation: 0, a: 0, blank1: 0, b: 0, blank2: 0,
  });
  const promptStartRef = useRef(0);
  const respondedRef = useRef(false);

  const startTrial = useCallback(() => {
    if (canRequestFullscreen() && !isFullscreen()) {
      // Proceed even when the request is refused: a refused fullscreen is recorded, not blocking.
      document.documentElement.requestFullscreen().catch(() => undefined);
    }
    setPhase('fixation');
    setRunning(true);
  }, []);

  // The single animation-frame loop that drives the whole timeline.
  useEffect(() => {
    if (!running) {
      return undefined;
    }

    const period = refreshMs > 0 ? refreshMs : DEFAULT_REFRESH_MS;
    const framesFor = (ms: number) => Math.max(1, Math.round(ms / period));

    let index = 0;
    let frames = 0;
    let phaseStart = 0;
    let pendingStart = true;
    let rafId = 0;
    let cancelled = false;

    const step = (now: number) => {
      if (cancelled) {
        return;
      }
      rafId = requestAnimationFrame(step);

      if (pendingStart) {
        // First frame after the phase was committed: this is when it became visible.
        phaseStart = now;
        frames = 0;
        pendingStart = false;
        return;
      }

      frames += 1;
      if (frames < framesFor(TIMELINE[index].ms)) {
        return;
      }

      measuredRef.current[TIMELINE[index].phase] = now - phaseStart;
      index += 1;

      if (index >= TIMELINE.length) {
        cancelled = true;
        cancelAnimationFrame(rafId);
        promptStartRef.current = now;
        setPhase('prompt');
        return;
      }

      setPhase(TIMELINE[index].phase);
      pendingStart = true;
    };

    rafId = requestAnimationFrame(step);

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
    };
  }, [running, refreshMs]);

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
        rtMs: performance.now() - promptStartRef.current,
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
        measured: { ...measuredRef.current },
        refreshMs,
        fullscreen: fullscreenRef.current,
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
      setPhase('done');

      // Practice trials are graded by the platform (Check Answer on Enter); main trials move on.
      if (!isPractice) {
        advance?.();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    advance, cellId, cue, density, displayA, displayB, isPractice, nB, phase, refreshMs, seedA, seedB,
    setAnswer, staircaseId, trialIndex,
  ]);

  const layer = (visible: boolean) => ({
    position: 'absolute' as const,
    top: 0,
    left: 0,
    visibility: (visible ? 'visible' : 'hidden') as 'visible' | 'hidden',
  });

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
      <div style={{
        position: 'relative', width: displayA.width, height: displayA.height,
      }}
      >
        <StimulusFrame />
        <div style={layer(phase === 'a')}><StimulusFrame display={displayA} /></div>
        <div style={layer(phase === 'b')}><StimulusFrame display={displayB} /></div>
        <div style={layer(phase === 'fixation')}>
          <svg width={displayA.width} height={displayA.height} aria-hidden>
            <line x1={displayA.width / 2 - 10} y1={displayA.height / 2} x2={displayA.width / 2 + 10} y2={displayA.height / 2} stroke={C.INK} strokeWidth={2} />
            <line x1={displayA.width / 2} y1={displayA.height / 2 - 10} x2={displayA.width / 2} y2={displayA.height / 2 + 10} stroke={C.INK} strokeWidth={2} />
          </svg>
        </div>
      </div>

      <div style={{
        height: 48, marginTop: 24, display: 'flex', alignItems: 'center',
      }}
      >
        {phase === 'prompt' && <span data-testid="trial-prompt">{PROMPT_TEXT}</span>}
      </div>
    </div>
  );
}
