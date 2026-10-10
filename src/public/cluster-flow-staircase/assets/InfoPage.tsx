/**
 * The study's information pages, in the Panel layout with figures instead of paragraphs. One
 * react-component, `parameters.page` picks the page:
 *  - `introduction`: what the task is and the five parts of the session (before full screen);
 *  - `instructions`: the trial storyboard and "what counts as an item";
 *  - `practice`: the practice feedback loop and one real diagram of the participant's cue;
 *  - `main`: the main-task rules and answer keys;
 *  - `rest`: the break page the staircase block inserts every 50 main-block trials.
 * Every page advances with its button (reVISit's `advance()`) or Enter (the study's `nextOnEnter`),
 * but only after its minimum reading time (`ui/readingTime.tsx`; none on the rest page).
 * Pages after the setup mount the full-screen gate. The practice page reads the participant's cue
 * and density from the upcoming practice block's parameters (or from `parameters.cue/density`).
 */
import {
  IconBolt, IconClock, IconCoffee, IconEyeCheck, IconDeviceDesktop, IconDeviceDesktopCheck, IconKeyboard, IconMaximize,
  IconMessageOff, IconMessageQuestion, IconSchool, IconSignature,
} from '@tabler/icons-react';
import {
  ComponentType, ReactNode, useEffect, useMemo,
} from 'react';
import type { StimulusParams } from '../../../store/types';
import type { Cue, Density, TrialAnswer } from './generator';
import { generateDisplay } from './generator';
import { DEFAULT_ATTENTION_CONFIG } from './attention';
import { StimulusSVG } from './render/StimulusSVG';
import { DEFAULT_REST_EVERY as REST_EVERY, drawHueOffset, readSetupAnswer } from './staircaseBlock';
import {
  AttentionMini, ItemCountFigure, PracticeStoryboard, TrialStoryboard,
} from './ui/figures';
import { AnswerKeys } from './ui/KeyCap';
import { FullscreenGate, Panel } from './ui/Panel';
import { ReadingButton, useReadingTime } from './ui/readingTime';
import { useStudyProgress, useUpcomingCell } from './ui/studyContext';
import { DEFAULT_PRACTICE_TRIALS, DEFAULT_SESSION_MINUTES, MAIN_BLOCK_MINUTES } from './ui/studyProgress';
import { UI } from './ui/theme';

export type InfoPageName = 'introduction' | 'instructions' | 'practice' | 'main' | 'rest';

export interface InfoPageParameters {
  page: InfoPageName;
  /** practice page: the cue and density of the preview diagram; default: the participant's cell */
  cue?: Cue;
  density?: Density;
  /** replaces the computed minimum reading time, seconds (the shortened test study uses 1) */
  readingSeconds?: number;
}

/** How long the main block is, in words for participants (simulated median 147, p90 165, cap 190). */
export const MAIN_BLOCK_TRIALS = '150–200';

/** The seed of the practice page's example diagram (any fixed seed; it is not a trial). */
export const PREVIEW_SEED = 20261006;

type Icon = ComponentType<{ size?: number; stroke?: number; color?: string }>;

function IconBubble({ icon: I, size = 26 }: { icon: Icon; size?: number }) {
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: size * 1.9,
      height: size * 1.9,
      borderRadius: '50%',
      background: '#e7f1fb',
      color: UI.accent,
      flex: 'none',
    }}
    >
      <I size={size} stroke={1.8} />
    </span>
  );
}

/** One part of the session in the introduction's row of steps. */
function StepChip({
  n, icon, label, sub,
}: { n: number; icon: Icon; label: string; sub?: string }) {
  return (
    <div
      data-testid="session-step"
      style={{
        width: 150,
        padding: '16px 10px 14px',
        border: `1.5px solid ${UI.line}`,
        borderRadius: 14,
        background: '#ffffff',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 8,
      }}
    >
      <IconBubble icon={icon} />
      <div style={{
        fontSize: 13, fontWeight: 700, color: UI.accent, letterSpacing: 0.6,
      }}
      >
        {`PART ${n}`}
      </div>
      <div style={{
        fontSize: 16, fontWeight: 700, color: UI.ink, lineHeight: 1.25,
      }}
      >
        {label}
      </div>
      {sub && <div style={{ fontSize: 14, color: UI.muted, lineHeight: 1.3 }}>{sub}</div>}
    </div>
  );
}

/** A rule with an icon, for the main-task page. */
function RuleChip({ icon, children }: { icon: Icon; children: ReactNode }) {
  return (
    <div style={{
      flex: '1 1 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, minWidth: 150,
    }}
    >
      <IconBubble icon={icon} size={28} />
      <div style={{
        fontSize: 17, fontWeight: 650, color: UI.ink, lineHeight: 1.3,
      }}
      >
        {children}
      </div>
    </div>
  );
}

function Meta({ icon: I, children }: { icon: Icon; children: ReactNode }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <I size={18} stroke={1.8} />
      {children}
    </span>
  );
}

