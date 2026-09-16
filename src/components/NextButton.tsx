import { Alert, Button, Group } from '@mantine/core';
import {
  JSX, useEffect, useMemo, useRef, useState,
} from 'react';
import { IconInfoCircle, IconAlertTriangle } from '@tabler/icons-react';
import { useNavigate } from 'react-router';
import { useNextStep } from '../store/hooks/useNextStep';
import { shouldIgnoreEnter } from './keyboardUtils';
import type { IndividualComponent, ResponseBlockLocation } from '../parser/types';
import { useStudyConfig } from '../store/hooks/useStudyConfig';
import { useCurrentIdentifier } from '../routes/utils';
import { PreviousButton } from './PreviousButton';
import {
  DEFAULT_AUTO_ADVANCE_WARNING_MESSAGE,
  DEFAULT_AUTO_ADVANCE_WARNING_TIME,
  getAutoAdvanceWarning,
} from './nextButtonTimeout';

const nextButtonJustify = {
  left: 'flex-start',
  center: 'center',
  right: 'flex-end',
} as const;

type Props = {
  label?: string;
  disabled?: boolean;
  config?: IndividualComponent;
  location?: ResponseBlockLocation;
  checkAnswer: JSX.Element | null;
  onCheckAnswer?: () => void;
  onNext: () => void;
  /** True while the stimulus has asked to advance via `StimulusParams.advance()`. */
  advanceRequested?: boolean;
  /** Called once the request has been honoured or dropped. */
  onAdvanceConsumed?: () => void;
};

