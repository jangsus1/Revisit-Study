/**
 * Progress header for the full-window screens of scatterplot_gaze (2026-09-30): the platform's progress bar is
 * covered by our overlays, so every Panel shows a thin bar at the top of the window and "About N min left".
 * Progress is weighted by the expected duration of each page (seconds at a typical participant's pace, from
 * pilot 4 plus reading time), not by page count: a belief rating takes ~5 s, a calibration ~50 s.
 * Not shown on the dot and plot screens (nothing there should draw the eyes).
 */
import { useMemo } from 'react';
import { useStoreSelector, useFlatSequence } from '../../../store/store';
import { useCurrentStep } from '../../../routes/utils';

const WEIGHTS: [RegExp, number][] = [
  [/^end$/, 0],
  [/^fullscreen$/, 15],
  [/^consent$/, 60],
  [/^attentionCheck$/, 120],
  [/_intro$|^phase2_examples$/, 20],
  [/^phase3_/, 6],                    // belief rating
  [/^webcamPermission$/, 90],
  [/^gazeCalibration$/, 50],
  [/^gazeRecalibration/, 45],
  [/^phase1_/, 17],                   // Task 2 trial: 3 dots, 5 s plot, slider, feedback
  [/^phase2_example/, 15],
  [/^gazeFinalCheck$/, 25],
  [/^gazeEnd$/, 5],
  [/^demographics$/, 60],
];

export function useStudyProgress(): { done: number; total: number; minutesLeft: number } | null {
  const config = useStoreSelector((state) => state.config);
  const flat = useFlatSequence();
  const step = useCurrentStep();
  return useMemo(() => {
    if (typeof step !== 'number' || !flat?.length) return null;
    const weight = (name: string) => {
      if (/^phase2_/.test(name) && !/_intro$|_examples?/.test(name)) {
        // Task 3 trial: 3 dots + click (~4 s), viewing time, slider (~4 s)
        const secs = (config.components[name] as { parameters?: { seconds?: number } } | undefined)?.parameters?.seconds;
        return 8 + (typeof secs === 'number' ? secs : 7);
      }
      const hit = WEIGHTS.find(([re]) => re.test(name));
      return hit ? hit[1] : 10;
    };
    const w = flat.map(weight);
    const total = w.reduce((a, b) => a + b, 0);
    const done = w.slice(0, step).reduce((a, b) => a + b, 0);
    return { done, total, minutesLeft: Math.max(0, (total - done) / 60) };
  }, [config, flat, step]);
}

export function StudyProgress() {
  const p = useStudyProgress();
  if (!p || p.total <= 0) return null;
  const pct = Math.min(100, (100 * p.done) / p.total);
  const left = p.minutesLeft < 1 ? 'Almost done' : `About ${Math.ceil(p.minutesLeft)} min left`;
  return (
    <div style={{
      position: 'absolute', top: 0, left: 0, right: 0, pointerEvents: 'none',
    }}
    >
      <div style={{ height: 5, background: '#e9ecef' }}>
        <div style={{ height: 5, width: `${pct}%`, background: '#1c7ed6', transition: 'width 0.4s' }} />
      </div>
      <div style={{
        position: 'absolute', top: 12, right: 20, fontSize: 14, color: '#868e96',
      }}
      >
        {`${Math.round(pct)} % done · ${left}`}
      </div>
    </div>
  );
}
