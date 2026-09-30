/**
 * Full-screen plumbing for scatterplot_gaze, in the style of the cluster-flow study:
 *  - FullscreenStart (default export): the first page. One button enters browser full screen, then the
 *    page advances by itself. Gaze coordinates are viewport pixels, so the viewport must not change
 *    between calibration and the trials.
 *  - Panel: a plain full-window screen (covers the platform header and Next button) with a title,
 *    one or two short lines and the action buttons. Used by the camera / calibration / check pages.
 *  - FullscreenGate: blocks the page with a "Return to full screen" button whenever full screen is
 *    left (Esc); counts exits in fullscreenExits for the data.
 */
import { Button } from '@mantine/core';
import {
  CSSProperties, ReactNode, useCallback, useEffect, useState,
} from 'react';
import { StimulusParams } from '../../../store/types';
import { StudyProgress } from './StudyProgress';

export const canFullscreen = () => typeof document !== 'undefined' && typeof document.documentElement?.requestFullscreen === 'function';
export const isFullscreen = () => !canFullscreen() || !!document.fullscreenElement;
export const enterFullscreen = () => {
  if (canFullscreen() && !document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => undefined);
};

/** Number of times full screen was left during the session (logged by the gaze pages). */
export const fullscreenStats = { exits: 0 };
if (typeof document !== 'undefined') {
  document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement) fullscreenStats.exits += 1; });
}

export function useFullscreen(): boolean {
  const [fs, setFs] = useState(isFullscreen);
  useEffect(() => {
    const on = () => setFs(isFullscreen());
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);
  return fs;
}

const panelStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 3000,
  background: '#ffffff',
  color: '#222',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'safe center',   // centred, but scrolls from the top when taller than the window
  gap: 18,
  padding: 24,
  textAlign: 'center',
  fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif',
};

/**
 * The study's one page layout (camera, calibration, intro and question screens): full window, white,
 * centred column; optional small `kicker` above the title ("Task 2 of 3"), short body, one row of buttons.
 */
export function Panel({
  title, children, actions, zIndex, kicker, maxWidth = 560, progress = true,
}: { title?: ReactNode; children?: ReactNode; actions?: ReactNode; zIndex?: number; kicker?: ReactNode; maxWidth?: number; progress?: boolean }) {
  return (
    <div style={{ ...panelStyle, zIndex: zIndex ?? panelStyle.zIndex, overflowY: 'auto' }}>
      {progress && <StudyProgress />}
      {kicker && <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: 0.6, textTransform: 'uppercase', color: '#1c7ed6' }}>{kicker}</div>}
      {title && <div style={{ fontSize: 28, fontWeight: 650 }}>{title}</div>}
      {children && <div style={{ fontSize: 18, lineHeight: 1.5, color: '#444', maxWidth }}>{children}</div>}
      {actions && <div style={{ display: 'flex', gap: 12, marginTop: 6 }}>{actions}</div>}
    </div>
  );
}

/** Amber "keep your head still" notice used on every setup / instruction screen of the gaze study. */
export function HeadStillNotice({ children }: { children?: ReactNode }) {
  return (
    <div style={{
      margin: '18px auto 0', maxWidth: 560, padding: '12px 18px', borderRadius: 10, background: '#fff4e6',
      border: '2px solid #fd7e14', color: '#7a3e00', fontSize: 17, lineHeight: 1.45, textAlign: 'center',
    }}
    >
      <div style={{ fontWeight: 700, fontSize: 18 }}>Do not move your head until the end of the task.</div>
      {children ?? 'Move only your eyes. Moving, leaning or turning your head makes the eye tracking inaccurate.'}
    </div>
  );
}

export function FullscreenGate() {
  const fs = useFullscreen();
  if (fs) return null;
  return (
    <Panel
      zIndex={5000}
      title="Full screen was closed"
      actions={<Button size="lg" onClick={enterFullscreen}>Return to full screen</Button>}
    >
      The eye tracker needs full screen. Please keep your head where it was.
    </Panel>
  );
}

function FullscreenStart({ setAnswer, advance }: StimulusParams<undefined>) {
  const fs = useFullscreen();
  const [clicked, setClicked] = useState(false);
  const done = useCallback(() => {
    setAnswer({
      status: true,
      answers: {
        fullscreen: JSON.stringify({
          fullscreen: !!document.fullscreenElement, supported: canFullscreen(), viewport: [window.innerWidth, window.innerHeight], screen: [window.screen.width, window.screen.height],
        }),
      },
    });
    advance?.();
  }, [setAnswer, advance]);

  useEffect(() => {
    setAnswer({ status: false, answers: { fullscreen: '' } });
  }, [setAnswer]);

  // Advance once full screen is on (after the click; the resize settles first)
  useEffect(() => {
    if (!clicked || !fs) return undefined;
    const t = setTimeout(done, 300);
    return () => clearTimeout(t);
  }, [clicked, fs, done]);

  return (
    <Panel
      title="Full screen"
      actions={canFullscreen()
        ? <Button size="lg" onClick={() => { setClicked(true); enterFullscreen(); }}>Enter full screen</Button>
        : <Button size="lg" onClick={done}>Continue</Button>}
    >
      This study runs in full screen. Please keep it on until the end.
    </Panel>
  );
}

export default FullscreenStart;
