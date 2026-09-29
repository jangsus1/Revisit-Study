/**
 * Device calibration ("virtual chinrest", Li et al., 2020 Sci. Rep.; used by Saxena et al., 2024):
 *  - CardCheck: the participant resizes a picture of a bank/ID card (ISO/IEC 7810 ID-1, 85.60 x 53.98 mm)
 *    to match a real card held against the screen -> CSS pixels per cm.
 *  - BlindSpotCheck: right eye closed, left eye fixates a square; a red dot moves left from the square and
 *    the participant presses Space when it vanishes in the blind spot (~13.5 deg temporal to fixation) ->
 *    viewing distance = dot-square distance / tan(13.5 deg). Five valid sweeps, median.
 * Nothing is recorded but the numbers. Both render inside the full-window Panel style.
 */
import { Button, Slider } from '@mantine/core';
import {
  useCallback, useEffect, useRef, useState,
} from 'react';
import { Panel } from './FullScreen';
import { gazeTracker } from './gazeTracker';

export const CARD_W_CM = 8.56;
const CARD_H_CM = 5.398;
const BLIND_SPOT_DEG = 13.5;
const SWEEPS = 5;
const MAX_TRIES = 10;
const DOT_SPEED = 180;          // px / s
const START_GAP = 120;          // px left of the square where the dot starts
const VALID_CM: [number, number] = [25, 120];

export type CardResult = { pxPerCm: number; cardWidthPx: number } | null;
export type BlindSpotResult = {
  distanceCm: number;
  sweepsPx: number[];            // dot-square distance at each valid key press
  invalid: number;               // sweeps rejected (no press, or implausible distance)
  faceZcm: number | null;        // tracker's face-distance estimate during the sweeps (median)
};

export function CardCheck({ onDone }: { onDone: (r: CardResult) => void }) {
  const [w, setW] = useState(() => Math.round(CARD_W_CM * (96 / 2.54)));   // nominal 96 dpi start
  const h = (w * CARD_H_CM) / CARD_W_CM;
  return (
    <Panel
      title="Screen size"
      actions={(
        <>
          <Button size="lg" onClick={() => onDone({ pxPerCm: w / CARD_W_CM, cardWidthPx: w })}>Done</Button>
          <Button size="lg" variant="subtle" color="gray" onClick={() => onDone(null)}>I have no card</Button>
        </>
      )}
    >
      Hold a bank card or ID card against the screen.
      <br />
      Drag the slider until the picture is the same size.
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 22, marginTop: 24,
      }}
      >
        <svg width={w} height={h} style={{ display: 'block' }}>
          <rect x={1} y={1} width={w - 2} height={h - 2} rx={(w * 0.318) / CARD_W_CM} fill="#dbeafe" stroke="#1e3a8a" strokeWidth={2} />
          <rect x={w * 0.1} y={h * 0.3} width={w * 0.14} height={h * 0.2} rx={3} fill="#fbbf24" />
          <rect x={w * 0.1} y={h * 0.72} width={w * 0.6} height={h * 0.07} rx={2} fill="#93c5fd" />
        </svg>
        <Slider w={440} min={150} max={700} step={1} value={w} onChange={setW} label={null} />
      </div>
    </Panel>
  );
}

