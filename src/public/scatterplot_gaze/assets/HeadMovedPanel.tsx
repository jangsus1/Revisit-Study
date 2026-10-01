/**
 * Shown by the Task 2 / Task 3 trials when the pre-trial check finds the head >= 4 cm away from where it was
 * during calibration (trialGaze.jsx). Continue re-runs the centre check.
 */
import { Button } from '@mantine/core';
import { useState } from 'react';
import { HeadStillNotice, Panel } from './FullScreen';
import { PositionGuide } from './PositionGuide';
import { gazeTracker } from './gazeTracker';
import { useFlatSequence } from '../../../store/store';
import { useCurrentStep } from '../../../routes/utils';

export default function HeadMovedPanel({ onContinue, kind = 'moved' }: { onContinue: () => void; kind?: 'moved' | 'noFace' | boolean }) {
  const noFace = kind === 'noFace';
  // Back to the distance of the calibration (lens-corrected, +-4 cm) rather than the general 45-70 cm
  const z = gazeTracker.calibHead ? gazeTracker.calibHead.origin[2] * gazeTracker.distanceScale : null;
  const range: [number, number] | undefined = z ? [z - 4, z + 4] : undefined;
  return (
    <Panel
      title={noFace ? 'We lost your face' : 'You moved your head'}
      zIndex={4000}
      actions={<Button size="lg" color="orange" onClick={onContinue}>I am back in position</Button>}
    >
      {noFace ? 'Keep your face in the oval and your eyes on the screen.' : 'Please sit the way you sat during calibration.'}
      <div style={{ marginTop: 22 }}><PositionGuide compact range={range} /></div>
      <HeadStillNotice />
    </Panel>
  );
}

/**
 * Small "my head moved" control for the between-plot screens (slider, feedback): the participant can ask
 * for a short recalibration, which the next trial's check then runs (7 dots: plot centre, labels, plot quadrants) before the plot.
 */
export function RecalibrateButton() {
  const [asked, setAsked] = useState(gazeTracker.userRecalRequested);
  // only offered when the next page is another trial (the request is served by that trial's check)
  const flat = useFlatSequence();
  const step = useCurrentStep();
  const nextName = typeof step === 'number' ? flat?.[step + 1] : undefined;
  const nextIsTrial = !!nextName && /^phase[12]_/.test(nextName) && !/_intro$|_examples$/.test(nextName);
  if (!nextIsTrial) return null;
  if (asked) {
    return <div style={{ marginTop: 14, fontSize: 14, color: '#2f9e44' }}>OK: a short recalibration runs before the next plot.</div>;
  }
  return (
    <div style={{ marginTop: 14, fontSize: 14, color: '#888' }}>
      Keep your head still. Moved it?
      {' '}
      <Button
        variant="subtle"
        size="compact-sm"
        onClick={() => { gazeTracker.userRecalRequested = true; gazeTracker.userRecalCount += 1; setAsked(true); }}
      >
        Recalibrate briefly
      </Button>
    </div>
  );
}

/** After a page reload the tracker has no calibration: shown before the trial re-runs the 15-dot calibration. */
export function SetupAgainPanel({ onStart }: { onStart: () => void }) {
  return (
    <Panel
      title="Eye tracking needs a quick recalibration"
      zIndex={4000}
      actions={<Button size="lg" onClick={onStart}>Start</Button>}
    >
      The page was reloaded, so the eye tracker starts again. Look at each dot until it disappears.
      <div style={{ marginTop: 22 }}><PositionGuide compact /></div>
      <HeadStillNotice />
    </Panel>
  );
}
