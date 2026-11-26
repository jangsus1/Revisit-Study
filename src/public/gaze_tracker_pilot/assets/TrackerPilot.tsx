/**
 * Tracker pilot (gaze_tracker_pilot), recording version (2026-11-25). No tracker runs in the browser:
 * the page records the webcam video while showing a fixed dot sequence and logs, on one clock
 * (performance.now), when each dot appeared, where, and when its collection window started and ended,
 * plus one entry per camera frame (requestVideoFrameCallback). Every tracker (RealEye Light, WebEyeTrack,
 * EyeGesturesLite, offline models) is then run on the same frames afterwards, and any calibration or
 * model change can be refitted on them.
 *   1. camera + full screen, framing preview (no live face tracking),
 *   2. calib: the study's 15 dots (3x3 grid + 6 on the trial plot), random order, 1.8 s each,
 *   3. check: 16 dots never used for calibration (8 task region + 8 off-grid), 1.5 s each,
 *   4. pursuit: 20 s smooth pursuit on the study's Lissajous path,
 *   5. map: 5 x 5 grid over the screen, 1.2 s each (spatial error map),
 *   6. re-positioning: 10 s sitting back / looking away, back into the oval (participant-paced),
 *   7. anchor: the study's per-trial 3-dot check (plot centre, x label, y label, 1 s each),
 *   8. recheck: the 16 check dots again (accuracy after a head move: none vs 3-dot re-anchoring vs refit),
 *   9. recalib: the 15 calibration dots again, 10. final: the 16 check dots again.
 * About 3.5 min of recording, ~5 min in all.
 * The video (WebM, ~2.5 Mbit/s, ~3.5 min) is uploaded with reVISit's recording upload
 * (Firebase Storage `<study>/screenRecording/<participantId>_webcam_<runId>`) and the log is saved next to it as
 * `<participantId>_log_<runId>` (JSON), so a browser that reuses a participant id (already completed: reVISit then
 * ignores the new answer) can neither lose a run's log nor overwrite an earlier video. Answer `pilot` also holds the log.
 */
import { Button } from '@mantine/core';
import {
  useCallback, useEffect, useRef, useState,
} from 'react';
import { StimulusParams } from '../../../store/types';
import { useStorageEngine } from '../../../storage/storageEngineHooks';
import {
  CalibrationOverlay, FULL_GRID, PURSUIT_LEAD_MS, PURSUIT_MS, animatePursuit,
} from '../../scatterplot_gaze/assets/CalibrationOverlay';
import type { NormPoint } from '../../scatterplot_gaze/assets/CalibrationOverlay';
import { taskCalibPoints, trialCheckPoints } from '../../scatterplot_gaze/assets/taskLayout';
import { Panel, enterFullscreen } from '../../scatterplot_gaze/assets/FullScreen';

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
const MAP_DWELL = 1200;
const MAP_COLLECT = 600;
const ANCHOR_DWELL = 1000; // the study's per-trial check timing
const ANCHOR_COLLECT = 500;
const AWAY_MS = 10000;
const GRID_5X5: NormPoint[] = [-0.4, -0.2, 0, 0.2, 0.4].flatMap((ny) => [-0.4, -0.2, 0, 0.2, 0.4].map((nx) => ({ nx, ny })));
const BITRATE = 2_500_000;
// One id per run: video and log files never collide, even when the browser reuses a participant id
const RUN_ID = `${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)}_${Math.random().toString(36).slice(2, 6)}`;
const VIDEO_NAME = `webcam_${RUN_ID}`;
const LOG_NAME = `log_${RUN_ID}`;

type Stage = 'intro' | 'starting' | 'preview' | 'running' | 'away' | 'return' | 'uploading' | 'uploadFailed' | 'failed';
type DotEvent = {
  phase: 'calib' | 'check' | 'map' | 'anchor' | 'recheck' | 'recalib' | 'final'; set: string; i: number; nx: number; ny: number; x: number; y: number;
  onset: number; collectStart: number; offset: number;
};

const shuffle = <T, >(a: T[]) => {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
};
const sleep = (ms: number) => new Promise<void>((r) => { setTimeout(r, ms); });
const now = () => Math.round(performance.now() * 10) / 10;
const pickMime = () => ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4']
  .find((m) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) ?? '';

