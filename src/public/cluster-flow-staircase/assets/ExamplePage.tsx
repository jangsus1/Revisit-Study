/**
 * "Examples": two super-easy trials of the participant's own cue and density, each in its own
 * card, shown before the practice. Every card has a static side-by-side view (Diagram 1 and
 * Diagram 2, the one with more items marked) and a "Play as it will appear" button that runs the
 * real timeline in place (fixation, flash 1, noise mask, flash 2) on a small stage and then shows
 * the answer with the key that gives it. Both examples use fixed demo seeds and A first:
 *  (a) the grouped diagram (A, 24 items) against 10 items, so the first had more (F);
 *  (b) A against 44 items, so the second had more (J).
 * Continue needs both examples played at least once and the page's reading time.
 */
import { Button } from '@mantine/core';
import { IconPlayerPlayFilled, IconRotateClockwise } from '@tabler/icons-react';
import {
  CSSProperties, useEffect, useMemo, useRef, useState,
} from 'react';
import type { StimulusParams } from '../../../store/types';
import type { Cue, Density, Display } from './generator';
import { generateTrialPair, hashSeed } from './generator';
import { GENERATOR_CONFIG as C } from './generator/config';
import { StimulusSVG } from './render/StimulusSVG';
import { TrialStage } from './render/TrialStage';
import { correctInterval, drawHueOffset, readSetupAnswer } from './staircaseBlock';
import { KeyCap } from './ui/KeyCap';
import { FullscreenGate, Panel } from './ui/Panel';
import { ReadingButton, useReadingTime } from './ui/readingTime';
import { useUpcomingCell } from './ui/studyContext';
import { UI } from './ui/theme';
import { useTrialTimeline } from './useTrialTimeline';

export interface ExamplePageParameters {
  /** default: the participant's cell, read from the upcoming practice block */
  cue?: Cue;
  density?: Density;
  /** replaces the computed minimum reading time, seconds (the shortened test study uses 1) */
  readingSeconds?: number;
}

/** The two demo trials: fixed seeds, A first, N_B far from 24 on either side. */
export const EXAMPLES = [
  {
    id: 'fewer', seedA: 20261007, seedB: 20261008, nB: 10, aFirst: true,
  },
  {
    id: 'more', seedA: 20261009, seedB: 20261010, nB: 44, aFirst: true,
  },
] as const;

/** Floor of the page's reading time, seconds (the word count is small; the plays take longer). */
export const EXAMPLE_MIN_READ_SECONDS = 10;

/** Window space around the two cards: title, intro line, button and paddings (px). */
const FIXED_H = 360;
/** Card width besides its three diagrams: label column, gaps, divider, answer column, paddings. */
const FIXED_W = 450;

/**
 * The display scale of the cards: two cards of three diagrams each (Diagram 1, Diagram 2 and the
 * play stage) must fit the window, so the scale is set by the height or the width, between 0.26
 * and 0.42 (about 0.4 at 1440 x 900; at 1280 x 720 the page may scroll).
 */
export function exampleScale(viewportW: number, viewportH: number): number {
  const byHeight = (viewportH - FIXED_H) / (2 * C.CANVAS.height);
  const byWidth = (viewportW - 48 - FIXED_W) / (3 * C.CANVAS.width);
  return Math.max(0.26, Math.min(0.42, byHeight, byWidth));
}

function ScaledDisplay({ display, scale, highlight }: { display: Display; scale: number; highlight: boolean }) {
  return (
    <div style={{
      width: display.width * scale,
      height: display.height * scale,
      outline: highlight ? `4px solid ${UI.correct}` : `2px solid ${UI.ink}`,
      outlineOffset: highlight ? 2 : 0,
      overflow: 'hidden',
      flex: 'none',
    }}
    >
      <div style={{
        transform: `scale(${scale})`, transformOrigin: 'top left', width: display.width, height: display.height,
      }}
      >
        <StimulusSVG display={display} />
      </div>
    </div>
  );
}

/** The real trial sequence on a small stage, replayed on every runKey change. */
function PlayStage({
  first, second, maskSeed, scale, refreshMs, runKey, onEnd,
}: {
  first: Display; second: Display; maskSeed: number; scale: number; refreshMs: number; runKey: number; onEnd: () => void;
}) {
  const { phase } = useTrialTimeline(runKey > 0, refreshMs, runKey);
  const ended = useRef(onEnd);
  ended.current = onEnd;
  useEffect(() => {
    if (phase === 'end') ended.current();
  }, [phase]);
  return (
    <div data-testid="example-stage" data-phase={phase} style={{ background: C.SURROUND, padding: 6 }}>
      <TrialStage first={first} second={second} maskSeed={maskSeed} phase={phase === 'idle' ? 'end' : phase} scale={scale} />
    </div>
  );
}

const cardStyle: CSSProperties = {
  border: `1.5px solid ${UI.line}`,
  borderRadius: 14,
  padding: '10px 16px',
  background: '#ffffff',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 20,
};

