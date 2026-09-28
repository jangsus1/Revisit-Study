/**
 * Gaze tracker comparison bench (gaze_playground). Several webcam trackers run at the same time on
 * the same camera and see the same calibration and check dots, so their accuracy is compared on
 * identical eye movements. Every engine uses the generic mechanism (pair frames with the fixated
 * target, refit); the drift fix is the same constant offset for every engine.
 *
 * Engines live in src/gazeEngine/compare (loaded lazily: MediaPipe, tfjs, WebGazer from CDN).
 * Nothing is uploaded; "Export JSON" saves the runs (numbers only) to a local file.
 */
import {
  Badge, Box, Button, Checkbox, Group, Menu, Paper, SegmentedControl, Select, SimpleGrid, Stack, Switch, Table, Text, Title,
} from '@mantine/core';
import {
  useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import { StimulusParams } from '../../../store/types';
import { gazeTracker, normToPx } from '../../scatterplot_gaze/assets/gazeTracker';
import {
  CalibrationOverlay, FULL_GRID, PURSUIT_LAG_MS, PURSUIT_MS, PURSUIT_SKIP_MS, VALIDATION_POINTS, animatePursuit, lissajous, nextPaint,
} from '../../scatterplot_gaze/assets/CalibrationOverlay';
import type { NormPoint } from '../../scatterplot_gaze/assets/CalibrationOverlay';
import { PositionGuide } from '../../scatterplot_gaze/assets/PositionGuide';
import type { DistanceFeed } from '../../scatterplot_gaze/assets/PositionGuide';
import { faceSource } from '../../../gazeEngine/compare/faceLandmarks';
import type { GazeEngineBase, EngineSample, TargetFn } from '../../../gazeEngine/compare/types';
import { runMetrics } from '../../../gazeEngine/compare/metrics';
import type { DotSamples, RunMetrics } from '../../../gazeEngine/compare/metrics';

const CENTRE: NormPoint[] = [{ nx: 0, ny: 0 }];
const GRID_5X5: NormPoint[] = [-0.4, -0.2, 0, 0.2, 0.4].flatMap((ny) => [-0.4, -0.2, 0, 0.2, 0.4].map((nx) => ({ nx, ny })));
// Off-grid points (none coincide with the 9 calibration targets): tests generalization
const OFF_GRID: NormPoint[] = [
  { nx: -0.2, ny: -0.2 }, { nx: 0.2, ny: -0.2 }, { nx: -0.2, ny: 0.2 }, { nx: 0.2, ny: 0.2 },
  { nx: 0, ny: -0.2 }, { nx: 0, ny: 0.2 }, { nx: -0.3, ny: 0 }, { nx: 0.3, ny: 0 },
];

const g = (xs: number[], ys: number[]) => ys.flatMap((ny) => xs.map((nx) => ({ nx, ny })));
// Task region = plot + axis labels of the scatterplot_gaze trial, measured on the 1512x862 pilot
// (plot x -0.12..0.21, y -0.30..0.28 of the viewport; y label at x -0.22..-0.12; x label at y ~0.31).
const PATTERNS: Record<string, { label: string; points: NormPoint[] }> = {
  grid9: { label: '9: 3x3 grid at 10/50/90 % (study now)', points: FULL_GRID },
  grid13: { label: '13: 3x3 grid + 4 inner points', points: [...FULL_GRID, ...g([-0.2, 0.2], [-0.2, 0.2])] },
  grid17: { label: '17: 4x4 grid at 5/35/65/95 % + centre (RealEye)', points: [...g([-0.45, -0.15, 0.15, 0.45], [-0.45, -0.15, 0.15, 0.45]), { nx: 0, ny: 0 }] },
  task13: { label: '13: 3x3 over the plot + labels, 4 outer corners', points: [...g([-0.2, 0, 0.2], [-0.3, 0, 0.3]), ...g([-0.42, 0.42], [-0.42, 0.42])] },
};
// Check dots inside the task region, none on a calibration target of any pattern
const TASK_CHECK: NormPoint[] = [
  { nx: -0.1, ny: -0.15 }, { nx: 0.1, ny: -0.15 }, { nx: -0.1, ny: 0.15 }, { nx: 0.1, ny: 0.15 },
  { nx: -0.17, ny: 0.07 }, { nx: 0.05, ny: 0.24 }, { nx: 0.05, ny: -0.25 }, { nx: 0.17, ny: 0.07 },
];
// Smooth pursuit uses the study's path and timing (CalibrationOverlay: lissajous, PURSUIT_*).
type Method = 'dots' | 'pursuit' | 'both';

const shuffle = <T,>(a: T[]) => {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
};

// Distance feed from the shared MediaPipe landmarker (used when WebEyeTrack is not running)
const faceSourceFeed: DistanceFeed = (fn) => faceSource.subscribe((f) => {
  fn({ cm: f.lm && f.matrix ? Math.abs(f.matrix[14]) : null, face: !!f.lm });
});

type Run = {
  id: number;
  label: string;
  at: string;
  viewport: [number, number];
  metrics: Record<string, RunMetrics>;
  dots: Record<string, DotSamples[]>;
};

const sleep = (ms: number) => new Promise<void>((r) => { setTimeout(r, ms); });
const f0 = (v: number | null | undefined) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : String(Math.round(v)));

