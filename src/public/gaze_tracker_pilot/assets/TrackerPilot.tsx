/**
 * Tracker pilot (gaze_tracker_pilot, 2026-11-24): the formal, fixed-protocol version of the
 * gaze_playground bench, used to choose the study's tracker. RealEye Light 1.1 (as in the study),
 * WebEyeTrack and EyeGesturesLite run together on one camera and see the same dots:
 *   1. camera start + full screen, 2. position guide (45-70 cm),
 *   3. calibration: the study's 15 dots (3x3 grid + 6 on the trial plot), random order, 1.8 s each,
 *   4. check: 16 held-out dots (8 in the task region + 8 off-grid), random order, 1.5 s each,
 *      none on a calibration target; no drift correction.
 * Saved as answer `pilot`: per tracker accuracy (mean over dots of the median sample error), precision
 * (spread SD, sample-to-sample RMS), data loss, Hz, per-dot metrics and the raw check samples
 * ([t_ms since check start, x, y, valid 0/1], viewport px). Camera video never leaves the browser.
 */
import { Button } from '@mantine/core';
import {
  useCallback, useEffect, useRef, useState,
} from 'react';
import { StimulusParams } from '../../../store/types';
import { GazeTracker, gazeTracker, normToPx } from '../../scatterplot_gaze/assets/gazeTracker';
import { CalibrationOverlay, FULL_GRID, nextPaint } from '../../scatterplot_gaze/assets/CalibrationOverlay';
import type { NormPoint } from '../../scatterplot_gaze/assets/CalibrationOverlay';
import { taskCalibPoints } from '../../scatterplot_gaze/assets/taskLayout';
import { PositionGuide } from '../../scatterplot_gaze/assets/PositionGuide';
import type { PositionState } from '../../scatterplot_gaze/assets/PositionGuide';
import { Panel, enterFullscreen } from '../../scatterplot_gaze/assets/FullScreen';
import type { GazeEngineBase, EngineSample } from '../../../gazeEngine/compare/types';
import { runMetrics } from '../../../gazeEngine/compare/metrics';
import type { DotSamples } from '../../../gazeEngine/compare/metrics';

// Held-out check dots: 8 in the task region (plot + labels) and 8 off-grid; none is a calibration target.
const TASK_CHECK: NormPoint[] = [
  { nx: -0.1, ny: -0.15 }, { nx: 0.1, ny: -0.15 }, { nx: -0.1, ny: 0.15 }, { nx: 0.1, ny: 0.15 },
  { nx: -0.17, ny: 0.07 }, { nx: 0.05, ny: 0.24 }, { nx: 0.05, ny: -0.25 }, { nx: 0.17, ny: 0.07 },
];
const OFF_GRID: NormPoint[] = [
  { nx: -0.2, ny: -0.2 }, { nx: 0.2, ny: -0.2 }, { nx: -0.2, ny: 0.2 }, { nx: 0.2, ny: 0.2 },
  { nx: 0, ny: -0.2 }, { nx: 0, ny: 0.2 }, { nx: -0.3, ny: 0 }, { nx: 0.3, ny: 0 },
];
const CALIB_DWELL = 1800;
const CALIB_COLLECT = 1000;
const CHECK_DWELL = 1500;
const CHECK_COLLECT = 800;
const OVERRIDE_MS = 20000;

type Stage = 'intro' | 'starting' | 'position' | 'running' | 'saving' | 'failed';

const shuffle = <T, >(a: T[]) => {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
};
const sleep = (ms: number) => new Promise<void>((r) => { setTimeout(r, ms); });
const r1 = (v: number | null | undefined) => (v === null || v === undefined || !Number.isFinite(v) ? null : Math.round(v * 10) / 10);

