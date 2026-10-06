/**
 * Full-screen state shared by every participant-facing page of the cluster-flow study (adapted from
 * scatterplot_gaze's FullScreen.tsx, without the gaze tracker).
 *
 * - `fullscreenSession.exits` counts how often full screen was left during the session; it is stored
 *   in the setup answer and in every trial record (a running total, so a trial's own exits are the
 *   difference to the previous record).
 * - A refused request is recorded (`fullscreenSession.refused`) and never blocks: the gates let the
 *   participant through until a later request succeeds.
 * - Without the Fullscreen API (jsdom, old browsers) everything counts as full screen and no gate shows.
 */
import { useCallback, useEffect, useState } from 'react';

export const fullscreenSession = { exits: 0, refused: false };

export function canFullscreen(): boolean {
  return typeof document !== 'undefined' && typeof document.documentElement?.requestFullscreen === 'function';
}

/** True when the page is full screen, or when the browser has no Fullscreen API. */
export function isFullscreen(): boolean {
  return !canFullscreen() || !!document.fullscreenElement;
}

/** Requests full screen; resolves to whether it is on afterwards. A refusal is recorded, not thrown. */
export function enterFullscreen(): Promise<boolean> {
  if (!canFullscreen()) return Promise.resolve(true);
  if (document.fullscreenElement) return Promise.resolve(true);
  return document.documentElement.requestFullscreen()
    .then(() => {
      fullscreenSession.refused = false;
      return true;
    })
    .catch(() => {
      fullscreenSession.refused = true;
      return false;
    });
}

if (typeof document !== 'undefined') {
  document.addEventListener('fullscreenchange', () => {
    if (document.fullscreenElement) {
      fullscreenSession.refused = false;
    } else {
      fullscreenSession.exits += 1;
    }
  });
}

/** Live full-screen state. */
export function useFullscreen(): boolean {
  const [fs, setFs] = useState(isFullscreen);
  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const on = () => setFs(isFullscreen());
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);
  return fs;
}

/**
 * Whether a full-screen gate should block the page right now, and the handler of its button.
 * The gate blocks while the page is not full screen, unless the participant already clicked the
 * button on this page (the request may be refused; the study then goes on, as before) or a request
 * was refused earlier in the session. Entering full screen re-arms the gate for the next exit.
 */
export function useFullscreenGate(): { blocked: boolean; returnToFullscreen: () => void } {
  const fs = useFullscreen();
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (fs) setDismissed(false);
  }, [fs]);

  const returnToFullscreen = useCallback(() => {
    setDismissed(true);
    enterFullscreen();
  }, []);

  return { blocked: !fs && !dismissed && !fullscreenSession.refused, returnToFullscreen };
}