function IntroductionPage({ practiceTrials }: { practiceTrials: number }) {
  // the same estimate the progress header shows ("About N min left" at 0 %)
  const progress = useStudyProgress();
  const minutes = progress ? Math.ceil(progress.minutesLeft) : DEFAULT_SESSION_MINUTES;
  return (
    <div data-testid="info-introduction" style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      <div style={{ fontSize: 19 }}>
        Two diagrams flash one after the other. You say which one had more items.
      </div>
      <div
        data-testid="session-steps"
        style={{
          display: 'flex', justifyContent: 'center', alignItems: 'stretch', gap: 12, flexWrap: 'wrap',
        }}
      >
        <StepChip n={1} icon={IconSignature} label="Consent" />
        <StepChip n={2} icon={IconDeviceDesktopCheck} label="Display check" sub="full screen, screen size" />
        <StepChip n={3} icon={IconSchool} label="Instructions" sub={`examples + ${practiceTrials} practice trials`} />
        <StepChip n={4} icon={IconKeyboard} label="Main task" sub={`${MAIN_BLOCK_TRIALS} trials (about ${MAIN_BLOCK_MINUTES} min), a break every ${REST_EVERY}`} />
        <StepChip n={5} icon={IconMessageQuestion} label="A few questions" />
      </div>
      <div
        data-testid="session-meta"
        style={{
          display: 'flex', justifyContent: 'center', gap: 22, flexWrap: 'wrap', fontSize: 16, color: UI.muted,
        }}
      >
        <Meta icon={IconClock}>{`About ${minutes} minutes`}</Meta>
        <span aria-hidden>·</span>
        <Meta icon={IconDeviceDesktop}>laptop or desktop</Meta>
        <span aria-hidden>·</span>
        <Meta icon={IconMaximize}>full screen</Meta>
      </div>
      <div
        data-testid="attention-note"
        style={{
          alignSelf: 'center',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 14px',
          borderRadius: 999,
          background: '#fff4e6',
          color: '#7a3e00',
          fontSize: 15.5,
          fontWeight: 600,
        }}
      >
        <IconEyeCheck size={18} stroke={1.8} />
        {`A few easy attention checks are mixed in — missing more than ${DEFAULT_ATTENTION_CONFIG.maxMisses} ends the study.`}
      </div>
    </div>
  );
}

function InstructionsPage() {
  return (
    <div data-testid="info-instructions" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <TrialStoryboard maxHeight="31vh" />
      <div
        data-testid="attention-line"
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, fontSize: 16.5, color: UI.ink,
        }}
      >
        <AttentionMini height={40} />
        <span>
          <strong>Attention checks</strong>
          {` are this easy (5 vs 30 items). Missing more than ${DEFAULT_ATTENTION_CONFIG.maxMisses} ends the study.`}
        </span>
      </div>
      <div style={{
        fontSize: 15, fontWeight: 700, letterSpacing: 0.7, textTransform: 'uppercase', color: UI.accent, marginTop: 4,
      }}
      >
        What counts as an item
      </div>
      <ItemCountFigure maxHeight="20vh" />
      <div style={{ fontSize: 18, color: UI.ink }}>
        Count the nodes only. Arrows, outlines, colours and shapes don&apos;t count.
      </div>
      <div data-testid="never-equal" style={{ fontSize: 19, fontWeight: 750, color: UI.ink }}>
        The two diagrams never have the same number of items — always pick one.
      </div>
    </div>
  );
}

/** One real stimulus A of the participant's cell, small, as an example. */
function StimulusPreview({ cue, density, hueOffset }: { cue: Cue; density: Density; hueOffset: number }) {
  const display = useMemo(() => generateDisplay(PREVIEW_SEED, {
    kind: 'A', cue, density, hueOffset,
  }), [cue, density, hueOffset]);
  const height = typeof window === 'undefined' ? 800 : window.innerHeight;
  const scale = Math.max(0.28, Math.min(0.45, (0.3 * height) / display.height));
  return (
    <div
      data-testid="stimulus-preview"
      data-cue={cue}
      data-density={density}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
      }}
    >
      <div style={{
        width: display.width * scale, height: display.height * scale, border: `2px solid ${UI.ink}`, boxSizing: 'content-box', overflow: 'hidden',
      }}
      >
        <div style={{
          transform: `scale(${scale})`, transformOrigin: 'top left', width: display.width, height: display.height,
        }}
        >
          <StimulusSVG display={display} />
        </div>
      </div>
      <div style={{ fontSize: 16, color: UI.muted, fontWeight: 600 }}>Your diagrams look like this</div>
    </div>
  );
}

function PracticePage({ cell, hueOffset }: { cell: { cue: Cue; density: Density } | null; hueOffset: number }) {
  return (
    <div
      data-testid="info-practice"
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14,
      }}
    >
      <PracticeStoryboard maxHeight="24vh" />
      {cell && <StimulusPreview cue={cell.cue} density={cell.density} hueOffset={hueOffset} />}
    </div>
  );
}