function GazeBench({ setAnswer }: StimulusParams<Record<string, never>>) {
  const [engines, setEngines] = useState<GazeEngineBase[]>([]);
  const [enabled, setEnabled] = useState<Record<string, boolean>>({});
  const [, setTick] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [dot, setDot] = useState<NormPoint | null>(null);
  const [collecting, setCollecting] = useState(false);
  const [message, setMessage] = useState('');
  const [showLive, setShowLive] = useState(true);
  const [pattern, setPattern] = useState('grid9');
  const [method, setMethod] = useState<Method>('dots');
  const [pursuitOn, setPursuitOn] = useState(false);
  const [relax, setRelax] = useState(false);
  const pursuitDot = useRef<HTMLDivElement | null>(null);
  const [showGuide, setShowGuide] = useState(true);
  const [live, setLive] = useState<Record<string, { hz: number; valid: boolean }>>({});
  const markers = useRef<Record<string, HTMLDivElement | null>>({});
  const cancelled = useRef(false);
  const runId = useRef(0);

  useEffect(() => { setAnswer({ status: true, answers: { playground: 'ok' } }); }, [setAnswer]);

  useEffect(() => {
    cancelled.current = false;
    let mounted = true;
    import('../../../gazeEngine/compare').then((m) => {
      if (!mounted) return;
      const list: GazeEngineBase[] = [
        new m.WebEyeTrackEngine(gazeTracker),
        new m.RealEyeEngine(),
        new m.EyeGesturesEngine(),
      ];
      setEngines(list);
      setEnabled(Object.fromEntries(list.map((e) => [e.info.id, true])));
    }).catch((e) => setError(String(e)));
    return () => { mounted = false; cancelled.current = true; };
  }, []);

  // Re-render on engine state changes; live markers via refs (EMA smoothed); readout at 4 Hz
  useEffect(() => {
    const ema: Record<string, [number, number] | null> = {};
    const lastValid: Record<string, boolean> = {};
    const unsubs = engines.flatMap((e) => [
      e.onStateChange(() => setTick((t) => t + 1)),
      e.onSample((s: EngineSample) => {
        lastValid[e.info.id] = s.valid;
        const el = markers.current[e.info.id];
        if (!s.valid || !el) return;
        const p = ema[e.info.id];
        const n: [number, number] = p ? [p[0] + 0.3 * (s.x - p[0]), p[1] + 0.3 * (s.y - p[1])] : [s.x, s.y];
        ema[e.info.id] = n;
        el.style.transform = `translate(${n[0] - 10}px, ${n[1] - 10}px)`;
      }),
    ]);
    const iv = setInterval(() => {
      setLive(Object.fromEntries(engines.map((e) => [e.info.id, { hz: e.hz, valid: !!lastValid[e.info.id] }])));
    }, 250);
    return () => { unsubs.forEach((u) => u()); clearInterval(iv); };
  }, [engines]);

  const active = useCallback(() => engines.filter((e) => enabled[e.info.id] && e.state === 'ready'), [engines, enabled]);

  const guard = useCallback(async (fn: () => Promise<void>) => {
    setBusy(true); setError(null);
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally {
      setBusy(false); setDot(null); setCollecting(false); setPursuitOn(false); setRelax(false);
    }
  }, []);

  /** One dot sequence shown to every active engine at once. */
  const sequence = useCallback(async (points: NormPoint[], mode: 'calib' | 'check', dwellMs: number, collectMs: number, text: string) => {
    const list = active();
    if (!list.length) throw new Error('no engine running - press Start first');
    const out: Record<string, DotSamples[]> = Object.fromEntries(list.map((e) => [e.info.id, []]));
    for (let i = 0; i < points.length; i += 1) {
      if (cancelled.current) break;
      const [tx, ty] = normToPx(points[i].nx, points[i].ny);
      setMessage(points.length > 1 ? `${text} (${i + 1} / ${points.length})` : text);
      setDot(points[i]);
      setCollecting(false);
      // eslint-disable-next-line no-await-in-loop
      await sleep(dwellMs - collectMs);
      setCollecting(true);
      const bufs = list.map((e) => ({ e, s: [] as EngineSample[] }));
      const unsubs = bufs.map((b) => b.e.onSample((s) => { b.s.push(s); }));
      if (mode === 'calib') list.forEach((e) => e.beginPoint(tx, ty));
      // eslint-disable-next-line no-await-in-loop
      await sleep(collectMs);
      unsubs.forEach((u) => u());
      if (mode === 'calib') {
        // eslint-disable-next-line no-await-in-loop
        await Promise.all(list.map((e) => e.endPoint().catch((err) => console.warn(e.info.id, err))));
      }
      bufs.forEach((b) => out[b.e.info.id].push({
        tx, ty, samples: b.s, collectMs,
      }));
    }
    setDot(null);
    setCollecting(false);
    return out;
  }, [active]);

  /** Fit every engine once all calibration input is in (blank screen: the participant may rest). */
  const fitAll = useCallback(async () => {
    setRelax(true);
    // Let the "Calibrating…" screen paint first: RealEye's fit runs synchronously on the main thread
    await nextPaint();
    try {
      await Promise.all(active().map((e) => e.finishCalibration().catch((err) => console.warn(e.info.id, err))));
    } finally { setRelax(false); }
  }, [active]);

  /** Continuous calibration: every engine pairs each frame with the moving dot's (lagged) position. */
  const runPursuit = useCallback(async (durationMs: number) => {
    const list = active();
    if (!list.length) throw new Error('no engine running - press Start first');
    setMessage('Follow the moving dot with your eyes. Keep your head still.');
    setPursuitOn(true);
    await nextPaint();
    let t0 = Infinity;
    const targetAt: TargetFn = (t) => {
      const e = t - PURSUIT_LAG_MS - t0;
      return e < PURSUIT_SKIP_MS || e > durationMs ? null : lissajous(e / durationMs);
    };
    await animatePursuit(() => pursuitDot.current, durationMs, () => cancelled.current, (start) => {
      t0 = start;
      list.forEach((e) => e.beginPursuit(targetAt));
    });
    await Promise.all(list.map((e) => e.endPursuit().catch((err) => console.warn(e.info.id, err))));
    setPursuitOn(false);
  }, [active]);

  const check = useCallback(async (points: NormPoint[], label: string) => {
    const dots = await sequence(points, 'check', 1500, 800, 'Look at the dot');
    const vw = window.innerWidth;
    const run: Run = {
      id: runId.current += 1,
      label,
      at: new Date().toLocaleTimeString(),
      viewport: [vw, window.innerHeight],
      metrics: Object.fromEntries(Object.entries(dots).map(([id, d]) => [id, runMetrics(d, vw)])),
      dots,
    };
    setRuns((r) => [run, ...r]);
    setSelected(run.id);
    return run;
  }, [sequence]);

  const start = () => guard(async () => {
    const want = engines.filter((e) => enabled[e.info.id]);
    const res = await Promise.allSettled(want.map((e) => e.start()));
    const failed = res.map((r, i) => (r.status === 'rejected' ? `${want[i].info.name}: ${String(r.reason?.message ?? r.reason)}` : null)).filter(Boolean);
    if (failed.length) throw new Error(failed.join(' | '));
  });
  const calibrate = () => guard(async () => {
    await Promise.all(active().map((e) => e.reset()));
    const pts = PATTERNS[pattern].points;
    if (method !== 'pursuit') await sequence(shuffle(pts), 'calib', 1800, 1000, 'Look at the dot; keep your head still');
    if (method !== 'dots') await runPursuit(PURSUIT_MS);
    await fitAll();
    const how = {
      dots: `${pts.length} dots (${pattern})`, pursuit: `pursuit ${PURSUIT_MS / 1000} s`, both: `${pts.length} dots (${pattern}) + pursuit`,
    }[method];
    await check(TASK_CHECK, `calibrated: ${how}; task-region check`);
  });
  const runCheck = (pts: NormPoint[], label: string) => guard(async () => { await check(pts, label); });
  const fixDrift = () => guard(async () => {
    const pre = await check(CENTRE, 'centre before drift fix');
    active().forEach((e) => {
      const off = pre.metrics[e.info.id]?.dots[0]?.offsetPx;
      if (off) e.offset = [e.offset[0] - off[0], e.offset[1] - off[1]];
    });
    await check(VALIDATION_POINTS, 'after drift fix: 5 dots');
  });
  const resetAll = () => guard(async () => { await Promise.all(active().map((e) => e.reset())); });
  const stopAll = () => { engines.forEach((e) => { if (e.state !== 'idle') e.stop(); }); };
  const toggle = (e: GazeEngineBase, on: boolean) => {
    setEnabled((m) => ({ ...m, [e.info.id]: on }));
    if (!on && e.state !== 'idle') e.stop();
  };
  const exportJson = () => {
    const blob = new Blob([JSON.stringify({
      exportedAt: new Date().toISOString(),
      userAgent: navigator.userAgent,
      dpr: window.devicePixelRatio,
      screen: [window.screen.width, window.screen.height],
      engines: engines.map((e) => e.info),
      runs,
    })], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `gaze_bench_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const anyReady = engines.some((e) => e.state === 'ready');
  const anyStarting = engines.some((e) => e.state === 'starting');
  const locked = busy || dot !== null || pursuitOn || relax;
  const wet = engines.find((e) => e.info.id === 'webeyetrack');
  const eg = engines.find((e) => e.info.id === 'eyegestures');
  let guideSource: { stream: MediaStream | null; feed?: DistanceFeed } | null = null;
  if (wet?.state === 'ready') guideSource = { stream: gazeTracker.getStream() ?? null };
  else if (eg?.state === 'ready') guideSource = { stream: faceSource.getStream() ?? null, feed: faceSourceFeed };
  const run = runs.find((r) => r.id === selected) ?? runs[0];
  const info = useMemo(() => Object.fromEntries(engines.map((e) => [e.info.id, e.info])), [engines]);

  return (
    <Box p="md" maw={1200}>
      {(dot || relax || pursuitOn) && (
        <CalibrationOverlay dot={dot} collecting={collecting} message={message} fitting={relax} pursuitOn={pursuitOn} pursuitDotRef={pursuitDot} />
      )}
      {engines.map((e) => (
        <div
          key={e.info.id}
          ref={(el) => { markers.current[e.info.id] = el; }}
          style={{
            position: 'fixed', left: 0, top: 0, width: 20, height: 20, borderRadius: 10, zIndex: 1500, pointerEvents: 'none',
            background: e.info.color, opacity: 0.6, border: '2px solid white',
            display: showLive && !dot && e.state === 'ready' && enabled[e.info.id] && live[e.info.id]?.valid ? 'block' : 'none',
          }}
        />
      ))}

      <Title order={2}>Webcam gaze tracker comparison</Title>
      <Text c="dimmed" size="sm">
        All checked trackers run together on the same camera and see the same dots. Errors are in CSS pixels
        (viewport
        {' '}
        {window.innerWidth}
        ×
        {window.innerHeight}
        ). Keep your head still. Nothing is recorded or uploaded.
      </Text>

      <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} mt="md" spacing="sm">
        {engines.map((e) => (
          <Paper key={e.info.id} withBorder p="sm" style={{ borderLeft: `5px solid ${e.info.color}` }}>
            <Group justify="space-between" wrap="nowrap">
              <Checkbox
                label={<Text fw={600} size="sm">{e.info.name}</Text>}
                checked={!!enabled[e.info.id]}
                disabled={locked}
                onChange={(ev) => toggle(e, ev.currentTarget.checked)}
              />
              <Badge style={{ flex: 'none' }} color={{
                ready: 'green', starting: 'yellow', error: 'red', idle: 'gray',
              }[e.state]}
              >
                {e.state}
              </Badge>
            </Group>
            <Text size="xs" c="dimmed" mt={4}>{e.info.method}</Text>
            <Text size="xs" c="dimmed">{e.info.license}</Text>
            {e.state === 'ready' && (
              <Text size="xs" mt={4} ff="monospace">
                {Math.round(live[e.info.id]?.hz ?? 0)}
                {' '}
                Hz ·
                {' '}
                {live[e.info.id]?.valid ? 'tracking' : 'no estimate'}
                {' '}
                · calib dots
                {' '}
                {e.calibTargets}
                {(e.offset[0] || e.offset[1]) ? ` · offset ${Math.round(e.offset[0])},${Math.round(e.offset[1])}` : ''}
              </Text>
            )}
            {e.error && <Text size="xs" c="red" lineClamp={4} style={{ wordBreak: 'break-word' }} title={e.error}>{e.error}</Text>}
          </Paper>
        ))}
      </SimpleGrid>

      <Group mt="md" gap="sm">
        <Button onClick={start} loading={anyStarting} disabled={locked || !engines.length}>1 · Start</Button>
        <Button onClick={calibrate} disabled={locked || !anyReady}>
          2 · Calibrate (
          {{ dots: `${PATTERNS[pattern].points.length} dots`, pursuit: 'pursuit', both: `${PATTERNS[pattern].points.length} dots + pursuit` }[method]}
          {' '}
          + task check)
        </Button>
        <Menu shadow="md" disabled={locked || !anyReady}>
          <Menu.Target><Button variant="light" disabled={locked || !anyReady}>3 · Check accuracy ▾</Button></Menu.Target>
          <Menu.Dropdown>
            <Menu.Item onClick={() => runCheck(TASK_CHECK, '8 task-region dots')}>8 task-region dots (plot + labels)</Menu.Item>
            <Menu.Item onClick={() => runCheck(CENTRE, 'centre')}>Centre dot</Menu.Item>
            <Menu.Item onClick={() => runCheck(VALIDATION_POINTS, '5 dots')}>5 dots (study validation)</Menu.Item>
            <Menu.Item onClick={() => runCheck(FULL_GRID, '9 dots (calibration targets)')}>9 dots (calibration targets)</Menu.Item>
            <Menu.Item onClick={() => runCheck(OFF_GRID, '8 off-grid dots')}>8 off-grid dots (generalization)</Menu.Item>
            <Menu.Item onClick={() => runCheck(GRID_5X5, '25 dots')}>25 dots (fine map)</Menu.Item>
          </Menu.Dropdown>
        </Menu>
        <Button variant="light" onClick={fixDrift} disabled={locked || !anyReady}>Fix drift (centre dot)</Button>
        <Menu shadow="md">
          <Menu.Target><Button variant="subtle" color="gray">More ▾</Button></Menu.Target>
          <Menu.Dropdown>
            <Menu.Item onClick={resetAll} disabled={locked || !anyReady}>Reset calibrations</Menu.Item>
            <Menu.Item onClick={exportJson} disabled={!runs.length}>Export JSON</Menu.Item>
            <Menu.Item onClick={stopAll} color="red" disabled={locked}>Stop all cameras</Menu.Item>
          </Menu.Dropdown>
        </Menu>
        <Switch label="live gaze dots" checked={showLive} onChange={(ev) => setShowLive(ev.currentTarget.checked)} />
      </Group>
      <Group mt="xs" gap="sm" align="flex-end">
        <Box>
          <Text size="sm" fw={500} mb={3}>Calibration method</Text>
          <SegmentedControl
            value={method}
            onChange={(v) => setMethod(v as Method)}
            disabled={locked}
            data={[
              { value: 'dots', label: 'Dots' },
              { value: 'pursuit', label: `Smooth pursuit (${PURSUIT_MS / 1000} s)` },
              { value: 'both', label: 'Dots + pursuit' },
            ]}
          />
        </Box>
        <Select
          label="Dot layout (random order)"
          w={420}
          data={Object.entries(PATTERNS).map(([value, p]) => ({ value, label: p.label }))}
          value={pattern}
          onChange={(v) => v && setPattern(v)}
          disabled={locked || method === 'pursuit'}
          allowDeselect={false}
        />
        <Switch label="position guide" checked={showGuide} onChange={(ev) => setShowGuide(ev.currentTarget.checked)} />
      </Group>
      {showGuide && anyReady && !dot && (
        <Paper withBorder p="sm" mt="sm">
          <Text size="sm" fw={600} mb={6}>Position before calibrating</Text>
          {guideSource
            ? <PositionGuide stream={guideSource.stream} feed={guideSource.feed} />
            : <Text size="sm" c="dimmed">Distance needs WebEyeTrack or the EyeGesturesLite engine running.</Text>}
        </Paper>
      )}
      {error && <Text c="red" size="sm" mt="xs" lineClamp={6} style={{ wordBreak: 'break-word' }}>{error}</Text>}

      {run ? (
        <Stack mt="lg" gap="sm">
          <Group justify="space-between">
            <Title order={4}>
              {run.label}
              {' '}
              <Text span c="dimmed" size="sm">{run.at}</Text>
            </Title>
          </Group>
          <MetricsTable run={run} info={info} />
          <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
            <Paper withBorder p="sm">
              <Text size="sm" fw={600}>Error range</Text>
              <Text size="xs" c="dimmed">line = best to worst dot · box = middle 50% of samples · diamond = accuracy (mean dot error) · dots = each check dot</Text>
              <RangeChart run={run} info={info} />
            </Paper>
            <Paper withBorder p="sm">
              <Text size="sm" fw={600}>Where each tracker thought you looked</Text>
              <Text size="xs" c="dimmed">+ = dot · circle = median gaze at that dot</Text>
              <ErrorMap run={run} info={info} />
            </Paper>
          </SimpleGrid>
          <Paper withBorder p="sm">
            <Text size="sm" fw={600}>All checks (accuracy in px; click a row to show it above)</Text>
            <Table fz="xs" highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>time</Table.Th>
                  <Table.Th>check</Table.Th>
                  {engines.map((e) => <Table.Th key={e.info.id} style={{ color: e.info.color }}>{e.info.name}</Table.Th>)}
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {runs.map((r) => (
                  <Table.Tr key={r.id} onClick={() => setSelected(r.id)} style={{ cursor: 'pointer', fontWeight: r.id === run.id ? 700 : 400 }}>
                    <Table.Td>{r.at}</Table.Td>
                    <Table.Td>{r.label}</Table.Td>
                    {engines.map((e) => <Table.Td key={e.info.id}>{f0(r.metrics[e.info.id]?.accuracyPx)}</Table.Td>)}
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Paper>
        </Stack>
      ) : (
        <Text size="sm" c="dimmed" mt="lg">No checks yet. Start, then calibrate.</Text>
      )}
    </Box>
  );
}

type InfoMap = Record<string, { name: string; color: string }>;

function MetricsTable({ run, info }: { run: Run; info: InfoMap }) {
  const ids = Object.keys(run.metrics);
  const best = (get: (m: RunMetrics) => number | null) => {
    const vals = ids.map((id) => get(run.metrics[id])).filter((v): v is number => v !== null && Number.isFinite(v));
    return vals.length > 1 && Math.min(...vals) < Math.max(...vals) ? Math.min(...vals) : null;
  };
  const cols: { label: string; title: string; get: (m: RunMetrics) => number | null; fmt?: (m: RunMetrics) => string; lowIsGood?: boolean }[] = [
    {
      label: 'accuracy px', title: 'mean over dots of the median sample-to-dot distance', get: (m) => m.accuracyPx, lowIsGood: true,
    },
    { label: '% width', title: 'accuracy / viewport width', get: (m) => m.accuracyPctW, fmt: (m) => (m.accuracyPctW === null ? '—' : (100 * m.accuracyPctW).toFixed(1)) },
    {
      label: 'best dot', title: 'smallest per-dot error', get: (m) => m.dotErr?.min ?? null, lowIsGood: true,
    },
    {
      label: 'worst dot', title: 'largest per-dot error', get: (m) => m.dotErr?.max ?? null, lowIsGood: true,
    },
    {
      label: 'samples p25–p75', title: 'interquartile range of every sample error', get: (m) => m.sampleErr?.p50 ?? null, fmt: (m) => (m.sampleErr ? `${f0(m.sampleErr.p25)}–${f0(m.sampleErr.p75)}` : '—'),
    },
    {
      label: 'spread SD', title: 'precision: RMS distance of samples from their centroid', get: (m) => m.sdPx, lowIsGood: true,
    },
    {
      label: 'jitter S2S', title: 'precision: RMS sample-to-sample distance', get: (m) => m.s2sPx, lowIsGood: true,
    },
    { label: 'bias dx, dy', title: 'mean (gaze - dot): constant drift', get: () => null, fmt: (m) => (m.biasPx ? `${f0(m.biasPx[0])}, ${f0(m.biasPx[1])}` : '—') },
    {
      label: 'error w/o bias', title: 'error left after removing the constant bias (best case for a drift fix)', get: (m) => m.afterBiasPx, lowIsGood: true,
    },
    {
      label: 'loss %', title: 'frames without an estimate (no face, blink, uncalibrated)', get: (m) => m.lossPct, lowIsGood: true,
    },
    { label: 'Hz', title: 'estimates per second during the check', get: (m) => m.hz },
  ];
  return (
    <Table fz="sm" withTableBorder striped>
      <Table.Thead>
        <Table.Tr>
          <Table.Th>tracker</Table.Th>
          {cols.map((c) => <Table.Th key={c.label} title={c.title}>{c.label}</Table.Th>)}
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {ids.map((id) => {
          const m = run.metrics[id];
          return (
            <Table.Tr key={id}>
              <Table.Td style={{ color: info[id]?.color, fontWeight: 600 }}>{info[id]?.name ?? id}</Table.Td>
              {cols.map((c) => {
                const v = c.get(m);
                const isBest = c.lowIsGood && v !== null && best(c.get) === v;
                return <Table.Td key={c.label} style={{ fontWeight: isBest ? 700 : 400, background: isBest ? 'rgba(22,163,74,0.12)' : undefined }}>{c.fmt ? c.fmt(m) : f0(v)}</Table.Td>;
              })}
            </Table.Tr>
          );
        })}
      </Table.Tbody>
    </Table>
  );
}

function RangeChart({ run, info }: { run: Run; info: InfoMap }) {
  const ids = Object.keys(run.metrics);
  const W = 560;
  const L = 170;
  const rowH = 34;
  const H = ids.length * rowH + 30;
  const maxV = Math.max(50, ...ids.flatMap((id) => {
    const m = run.metrics[id];
    return [m.dotErr?.max ?? 0, m.sampleErr?.p75 ?? 0];
  }));
  const step = maxV > 400 ? 100 : 50;
  const top = Math.ceil(maxV / step) * step;
  const x = (v: number) => L + ((W - L - 10) * v) / top;
  const ticks = Array.from({ length: top / step + 1 }, (_, i) => i * step);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: W }}>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={x(t)} x2={x(t)} y1={4} y2={H - 22} stroke="#e5e7eb" />
          <text x={x(t)} y={H - 8} fontSize={10} textAnchor="middle" fill="#6b7280">{t}</text>
        </g>
      ))}
      <text x={W - 10} y={H - 8} fontSize={10} textAnchor="end" fill="#6b7280">px</text>
      {ids.map((id, i) => {
        const m = run.metrics[id];
        const cy = 18 + i * rowH;
        const c = info[id]?.color ?? '#333';
        return (
          <g key={id}>
            <text x={L - 8} y={cy + 4} fontSize={11} textAnchor="end" fill={c} fontWeight={600}>{info[id]?.name ?? id}</text>
            {m.dotErr && <line x1={x(m.dotErr.min)} x2={x(m.dotErr.max)} y1={cy} y2={cy} stroke={c} strokeWidth={2} />}
            {m.sampleErr && <rect x={x(m.sampleErr.p25)} y={cy - 7} width={Math.max(1, x(m.sampleErr.p75) - x(m.sampleErr.p25))} height={14} fill={c} opacity={0.2} stroke={c} />}
            {m.dots.map((d, j) => (d.errorPx === null ? null : (
              // eslint-disable-next-line react/no-array-index-key
              <circle key={j} cx={x(d.errorPx)} cy={cy} r={3} fill="white" stroke={c} />
            )))}
            {m.accuracyPx !== null && (
              <path d={`M ${x(m.accuracyPx)} ${cy - 8} l 6 8 l -6 8 l -6 -8 z`} fill={c} />
            )}
          </g>
        );
      })}
    </svg>
  );
}

function ErrorMap({ run, info }: { run: Run; info: InfoMap }) {
  const [vw, vh] = run.viewport;
  const W = 560;
  const s = W / vw;
  const H = vh * s;
  const first = Object.values(run.dots)[0] ?? [];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: W, background: '#fafafa', border: '1px solid #eee' }}>
      {Object.entries(run.metrics).map(([id, m]) => m.dots.map((d, j) => (d.centroid ? (
        // eslint-disable-next-line react/no-array-index-key
        <g key={`${id}-${j}`}>
          <line x1={d.tx * s} y1={d.ty * s} x2={d.centroid[0] * s} y2={d.centroid[1] * s} stroke={info[id]?.color} strokeWidth={1} opacity={0.6} />
          <circle cx={d.centroid[0] * s} cy={d.centroid[1] * s} r={5} fill={info[id]?.color} opacity={0.75} />
        </g>
      ) : null)))}
      {first.map((d) => (
        <g key={`${d.tx}-${d.ty}`}>
          <line x1={d.tx * s - 7} x2={d.tx * s + 7} y1={d.ty * s} y2={d.ty * s} stroke="#111" strokeWidth={1.5} />
          <line x1={d.tx * s} x2={d.tx * s} y1={d.ty * s - 7} y2={d.ty * s + 7} stroke="#111" strokeWidth={1.5} />
        </g>
      ))}
    </svg>
  );
}

export default GazeBench;
