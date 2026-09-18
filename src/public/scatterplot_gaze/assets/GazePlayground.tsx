/**
 * Standalone playground for the WebEyeTrack engine: start the camera, calibrate, check accuracy
 * on a grid, fix drift, and watch the live gaze point. Not a stimulus; it exists so the tracker
 * can be judged by eye at localhost:8080/gaze_playground.
 *
 * Live gaze is written straight to the DOM (refs) rather than React state, so the 30–50 Hz
 * sample stream never re-renders the page; the numeric readout is throttled to 4 Hz.
 */
import {
  Badge, Box, Button, Group, Menu, Paper, Stack, Table, Text, Title,
} from '@mantine/core';
import {
  useCallback, useEffect, useRef, useState,
} from 'react';
import { StimulusParams } from '../../../store/types';
import { gazeTracker, normToPx } from './gazeTracker';
import {
  CalibrationOverlay, FULL_GRID, VALIDATION_POINTS, useDotSequence,
} from './CalibrationOverlay';
import type { NormPoint, ValidationResult } from './CalibrationOverlay';

const GRID_5X5: NormPoint[] = [-0.4, -0.2, 0, 0.2, 0.4].flatMap((ny) => [-0.4, -0.2, 0, 0.2, 0.4].map((nx) => ({ nx, ny })));
const CENTRE: NormPoint[] = [{ nx: 0, ny: 0 }];
const REFRESH_DOTS: NormPoint[] = [{ nx: -0.35, ny: -0.35 }, { nx: 0.35, ny: 0 }, { nx: -0.35, ny: 0.35 }];

type Run = { label: string; at: string; result: ValidationResult };

