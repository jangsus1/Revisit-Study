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
 * Attention checks (`staircaseId: 'attention'`, scheduled by the block) show two ungrouped displays
 * of 5 and 30 items (`generateAttentionPair`) on the same timeline. A correct answer moves on at
 * once, like any trial. A miss shows "That was an attention check" with the misses still allowed
 * (text and hearts) until a key press or click, accepted after `ATTENTION_MIN_MS`; the miss that
 * exceeds `maxAttentionMisses` moves on at once to the block's terminal `attention-failed` page.
 * Main and attention trials store `attentionMisses`, the running total.
 *
 * Full screen: leaving it brings up the full-screen gate over the trial (answers are ignored while
 * it is up); a refused request is recorded in the answer, not blocking.
 *
 * What is reVISit's and what is ours: the key press is read here (the platform has no keypress
 * response type) and written to the `trial` reactive response, which is what enables Next. Main
 * trials then call the platform's `advance()`. Practice trials grade the key press themselves against
 * the interval that held more items, show "Correct" / "Not quite" over the blank frame for
 * `FEEDBACK_MS`, store `correct` and `feedbackShownMs`, and then call `advance()` too.
 */
import {
  CSSProperties, useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import { IconHeart, IconHeartFilled } from '@tabler/icons-react';
import type { JsonValue } from '../../../parser/types';
import type { StimulusParams } from '../../../store/types';
import type { TrialAnswer, TrialParams } from './generator';
import {
  generateAttentionPair, generateTrialPair, hashSeed, measureDisplay,
} from './generator';
import { GENERATOR_CONFIG as C } from './generator/config';
import { TrialStage } from './render/TrialStage';
import {
  DEFAULT_ATTENTION_CONFIG, isRejected, livesMessage, missesLeft,
} from './attention';
import { correctInterval } from './staircaseBlock';
import { stimulusScale } from './stimulusScale';
import { fullscreenSession, useFullscreenGate } from './ui/fullscreen';
import { AnswerKeys, KeyCap } from './ui/KeyCap';
import { FullscreenGatePanel, Panel } from './ui/Panel';
import { UI } from './ui/theme';
import { useTrialTimeline } from './useTrialTimeline';

type Phase = 'ready' | 'running' | 'prompt' | 'feedback' | 'attention-miss' | 'done';

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

/** How long a practice trial shows its feedback before it moves on by itself. */
export const FEEDBACK_MS = 1500;

/** The practice feedback card, centred on the (blank) stimulus frame. */
function PracticeFeedback({ correct, answer }: { correct: boolean; answer: TrialAnswer['response'] }) {
  return (
    <div style={{
      position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none',
    }}
    >
      <div
        data-testid="practice-feedback"
        data-correct={correct}
        style={{
          background: correct ? '#ebfbee' : '#fff5f5',
          border: `3px solid ${correct ? UI.correct : UI.wrong}`,
          borderRadius: 16,
          padding: '28px 48px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 14,
          boxShadow: '0 8px 30px rgba(0,0,0,0.12)',
        }}
      >
        <div style={{ fontSize: 44, fontWeight: 800, color: correct ? UI.correct : UI.wrong }}>
          {correct ? 'Correct' : 'Not quite'}
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, fontSize: 21, color: UI.ink, fontWeight: 600,
        }}
        >
          <KeyCap label={answer === 'first' ? 'F' : 'J'} size={40} />
          <span data-testid="practice-feedback-answer">{`The ${answer} diagram had more items.`}</span>
        </div>
      </div>
    </div>
  );
}

/** A missed attention check's feedback accepts the dismissing key press or click only after this long. */
export const ATTENTION_MIN_MS = 1500;

