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
  fn({ cm: s.face && s.origin ? Math.abs(s.origin[2]) : null, face: s.face });
});

export function PositionGuide({
  onChange, stream, feed = trackerFeed,
}: {
  onChange?: (s: PositionState) => void;
  stream?: MediaStream | null;
  feed?: DistanceFeed;
}) {
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
      const inRange = face && cm !== null && cm >= MIN_CM && cm <= MAX_CM;
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
  }, [feed]);

  const { distanceCm: cm, face } = state;
  const inRange = face && cm !== null && cm >= MIN_CM && cm <= MAX_CM;
  let msg: string;
  let color: string;
  if (!src && stream === undefined && gazeTracker.state === 'error') { msg = 'The camera or eye tracker could not start. Reload the page, or use the help link.'; color = 'red'; } else if (!src) { msg = 'Starting the camera…'; color = 'gray'; } else if (!face || cm === null) { msg = 'We cannot see your face. Face the screen, make sure your face is well lit and not covered.'; color = 'red'; } else if (cm < MIN_CM) { msg = 'Too close. Lean back a little.'; color = 'orange'; } else if (cm > MAX_CM) { msg = 'Too far. Move a little closer to the screen.'; color = 'orange'; } else { msg = state.ready ? 'Good position. Stay like this.' : 'Good. Hold still…'; color = 'green'; }
  const pct = (v: number) => (100 * (Math.min(BAR_MAX, Math.max(BAR_MIN, v)) - BAR_MIN)) / (BAR_MAX - BAR_MIN);
  const ok = inRange ? '#16a34a' : '#f59e0b';

  return (
    <Group align="flex-start" gap="lg" wrap="wrap">
      <Box pos="relative" w={280} h={210} style={{ borderRadius: 8, overflow: 'hidden', background: '#111', flex: 'none' }}>
        <video ref={videoRef} autoPlay muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }} />
        <svg viewBox="0 0 280 210" width={280} height={210} style={{ position: 'absolute', inset: 0 }}>
          <ellipse cx={140} cy={100} rx={52} ry={70} fill="none" stroke={face ? ok : '#ef4444'} strokeWidth={3} strokeDasharray={inRange ? undefined : '8 6'} />
        </svg>
      </Box>
      <Box style={{ flex: 1, minWidth: 240 }}>
        <Text fw={600} c={color}>{msg}</Text>
        <Text size="sm" mt={6}>
          Sit about an arm&apos;s length from the screen, with your face inside the oval and the camera at eye
          level if possible. Rest your arms so you can keep your head in this position for the whole task.
        </Text>
        <Box mt="md" pos="relative" h={34}>
          <Box pos="absolute" top={12} left={0} right={0} h={10} style={{ background: '#e5e7eb', borderRadius: 5 }} />
          <Box pos="absolute" top={12} h={10} style={{ left: `${pct(MIN_CM)}%`, width: `${pct(MAX_CM) - pct(MIN_CM)}%`, background: '#bbf7d0', borderRadius: 5 }} />
          {cm !== null && face && (
            <Box pos="absolute" top={4} w={4} h={26} style={{ left: `calc(${pct(cm)}% - 2px)`, background: ok, borderRadius: 2, transition: 'left 0.15s' }} />
          )}
        </Box>
        <Group justify="space-between" mt={-4}>
          <Text size="xs" c="dimmed">closer</Text>
          <Text size="xs" c="dimmed">
            {cm !== null && face ? `about ${Math.round(cm)} cm` : '—'}
            {' '}
            (aim for
            {' '}
            {MIN_CM}
            –
            {MAX_CM}
            {' '}
            cm)
          </Text>
          <Text size="xs" c="dimmed">farther</Text>
        </Group>
      </Box>
    </Group>
  );
}
