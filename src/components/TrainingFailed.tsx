import { Text } from '@mantine/core';
import { useEffect } from 'react';
import { useStartupInteractionBlocked } from './StartupContext';
import { useStorageEngine } from '../storage/storageEngineHooks';
import { useStudyConfig } from '../store/hooks/useStudyConfig';
import { ReactMarkdownWrapper } from './ReactMarkdownWrapper';

export function TrainingFailed() {
  const { storageEngine } = useStorageEngine();
  const startupInteractionBlocked = useStartupInteractionBlocked();
  const studyConfig = useStudyConfig();
  const { trainingFailedMsg, trainingFailedRedirectURL, trainingFailedRedirectDelay } = studyConfig.uiConfig;

  useEffect(() => {
    if (!startupInteractionBlocked && storageEngine) {
      storageEngine.rejectCurrentParticipant('Failed training')
        .catch(() => {
          console.error('Failed to reject participant who failed training');
        });
    }
  }, [startupInteractionBlocked, storageEngine]);

  useEffect(() => {
    if (!trainingFailedRedirectURL) {
      return undefined;
    }
    const timeoutId = setTimeout(() => {
      window.location.replace(trainingFailedRedirectURL);
    }, trainingFailedRedirectDelay ?? 10000);
    return () => clearTimeout(timeoutId);
  }, [trainingFailedRedirectURL, trainingFailedRedirectDelay]);

  return trainingFailedMsg
    ? <ReactMarkdownWrapper text={trainingFailedMsg} />
    : (
      <Text>
        Thank you for participating. Unfortunately you didn&apos;t answer the training correctly, which means you are not eligible to participate in the study. You may close this window now.
      </Text>
    );
}