export function BlindSpotCheck({ pxPerCm, onDone }: { pxPerCm: number; onDone: (r: BlindSpotResult | null) => void }) {
  const [phase, setPhase] = useState<'intro' | 'running' | 'retry'>('intro');
  const [nValid, setNValid] = useState(0);
  const valid = useRef<number[]>([]);
  const dotRef = useRef<HTMLDivElement | null>(null);
  const sweep = useRef<{ start: number; raf: number; x0: number; done: boolean } | null>(null);
  const invalid = useRef(0);
  const faceZ = useRef<number[]>([]);
  const W = typeof window === 'undefined' ? 1200 : window.innerWidth;
  const H = typeof window === 'undefined' ? 800 : window.innerHeight;
  const sqX = W - 140;
  const cy = H / 2;

  // Tracker's own distance estimate during the sweeps (to correct it later)
  useEffect(() => {
    if (phase !== 'running') return undefined;
    return gazeTracker.onSample((s) => { if (s.face && s.origin) faceZ.current.push(Math.abs(s.origin[2])); });
  }, [phase]);

  const finish = useCallback((sweeps: number[]) => {
    const px = [...sweeps].sort((a, b) => a - b)[Math.floor(sweeps.length / 2)];
    const distanceCm = px / pxPerCm / Math.tan((BLIND_SPOT_DEG * Math.PI) / 180);
    const z = [...faceZ.current].sort((a, b) => a - b);
    onDone({
      distanceCm: Math.round(distanceCm * 10) / 10,
      sweepsPx: sweeps.map(Math.round),
      invalid: invalid.current,
      faceZcm: z.length ? Math.round(z[Math.floor(z.length / 2)] * 10) / 10 : null,
    });
  }, [pxPerCm, onDone]);

  const startSweep = useCallback(() => {
    const x0 = sqX - START_GAP;
    const s = {
      start: performance.now(), raf: 0, x0, done: false,
    };
    sweep.current = s;
    const step = () => {
      if (s.done) return;
      const x = x0 - (DOT_SPEED * (performance.now() - s.start)) / 1000;
      if (x < 20) {                       // reached the edge without a key press
        s.done = true;
        invalid.current += 1;
        if (invalid.current + valid.current.length >= MAX_TRIES) setPhase('retry');
        else setTimeout(() => startSweep(), 600);
        return;
      }
      if (dotRef.current) dotRef.current.style.transform = `translate(${x - 12}px, ${cy - 12}px)`;
      s.raf = requestAnimationFrame(step);
    };
    s.raf = requestAnimationFrame(step);
  }, [sqX, cy]);

  // Space = "the dot disappeared"
  useEffect(() => {
    if (phase !== 'running') return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space' && e.key !== ' ') return;
      e.preventDefault();
      const s = sweep.current;
      if (!s || s.done) return;
      s.done = true;
      cancelAnimationFrame(s.raf);
      const x = s.x0 - (DOT_SPEED * (performance.now() - s.start)) / 1000;
      const px = sqX - x;
      const cm = px / pxPerCm / Math.tan((BLIND_SPOT_DEG * Math.PI) / 180);
      if (cm >= VALID_CM[0] && cm <= VALID_CM[1]) valid.current = [...valid.current, px];
      else invalid.current += 1;
      setNValid(valid.current.length);
      if (valid.current.length >= SWEEPS) setTimeout(() => finish(valid.current), 300);
      else if (invalid.current + valid.current.length >= MAX_TRIES) setPhase('retry');
      else setTimeout(() => startSweep(), 700);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, sqX, pxPerCm, finish, startSweep]);

  useEffect(() => () => { if (sweep.current) { sweep.current.done = true; cancelAnimationFrame(sweep.current.raf); } }, []);

  if (phase === 'intro' || phase === 'retry') {
    return (
      <Panel
        title={phase === 'retry' ? "Let's try that again" : 'Viewing distance'}
        actions={(
          <>
            <Button
              size="lg"
              onClick={() => {
                invalid.current = 0; valid.current = []; setNValid(0); faceZ.current = []; setPhase('running'); setTimeout(startSweep, 800);
              }}
            >
              Start
            </Button>
            {phase === 'retry' && <Button size="lg" variant="subtle" color="gray" onClick={() => onDone(null)}>Skip</Button>}
          </>
        )}
      >
        <strong>Close your right eye.</strong>
        {' '}
        Keep looking at the black square with your left eye.
        <br />
        A red dot moves left. Press
        {' '}
        <strong>Space</strong>
        {' '}
        the moment it disappears. 5 times.
      </Panel>
    );
  }
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 3000, background: '#fff', cursor: 'none', userSelect: 'none',
    }}
    >
      <div style={{
        position: 'absolute', left: sqX - 14, top: cy - 14, width: 28, height: 28, background: '#111',
      }}
      />
      <div
        ref={dotRef}
        style={{
          position: 'absolute', left: 0, top: 0, width: 24, height: 24, borderRadius: 12, background: '#dc2626', transform: `translate(${sqX - START_GAP - 12}px, ${cy - 12}px)`,
        }}
      />
      <div style={{
        position: 'absolute', bottom: 28, left: 0, right: 0, textAlign: 'center', color: '#666', fontSize: 16,
      }}
      >
        Right eye closed, look at the square. Press Space when the red dot disappears (
        {nValid}
        {' '}
        /
        {' '}
        {SWEEPS}
        )
      </div>
    </div>
  );
}