function ExampleCard({
  index, cue, density, hueOffset, scale, refreshMs, played, onPlayed,
}: {
  index: number; cue: Cue; density: Density; hueOffset: number; scale: number; refreshMs: number; played: boolean; onPlayed: () => void;
}) {
  const example = EXAMPLES[index];
  const { displayA, displayB } = useMemo(() => generateTrialPair(example.seedA, example.seedB, {
    cue, density, nB: example.nB, hueOffset,
  }), [example, cue, density, hueOffset]);
  const first = example.aFirst ? displayA : displayB;
  const second = example.aFirst ? displayB : displayA;
  const answer = correctInterval(example.nB, example.aFirst, displayA.n);
  const [runKey, setRunKey] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);

  const label = (n: 1 | 2) => {
    const more = (n === 1) === (answer === 'first');
    return (
      <div style={{
        fontSize: 16, fontWeight: more ? 750 : 600, color: more ? UI.correct : UI.muted,
      }}
      >
        {more ? `Diagram ${n} has more items` : `Diagram ${n}`}
      </div>
    );
  };

  return (
    <div style={cardStyle} data-testid={`example-${example.id}`} data-answer={answer}>
      <div style={{
        width: 70, display: 'flex', flexDirection: 'column', alignItems: 'center', color: UI.accent, flex: 'none',
      }}
      >
        <span style={{
          fontSize: 13, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase',
        }}
        >
          Example
        </span>
        <span style={{ fontSize: 34, fontWeight: 800, lineHeight: 1.1 }}>{index + 1}</span>
      </div>
      <div style={{ display: 'flex', gap: 14 }}>
        {([1, 2] as const).map((n) => (
          <div
            key={n}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
            }}
          >
            <ScaledDisplay display={n === 1 ? first : second} scale={scale} highlight={(n === 1) === (answer === 'first')} />
            {label(n)}
          </div>
        ))}
      </div>
      <div style={{ width: 1, alignSelf: 'stretch', background: UI.line }} />
      <PlayStage
        first={first}
        second={second}
        maskSeed={hashSeed(example.seedA, example.seedB, 'mask')}
        scale={scale}
        refreshMs={refreshMs}
        runKey={runKey}
        onEnd={() => {
          setShowAnswer(true);
          onPlayed();
        }}
      />
      <div style={{
        width: 190, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, flex: 'none',
      }}
      >
        {showAnswer ? (
          <>
            <KeyCap label={answer === 'first' ? 'F' : 'J'} size={44} />
            <span data-testid={`example-${example.id}-answer`} style={{ fontSize: 17, fontWeight: 700, color: UI.ink }}>
              {`The ${answer} had more`}
            </span>
            <Button
              variant="subtle"
              size="sm"
              leftSection={<IconRotateClockwise size={16} />}
              onClick={() => { setShowAnswer(false); setRunKey((k) => k + 1); }}
            >
              Replay
            </Button>
          </>
        ) : (
          <Button
            data-testid={`example-${example.id}-play`}
            leftSection={<IconPlayerPlayFilled size={16} />}
            disabled={runKey > 0 && !played && !showAnswer}
            onClick={() => { setShowAnswer(false); setRunKey((k) => k + 1); }}
            styles={{ root: { height: 'auto', padding: '8px 12px' }, label: { whiteSpace: 'normal', lineHeight: 1.25 } }}
          >
            Play as it will appear
          </Button>
        )}
      </div>
    </div>
  );
}

export default function ExamplePage({
  parameters, answers, setAnswer, advance,
}: StimulusParams<ExamplePageParameters | undefined>) {
  const upcoming = useUpcomingCell();
  const cue: Cue = parameters?.cue ?? upcoming?.cue ?? 'proximity';
  const density: Density = parameters?.density ?? upcoming?.density ?? 'sparse';
  const { sessionSalt, refreshMs } = readSetupAnswer(answers ?? {});
  const hueOffset = drawHueOffset(sessionSalt);
  const [scale] = useState(() => exampleScale(
    typeof window === 'undefined' ? 1440 : window.innerWidth,
    typeof window === 'undefined' ? 900 : window.innerHeight,
  ));
  const [played, setPlayed] = useState<boolean[]>(EXAMPLES.map(() => false));

  const textRef = useRef<HTMLDivElement>(null);
  const reading = useReadingTime(textRef, { minSeconds: EXAMPLE_MIN_READ_SECONDS, fixedSeconds: parameters?.readingSeconds });
  const allPlayed = played.every(Boolean);
  const ready = reading.ready && allPlayed;

  useEffect(() => {
    setAnswer({ status: ready, answers: {} });
  }, [setAnswer, ready]);

  return (
    <>
      <Panel
        testId="example-page"
        title="Two easy examples"
        maxWidth={1400}
        textRef={textRef}
        actions={(
          <ReadingButton
            reading={reading}
            blockedLabel={allPlayed ? undefined : 'Play both examples to continue'}
            onClick={() => advance?.()}
          >
            Continue
          </ReadingButton>
        )}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 17 }}>
            Here are your diagrams side by side. In the task they flash one after the other: press Play
            to see how.
          </div>
          {EXAMPLES.map((example, i) => (
            <ExampleCard
              key={example.id}
              index={i}
              cue={cue}
              density={density}
              hueOffset={hueOffset}
              scale={scale}
              refreshMs={refreshMs}
              played={played[i]}
              onPlayed={() => setPlayed((prev) => prev.map((p, k) => (k === i ? true : p)))}
            />
          ))}
        </div>
      </Panel>
      <FullscreenGate />
    </>
  );
}
