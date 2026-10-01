import { Button } from '@mantine/core';
import { useEffect } from 'react';
import { StimulusParams } from '../../../store/types';
import { gazeTracker } from './gazeTracker';
import { Panel } from './FullScreen';

function GazeEnd({ setAnswer, advance }: StimulusParams<undefined>) {
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

  // Full screen stays on: leaving it can shrink the window below the study's minimum size, and reVISit
  // rejects participants whose window stays too small for 60 s (the questionnaire is a reVISit page).
  const next = () => { advance?.(); };

  return (
    <Panel title="Eye tracking finished" actions={<Button size="lg" onClick={next}>Continue</Button>}>
      The camera is off. A short questionnaire follows.
    </Panel>
  );
}

export default GazeEnd;
