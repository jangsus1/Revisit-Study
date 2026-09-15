import { Box, Text, Title } from '@mantine/core';
import { useEffect } from 'react';
import { StimulusParams } from '../../../store/types';
import { gazeTracker } from './gazeTracker';

function GazeEnd({ setAnswer }: StimulusParams<undefined>) {
  useEffect(() => {
    const samplesTotal = gazeTracker.sampleCount;
    gazeTracker.stop();
    setAnswer({
      status: true,
      answers: {
        gazeEnd: JSON.stringify({ stoppedAt: Date.now(), samplesTotal }),
      },
    });
  }, [setAnswer]);

  return (
    <Box p="md" maw={760}>
      <Title order={2}>Eye tracking finished</Title>
      <Text mt="sm">
        Your camera has been turned off. You may cover it if you wish. A short questionnaire follows.
      </Text>
    </Box>
  );
}

export default GazeEnd;
