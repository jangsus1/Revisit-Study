/**
 * Shown by the setup when the full-screen viewport is below the study's minimum (`screenCheck.ts`):
 * the participant is told at once that the screen is too small and asked to return the study, so
 * nobody spends time on a session that cannot be used. Like `AttentionFailed.tsx`, it records the
 * rejection with reVISit's `storageEngine.rejectCurrentParticipant(reason)` (freeing the participant's
 * Latin-square row), never advances, swallows Enter, and with `redirectUrl` sends the participant back
 * to Prolific `redirectDelayMs` after the rejection was stored (or after `REJECTION_WAIT_MS` at most).
 */
import { useEffect, useRef, useState } from 'react';
import { useStorageEngine } from '../../../storage/storageEngineHooks';
import { DEFAULT_CONTACT, DEFAULT_REDIRECT_DELAY_MS, REJECTION_WAIT_MS } from './AttentionFailed';
import { MinScreen, screenRejectionReason } from './screenCheck';
import { Panel } from './ui/Panel';
import { UI } from './ui/theme';

export interface ScreenTooSmallProps {
  width: number;
  height: number;
  min: MinScreen;
  prolificCode?: string;
  redirectUrl?: string;
  redirectDelayMs?: number;
  contactEmail?: string;
}

export function ScreenTooSmall({
  width, height, min, prolificCode, redirectUrl, redirectDelayMs = DEFAULT_REDIRECT_DELAY_MS, contactEmail = DEFAULT_CONTACT,
}: ScreenTooSmallProps) {
  const { storageEngine } = useStorageEngine() ?? {};
  const rejected = useRef(false);
  const [stored, setStored] = useState(false);

  useEffect(() => {
    if (!storageEngine || rejected.current) return;
    rejected.current = true;
    storageEngine.rejectCurrentParticipant(screenRejectionReason(width, height, min))
      .catch(() => console.error('Could not mark the participant as rejected'))
      .finally(() => setStored(true));
  }, [storageEngine, width, height, min]);

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
    <Panel testId="screen-too-small" title="Your screen is too small for this study" progress={false} maxWidth={620}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ fontSize: 19, color: UI.ink }}>
          {`This study needs a screen of at least ${min.width} x ${min.height} pixels in full screen; yours is ${Math.round(width)} x ${Math.round(height)}. Please return the study on Prolific. Thank you for your time.`}
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