function TrackerPilot({ setAnswer, advance }: StimulusParams<Record<string, never>>) {
  const [stage, setStage] = useState<Stage>('intro');
  const [error, setError] = useState<string | null>(null);
  const [dot, setDot] = useState<NormPoint | null>(null);
  const [collecting, setCollecting] = useState(false);
  const [fitting, setFitting] = useState(false);
  const [message, setMessage] = useState('');
  const [pos, setPos] = useState<PositionState | null>(null);
  const [canOverride, setCanOverride] = useState(false); // the guide can misjudge unusual cameras
  const engines = useRef<GazeEngineBase[]>([]);
  const startErrors = useRef<Record<string, string>>({});
  const startedAt = useRef(0);
  const posLog = useRef<PositionState | null>(null);

  useEffect(() => () => { engines.current.forEach((e) => { if (e.state !== 'idle') e.stop(); }); }, []);

  useEffect(() => {
    if (stage !== 'position') return undefined;
    const t = setTimeout(() => setCanOverride(true), OVERRIDE_MS);
    return () => clearTimeout(t);
  }, [stage]);

  const ready = () => engines.current.filter((e) => e.state === 'ready');

  const start = useCallback(async () => {
    enterFullscreen();
    setStage('starting');
    try {
      const m = await import('../../../gazeEngine/compare');
      engines.current = [
        new m.StudyTrackerEngine(gazeTracker), // RealEye Light 1.1, as in the study
        new m.StudyTrackerEngine(new GazeTracker('webeyetrack')),
        new m.EyeGesturesEngine(),
      ];
      const res = await Promise.allSettled(engines.current.map((e) => e.start()));
      res.forEach((r, i) => {
        if (r.status === 'rejected') startErrors.current[engines.current[i].info.id] = String(r.reason?.message ?? r.reason);
      });
      if (!ready().length) throw new Error('No tracker could start. Check that the camera is allowed and not used by another app.');
      startedAt.current = performance.now();
      setStage('position');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStage('failed');
    }
  }, []);

  /** One dot sequence shown to every running tracker at once. */
  const sequence = useCallback(async (points: NormPoint[], calib: boolean, dwell: number, collect: number, text: string) => {
    const list = ready();
    const out: Record<string, DotSamples[]> = Object.fromEntries(list.map((e) => [e.info.id, []]));
    for (let i = 0; i < points.length; i += 1) {
      const [tx, ty] = normToPx(points[i].nx, points[i].ny);
      setMessage(`${text} (${i + 1} / ${points.length})`);
      setDot(points[i]);
      setCollecting(false);
      // eslint-disable-next-line no-await-in-loop
      await sleep(dwell - collect);
      setCollecting(true);
      const bufs = list.map((e) => ({ e, s: [] as EngineSample[] }));
      const unsubs = bufs.map((b) => b.e.onSample((s) => { b.s.push(s); }));
      if (calib) list.forEach((e) => e.beginPoint(tx, ty));
      // eslint-disable-next-line no-await-in-loop
      await sleep(collect);
      unsubs.forEach((u) => u());
      if (calib) {
        // eslint-disable-next-line no-await-in-loop
        await Promise.all(list.map((e) => e.endPoint().catch((err) => console.warn(e.info.id, err))));
      }
      bufs.forEach((b) => out[b.e.info.id].push({
        tx, ty, samples: b.s, collectMs: collect,
      }));
    }
    setDot(null);
    setCollecting(false);
    return out;
  }, []);

  const run = useCallback(async () => {
    posLog.current = pos;
    setStage('running');
    try {
      const list = ready();
      await Promise.all(list.map((e) => e.reset()));
      const calibPts = shuffle([...FULL_GRID, ...taskCalibPoints()]);
      await sequence(calibPts, true, CALIB_DWELL, CALIB_COLLECT, 'Look at the dot. Keep your head still');
      setFitting(true);
      await nextPaint();
      await Promise.all(list.map((e) => e.finishCalibration().catch((err) => console.warn(e.info.id, err))));
      setFitting(false);
      const checkPts = shuffle([...TASK_CHECK.map((p) => ({ ...p, set: 'task' })), ...OFF_GRID.map((p) => ({ ...p, set: 'offgrid' }))]);
      const t0 = performance.now();
      const dots = await sequence(checkPts, false, CHECK_DWELL, CHECK_COLLECT, 'Look at the dot');
      setStage('saving');
      const vw = window.innerWidth;
      const trackers = Object.fromEntries(list.map((e) => {
        const d = dots[e.info.id];
        const all = runMetrics(d, vw);
        const sub = (set: string) => runMetrics(d.filter((_, i) => (checkPts.at(i) as { set: string }).set === set), vw);
        const summary = (mm: ReturnType<typeof runMetrics>) => ({
          accuracyPx: r1(mm.accuracyPx),
          accuracyPctW: mm.accuracyPctW === null ? null : Math.round(mm.accuracyPctW * 10000) / 10000,
          spreadSdPx: r1(mm.sdPx),
          s2sPx: r1(mm.s2sPx),
          lossPct: r1(mm.lossPct),
          hz: r1(mm.hz),
          biasPx: mm.biasPx ? mm.biasPx.map((v) => r1(v)) : null,
          worstDotPx: r1(mm.dotErr?.max),
          bestDotPx: r1(mm.dotErr?.min),
        });
        return [e.info.id, {
          name: e.info.name,
          ...summary(all),
          taskRegion: summary(sub('task')),
          offGrid: summary(sub('offgrid')),
          dots: all.dots.map((dm, i) => ({
            set: (checkPts.at(i) as { set: string }).set,
            tx: Math.round(dm.tx),
            ty: Math.round(dm.ty),
            n: dm.n,
            nValid: dm.nValid,
            errorPx: r1(dm.errorPx),
            offsetPx: dm.offsetPx ? dm.offsetPx.map((v) => r1(v)) : null,
            sdPx: r1(dm.sdPx),
            s2sPx: r1(dm.s2sPx),
          })),
          samples: d.map((ds) => ds.samples.map((s) => [Math.round(s.t - t0), Math.round(s.x), Math.round(s.y), s.valid ? 1 : 0])),
        }];
      }));
      const result = {
        version: 1,
        at: new Date().toISOString(),
        device: {
          userAgent: navigator.userAgent,
          viewport: [vw, window.innerHeight],
          screen: [window.screen.width, window.screen.height],
          dpr: window.devicePixelRatio,
          fullscreen: !!document.fullscreenElement,
        },
        position: { distanceCm: r1(posLog.current?.distanceCm), inRange: !!posLog.current?.ready, face: !!posLog.current?.face },
        protocol: {
          calibDots: calibPts.length,
          calibDwellMs: CALIB_DWELL,
          calibCollectMs: CALIB_COLLECT,
          checkDots: checkPts.length,
          checkDwellMs: CHECK_DWELL,
          checkCollectMs: CHECK_COLLECT,
          driftCorrection: false,
        },
        startErrors: startErrors.current,
        trackers,
      };
      engines.current.forEach((e) => { if (e.state !== 'idle') e.stop(); });
      setAnswer({ status: true, answers: { pilot: JSON.stringify(result) } });
      if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
      setTimeout(() => advance?.(), 300);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStage('failed');
    } finally {
      setDot(null); setFitting(false);
    }
  }, [pos, sequence, setAnswer, advance]);

  if (dot || fitting) return <CalibrationOverlay dot={dot} collecting={collecting} message={message} fitting={fitting} />;

  if (stage === 'intro' || stage === 'starting') {
    return (
      <Panel
        progress={false}
        title="Webcam eye-tracking test"
        actions={<Button size="lg" loading={stage === 'starting'} onClick={start}>Start camera</Button>}
      >
        About 3 minutes. Three eye trackers run at the same time on your webcam; you only look at dots.
        Sit at arm&apos;s length with your face evenly lit, and keep your head still once the dots start.
        The camera video stays on your computer; only gaze numbers are saved.
        {stage === 'starting' && <div style={{ fontSize: 15, color: '#666', marginTop: 10 }}>Loading the trackers (up to a minute)…</div>}
      </Panel>
    );
  }
  if (stage === 'position') {
    return (
      <Panel
        progress={false}
        title="Find a steady position"
        actions={<Button size="lg" onClick={run} disabled={!pos?.face && !canOverride}>Start the dots</Button>}
      >
        Move until your face is centred and the distance reads good. Then keep your head still and follow each dot with your eyes.
        <div style={{ marginTop: 14 }}><PositionGuide stream={gazeTracker.getStream() ?? null} onChange={setPos} /></div>
      </Panel>
    );
  }
  if (stage === 'failed') {
    return (
      <Panel progress={false} title="Something went wrong">
        {error}
      </Panel>
    );
  }
  return <Panel progress={false} title={stage === 'saving' ? 'Saving…' : 'Calibrating…'} />;
}

export default TrackerPilot;
