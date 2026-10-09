/**
 * The terminal page of a participant who missed more than `maxMisses` attention checks: the staircase
 * block returns it instead of a trial (and keeps returning it after a reload, since it follows from
 * the stored trials). It covers the whole window, never becomes valid and swallows Enter, so
 * nothing advances: there are no further pages and no demographics.
 *
 * The rejection itself uses reVISit's native API, `storageEngine.rejectCurrentParticipant(reason)`
 * (as the platform's own TrainingFailed page does): the participant record gets `rejected: { reason,
 * timestamp }` and their Latin-square row is freed for the next participant. The reason names the
 * number of misses; the trial that caused it also stores `attentionMisses` in its trialData.
 */
import { useEffect, useRef } from 'react';
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
}

export const DEFAULT_CONTACT = 'minsuk@gatech.edu';

/** The reason stored with reVISit's rejection. */
export function rejectionReason(misses: number, maxMisses: number): string {
  return `Missed ${misses} attention checks (more than ${maxMisses} allowed)`;
}

export default function AttentionFailed({ parameters, setAnswer }: StimulusParams<AttentionFailedParameters | undefined>) {
  const maxMisses = parameters?.maxMisses ?? DEFAULT_ATTENTION_CONFIG.maxMisses;
  const misses = parameters?.misses ?? maxMisses + 1;
  const contact = parameters?.contactEmail ?? DEFAULT_CONTACT;
  const { storageEngine } = useStorageEngine() ?? {};
  const rejected = useRef(false);

  // The page never becomes valid: there is nothing to continue to.
  useEffect(() => {
    setAnswer({ status: false, answers: { attention: { rejected: true, misses, maxMisses } as unknown as JsonValue } });
  }, [setAnswer, misses, maxMisses]);

  useEffect(() => {
    if (!storageEngine || rejected.current) return;
    rejected.current = true;
    storageEngine.rejectCurrentParticipant(rejectionReason(misses, maxMisses))
      .catch(() => console.error('Could not mark the participant as rejected'));
  }, [storageEngine, misses, maxMisses]);

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
    <Panel testId="attention-failed" title="The study has ended" progress={false} maxWidth={620}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ fontSize: 19, color: UI.ink }}>
          {`You missed more than ${maxMisses} attention check${maxMisses === 1 ? '' : 's'}, so we cannot use your responses. Please return the study on Prolific.`}
        </div>
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