export function NextButton({
  label = 'Next',
  disabled = false,
  config,
  location,
  checkAnswer,
  onCheckAnswer,
  onNext,
  advanceRequested = false,
  onAdvanceConsumed,
}: Props) {
  const { isNextDisabled, goToNextStep } = useNextStep();
  const studyConfig = useStudyConfig();
  const navigate = useNavigate();
  const identifier = useCurrentIdentifier();

  const nextButtonDisableTime = config?.nextButtonDisableTime ?? studyConfig.uiConfig.nextButtonDisableTime;
  const nextButtonEnableTime = config?.nextButtonEnableTime ?? studyConfig.uiConfig.nextButtonEnableTime ?? 0;
  const nextButtonAutoAdvanceTime = config?.nextButtonAutoAdvanceTime;
  const nextButtonAutoAdvanceWarningTime = config?.nextButtonAutoAdvanceWarningTime ?? DEFAULT_AUTO_ADVANCE_WARNING_TIME;
  const nextButtonAutoAdvanceWarningMessage = config?.nextButtonAutoAdvanceWarningMessage ?? DEFAULT_AUTO_ADVANCE_WARNING_MESSAGE;

  const [timer, setTimer] = useState<number | undefined>(undefined);
  const autoAdvanceTriggered = useRef(false);
  // Use the current identifier so nested function-sequence items reset their timer state.
  useEffect(() => {
    autoAdvanceTriggered.current = false;
    const start = Date.now();
    setTimer(0);
    const interval = setInterval(() => {
      setTimer(Date.now() - start);
    }, 100);
    return () => {
      clearInterval(interval);
    };
  }, [identifier]);

  useEffect(() => {
    if (timer === undefined) {
      return;
    }
    if (nextButtonDisableTime && timer >= nextButtonDisableTime && studyConfig.uiConfig.timeoutReject) {
      navigate(`./../__timedOut${window.location.search}`);
    }
  }, [nextButtonDisableTime, timer, navigate, studyConfig.uiConfig.timeoutReject]);

  useEffect(() => {
    if (timer === undefined || nextButtonAutoAdvanceTime === undefined || timer < nextButtonAutoAdvanceTime || autoAdvanceTriggered.current) {
      return;
    }

    autoAdvanceTriggered.current = true;
    goToNextStep(false);
  }, [goToNextStep, nextButtonAutoAdvanceTime, timer]);

  const buttonTimerSatisfied = useMemo(
    () => {
      if (timer === undefined) {
        return true;
      }
      const nextButtonDisableSatisfied = nextButtonDisableTime ? timer <= nextButtonDisableTime : true;
      const nextButtonEnableSatisfied = nextButtonEnableTime ? timer >= nextButtonEnableTime : true;
      return nextButtonDisableSatisfied && nextButtonEnableSatisfied;
    },
    [nextButtonDisableTime, nextButtonEnableTime, timer],
  );

  const autoAdvanceWarning = useMemo(() => getAutoAdvanceWarning({
    timer,
    autoAdvanceTime: nextButtonAutoAdvanceTime,
    warningTime: nextButtonAutoAdvanceWarningTime,
    warningMessage: nextButtonAutoAdvanceWarningMessage,
  }), [nextButtonAutoAdvanceTime, nextButtonAutoAdvanceWarningMessage, nextButtonAutoAdvanceWarningTime, timer]);

  const nextOnEnter = config?.nextOnEnter ?? studyConfig.uiConfig.nextOnEnter;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Enter' || shouldIgnoreEnter(event.target)) {
        return;
      }

      if (onCheckAnswer) {
        onCheckAnswer();
        return;
      }
      if (!disabled && !isNextDisabled && buttonTimerSatisfied) {
        onNext();
      }
    };

    if (nextOnEnter) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [disabled, isNextDisabled, buttonTimerSatisfied, onCheckAnswer, onNext, nextOnEnter]);

  // A programmatic advance from the stimulus behaves like Enter, except that it never triggers Check Answer:
  // while feedback is pending the request is dropped, and while a timer or validation blocks Next it waits.
  // Each request is honoured at most once, however often the guards re-evaluate before the parent clears it.
  const advancePendingRef = useRef(false);
  useEffect(() => {
    advancePendingRef.current = advanceRequested;
  }, [advanceRequested]);
  useEffect(() => {
    if (!advanceRequested || !advancePendingRef.current || !onAdvanceConsumed) {
      return;
    }
    if (onCheckAnswer) {
      advancePendingRef.current = false;
      onAdvanceConsumed();
      return;
    }
    // `timer` is undefined only before the mount effect starts it; wait so an enable time is honoured.
    if (disabled || isNextDisabled || timer === undefined || !buttonTimerSatisfied) {
      return;
    }
    advancePendingRef.current = false;
    onAdvanceConsumed();
    onNext();
  }, [advanceRequested, onAdvanceConsumed, onCheckAnswer, disabled, isNextDisabled, timer, buttonTimerSatisfied, onNext]);

  const nextButtonDisabled = disabled || isNextDisabled || !buttonTimerSatisfied;
  const previousButtonText = config?.previousButtonText ?? studyConfig.uiConfig.previousButtonText ?? 'Previous';
  const nextButtonAlignment = config?.nextButtonAlignment ?? studyConfig.uiConfig.nextButtonAlignment ?? 'right';

  return (
    <>
      <Group justify={nextButtonJustify[nextButtonAlignment]} gap="xs" mt="sm" wrap="wrap">
        {config?.previousButton && (
          <PreviousButton
            label={previousButtonText}
            px={location === 'sidebar' && checkAnswer ? 8 : undefined}
          />
        )}
        {checkAnswer}
        <Button
          type="submit"
          disabled={nextButtonDisabled}
          onClick={() => onNext()}
          px={location === 'sidebar' && checkAnswer ? 8 : undefined}
        >
          {label}
        </Button>
      </Group>
      {timer !== undefined && (
        <>
          {nextButtonEnableTime > 0 && timer < nextButtonEnableTime && (
            <Alert mt="md" title="Please wait" color="blue" icon={<IconInfoCircle />}>
              The next button will be enabled in
              {' '}
              {Math.ceil((nextButtonEnableTime - timer) / 1000)}
              {' '}
              seconds.
            </Alert>
          )}
          {nextButtonDisableTime && (nextButtonDisableTime - timer) < 10000 && (
            (nextButtonDisableTime - timer) > 0
              ? (
                <Alert mt="md" title="Next button disables soon" color="yellow" icon={<IconAlertTriangle />}>
                  The next button disables in
                  {' '}
                  {Math.ceil((nextButtonDisableTime - timer) / 1000)}
                  {' '}
                  seconds.
                </Alert>
              ) : !studyConfig.uiConfig.timeoutReject && (
                <Alert mt="md" title="Next button disabled" color="red" icon={<IconAlertTriangle />}>
                  The next button has timed out and is now disabled.
                  <Group justify="right" mt="sm">
                    <Button onClick={() => goToNextStep(false)} variant="link" color="red">Proceed</Button>
                  </Group>
                </Alert>
              ))}
          {autoAdvanceWarning && (
            <Alert mt="md" title="Automatically advancing soon" color="yellow" icon={<IconAlertTriangle />}>
              {autoAdvanceWarning.message}
            </Alert>
          )}
        </>
      )}
    </>
  );
}
