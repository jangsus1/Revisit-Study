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
 */
import { Button } from '@mantine/core';
import {
  CSSProperties, useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import type { JsonValue } from '../../../parser/types';
import type { StimulusParams } from '../../../store/types';
import type { MeasuredDurations, TrialAnswer, TrialParams } from './generator';
import { generateDisplay } from './generator';
import { StimulusFrame } from './render/StimulusSVG';

type Phase = 'gate' | 'fixation' | 'a' | 'blank1' | 'b' | 'blank2' | 'prompt' | 'feedback' | 'done';
type TimedPhase = keyof MeasuredDurations;

const TIMELINE: { phase: TimedPhase, ms: number }[] = [
  { phase: 'fixation', ms: 500 },
  { phase: 'a', ms: 200 },
  { phase: 'blank1', ms: 400 },
  { phase: 'b', ms: 200 },
  { phase: 'blank2', ms: 400 },
];

const FEEDBACK_MS = 600;
const DEFAULT_REFRESH_MS = 1000 / 60;
/** The synthetic Enter is retried because the Next button only unlocks after the store round-trip. */
const ADVANCE_RETRY_DELAYS = [60, 160, 300, 500, 800, 1200];

const PROMPT_TEXT = 'Which one has more items?  Press  i  (first)  or  j  (second)';

/** The trial owns the whole viewport: a dark ground, the frame centred, and nothing else. */
const overlayStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 3000,
  background: '#202020',
  color: '#FFFFFF',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 16,
  fontFamily: 'system-ui, sans-serif',
  fontSize: 18,
};

function canRequestFullscreen(): boolean {
  return typeof document !== 'undefined' && typeof document.documentElement?.requestFullscreen === 'function';
}

export default function TrialRunner({ parameters, setAnswer }: StimulusParams<TrialParams>) {
  const {
    seedA, seedB, nB, cue, density, cellId, trialIndex, staircaseId, feedback, refreshMs,
  } = parameters;

  const displayA = useMemo(() => generateDisplay(seedA, { kind: 'A', cue, density }), [seedA, cue, density]);
  const displayB = useMemo(() => generateDisplay(seedB, {
    kind: 'B', cue, density, nB,
  }), [seedB, cue, density, nB]);

  // Without the Fullscreen API (jsdom, and any browser that refuses it) the gate is skipped.
  const needsGate = useMemo(
    () => canRequestFullscreen() && !document.fullscreenElement,
    [],
  );

  const [phase, setPhase] = useState<Phase>(needsGate ? 'gate' : 'fixation');
  const [running, setRunning] = useState(!needsGate);
  const [wasCorrect, setWasCorrect] = useState<boolean | null>(null);

  const measuredRef = useRef<MeasuredDurations>({
    fixation: 0, a: 0, blank1: 0, b: 0, blank2: 0,
  });
  const promptStartRef = useRef(0);
  const respondedRef = useRef(false);
  const timeoutsRef = useRef<number[]>([]);

  useEffect(() => () => {
    timeoutsRef.current.forEach((id) => window.clearTimeout(id));
    timeoutsRef.current = [];
  }, []);

  /** Advances via the study's `nextOnEnter` handler; retried until the Next button accepts it. */
  const advance = useCallback(() => {
    const fire = () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    ADVANCE_RETRY_DELAYS.forEach((delay) => {
      timeoutsRef.current.push(window.setTimeout(fire, delay));
    });
  }, []);

  const startTrial = useCallback(() => {
    if (canRequestFullscreen() && !document.fullscreenElement) {
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

  // Response collection: only `i` and `j` count, and only while the prompt is up.
  useEffect(() => {
    if (phase !== 'prompt') {
      return undefined;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (respondedRef.current || (key !== 'i' && key !== 'j')) {
        return;
      }
      respondedRef.current = true;

      const response: TrialAnswer['response'] = key === 'i' ? 'first' : 'second';
      const correct = (nB > displayA.n ? 'second' : 'first') === response;
      const trialAnswer: TrialAnswer = {
        response,
        correct,
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
        fullscreen: typeof document !== 'undefined' && !!document.fullscreenElement,
        displayA,
        displayB,
      };

      setAnswer({
        status: true,
        answers: {
          trial: response,
          trialData: trialAnswer as unknown as JsonValue,
        },
      });

      if (feedback) {
        setWasCorrect(correct);
        setPhase('feedback');
        timeoutsRef.current.push(window.setTimeout(() => {
          setPhase('done');
          advance();
        }, FEEDBACK_MS));
      } else {
        setPhase('done');
        advance();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    advance, cellId, cue, density, displayA, displayB, feedback, nB, phase, refreshMs, seedA, seedB,
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
            <line x1={displayA.width / 2 - 10} y1={displayA.height / 2} x2={displayA.width / 2 + 10} y2={displayA.height / 2} stroke="#FFFFFF" strokeWidth={2} />
            <line x1={displayA.width / 2} y1={displayA.height / 2 - 10} x2={displayA.width / 2} y2={displayA.height / 2 + 10} stroke="#FFFFFF" strokeWidth={2} />
          </svg>
        </div>
      </div>

      <div style={{
        height: 48, marginTop: 24, display: 'flex', alignItems: 'center',
      }}
      >
        {phase === 'prompt' && <span data-testid="trial-prompt">{PROMPT_TEXT}</span>}
        {phase === 'feedback' && (
          <span data-testid="trial-feedback" style={{ color: wasCorrect ? '#4CAF50' : '#E53935' }}>
            {wasCorrect ? 'Correct' : 'Incorrect'}
          </span>
        )}
      </div>
    </div>
  );
}
