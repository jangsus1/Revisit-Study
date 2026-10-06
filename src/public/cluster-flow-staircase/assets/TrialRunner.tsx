/**
 * One two-interval forced-choice trial of the cluster-flow experiment.
 *
 * Timeline (`useTrialTimeline`; every duration is a whole number of frames of the measured refresh
 * period):
 *   [start gate] -> fixation 500 ms -> stimulus 1 200 ms -> noise mask 150 ms -> blank 250 ms
 *   -> stimulus 2 200 ms -> blank 400 ms -> prompt (until a key).
 *
 * Both stimuli appear at one screen location. Which interval holds A is drawn per trial (`aFirst`)
 * and the answer names an interval: F / left arrow for the first, J / right arrow for the second.
 * The 150 ms white-noise mask between the two stimuli wipes the first display's afterimage.
 *
 * Start gate: when the block sets `waitForStart` (its first trial, and the first trial after a rest
 * page) a ready screen asks the participant to put their fingers on F and J, and the timeline
 * starts on the first key press or click. That key press is swallowed: it is never an answer and
 * never reaches reVISit's Enter handler. Its wait is stored as `startWaitMs`.
 *
 * Size: the whole stage is scaled uniformly (`stimulusScale.ts`) to 21 cm wide when the setup's
 * card check gave CSS px per cm, else to scale 1, and always to fit the window; the scale is fixed
 * at mount and stored with the answer (`displayScale`, `stimulusWidthCm`).
 *
 * Full screen: leaving it brings up the full-screen gate over the trial (answers are ignored while
 * it is up); a refused request is recorded in the answer, not blocking.
 *
 * What is reVISit's and what is ours: the key press is read here (the platform has no keypress
 * response type) and written to the `trial` reactive response, which is what enables Next. Main
 * trials then call the platform's `advance()`; practice trials leave the platform's Check Answer
 * flow (`provideFeedback` on the `practice-trial` component) to grade the answer and show feedback.
 */
import {
  CSSProperties, useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import type { JsonValue } from '../../../parser/types';
import type { StimulusParams } from '../../../store/types';
import type { TrialAnswer, TrialParams } from './generator';
import { generateTrialPair, hashSeed, measureDisplay } from './generator';
import { GENERATOR_CONFIG as C } from './generator/config';
import { TrialStage } from './render/TrialStage';
import { stimulusScale } from './stimulusScale';
import { fullscreenSession, useFullscreenGate } from './ui/fullscreen';
import { AnswerKeys, KeyCap } from './ui/KeyCap';
import { FullscreenGatePanel, Panel } from './ui/Panel';
import { UI } from './ui/theme';
import { useTrialTimeline } from './useTrialTimeline';

type Phase = 'ready' | 'running' | 'prompt' | 'done';

export const PROMPT_TEXT = 'Which one had more items?';
export const READY_TEXT = 'Put your fingers on F and J. Press any key or click to start.';

/** Keys that answer "first" and "second": f / j on the home row, or the left / right arrows. */
const FIRST_KEYS = new Set(['f', 'arrowleft']);
const SECOND_KEYS = new Set(['j', 'arrowright']);
/** Keys that do not start a trial from the ready screen (modifiers, and Escape, which leaves full screen). */
const NON_START_KEYS = new Set(['shift', 'control', 'alt', 'meta', 'capslock', 'escape', 'tab', 'fn']);

/**
 * Start-gate waits of the trials started in this page session, by trial. reVISit may remount a
 * dynamic-block component right after its first render (its identifier settles), which would
 * otherwise drop a start press made in that instant and show the gate again.
 */
const startedTrials = new Map<string, number | null>();

/** Forgets which trials were started (tests). */
export function forgetStartedTrials(): void {
  startedTrials.clear();
}

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
  fontFamily: UI.font,
  fontSize: 18,
};

/** After a practice answer the overlay gives way to reVISit's response block, feedback and Next. */
const practiceDoneStyle: CSSProperties = {
  color: UI.ink,
  padding: '32px 32px 8px',
  fontFamily: UI.font,
  fontSize: 18,
  textAlign: 'center',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 14,
};