function TrackerPilot({ setAnswer, advance }: StimulusParams<Record<string, never>>) {
  const storageEngine = useStorageEngine()?.storageEngine;
  const [stage, setStage] = useState<Stage>('intro');
  const [error, setError] = useState<string | null>(null);
  const [dot, setDot] = useState<NormPoint | null>(null);
  const [collecting, setCollecting] = useState(false);
  const [message, setMessage] = useState('');
  const [awayLeft, setAwayLeft] = useState(0);
  const [pursuitOn, setPursuitOn] = useState(false);
  const pursuitDot = useRef<HTMLDivElement | null>(null);
  const returnResolve = useRef<(() => void) | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const previewRef = useRef<HTMLVideoElement | null>(null);
  const frameVideo = useRef<HTMLVideoElement | null>(null);
  const frames = useRef<number[][]>([]);
  const logging = useRef(false);
  const blob = useRef<Blob | null>(null);
  const result = useRef<Record<string, unknown> | null>(null);

  useEffect(() => () => { stream.current?.getTracks().forEach((t) => t.stop()); }, []);

  // Preview element gets the stream whenever it mounts
  useEffect(() => {
    if ((stage === 'preview' || stage === 'return') && previewRef.current && stream.current) {
      previewRef.current.srcObject = stream.current;
      previewRef.current.play().catch(() => undefined);
    }
  }, [stage]);

  const start = useCallback(async () => {
    enterFullscreen();
    setStage('starting');
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } }, audio: false,
      });
      if (!pickMime()) throw new Error('This browser cannot record video. Please use Chrome or Edge.');
      setStage('preview');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStage('failed');
    }
  }, []);

  /** One entry per camera frame: [performance.now at the callback, mediaTime s, captureTime ms or -1, presentedFrames]. */
  const startFrameLog = () => {
    const v = document.createElement('video');
    v.muted = true;
    v.playsInline = true;
    v.srcObject = stream.current;
    v.play().catch(() => undefined);
    frameVideo.current = v;
    logging.current = true;
    type Meta = { mediaTime: number; captureTime?: number; presentedFrames: number };
    const rvfc = (v as unknown as { requestVideoFrameCallback?: (cb: (t: number, m: Meta) => void) => number }).requestVideoFrameCallback?.bind(v);
    if (!rvfc) return;
    const cb = (t: number, m: Meta) => {
      if (!logging.current) return;
      frames.current.push([Math.round(t * 10) / 10, Math.round(m.mediaTime * 1e4) / 1e4, m.captureTime === undefined ? -1 : Math.round(m.captureTime * 10) / 10, m.presentedFrames]);
      rvfc(cb);
    };
    rvfc(cb);
  };

  const upload = useCallback(async () => {
    if (!blob.current || !result.current) return;
    setStage('uploading');
    try {
      if (!storageEngine) throw new Error('storage not ready');
      await storageEngine.saveScreenRecording(new Blob([JSON.stringify(result.current)], { type: 'application/json' }), LOG_NAME);
      await storageEngine.saveScreenRecording(blob.current, VIDEO_NAME);
      setAnswer({ status: true, answers: { pilot: JSON.stringify({ ...result.current, videoUploaded: true }) } });
      if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
      setTimeout(() => advance?.(), 300);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStage('uploadFailed');
    }
  }, [storageEngine, setAnswer, advance]);

  const run = useCallback(async () => {
    if (!stream.current) return;
    setStage('running');
    const events: DotEvent[] = [];
    try {
      const mimeType = pickMime();
      const rec = new MediaRecorder(stream.current, { mimeType, videoBitsPerSecond: BITRATE });
      const chunks: Blob[] = [];
      const chunkLog: number[][] = [];
      let recStart = -1;
      let recStop = -1;
      rec.ondataavailable = (ev) => { if (ev.data.size) { chunks.push(ev.data); chunkLog.push([now(), ev.data.size]); } };
      const started = new Promise<void>((res) => { rec.onstart = () => { recStart = now(); res(); }; });
      const stopped = new Promise<void>((res) => { rec.onstop = () => { recStop = now(); res(); }; });
      startFrameLog();
      const recCall = now();
      rec.start(1000);
      await started;
      await sleep(500);

      const showDots = async (points: (NormPoint & { set: string })[], phase: DotEvent['phase'], dwell: number, collect: number, text: string) => {
        for (let i = 0; i < points.length; i += 1) {
          const p = points[i];
          setMessage(`${text} (${i + 1} / ${points.length})`);
          setDot(p);
          setCollecting(false);
          const onset = now();
          // eslint-disable-next-line no-await-in-loop
          await sleep(dwell - collect);
          setCollecting(true);
          const collectStart = now();
          // eslint-disable-next-line no-await-in-loop
          await sleep(collect);
          events.push({
            phase,
            set: p.set,
            i,
            nx: p.nx,
            ny: p.ny,
            x: Math.round((p.nx + 0.5) * window.innerWidth),
            y: Math.round((p.ny + 0.5) * window.innerHeight),
            onset,
            collectStart,
            offset: now(),
          });
        }
        setDot(null);
        setCollecting(false);
      };
      const blocks: { name: string; start: number; end: number }[] = [];
      const block = async (name: string, fn: () => Promise<void>) => {
        const t0 = now();
        await fn();
        blocks.push({ name, start: t0, end: now() });
      };
      const pause = async (text: string, ms = 2500) => {
        setMessage(text);
        await sleep(ms);
      };
      const calibSet = () => [...FULL_GRID.map((p) => ({ ...p, set: 'grid' })), ...taskCalibPoints().map((p) => ({ ...p, set: 'task' }))];
      const checkSet = () => [...TASK_CHECK.map((p) => ({ ...p, set: 'task' })), ...OFF_GRID.map((p) => ({ ...p, set: 'offgrid' }))];
      const HEAD = 'Look at the dot. Keep your head still';

      // 1. calibration (15) and 2. first check (16)
      await block('calib', () => showDots(shuffle(calibSet()), 'calib', CALIB_DWELL, CALIB_COLLECT, HEAD));
      await pause('Short pause. Keep your head where it is');
      await block('check', () => showDots(shuffle(checkSet()), 'check', CHECK_DWELL, CHECK_COLLECT, HEAD));
      await pause('Next: follow the moving dot with your eyes');
      // 3. smooth pursuit (20 s Lissajous; target position at time t = lissajous((t - motionStart) / PURSUIT_MS))
      let motionStart = -1;
      await block('pursuit', async () => {
        setMessage('Follow the moving dot with your eyes. Keep your head still');
        setPursuitOn(true);
        await sleep(50);
        motionStart = await animatePursuit(() => pursuitDot.current, PURSUIT_MS, () => false, () => undefined);
        setPursuitOn(false);
      });
      await pause('Short pause. Keep your head where it is');
      // 4. fine map: 5 x 5 grid over the screen
      await block('map', () => showDots(shuffle(GRID_5X5.map((p) => ({ ...p, set: 'map' }))), 'map', MAP_DWELL, MAP_COLLECT, HEAD));

      // 5. re-positioning: move away, come back
      const awayStart = now();
      setStage('away');
      for (let left = AWAY_MS / 1000; left > 0; left -= 1) {
        setAwayLeft(left);
        // eslint-disable-next-line no-await-in-loop
        await sleep(1000);
      }
      const awayEnd = now();
      setStage('return');
      await new Promise<void>((res) => { returnResolve.current = res; });
      const returned = now();
      setStage('running');
      await sleep(800);
      // 6. the study's per-trial check: 3 dots (plot centre, x label, y label), 1 s each, fixed order
      await block('anchor', () => showDots(trialCheckPoints().map((p) => ({ ...p, set: p.target })), 'anchor', ANCHOR_DWELL, ANCHOR_COLLECT, HEAD));
      // 7. check after the move (16)
      await block('recheck', () => showDots(shuffle(checkSet()), 'recheck', CHECK_DWELL, CHECK_COLLECT, HEAD));
      await pause('Short pause. Keep your head where it is');
      // 8. full recalibration (15) and 9. final check (16)
      await block('recalib', () => showDots(shuffle(calibSet()), 'recalib', CALIB_DWELL, CALIB_COLLECT, HEAD));
      await pause('Almost done. Keep your head where it is');
      await block('final', () => showDots(shuffle(checkSet()), 'final', CHECK_DWELL, CHECK_COLLECT, HEAD));
      const reposition = {
        awayStart, awayEnd, returned, awayMs: AWAY_MS,
      };
      const pursuit = {
        motionStart, durationMs: PURSUIT_MS, leadMs: PURSUIT_LEAD_MS, path: 'x = (0.5 + 0.4 sin(6 pi u + pi/2)) W, y = (0.5 + 0.4 sin(4 pi u)) H, u = (t - motionStart) / durationMs',
      };

      await sleep(300);
      logging.current = false;
      rec.stop();
      await stopped;
      const settings = stream.current.getVideoTracks()[0]?.getSettings() ?? {};
      stream.current.getTracks().forEach((t) => t.stop());
      blob.current = new Blob(chunks, { type: mimeType });
      result.current = {
        version: 3,
        runId: RUN_ID,
        at: new Date().toISOString(),
        device: {
          userAgent: navigator.userAgent,
          viewport: [window.innerWidth, window.innerHeight],
          screen: [window.screen.width, window.screen.height],
          dpr: window.devicePixelRatio,
          fullscreen: !!document.fullscreenElement,
        },
        camera: { width: settings.width ?? null, height: settings.height ?? null, frameRate: settings.frameRate ?? null },
        recording: {
          videoName: VIDEO_NAME,
          mimeType,
          bitrate: BITRATE,
          bytes: blob.current.size,
          startCalled: recCall,
          started: recStart,
          stopped: recStop,
          chunks: chunkLog,
        },
        protocol: {
          calibDwellMs: CALIB_DWELL,
          calibCollectMs: CALIB_COLLECT,
          checkDwellMs: CHECK_DWELL,
          checkCollectMs: CHECK_COLLECT,
          clock: 'performance.now ms',
          frameColumns: ['callbackTime', 'mediaTime_s', 'captureTime', 'presentedFrames'],
        },
        events,
        blocks,
        reposition,
        pursuit,
        frames: frames.current,
      };
      await upload();
    } catch (e) {
      logging.current = false;
      setError(e instanceof Error ? e.message : String(e));
      setStage('failed');
    } finally {
      setDot(null);
    }
  }, [upload]);

  const download = () => {
    if (!blob.current || !result.current) return;
    [[blob.current, 'webcam.webm'], [new Blob([JSON.stringify(result.current)], { type: 'application/json' }), 'log.json']].forEach(([b, n]) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(b as Blob);
      a.download = `gaze_pilot_${n as string}`;
      a.click();
    });
  };

  const previewBox = (
    <div style={{
      position: 'relative', width: 400, height: 225, margin: '14px auto 0', borderRadius: 10, overflow: 'hidden', background: '#000',
    }}
    >
      <video
        ref={previewRef}
        muted
        playsInline
        style={{
          width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)',
        }}
      />
      <div style={{
        position: 'absolute', left: '50%', top: '50%', width: 110, height: 150, transform: 'translate(-50%, -50%)', border: '3px dashed rgba(255,255,255,0.85)', borderRadius: '50%',
      }}
      />
    </div>
  );

  if (dot || pursuitOn) return <CalibrationOverlay dot={dot} collecting={collecting} message={message} pursuitOn={pursuitOn} pursuitDotRef={pursuitDot} />;

  if (stage === 'intro' || stage === 'starting') {
    return (
      <Panel
        progress={false}
        title="Webcam eye-tracking test"
        actions={<Button size="lg" loading={stage === 'starting'} onClick={start}>Start camera</Button>}
      >
        About 5 minutes: you look at a series of dots while your webcam
        {' '}
        <b>records a video of your face</b>
        . The video is uploaded for this research only and is used to test eye-tracking software.
        Sit at arm&apos;s length with your face evenly lit and keep your head still while the dots are shown.
      </Panel>
    );
  }
  if (stage === 'preview') {
    return (
      <Panel
        progress={false}
        title="Check your position"
        actions={<Button size="lg" onClick={run}>Start the dots</Button>}
      >
        Centre your face in the oval, about an arm&apos;s length from the screen, with light in front of you. Then keep your head still and follow each dot with your eyes.
        {previewBox}
      </Panel>
    );
  }
  if (stage === 'away') {
    return (
      <Panel progress={false} title="Sit back and relax">
        Lean back, stretch or look away from the screen for a moment.
        <div style={{
          fontSize: 44, fontWeight: 700, marginTop: 12, color: '#1c7ed6',
        }}
        >
          {awayLeft}
        </div>
      </Panel>
    );
  }
  if (stage === 'return') {
    return (
      <Panel
        progress={false}
        title="Come back to your position"
        actions={<Button size="lg" onClick={() => returnResolve.current?.()}>Continue</Button>}
      >
        Centre your face in the oval again, at the same distance as before. Then keep your head still for a few more dots.
        {previewBox}
      </Panel>
    );
  }
  if (stage === 'uploadFailed') {
    return (
      <Panel
        progress={false}
        title="The upload did not finish"
        actions={(
          <>
            <Button size="lg" onClick={upload}>Try again</Button>
            <Button size="lg" variant="light" onClick={download}>Download the files instead</Button>
          </>
        )}
      >
        {error}
        <div style={{ fontSize: 15, color: '#666', marginTop: 8 }}>If it keeps failing, download the two files and send them to the researcher.</div>
      </Panel>
    );
  }
  if (stage === 'failed') return <Panel progress={false} title="Something went wrong">{error}</Panel>;
  if (stage === 'running') return <Panel progress={false} title={message || 'Starting…'} />;
  return <Panel progress={false} title="Uploading the video… please keep this tab open" />;
}

export default TrackerPilot;
