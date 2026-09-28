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

  const next = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
    advance?.();
  };

  return (
    <Panel title="Eye tracking finished" actions={<Button size="lg" onClick={next}>Continue</Button>}>
      The camera is off. You can leave full screen now. A short questionnaire follows.
    </Panel>
  );
}

export default GazeEnd;