function GazePlayground({ setAnswer }: StimulusParams<Record<string, never>>) {
  const [trackerState, setTrackerState] = useState(gazeTracker.state);
  const [busy, setBusy] = useState(false);
  const [runs, setRuns] = useState<Run[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [calibInfo, setCalibInfo] = useState('not calibrated');
  const [readout, setReadout] = useState({
    hz: 0, face: false, open: false, sx: 0, sy: 0, rx: 0, ry: 0,
  });
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const smoothRef = useRef<HTMLDivElement | null>(null);
  const rawRef = useRef<HTMLDivElement | null>(null);
  const lastReadout = useRef(0);
  const {
    dot, collecting, message, setMessage, runCalibration, runValidation,
  } = useDotSequence();
  const overlayOpen = dot !== null;

  useEffect(() => { setAnswer({ status: true, answers: { playground: 'ok' } }); }, [setAnswer]);
  useEffect(() => gazeTracker.onStateChange(() => setTrackerState(gazeTracker.state)), []);

  // Attach the camera stream once per state change, never on every render (re-assigning
  // srcObject each frame restarts the video element and makes it flicker).
  useEffect(() => {
    const v = videoRef.current;
    const s = gazeTracker.getStream() ?? null;
    if (v && v.srcObject !== s) v.srcObject = s;
  }, [trackerState]);

  // Live gaze: move two absolutely positioned markers via refs; throttle the text readout.
  useEffect(() => gazeTracker.onSample((s) => {
    const [sx, sy] = normToPx(s.nx, s.ny);
    const [rx, ry] = normToPx(s.rx, s.ry);
    const ok = s.open && s.face;
    if (smoothRef.current) {
      smoothRef.current.style.transform = `translate(${sx - 12}px, ${sy - 12}px)`;
      smoothRef.current.style.background = ok ? 'rgba(220,38,38,0.55)' : 'rgba(120,120,120,0.35)';
    }
    if (rawRef.current) rawRef.current.style.transform = `translate(${rx - 8}px, ${ry - 8}px)`;
    const now = performance.now();
    if (now - lastReadout.current > 250) {
      lastReadout.current = now;
      setReadout({
        hz: gazeTracker.hz, face: s.face, open: s.open, sx, sy, rx, ry,
      });
    }
  }), []);

  const guard = useCallback(async (fn: () => Promise<void>) => {
    setBusy(true); setError(null);
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  }, []);
  const addRun = useCallback((label: string, result: ValidationResult) => {
    setRuns((r) => [{ label, at: new Date().toLocaleTimeString(), result }, ...r].slice(0, 15));
  }, []);
  const describe = (c: { entries: number; distinctTargets: number; affineFitted: boolean }[]) => {
    const last = c[c.length - 1];
    return last ? `${last.entries} points, ${last.distinctTargets} distinct, affine ${last.affineFitted ? 'fitted' : 'not fitted'}` : 'no data';
  };

  const start = () => guard(async () => { await gazeTracker.init(); });
  const calibrate = () => guard(async () => {
    await gazeTracker.init();
    await gazeTracker.resetCalibration();
    setMessage('Follow the dot; keep your head still');
    setCalibInfo(describe(await runCalibration(FULL_GRID, 'calib')));
    addRun('check after calibration (5 dots)', await runValidation(VALIDATION_POINTS, 1500, 800, 'Checking accuracy'));
  });
  const check = (pts: NormPoint[], label: string) => guard(async () => {
    await gazeTracker.init();
    addRun(label, await runValidation(pts, 1300, 700, 'Look at the dot'));
  });
  const refresh = () => guard(async () => {
    await gazeTracker.init();
    setMessage('Quick refresh');
    setCalibInfo(describe(await runCalibration(REFRESH_DOTS, 'click', 1300, 800)));
    addRun('centre after 3-dot refresh', await runValidation(CENTRE, 1300, 700, 'Look at the centre dot'));
  });
  const fixDrift = () => guard(async () => {
    await gazeTracker.init();
    const pre = await runValidation(CENTRE, 1300, 700, 'Look at the centre dot');
    addRun('centre before drift fix', pre);
    if (pre.meanOffsetPx) {
      const [ox, oy] = gazeTracker.offsetPx;
      await gazeTracker.setOffsetPx(ox - pre.meanOffsetPx[0], oy - pre.meanOffsetPx[1]);
      addRun('centre after drift fix', await runValidation(CENTRE, 1300, 700, 'Look at the centre dot'));
    }
  });
  const clearOffset = () => guard(async () => { await gazeTracker.setOffsetPx(0, 0); });
  const reset = () => guard(async () => { await gazeTracker.resetCalibration(); setCalibInfo('not calibrated'); });
  const stop = () => { gazeTracker.stop(); setCalibInfo('not calibrated'); };

  const ready = trackerState === 'ready';
  const locked = busy || overlayOpen;
  const off = gazeTracker.offsetPx;
  const stateColor = ready ? 'green' : trackerState === 'error' ? 'red' : trackerState === 'starting' ? 'yellow' : 'gray';

  return (
    <Box p="md" maw={1100}>
      {overlayOpen && <CalibrationOverlay dot={dot} collecting={collecting} message={message} />}

      {/* live markers: always mounted, hidden until the tracker runs */}
      <div ref={smoothRef} style={{ position: 'fixed', left: 0, top: 0, width: 24, height: 24, borderRadius: 12, zIndex: 1500, pointerEvents: 'none', display: ready && !overlayOpen ? 'block' : 'none', willChange: 'transform' }} />
      <div ref={rawRef} style={{ position: 'fixed', left: 0, top: 0, width: 16, height: 16, borderRadius: 8, zIndex: 1500, pointerEvents: 'none', border: '2px solid #2563eb', display: ready && !overlayOpen ? 'block' : 'none', willChange: 'transform' }} />

      <Group justify="space-between" align="flex-start">
        <div>
          <Title order={2}>WebEyeTrack playground</Title>
          <Text c="dimmed" size="sm">Red dot = smoothed gaze, blue ring = raw. Errors are median pixel distance from the dot.</Text>
        </div>
        <video ref={videoRef} autoPlay muted playsInline style={{ width: 200, height: 150, objectFit: 'cover', transform: 'scaleX(-1)', borderRadius: 6, background: '#111' }} />
      </Group>

      <Paper withBorder p="sm" mt="md">
        <Group gap="sm">
          <Badge size="lg" color={stateColor}>{trackerState}</Badge>
          <Text size="sm" ff="monospace">{Math.round(readout.hz)} Hz</Text>
          <Text size="sm">{ready ? (readout.face ? (readout.open ? 'eyes open' : 'blink') : 'no face') : ''}</Text>
          <Text size="sm" c="dimmed">·</Text>
          <Text size="sm">{calibInfo}</Text>
          <Text size="sm" c="dimmed">·</Text>
          <Text size="sm">
            offset {Math.round(off[0])}, {Math.round(off[1])} px
          </Text>
          {ready && (
            <Text size="sm" ff="monospace" c="dimmed">
              gaze {Math.round(readout.sx)},{Math.round(readout.sy)} · raw {Math.round(readout.rx)},{Math.round(readout.ry)}
            </Text>
          )}
        </Group>
        {error && <Text c="red" size="sm" mt="xs">{error}</Text>}
      </Paper>

      <Group mt="md" gap="sm">
        {!ready ? (
          <Button size="md" onClick={start} loading={trackerState === 'starting'} disabled={locked}>1 · Start camera</Button>
        ) : (
          <Button size="md" onClick={calibrate} disabled={locked}>2 · Calibrate (9 dots)</Button>
        )}
        <Menu shadow="md" disabled={!ready || locked}>
          <Menu.Target><Button size="md" variant="light" disabled={!ready || locked}>3 · Check accuracy ▾</Button></Menu.Target>
          <Menu.Dropdown>
            <Menu.Item onClick={() => check(CENTRE, 'centre check')}>Centre dot only</Menu.Item>
            <Menu.Item onClick={() => check(VALIDATION_POINTS, 'check 5 dots')}>5 dots (study validation)</Menu.Item>
            <Menu.Item onClick={() => check(FULL_GRID, 'check 9 dots')}>9 dots</Menu.Item>
            <Menu.Item onClick={() => check(GRID_5X5, 'check 25 dots')}>25 dots (fine map)</Menu.Item>
          </Menu.Dropdown>
        </Menu>
        <Button size="md" variant="light" onClick={refresh} disabled={!ready || locked}>3-dot refresh</Button>
        <Button size="md" variant="light" onClick={fixDrift} disabled={!ready || locked}>Fix drift</Button>
        <Menu shadow="md" disabled={locked}>
          <Menu.Target><Button size="md" variant="subtle" color="gray" disabled={locked}>More ▾</Button></Menu.Target>
          <Menu.Dropdown>
            <Menu.Item onClick={clearOffset} disabled={!ready}>Clear drift offset</Menu.Item>
            <Menu.Item onClick={reset} disabled={!ready}>Reset calibration</Menu.Item>
            <Menu.Item onClick={stop} disabled={!ready} color="red">Stop camera</Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </Group>

      <Stack mt="lg" gap="xs">
        <Title order={4}>Accuracy checks</Title>
        {runs.length === 0 ? (
          <Text size="sm" c="dimmed">Nothing yet. Calibrate, then run a check.</Text>
        ) : (
          <Table fz="sm" withTableBorder striped>
            <Table.Thead>
              <Table.Tr><Table.Th>time</Table.Th><Table.Th>run</Table.Th><Table.Th>mean px</Table.Th><Table.Th>% width</Table.Th><Table.Th>drift dx, dy</Table.Th><Table.Th>per dot (px)</Table.Th></Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {runs.map((r) => (
                <Table.Tr key={r.at + r.label}>
                  <Table.Td>{r.at}</Table.Td>
                  <Table.Td>{r.label}</Table.Td>
                  <Table.Td>{r.result.meanErrorPx === null ? '—' : Math.round(r.result.meanErrorPx)}</Table.Td>
                  <Table.Td>{r.result.meanErrorPctW === null ? '—' : (100 * r.result.meanErrorPctW).toFixed(1)}</Table.Td>
                  <Table.Td>{r.result.meanOffsetPx ? `${Math.round(r.result.meanOffsetPx[0])}, ${Math.round(r.result.meanOffsetPx[1])}` : '—'}</Table.Td>
                  <Table.Td>{r.result.points.map((p) => (p.errorPx === null ? '—' : Math.round(p.errorPx))).join('  ')}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </Stack>
    </Box>
  );
}

export default GazePlayground;
