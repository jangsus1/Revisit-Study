/**
 * Standalone playground for the WebEyeTrack engine: start the camera, run the 9-point
 * calibration, validate on any grid, apply a drift offset, and watch the live gaze point.
 * Not a stimulus; it exists so the tracker can be judged by eye at localhost:8080/gaze_playground.
 */
import {
  Badge, Box, Button, Group, Stack, Switch, Table, Text, Title,
} from '@mantine/core';
import {
  useCallback, useEffect, useRef, useState,
} from 'react';
import { StimulusParams } from '../../../store/types';
import { gazeTracker, normToPx } from './gazeTracker';
import type { GazeSample } from './gazeTracker';
import {
  CalibrationOverlay, FULL_GRID, VALIDATION_POINTS, useDotSequence,
} from './CalibrationOverlay';
import type { NormPoint, ValidationResult } from './CalibrationOverlay';

const GRID_5X5: NormPoint[] = [-0.4, -0.2, 0, 0.2, 0.4].flatMap((ny) => [-0.4, -0.2, 0, 0.2, 0.4].map((nx) => ({ nx, ny })));
const CENTRE: NormPoint[] = [{ nx: 0, ny: 0 }];

type Run = { label: string; at: string; result: ValidationResult };

function GazePlayground({ setAnswer }: StimulusParams<Record<string, never>>) {
  const [, force] = useState(0);
  const [busy, setBusy] = useState(false);
  const [showLive, setShowLive] = useState(true);
  const [showRaw, setShowRaw] = useState(true);
  const [runs, setRuns] = useState<Run[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState<GazeSample | null>(null);
  const [calibInfo, setCalibInfo] = useState<string>('');
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const {
    dot, collecting, message, setMessage, runCalibration, runValidation,
  } = useDotSequence();

  useEffect(() => { setAnswer({ status: true, answers: { playground: 'ok' } }); }, [setAnswer]);
  useEffect(() => gazeTracker.onStateChange(() => force((n) => n + 1)), []);
  useEffect(() => gazeTracker.onSample((s) => setLive(s)), []);
  useEffect(() => {
    if (videoRef.current && gazeTracker.getStream()) videoRef.current.srcObject = gazeTracker.getStream() ?? null;
  });

  const guard = useCallback(async (fn: () => Promise<void>) => {
    setBusy(true); setError(null);
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  }, []);

  const addRun = useCallback((label: string, result: ValidationResult) => {
    setRuns((r) => [{ label, at: new Date().toLocaleTimeString(), result }, ...r].slice(0, 12));
  }, []);

  const start = () => guard(async () => { await gazeTracker.init(); });
  const fullCalib = () => guard(async () => {
    await gazeTracker.init();
    await gazeTracker.resetCalibration();
    setMessage('Follow the dot; keep your head still');
    const c = await runCalibration(FULL_GRID, 'calib');
    setCalibInfo(`entries ${c[c.length - 1]?.entries ?? '?'}, distinct ${c[c.length - 1]?.distinctTargets ?? '?'}, affine ${c[c.length - 1]?.affineFitted ? 'yes' : 'no'}`);
    addRun('validate 5 after full calib', await runValidation(VALIDATION_POINTS, 1500, 800, 'Checking accuracy'));
  });
  const validate = (pts: NormPoint[], label: string) => guard(async () => {
    await gazeTracker.init();
    addRun(label, await runValidation(pts, 1300, 700, 'Look at the dot'));
  });
  const shortCalib = () => guard(async () => {
    await gazeTracker.init();
    setMessage('Quick calibration');
    const pts: NormPoint[] = [{ nx: -0.35, ny: -0.35 }, { nx: 0.35, ny: 0 }, { nx: -0.35, ny: 0.35 }];
    const c = await runCalibration(pts, 'click', 1300, 800);
    setCalibInfo(`entries ${c[c.length - 1]?.entries ?? '?'}, distinct ${c[c.length - 1]?.distinctTargets ?? '?'}, affine ${c[c.length - 1]?.affineFitted ? 'yes' : 'no'}`);
    addRun('centre after 3 click dots', await runValidation(CENTRE, 1300, 700, 'Look at the centre dot'));
  });
  const offsetFromCentre = () => guard(async () => {
    await gazeTracker.init();
    const pre = await runValidation(CENTRE, 1300, 700, 'Look at the centre dot');
    addRun('centre before offset', pre);
    if (pre.meanOffsetPx) {
      const [ox, oy] = gazeTracker.offsetPx;
      await gazeTracker.setOffsetPx(ox - pre.meanOffsetPx[0], oy - pre.meanOffsetPx[1]);
      addRun('centre after offset', await runValidation(CENTRE, 1300, 700, 'Look at the centre dot'));
    }
  });
  const clearOffset = () => guard(async () => { await gazeTracker.setOffsetPx(0, 0); });
  const reset = () => guard(async () => { await gazeTracker.resetCalibration(); setCalibInfo('reset'); });
  const stop = () => { gazeTracker.stop(); setLive(null); };

  const [lx, ly] = live ? normToPx(live.nx, live.ny) : [0, 0];
  const [rx, ry] = live ? normToPx(live.rx, live.ry) : [0, 0];
  const off = gazeTracker.offsetPx;
  const running = dot !== null || busy;

  return (
    <Box p="md">
      {dot !== null && <CalibrationOverlay dot={dot} collecting={collecting} message={message} />}

      {showLive && live && gazeTracker.state === 'ready' && dot === null && (
        <>
          <div style={{
            position: 'fixed', left: lx - 12, top: ly - 12, width: 24, height: 24, borderRadius: 12, zIndex: 1500,
            background: live.open && live.face ? 'rgba(220,38,38,0.55)' : 'rgba(120,120,120,0.4)', pointerEvents: 'none',
          }}
          />
          {showRaw && (
            <div style={{
              position: 'fixed', left: rx - 8, top: ry - 8, width: 16, height: 16, borderRadius: 8, zIndex: 1500,
              border: '2px solid #2563eb', pointerEvents: 'none',
            }}
            />
          )}
        </>
      )}

      <Title order={2}>WebEyeTrack playground</Title>
      <Text c="dimmed" size="sm">
        Red dot = smoothed gaze, blue ring = raw (affine only). Errors are medians of raw samples over the last half of each dot.
      </Text>

      <Group mt="md" gap="xs">
        <Button onClick={start} disabled={running || gazeTracker.state === 'ready'}>Start camera</Button>
        <Button onClick={fullCalib} disabled={running}>Full calibration (9 + 5)</Button>
        <Button onClick={() => validate(VALIDATION_POINTS, 'validate 5')} disabled={running} variant="light">Validate 5</Button>
        <Button onClick={() => validate(FULL_GRID, 'validate 9')} disabled={running} variant="light">Validate 9</Button>
        <Button onClick={() => validate(GRID_5X5, 'validate 25')} disabled={running} variant="light">Validate 25</Button>
        <Button onClick={() => validate(CENTRE, 'centre check')} disabled={running} variant="light">Centre check</Button>
        <Button onClick={shortCalib} disabled={running} variant="outline">3 click dots + centre</Button>
        <Button onClick={offsetFromCentre} disabled={running} variant="outline">Offset from centre</Button>
        <Button onClick={clearOffset} disabled={running} variant="subtle">Clear offset</Button>
        <Button onClick={reset} disabled={running} color="orange" variant="subtle">Reset calibration</Button>
        <Button onClick={stop} disabled={running} color="red" variant="subtle">Stop camera</Button>
      </Group>

      <Group mt="sm" gap="lg">
        <Switch label="Show live gaze" checked={showLive} onChange={(e) => setShowLive(e.currentTarget.checked)} />
        <Switch label="Show raw ring" checked={showRaw} onChange={(e) => setShowRaw(e.currentTarget.checked)} />
      </Group>

      <Group mt="md" gap="md" align="flex-start">
        <Stack gap={4} style={{ minWidth: 300 }}>
          <Group gap="xs">
            <Badge color={gazeTracker.state === 'ready' ? 'green' : gazeTracker.state === 'error' ? 'red' : 'gray'}>{gazeTracker.state}</Badge>
            <Text size="sm" className="num">{Math.round(gazeTracker.hz)} Hz</Text>
            <Text size="sm">{live?.face ? (live.open ? 'eyes open' : 'blink') : 'no face'}</Text>
          </Group>
          <Text size="sm">
            viewport {window.innerWidth}×{window.innerHeight}, dpr {window.devicePixelRatio}
          </Text>
          <Text size="sm">offset {Math.round(off[0])}, {Math.round(off[1])} px</Text>
          <Text size="sm">calibration: {calibInfo || '—'}</Text>
          {live && (
            <Text size="sm" ff="monospace">
              smooth {Math.round(lx)},{Math.round(ly)}  raw {Math.round(rx)},{Math.round(ry)}
            </Text>
          )}
          {error && <Text c="red" size="sm">{error}</Text>}
        </Stack>
        <video ref={videoRef} autoPlay muted playsInline style={{ width: 240, transform: 'scaleX(-1)', borderRadius: 6, background: '#111' }} />
      </Group>

      <Title order={4} mt="lg">Validation runs (newest first)</Title>
      <Table mt="xs" fz="sm" withTableBorder>
        <Table.Thead>
          <Table.Tr><Table.Th>time</Table.Th><Table.Th>run</Table.Th><Table.Th>mean px</Table.Th><Table.Th>% width</Table.Th><Table.Th>mean drift</Table.Th><Table.Th>per dot (px)</Table.Th></Table.Tr>
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
    </Box>
  );
}

export default GazePlayground;