export default function TrialRunner({ parameters, setAnswer, advance }: StimulusParams<TrialParams>) {
  const {
    seedA, seedB, nB, cue, density, cellId, trialIndex, staircaseId, aFirst, hueOffset, starts, refreshMs,
    pxPerCm = null, waitForStart = false,
  } = parameters;
  const isPractice = staircaseId === 'practice';

  const { displayA, displayB } = useMemo(() => generateTrialPair(seedA, seedB, {
    cue, density, nB, hueOffset,
  }), [seedA, seedB, cue, density, nB, hueOffset]);
  const maskSeed = useMemo(() => hashSeed(seedA, seedB, 'mask'), [seedA, seedB]);

  // Fixed for the trial: full screen is forced, so the window size at mount is the screen size.
  const [{ scale, widthCm }] = useState(() => stimulusScale({
    canvasW: displayA.width,
    canvasH: displayA.height,
    viewportW: typeof window === 'undefined' ? 0 : window.innerWidth,
    viewportH: typeof window === 'undefined' ? 0 : window.innerHeight,
    pxPerCm,
  }));

  // Without the Fullscreen API (jsdom) the gate never blocks; a refused request does not either.
  const { blocked, returnToFullscreen } = useFullscreenGate();
  // The timeline may start once the gate has been passed; it is never stopped again.
  const [armed, setArmed] = useState(!blocked);
  useEffect(() => {
    if (!blocked) setArmed(true);
  }, [blocked]);

  const trialKey = `${cellId}|${staircaseId}|${trialIndex}|${seedA}|${seedB}`;
  const [started, setStarted] = useState(() => !waitForStart || startedTrials.has(trialKey));
  const readyAt = useRef<number | null>(null);
  const startWaitMs = useRef<number | null>(startedTrials.get(trialKey) ?? null);
  const [response, setResponse] = useState<TrialAnswer['response'] | null>(null);
  const timeline = useTrialTimeline(armed && started, refreshMs);

  let phase: Phase = 'running';
  if (!started) phase = 'ready';
  else if (response !== null) phase = 'done';
  else if (timeline.phase === 'end') phase = 'prompt';

  // The ready screen's wait is timed from when it is first visible (after any full-screen gate).
  useEffect(() => {
    if (phase === 'ready' && armed && readyAt.current === null) {
      readyAt.current = performance.now();
    }
  }, [phase, armed]);

  const startTrial = useCallback(() => {
    if (readyAt.current !== null) {
      startWaitMs.current = performance.now() - readyAt.current;
    }
    startedTrials.set(trialKey, startWaitMs.current);
    setStarted(true);
  }, [trialKey]);

  // Fullscreen state is tracked live so the answer records what was true at the key press.
  const fullscreenRef = useRef(typeof document !== 'undefined' && !!document.fullscreenElement);
  useEffect(() => {
    if (typeof document === 'undefined') {
      return undefined;
    }
    const onChange = () => {
      fullscreenRef.current = !!document.fullscreenElement;
    };
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const respondedRef = useRef(false);

  // Until the answer is in, Enter must not reach the study's `nextOnEnter` handler: the stimulus is
  // still invalid, and the platform would surface a validation message over the display. On the
  // ready screen the same capture-phase listener starts the trial on any key and swallows that key,
  // so it can neither answer nor advance.
  useEffect(() => {
    if (phase === 'done') {
      return undefined;
    }
    const onKeyDownCapture = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (phase === 'ready' && armed && !blocked && !event.repeat && !NON_START_KEYS.has(key)) {
        event.stopImmediatePropagation();
        event.preventDefault();
        startTrial();
        return;
      }
      if (event.key === 'Enter') {
        event.stopImmediatePropagation();
        event.preventDefault();
      }
    };
    window.addEventListener('keydown', onKeyDownCapture, true);
    return () => window.removeEventListener('keydown', onKeyDownCapture, true);
  }, [phase, armed, blocked, startTrial]);

  const { measured, endedAt } = timeline;

  // Response collection: only f / left arrow and j / right arrow count, and only while the prompt is up.
  useEffect(() => {
    if (phase !== 'prompt') {
      return undefined;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (respondedRef.current || blocked || (!FIRST_KEYS.has(key) && !SECOND_KEYS.has(key))) {
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
        fullscreenExits: fullscreenSession.exits,
        displayScale: scale,
        stimulusWidthCm: widthCm,
        startWaitMs: startWaitMs.current,
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
    advance, aFirst, blocked, cellId, cue, density, displayA, displayB, endedAt, hueOffset, isPractice, measured, nB,
    phase, refreshMs, scale, seedA, seedB, setAnswer, staircaseId, starts, trialIndex, widthCm,
  ]);

  const gate = blocked && phase !== 'done' ? <FullscreenGatePanel onReturn={returnToFullscreen} /> : null;

  if (phase === 'done' && isPractice) {
    return (
      <div style={practiceDoneStyle} data-testid="practice-done">
        <div style={{ fontSize: 20 }}>
          You answered
          {' '}
          <strong>{response === 'first' ? 'first' : 'second'}</strong>
          .
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', justifyContent: 'center',
        }}
        >
          <KeyCap label="Enter" size={38} />
          <span>to check your answer, then</span>
          <KeyCap label="Enter" size={38} />
          <span>again for the next trial.</span>
        </div>
      </div>
    );
  }

  return (
    <>
      <div style={overlayStyle} data-testid="trial-runner">
        <TrialStage
          first={aFirst ? displayA : displayB}
          second={aFirst ? displayB : displayA}
          maskSeed={maskSeed}
          phase={phase === 'running' ? timeline.phase : 'end'}
          scale={scale}
        />

        <div style={{
          height: 56, marginTop: 8, display: 'flex', alignItems: 'center',
        }}
        >
          {phase === 'prompt' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <KeyCap label="F" size={36} />
                <span style={{ fontSize: 16, color: UI.muted }}>first</span>
              </span>
              <span data-testid="trial-prompt" style={{ fontSize: 22, fontWeight: 700 }}>{PROMPT_TEXT}</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 16, color: UI.muted }}>second</span>
                <KeyCap label="J" size={36} />
              </span>
            </div>
          )}
        </div>
      </div>
      {phase === 'ready' && armed && (
        <Panel
          testId="start-gate"
          background={C.SURROUND}
          zIndex={3500}
          kicker={isPractice ? 'Practice' : 'Main task'}
          title="Ready?"
          onPointerDown={startTrial}
        >
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 22,
          }}
          >
            <AnswerKeys size={56} />
            <div data-testid="start-gate-text" style={{ fontSize: 20, color: UI.ink, fontWeight: 600 }}>{READY_TEXT}</div>
          </div>
        </Panel>
      )}
      {gate}
    </>
  );
}
