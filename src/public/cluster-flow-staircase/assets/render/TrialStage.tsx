/**
 * The single stimulus location of a trial: a blank canvas that is always visible, with the first
 * stimulus, the noise mask, the second stimulus and the fixation cross layered on top of it. Every
 * layer is mounted for the whole trial and only its `visibility` follows the phase, so a phase
 * change costs a paint and not a layout. Used by the trial runner and the gallery preview.
 *
 * `scale` enlarges or shrinks the whole stage uniformly with a CSS transform (the trial runner's
 * physical-size scaling, `stimulusScale.ts`); the displays themselves stay in design pixels. The
 * gallery uses the default scale 1.
 */
import { CSSProperties } from 'react';
import { GENERATOR_CONFIG as C } from '../generator/config';
import type { Display } from '../generator/types';
import type { TimelinePhase } from '../useTrialTimeline';
import { NoiseMask } from './NoiseMask';
import { StimulusFrame } from './StimulusSVG';

/** Half the length of each fixation-cross bar, css px. */
const CROSS_HALF = 10;

function layer(visible: boolean): CSSProperties {
  return {
    position: 'absolute',
    top: 0,
    left: 0,
    visibility: visible ? 'visible' : 'hidden',
  };
}

export function TrialStage({
  first, second, maskSeed, phase, scale = 1,
}: { first: Display; second: Display; maskSeed: number; phase: TimelinePhase; scale?: number }) {
  const { width, height } = first;
  const stage = (
    <div data-testid="trial-stage" data-scale={scale} style={{ position: 'relative', width, height }}>
      <StimulusFrame />
      <div data-testid="layer-s1" data-stimulus={first.kind} style={layer(phase === 's1')}>
        <StimulusFrame display={first} />
      </div>
      <div data-testid="layer-mask" style={layer(phase === 'mask')}>
        <NoiseMask width={width} height={height} seed={maskSeed} />
      </div>
      <div data-testid="layer-s2" data-stimulus={second.kind} style={layer(phase === 's2')}>
        <StimulusFrame display={second} />
      </div>
      <div data-testid="layer-fixation" style={{ ...layer(phase === 'fixation'), width, height }}>
        <svg width={width} height={height} aria-hidden>
          <line x1={width / 2 - CROSS_HALF} y1={height / 2} x2={width / 2 + CROSS_HALF} y2={height / 2} stroke={C.INK} strokeWidth={2} />
          <line x1={width / 2} y1={height / 2 - CROSS_HALF} x2={width / 2} y2={height / 2 + CROSS_HALF} stroke={C.INK} strokeWidth={2} />
        </svg>
      </div>
    </div>
  );
  if (scale === 1) return stage;
  return (
    <div data-testid="trial-stage-scaled" style={{ width: width * scale, height: height * scale, flex: 'none' }}>
      <div style={{
        width, height, transform: `scale(${scale})`, transformOrigin: 'top left',
      }}
      >
        {stage}
      </div>
    </div>
  );
}
