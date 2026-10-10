/**
 * The page that ends a session the computer cannot run. Shown by the setup when the full-screen
 * viewport is below the study's minimum or the device is a phone or tablet (`screenCheck.ts`), and,
 * with `reason: 'timing'`, when the display cannot keep the trial timing (`timingGuard.ts`: by the
 * setup's refresh guard and display test, and through `DisplayFailed.tsx` by the practice backstop).
 * The participant is told at once and asked to return the study, so nobody spends time on a session
 * that cannot be used. Like `AttentionFailed.tsx`, it records the
 * rejection with reVISit's `storageEngine.rejectCurrentParticipant(reason)` (freeing the participant's
 * Latin-square row), never advances, swallows Enter, and with `redirectUrl` sends the participant back
 * to Prolific `redirectDelayMs` after the rejection was stored (or after `REJECTION_WAIT_MS` at most).
 */
import { useEffect, useRef, useState } from 'react';
import { useStorageEngine } from '../../../storage/storageEngineHooks';
import { DEFAULT_CONTACT, DEFAULT_REDIRECT_DELAY_MS, REJECTION_WAIT_MS } from './AttentionFailed';
import { MinScreen, deviceRejectionReason, screenRejectionReason } from './screenCheck';
import { Panel } from './ui/Panel';
import { UI } from './ui/theme';

export type SessionEndReason = 'size' | 'device' | 'timing';

export const TIMING_TITLE = 'Your computer can\'t show this study reliably';
export const TIMING_TEXT = 'The diagrams must flash for exact fractions of a second, and your display could not keep that timing. Please return the study on Prolific. Thank you for your time.';

export interface ScreenTooSmallProps {
  /** full-screen viewport, CSS px ('size' and 'device') */
  width?: number;
  height?: number;
  /** the study's minimum ('size') */
  min?: MinScreen;
  /** 'size' (screen below the minimum), 'device' (phone or tablet) or 'timing' (display timing) */
  reason?: SessionEndReason;
  finePointer?: boolean;
  /** 'timing': the reason stored with the rejection, e.g. "Display timing: refresh 30 Hz" */
  timingReason?: string;
  prolificCode?: string;
  redirectUrl?: string;
  redirectDelayMs?: number;
  contactEmail?: string;
}

/** The reason stored with reVISit's rejection. */
export function sessionEndRejectionReason({
  reason = 'size', width = 0, height = 0, min = { width: 0, height: 0 }, finePointer = true, timingReason,
}: Pick<ScreenTooSmallProps, 'reason' | 'width' | 'height' | 'min' | 'finePointer' | 'timingReason'>): string {
  if (reason === 'timing') return timingReason ?? 'Display timing';
  if (reason === 'device') return deviceRejectionReason(width, height, finePointer);
  return screenRejectionReason(width, height, min);
}

const TITLES: Record<SessionEndReason, string> = {
  size: 'Your screen is too small for this study',
  device: 'This study needs a laptop or desktop computer',
  timing: TIMING_TITLE,
};

export function ScreenTooSmall({
  width = 0, height = 0, min = { width: 0, height: 0 }, reason = 'size', finePointer = true, timingReason,
  prolificCode, redirectUrl, redirectDelayMs = DEFAULT_REDIRECT_DELAY_MS, contactEmail = DEFAULT_CONTACT,
}: ScreenTooSmallProps) {
  const { storageEngine } = useStorageEngine() ?? {};
  const rejected = useRef(false);
  const [stored, setStored] = useState(false);

  useEffect(() => {
    if (!storageEngine || rejected.current) return;
    rejected.current = true;
    storageEngine.rejectCurrentParticipant(sessionEndRejectionReason({
      reason, width, height, min, finePointer, timingReason,
    }))
      .catch(() => console.error('Could not mark the participant as rejected'))
      .finally(() => setStored(true));
  }, [storageEngine, width, height, min, reason, finePointer, timingReason]);

  useEffect(() => {
    if (!redirectUrl) return undefined;
    const id = setTimeout(() => setStored(true), REJECTION_WAIT_MS);
    return () => clearTimeout(id);
  }, [redirectUrl]);

  useEffect(() => {
    if (!redirectUrl || !stored) return undefined;
    const id = setTimeout(() => window.location.replace(redirectUrl), redirectDelayMs);
    return () => clearTimeout(id);
  }, [redirectUrl, redirectDelayMs, stored]);

  useEffect(() => {
    const swallow = (event: KeyboardEvent) => {
      if (event.key === 'Enter') {
        event.stopImmediatePropagation();
        event.preventDefault();
      }
    };
    window.addEventListener('keydown', swallow, true);
    return () => window.removeEventListener('keydown', swallow, true);
  }, []);

  return (
    <Panel
      testId="screen-too-small"
      title={TITLES[reason]}
      progress={false}
      maxWidth={620}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div data-testid="screen-too-small-text" data-reason={reason} style={{ fontSize: 19, color: UI.ink }}>
          {reason === 'timing' && TIMING_TEXT}
          {reason === 'device' && 'It cannot be done on a phone or tablet. Please return the study on Prolific. Thank you for your time.'}
          {reason === 'size' && `This study needs a screen of at least ${min.width} x ${min.height} pixels in full screen; yours is ${Math.round(width)} x ${Math.round(height)}. Please return the study on Prolific. Thank you for your time.`}
        </div>
        {prolificCode && (
          <div data-testid="screen-too-small-code" style={{ fontSize: 18, color: UI.ink }}>
            Your Prolific code is
            {' '}
            <strong>{prolificCode}</strong>
            {redirectUrl
              ? '. You will be taken back to Prolific in a few seconds; please return your submission there.'
              : '. Please return your submission on Prolific.'}
          </div>
        )}
        <div style={{ fontSize: 16 }}>
          Questions? Contact
          {' '}
          <a href={`mailto:${contactEmail}`}>{contactEmail}</a>
          .
        </div>
      </div>
    </Panel>
  );
}
