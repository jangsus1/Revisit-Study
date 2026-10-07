/**
 * The cluster-flow study's one page layout (adapted from scatterplot_gaze's Panel): a full-window
 * page that covers reVISit's header and Next button, with an optional progress header, a small
 * kicker, a title, the body (figures first, few words) and one row of actions. Every
 * participant-facing page of the study uses it, so they all look alike.
 */
import { Button } from '@mantine/core';
import {
  CSSProperties, ReactNode, Ref, useEffect,
} from 'react';
import { useStudyProgress } from './studyContext';
import { progressLabel } from './studyProgress';
import { useFullscreenGate } from './fullscreen';
import { UI } from './theme';

/** Thin bar across the top of the window plus "N % done · About M min left". */
export function StudyProgress() {
  const p = useStudyProgress();
  if (!p) return null;
  const pct = Math.min(100, 100 * p.fraction);
  return (
    <div
      data-testid="study-progress"
      style={{
        position: 'absolute', top: 0, left: 0, right: 0, pointerEvents: 'none',
      }}
    >
      <div style={{ height: 5, background: '#e9ecef' }}>
        <div style={{
          height: 5, width: `${pct}%`, background: UI.accent, transition: 'width 0.4s',
        }}
        />
      </div>
      <div style={{
        position: 'absolute', top: 12, right: 20, fontSize: 14, color: UI.faint,
      }}
      >
        {progressLabel(p)}
      </div>
    </div>
  );
}

const panelStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 3000,
  color: UI.ink,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  // centred, but scrolls from the top when taller than the window
  justifyContent: 'safe center',
  gap: 'clamp(10px, 2.2vh, 20px)',
  padding: '40px 24px 24px',
  textAlign: 'center',
  fontFamily: UI.font,
  overflowY: 'auto',
};

export interface PanelProps {
  kicker?: ReactNode;
  title?: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
  /** max width of the body column, px */
  maxWidth?: number;
  progress?: boolean;
  background?: string;
  zIndex?: number;
  testId?: string;
  onPointerDown?: () => void;
  /** attached to the title and body (what the reading timer counts), not the progress header or buttons */
  textRef?: Ref<HTMLDivElement>;
  /** left-aligned body text (long pages such as the consent form) */
  alignLeft?: boolean;
}

export function Panel({
  kicker, title, children, actions, maxWidth = 640, progress = true, background = '#ffffff', zIndex, testId, onPointerDown,
  textRef, alignLeft = false,
}: PanelProps) {
  return (
    <div
      data-testid={testId}
      style={{ ...panelStyle, background, zIndex: zIndex ?? panelStyle.zIndex }}
      onPointerDown={onPointerDown}
    >
      {progress && <StudyProgress />}
      <div
        ref={textRef}
        style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'inherit', width: '100%',
        }}
      >
        {kicker && (
          <div style={{
            fontSize: 14, fontWeight: 650, letterSpacing: 0.7, textTransform: 'uppercase', color: UI.accent,
          }}
          >
            {kicker}
          </div>
        )}
        {title && <h1 style={{ margin: 0, fontSize: 'clamp(24px, 3.6vh, 32px)', fontWeight: 700 }}>{title}</h1>}
        {children && (
          <div style={{
            fontSize: 18, lineHeight: 1.5, color: UI.muted, maxWidth, width: '100%', textAlign: alignLeft ? 'left' : 'center',
          }}
          >
            {children}
          </div>
        )}
      </div>
      {actions && <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>{actions}</div>}
    </div>
  );
}

/** Full-screen "return" page drawn over the current page while `blocked`. */
export function FullscreenGatePanel({ onReturn }: { onReturn: () => void }) {
  // Enter must not reach reVISit's nextOnEnter handler and advance the page underneath.
  useEffect(() => {
    const swallowEnter = (event: KeyboardEvent) => {
      if (event.key === 'Enter') {
        event.stopImmediatePropagation();
        event.preventDefault();
      }
    };
    window.addEventListener('keydown', swallowEnter, true);
    return () => window.removeEventListener('keydown', swallowEnter, true);
  }, []);

  return (
    <Panel
      testId="fullscreen-gate"
      zIndex={5000}
      kicker="Full screen"
      title="Full screen was closed"
      actions={<Button size="lg" onClick={onReturn}>Return to full screen</Button>}
    >
      The diagrams are shown very briefly, so the study runs in full screen. Please keep it on until
      the end.
    </Panel>
  );
}

/** Mount on any page after the setup: blocks it whenever full screen is left. */
export function FullscreenGate() {
  const { blocked, returnToFullscreen } = useFullscreenGate();
  return blocked ? <FullscreenGatePanel onReturn={returnToFullscreen} /> : null;
}