/** "That was an attention check" card with the misses still allowed, as text and as hearts. */
function AttentionMissFeedback({
  answer, misses, maxMisses, canDismiss,
}: { answer: TrialAnswer['response']; misses: number; maxMisses: number; canDismiss: boolean }) {
  const left = missesLeft(misses, maxMisses);
  return (
    <div style={{
      position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none',
    }}
    >
      <div
        data-testid="attention-feedback"
        data-left={left}
        style={{
          background: '#fff4e6',
          border: '3px solid #e8590c',
          borderRadius: 16,
          padding: '26px 40px',
          maxWidth: 620,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 14,
          boxShadow: '0 8px 30px rgba(0,0,0,0.12)',
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: 30, fontWeight: 800, color: '#c2410c' }}>That was an attention check</div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, fontSize: 20, color: UI.ink, fontWeight: 600,
        }}
        >
          <KeyCap label={answer === 'first' ? 'F' : 'J'} size={38} />
          <span data-testid="attention-feedback-answer">{`The ${answer} diagram had many more items.`}</span>
        </div>
        <div data-testid="attention-lives" style={{ display: 'flex', gap: 8 }} aria-label={`${left} of ${maxMisses + 1} left`}>
          {Array.from({ length: maxMisses + 1 }, (_, i) => (i < left
            ? <IconHeartFilled key={i} size={34} color="#e03131" />
            : <IconHeart key={i} size={34} color="#ced4da" />))}
        </div>
        <div data-testid="attention-lives-text" style={{ fontSize: 20, fontWeight: 700, color: '#7a2e0b' }}>
          {livesMessage(misses, maxMisses)}
        </div>
        <div style={{
          fontSize: 16, color: UI.muted, minHeight: 22, visibility: canDismiss ? 'visible' : 'hidden',
        }}
        >
          Press any key or click to continue
        </div>
      </div>
    </div>
  );
}

