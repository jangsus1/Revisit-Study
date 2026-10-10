/**
 * The terminal page of the practice backstop (`timingGuard.ts`): the practice block returns the
 * `display-failed` component instead of ending when two or more of the three practice trials had a
 * stimulus or mask off target, and keeps returning it after a reload, since that follows from the
 * stored trials. It is `ScreenTooSmall` with reason 'timing' ("Your computer can't show this study
 * reliably"): reVISit's native rejection with the reason "Display timing: N of 3 practice trials off
 * target", the Prolific code and the redirect from the component's config parameters (main config
 * only), no advancing, Enter swallowed.
 */
import { useEffect } from 'react';
import type { JsonValue } from '../../../parser/types';
import type { StimulusParams } from '../../../store/types';
import type { TrialAnswer } from './generator';
import { ScreenTooSmall } from './ScreenTooSmall';
import { countOffTarget, practiceRejectionReason } from './timingGuard';

export interface DisplayFailedParameters {
  prolificCode?: string;
  redirectUrl?: string;
  redirectDelayMs?: number;
  contactEmail?: string;
}

/** The finished practice trials among the stored answers. */
export function storedPracticeTrials(answers: StimulusParams<unknown>['answers']): TrialAnswer[] {
  return Object.values(answers ?? {})
    .filter((record) => record && record.endTime > -1)
    .map((record) => record.answer?.trialData as unknown as TrialAnswer | undefined)
    .filter((trial): trial is TrialAnswer => !!trial && trial.staircaseId === 'practice');
}

/** The rejection reason, from the stored practice trials. */
export function practiceTimingReason(answers: StimulusParams<unknown>['answers']): string {
  const trials = storedPracticeTrials(answers);
  return practiceRejectionReason(countOffTarget(trials), trials.length);
}

export default function DisplayFailed({ parameters, answers, setAnswer }: StimulusParams<DisplayFailedParameters | undefined>) {
  const reason = practiceTimingReason(answers);

  // The page never becomes valid: there is nothing to continue to.
  useEffect(() => {
    setAnswer({ status: false, answers: { timing: { rejected: true, reason } as unknown as JsonValue } });
  }, [setAnswer, reason]);

  return (
    <ScreenTooSmall
      reason="timing"
      timingReason={reason}
      prolificCode={parameters?.prolificCode}
      redirectUrl={parameters?.redirectUrl}
      redirectDelayMs={parameters?.redirectDelayMs}
      contactEmail={parameters?.contactEmail}
    />
  );
}
