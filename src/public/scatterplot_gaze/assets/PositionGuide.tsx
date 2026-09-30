/**
 * Viewing-distance and position guide shown before calibration: mirrored camera preview with a face
 * oval, a distance meter with the target zone, and one instruction at a time. Distance is the
 * tracker's 3D face-origin estimate (cm; assumes a typical webcam field of view, so treat it as
 * approximate, +-15 %). `ready` turns true after the face has stayed in range for HOLD_MS.
 *
 * Default source is the study's gazeTracker; the gaze_playground bench can pass another stream and
 * distance feed when WebEyeTrack is not running.
 */
import { Box, Group, Text } from '@mantine/core';
import { useEffect, useRef, useState } from 'react';
import { gazeTracker } from './gazeTracker';

export type DistanceFeed = (fn: (d: { cm: number | null; face: boolean }) => void) => () => void;

export type PositionState = { ready: boolean; distanceCm: number | null; face: boolean; inRangeMs: number };

export const MIN_CM = 45;
export const MAX_CM = 70;
const HOLD_MS = 1500;
const BAR_MIN = 25;
const BAR_MAX = 100;

const trackerFeed: DistanceFeed = (fn) => gazeTracker.onSample((s) => {
  // corrected by the blind-spot measurement when the camera page ran it (gazeTracker.distanceScale)
  fn({ cm: s.face && s.origin ? Math.abs(s.origin[2]) * gazeTracker.distanceScale : null, face: s.face });
});

export function PositionGuide({
  onChange, stream, feed = trackerFeed, compact = false, range,
}: {
  onChange?: (s: PositionState) => void;
  stream?: MediaStream | null;
  feed?: DistanceFeed;
  compact?: boolean;          // meter and message only, no camera preview
  range?: [number, number];   // target distance (cm); default MIN_CM-MAX_CM
}) {
  const [lo, hi] = range ?? [MIN_CM, MAX_CM];
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [state, setState] = useState<PositionState>({
    ready: false, distanceCm: null, face: false, inRangeMs: 0,
  });
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const src = stream === undefined ? gazeTracker.getStream() ?? null : stream;
  useEffect(() => {
    const v = videoRef.current;
    if (v && v.srcObject !== src) v.srcObject = src;
  });

  useEffect(() => {
    const recent: number[] = [];
    let face = false;
    let lastFace = 0;
    let inRangeSince: number | null = null;
    let last = 0;
    const unsub = feed((d) => {
      const now = performance.now();
      if (d.face && d.cm !== null && Number.isFinite(d.cm)) {
        recent.push(d.cm);
        if (recent.length > 8) recent.shift();
        face = true;
        lastFace = now;
      } else if (now - lastFace > 500) {
        face = false;
        recent.length = 0;
      }
      const cm = recent.length ? [...recent].sort((a, b) => a - b)[Math.floor(recent.length / 2)] : null;
      const inRange = face && cm !== null && cm >= lo && cm <= hi;
      if (inRange) inRangeSince ??= now; else inRangeSince = null;
      if (now - last < 150) return;   // UI at ~7 Hz
      last = now;
      const inRangeMs = inRangeSince === null ? 0 : now - inRangeSince;
      const next = {
        ready: inRangeMs >= HOLD_MS, distanceCm: cm, face, inRangeMs,
      };
      setState(next);
      onChangeRef.current?.(next);
    });
    return unsub;
  }, [feed, lo, hi]);

  const { distanceCm: cm, face } = state;
  const inRange = face && cm !== null && cm >= lo && cm <= hi;
  let msg: string;
  let color: string;
  if (!src && stream === undefined && gazeTracker.state === 'error') { msg = 'The camera could not start.'; color = '#dc2626'; } else if (!src) { msg = 'Starting the camera…'; color = '#666'; } else if (!face || cm === null) { msg = 'Face not found. Face the screen in good light.'; color = '#dc2626'; } else if (cm < lo) { msg = 'Too close. Lean back a little.'; color = '#d97706'; } else if (cm > hi) { msg = 'Too far. Move a little closer.'; color = '#d97706'; } else { msg = state.ready ? 'Good position.' : 'Good. Hold still…'; color = '#16a34a'; }
  const pct = (v: number) => (100 * (Math.min(BAR_MAX, Math.max(BAR_MIN, v)) - BAR_MIN)) / (BAR_MAX - BAR_MIN);
  const ok = inRange ? '#16a34a' : '#f59e0b';
  const W = 320;

  return (
    <Box style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
      {!compact && (
        <Box pos="relative" w={W} h={240} style={{ borderRadius: 10, overflow: 'hidden', background: '#111' }}>
          <video ref={videoRef} autoPlay muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }} />
          <svg viewBox={`0 0 ${W} 240`} width={W} height={240} style={{ position: 'absolute', inset: 0 }}>
            <ellipse cx={W / 2} cy={115} rx={60} ry={80} fill="none" stroke={face ? ok : '#ef4444'} strokeWidth={3} strokeDasharray={inRange ? undefined : '8 6'} />
          </svg>
        </Box>
      )}
      <Text fw={600} size="lg" style={{ color }}>{msg}</Text>
      <Box pos="relative" w={W} h={30}>
        <Box pos="absolute" top={10} left={0} right={0} h={10} style={{ background: '#e5e7eb', borderRadius: 5 }} />
        <Box pos="absolute" top={10} h={10} style={{ left: `${pct(lo)}%`, width: `${pct(hi) - pct(lo)}%`, background: '#bbf7d0', borderRadius: 5 }} />
        {cm !== null && face && (
          <Box pos="absolute" top={2} w={4} h={26} style={{ left: `calc(${pct(cm)}% - 2px)`, background: ok, borderRadius: 2, transition: 'left 0.15s' }} />
        )}
      </Box>
      <Group justify="space-between" w={W} mt={-6}>
        <Text size="xs" c="dimmed">closer</Text>
        <Text size="xs" c="dimmed">{cm !== null && face ? `about ${Math.round(cm)} cm` : ''}</Text>
        <Text size="xs" c="dimmed">farther</Text>
      </Group>
    </Box>
  );
}
