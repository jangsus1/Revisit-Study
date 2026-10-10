/**
 * The terminal page of a participant who missed more than `maxMisses` attention checks: the staircase
 * block returns it instead of a trial (and keeps returning it after a reload, since it follows from
 * the stored trials). It covers the whole window, never becomes valid and swallows Enter, so
 * nothing advances: there are no further pages and no demographics.
 *
 * The rejection itself uses reVISit's native API, `storageEngine.rejectCurrentParticipant(reason)`
 * (as the platform's own TrainingFailed page does): the participant record gets `rejected: { reason,
 * timestamp }` and their Latin-square row is freed for the next participant. The reason names the
 * failure ("Attention check failed: missed N ...", so it reads as such in reVISit's participant
 * table) and the number of misses; the trial that caused it also stores `attentionMisses` in its trialData.
 *
 * With `prolificCode` the page shows the participant's Prolific code, and with `redirectUrl` it
 * sends them back to Prolific `redirectDelayMs` (8 s) after the rejection has been stored, like
 * reVISit's StudyEnd waits for the upload; if the rejection fails or takes longer than
 * `REJECTION_WAIT_MS` the redirect happens anyway. Both are set in the main config only.
 */
import { useEffect, useRef, useState } from 'react';
import type { JsonValue } from '../../../parser/types';
import { useStorageEngine } from '../../../storage/storageEngineHooks';
import type { StimulusParams } from '../../../store/types';
import { DEFAULT_ATTENTION_CONFIG } from './attention';
import { Panel } from './ui/Panel';
import { UI } from './ui/theme';

export interface AttentionFailedParameters {
  /** attention checks missed (more than `maxMisses`) */
  misses?: number;
  maxMisses?: number;
  contactEmail?: string;
  /** Prolific code to show (the "returned" code); none in the test study */
  prolificCode?: string;
  /** where to send the participant once the rejection is stored; no redirect without it */
  redirectUrl?: string;
  /** delay before the redirect, ms; default 8000 */
  redirectDelayMs?: number;
}

/** The redirect does not wait longer than this for the rejection to be stored, ms. */
export const REJECTION_WAIT_MS = 15000;
export const DEFAULT_REDIRECT_DELAY_MS = 8000;

export const DEFAULT_CONTACT = 'minsuk@gatech.edu';

/** The reason stored with reVISit's rejection. */
export function rejectionReason(misses: number, maxMisses: number): string {
  return `Attention check failed: missed ${misses} attention checks (more than ${maxMisses} allowed)`;
}

/** The participant's attention-check misses: the highest running total stored on a trial. */
export function storedMisses(answers: StimulusParams<unknown>['answers']): number | null {
  const counts = Object.values(answers ?? {})
    .map((record) => (record?.answer?.trialData as unknown as { attentionMisses?: number } | undefined)?.attentionMisses)
    .filter((m): m is number => typeof m === 'number');
  return counts.length > 0 ? Math.max(...counts) : null;
}

export default function AttentionFailed({ parameters, answers, setAnswer }: StimulusParams<AttentionFailedParameters | undefined>) {
  // The block returns this page without parameters, so the component's config parameters (code,
  // redirect) apply; the misses come from the stored trials (the study ends on miss max + 1).
  const fromAnswers = storedMisses(answers);
  const misses = parameters?.misses ?? fromAnswers ?? DEFAULT_ATTENTION_CONFIG.maxMisses + 1;
  const maxMisses = parameters?.maxMisses ?? Math.max(0, misses - 1);
  const contact = parameters?.contactEmail ?? DEFAULT_CONTACT;
  const prolificCode = parameters?.prolificCode;
  const redirectUrl = parameters?.redirectUrl;
  const redirectDelayMs = parameters?.redirectDelayMs ?? DEFAULT_REDIRECT_DELAY_MS;
  const { storageEngine } = useStorageEngine() ?? {};
  const rejected = useRef(false);
  const [stored, setStored] = useState(false);

  // The page never becomes valid: there is nothing to continue to.
  useEffect(() => {
    setAnswer({ status: false, answers: { attention: { rejected: true, misses, maxMisses } as unknown as JsonValue } });
  }, [setAnswer, misses, maxMisses]);

  useEffect(() => {
    if (!storageEngine || rejected.current) return;
    rejected.current = true;
    storageEngine.rejectCurrentParticipant(rejectionReason(misses, maxMisses))
      .catch(() => console.error('Could not mark the participant as rejected'))
      .finally(() => setStored(true));
  }, [storageEngine, misses, maxMisses]);

  // never wait for the storage longer than REJECTION_WAIT_MS
  useEffect(() => {
    if (!redirectUrl) return undefined;
    const id = setTimeout(() => setStored(true), REJECTION_WAIT_MS);
    return () => clearTimeout(id);
  }, [redirectUrl]);

  // back to Prolific redirectDelayMs after the rejection was stored
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
    <Panel testId="attention-failed" title="Attention check failed" progress={false} maxWidth={620}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ fontSize: 19, color: UI.ink }}>
          {`The study has ended. You missed more than ${maxMisses} attention check${maxMisses === 1 ? '' : 's'}, so we cannot use your responses.${prolificCode ? '' : ' Please return the study on Prolific.'}`}
        </div>
        {prolificCode && (
          <div data-testid="attention-failed-code" style={{ fontSize: 18, color: UI.ink }}>
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
          <a href={`mailto:${contact}`}>{contact}</a>
          .
        </div>
      </div>
    </Panel>
  );
}