function MainPage() {
  return (
    <div data-testid="info-main" style={{ display: 'flex', flexDirection: 'column', gap: 30 }}>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 24 }}>
        <RuleChip icon={IconMessageOff}>No feedback from now on</RuleChip>
        <RuleChip icon={IconBolt}>Answer with your first impression</RuleChip>
        <RuleChip icon={IconEyeCheck}>{`Easy attention checks: missing more than ${DEFAULT_ATTENTION_CONFIG.maxMisses} ends the study`}</RuleChip>
        <RuleChip icon={IconCoffee}>{`Breaks are offered every ${REST_EVERY} trials`}</RuleChip>
      </div>
      <div data-testid="main-length" style={{ fontSize: 18, color: UI.ink, fontWeight: 600 }}>
        {`The main task has about ${MAIN_BLOCK_TRIALS} trials.`}
      </div>
      <AnswerKeys size={52} />
    </div>
  );
}

/** Main trials finished so far (this study runs one cell per participant). */
export function countMainTrials(answers: StimulusParams<unknown>['answers']): number {
  return Object.values(answers ?? {}).filter((record) => {
    const data = record?.answer?.trialData as unknown as TrialAnswer | undefined;
    return record.endTime > -1 && !!data && typeof data === 'object'
      && (data.staircaseId === 'above' || data.staircaseId === 'below' || data.staircaseId === 'attention');
  }).length;
}

function RestPage({ trialsDone }: { trialsDone: number }) {
  return (
    <div
      data-testid="info-rest"
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 26,
      }}
    >
      <div style={{ fontSize: 19 }}>
        Rest your eyes as long as you like. The task continues exactly as before.
      </div>
      {trialsDone > 0 && (
        <div
          data-testid="rest-count"
          style={{
            padding: '8px 18px', borderRadius: 999, background: '#e7f1fb', color: UI.accent, fontWeight: 700, fontSize: 17,
          }}
        >
          {`${trialsDone} trials done`}
        </div>
      )}
      <AnswerKeys size={48} />
    </div>
  );
}

interface PageSpec {
  kicker?: string;
  title: string;
  button: string;
  maxWidth: number;
  gate: boolean;
  /** seconds before the button works (fixed per page); null = no timer */
  readSeconds: number | null;
}

/**
 * Seconds before each page's button works (fixed, since 2026-10-09): introduction 5, instructions
 * 15, practice intro 4, main-task intro 3; no timer on the rest page.
 */
export const PAGES: Record<InfoPageName, PageSpec> = {
  introduction: {
    kicker: 'Research study', title: 'Which diagram has more items?', button: 'Start', maxWidth: 900, gate: false, readSeconds: 5,
  },
  instructions: {
    title: 'How a trial works', button: 'Continue', maxWidth: 1100, gate: true, readSeconds: 15,
  },
  practice: {
    kicker: 'Practice', title: '3 easy trials with feedback', button: 'Start practice', maxWidth: 1000, gate: true, readSeconds: 4,
  },
  main: {
    kicker: 'Practice done', title: 'Main task', button: 'Start the main task', maxWidth: 960, gate: true, readSeconds: 3,
  },
  rest: {
    kicker: 'Main task', title: 'Short break', button: 'Continue', maxWidth: 700, gate: true, readSeconds: null,
  },
};

export default function InfoPage({
  parameters, answers, setAnswer, advance,
}: StimulusParams<InfoPageParameters>) {
  const page: InfoPageName = parameters?.page && parameters.page in PAGES ? parameters.page : 'introduction';
  const upcoming = useUpcomingCell();
  const practiceTrials = upcoming?.trials ?? DEFAULT_PRACTICE_TRIALS;
  const spec = page === 'practice'
    ? { ...PAGES.practice, title: `${practiceTrials} easy trials with feedback` }
    : PAGES[page];
  const cell = parameters?.cue && parameters?.density ? { cue: parameters.cue, density: parameters.density } : upcoming;
  const { sessionSalt } = readSetupAnswer(answers ?? {});

  // The page answer stays invalid until the reading time has passed, so neither the button nor
  // reVISit's Enter handler can advance it early.
  const reading = useReadingTime(spec.readSeconds === null ? null : parameters?.readingSeconds ?? spec.readSeconds);
  useEffect(() => {
    setAnswer({ status: reading.ready, answers: {} });
  }, [setAnswer, reading.ready]);

  let body: ReactNode;
  switch (page) {
    case 'instructions': body = <InstructionsPage />; break;
    case 'practice': body = <PracticePage cell={cell} hueOffset={drawHueOffset(sessionSalt)} />; break;
    case 'main': body = <MainPage />; break;
    case 'rest': body = <RestPage trialsDone={countMainTrials(answers)} />; break;
    default: body = <IntroductionPage practiceTrials={practiceTrials} />;
  }

  return (
    <>
      <Panel
        testId={`info-page-${page}`}
        kicker={spec.kicker}
        title={spec.title}
        maxWidth={spec.maxWidth}
        actions={<ReadingButton reading={reading} onClick={() => advance?.()}>{spec.button}</ReadingButton>}
      >
        {body}
      </Panel>
      {spec.gate && <FullscreenGate />}
    </>
  );
}
