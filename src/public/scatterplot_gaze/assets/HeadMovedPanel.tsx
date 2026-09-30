/**
 * Shown by the Task 2 / Task 3 trials when the pre-trial check finds the head >= 4 cm away from where it was
 * during calibration (trialGaze.jsx). Continue re-runs the centre check.
 */
import { Button } from '@mantine/core';
import { useState } from 'react';
import { HeadStillNotice, Panel } from './FullScreen';
import { PositionGuide } from './PositionGuide';
import { gazeTracker } from './gazeTracker';

export default function HeadMovedPanel({ onContinue }: { onContinue: () => void }) {
  // Back to the distance of the calibration (lens-corrected, +-4 cm) rather than the general 45-70 cm
  const z = gazeTracker.calibHead ? gazeTracker.calibHead.origin[2] * gazeTracker.distanceScale : null;
  const range: [number, number] | undefined = z ? [z - 4, z + 4] : undefined;
  return (
    <Panel
      title="You moved your head"
      zIndex={4000}
      actions={<Button size="lg" color="orange" onClick={onContinue}>I am back in position</Button>}
    >
      Please sit the way you sat during calibration.
      <div style={{ marginTop: 22 }}><PositionGuide compact range={range} /></div>
      <HeadStillNotice />
    </Panel>
  );
}

/**
 * Small "my head moved" control for the between-plot screens (slider, feedback): the participant can ask
 * for a short recalibration, which the next trial's check then runs (5 dots) before the plot.
 */
export function RecalibrateButton() {
  const [asked, setAsked] = useState(gazeTracker.userRecalRequested);
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