export default function TrialRunner({ parameters, setAnswer, advance }: StimulusParams<TrialParams>) {
  const {
    seedA, seedB, nB, cue, density, cellId, trialIndex, staircaseId, aFirst, hueOffset, starts, refreshMs,
    pxPerCm = null, waitForStart = false, nA, attentionMisses = 0, maxAttentionMisses = DEFAULT_ATTENTION_CONFIG.maxMisses,
  } = parameters;
  const isPractice = staircaseId === 'practice';
  const isAttention = staircaseId === 'attention';

  // An attention check shows two ungrouped displays (5 and 30 items) instead of A and B.
  const { displayA, displayB } = useMemo(() => (isAttention
    ? generateAttentionPair(seedA, seedB, {
      cue, density, few: nA ?? DEFAULT_ATTENTION_CONFIG.few, many: nB, hueOffset,
    })
    : generateTrialPair(seedA, seedB, {
      cue, density, nB, hueOffset,
    })), [isAttention, seedA, seedB, cue, density, nA, nB, hueOffset]);
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

  // The interval that held more items, as the block's correctAnswer has it (practice feedback,
  // attention checks).
  const expected = correctInterval(nB, aFirst, displayA.n);
  const answerRef = useRef<TrialAnswer | null>(null);
  // A missed attention check shows its feedback, unless it is the miss that ends the study.
  const missed = isAttention && response !== null && response !== expected;
  const missesNow = attentionMisses + (missed ? 1 : 0);
  const showMiss = missed && !isRejected(missesNow, maxAttentionMisses);

  let phase: Phase = 'running';
  if (!started) phase = 'ready';
  else if (response !== null) {
    if (isPractice) phase = 'feedback';
    else if (showMiss) phase = 'attention-miss';
    else phase = 'done';
  } else if (timeline.phase === 'end') phase = 'prompt';

  // The miss feedback stays until a key press or click, accepted after ATTENTION_MIN_MS.
  const [canDismiss, setCanDismiss] = useState(false);
  const missShownAt = useRef(0);
  const dismissedRef = useRef(false);

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
    // (a missed attention check's feedback has its own listener, below)
    if (phase === 'done' || phase === 'attention-miss') {
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
      const isMiss = isAttention && chosen !== expected;
      const trialAnswer: TrialAnswer = {
        // practice: graded here for the in-stream feedback; the time it was shown is filled in when it ends
        ...(isPractice ? { correct: chosen === expected, feedbackShownMs: 0 } : {}),
        // main block: attention checks graded here, and the running count of misses on every trial
        ...(isAttention ? { correct: !isMiss } : {}),
        ...(!isPractice ? { attentionMisses: attentionMisses + (isMiss ? 1 : 0) } : {}),
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
      answerRef.current = trialAnswer;
      setResponse(chosen);

      // Main trials and correct attention checks move on at once, as does the miss that ends the
      // study; practice trials and other missed checks first show their feedback (effects below).
      const holdForMiss = isMiss && !isRejected(attentionMisses + 1, maxAttentionMisses);
      if (!isPractice && !holdForMiss) {
        advance?.();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    advance, aFirst, attentionMisses, blocked, cellId, cue, density, displayA, displayB, endedAt, expected, hueOffset,
    isAttention, isPractice, maxAttentionMisses, measured, nB, phase, refreshMs, scale, seedA, seedB, setAnswer,
    staircaseId, starts, trialIndex, widthCm,
  ]);

  // Missed attention check: the feedback is timed from its first paint; input is accepted after
  // ATTENTION_MIN_MS, and the dismissing key press or click is swallowed and moves on.
  useEffect(() => {
    if (phase !== 'attention-miss') return undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const raf = requestAnimationFrame(() => {
      missShownAt.current = performance.now();
      timer = setTimeout(() => setCanDismiss(true), ATTENTION_MIN_MS);
    });
    return () => {
      cancelAnimationFrame(raf);
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [phase]);

  const dismissMiss = useCallback(() => {
    if (!canDismiss || dismissedRef.current) return;
    dismissedRef.current = true;
    const record = answerRef.current;
    if (record) {
      const final = { ...record, feedbackShownMs: performance.now() - missShownAt.current };
      setAnswer({
        status: true,
        answers: { trial: final.response, trialData: final as unknown as JsonValue },
      });
    }
    advance?.();
  }, [advance, canDismiss, setAnswer]);

  useEffect(() => {
    if (phase !== 'attention-miss') return undefined;
    const onKey = (event: KeyboardEvent) => {
      event.stopImmediatePropagation();
      event.preventDefault();
      if (!event.repeat && !NON_START_KEYS.has(event.key.toLowerCase())) dismissMiss();
    };
    const onPointer = () => dismissMiss();
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('pointerdown', onPointer);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('pointerdown', onPointer);
    };
  }, [phase, dismissMiss]);

  // Practice feedback: shown for FEEDBACK_MS from its first paint, then the trial stores how long
  // it was up and moves on by itself, so practice needs no Enter presses and no Check Answer step.
  useEffect(() => {
    if (phase !== 'feedback') return undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const raf = requestAnimationFrame(() => {
      const shownAt = performance.now();
      timer = setTimeout(() => {
        const record = answerRef.current;
        if (record) {
          const final = { ...record, feedbackShownMs: performance.now() - shownAt };
          setAnswer({
            status: true,
            answers: { trial: final.response, trialData: final as unknown as JsonValue },
          });
        }
        advance?.();
      }, FEEDBACK_MS);
    });
    return () => {
      cancelAnimationFrame(raf);
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [phase, advance, setAnswer]);

  const gate = blocked && phase !== 'done' ? <FullscreenGatePanel onReturn={returnToFullscreen} /> : null;

  return (
    <>
      <div style={overlayStyle} data-testid="trial-runner" data-kind={isAttention ? 'attention' : staircaseId}>
        <TrialStage
          first={aFirst ? displayA : displayB}
          second={aFirst ? displayB : displayA}
          maskSeed={maskSeed}
          phase={phase === 'running' ? timeline.phase : 'end'}
          scale={scale}
        />
        {phase === 'feedback' && response !== null && <PracticeFeedback correct={response === expected} answer={expected} />}
        {phase === 'attention-miss' && (
          <AttentionMissFeedback answer={expected} misses={missesNow} maxMisses={maxAttentionMisses} canDismiss={canDismiss} />
        )}

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
