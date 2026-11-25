/**
 * Tracker pilot (gaze_tracker_pilot), recording version (2026-11-25). No tracker runs in the browser:
 * the page records the webcam video while showing a fixed dot sequence and logs, on one clock
 * (performance.now), when each dot appeared, where, and when its collection window started and ended,
 * plus one entry per camera frame (requestVideoFrameCallback). Every tracker (RealEye Light, WebEyeTrack,
 * EyeGesturesLite, offline models) is then run on the same frames afterwards, and any calibration or
 * model change can be refitted on them.
 *   1. camera + full screen, framing preview (no live face tracking),
 *   2. calibration dots: the study's 15 (3x3 grid + 6 on the trial plot), random order, 1.8 s each,
 *   3. check dots: 16 never used for calibration (8 task region + 8 off-grid), random order, 1.5 s each,
 *   4. re-positioning: 10 s sitting back / looking away, back into the oval (participant-paced), then the
 *      8 task-region check dots again (phase 'recheck'): accuracy after a head move, per tracker.
 * The video (WebM, ~2.5 Mbit/s, ~1 min) is uploaded with reVISit's recording upload
 * (Firebase Storage `<study>/screenRecording/<participantId>_<VIDEO_NAME>`); answer `pilot` holds the log.
 */
import { Button } from '@mantine/core';
import {
  useCallback, useEffect, useRef, useState,
} from 'react';
import { StimulusParams } from '../../../store/types';
import { useStorageEngine } from '../../../storage/storageEngineHooks';
import { CalibrationOverlay, FULL_GRID } from '../../scatterplot_gaze/assets/CalibrationOverlay';
import type { NormPoint } from '../../scatterplot_gaze/assets/CalibrationOverlay';
import { taskCalibPoints } from '../../scatterplot_gaze/assets/taskLayout';
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
const AWAY_MS = 10000;
const BITRATE = 2_500_000;
const VIDEO_NAME = 'webcam';

type Stage = 'intro' | 'starting' | 'preview' | 'running' | 'away' | 'return' | 'uploading' | 'uploadFailed' | 'failed';
type DotEvent = {
  phase: 'calib' | 'check' | 'recheck'; set: string; i: number; nx: number; ny: number; x: number; y: number;
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
      const calibPts = shuffle([...FULL_GRID.map((p) => ({ ...p, set: 'grid' })), ...taskCalibPoints().map((p) => ({ ...p, set: 'task' }))]);
      await showDots(calibPts, 'calib', CALIB_DWELL, CALIB_COLLECT, 'Look at the dot. Keep your head still');
      setMessage('Short pause');
      await sleep(1000);
      const checkPts = shuffle([...TASK_CHECK.map((p) => ({ ...p, set: 'task' })), ...OFF_GRID.map((p) => ({ ...p, set: 'offgrid' }))]);
      await showDots(checkPts, 'check', CHECK_DWELL, CHECK_COLLECT, 'Look at the dot');

      // Re-positioning: move away, come back, check again (recording continues throughout)
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
      await sleep(500);
      await showDots(shuffle(TASK_CHECK.map((p) => ({ ...p, set: 'task' }))), 'recheck', CHECK_DWELL, CHECK_COLLECT, 'Look at the dot');
      const reposition = {
        awayStart, awayEnd, returned, awayMs: AWAY_MS,
      };

      await sleep(300);
      logging.current = false;
      rec.stop();
      await stopped;
      const settings = stream.current.getVideoTracks()[0]?.getSettings() ?? {};
      stream.current.getTracks().forEach((t) => t.stop());
      blob.current = new Blob(chunks, { type: mimeType });
      result.current = {
        version: 2,
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
        reposition,
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

  if (dot) return <CalibrationOverlay dot={dot} collecting={collecting} message={message} />;

  if (stage === 'intro' || stage === 'starting') {
    return (
      <Panel
        progress={false}
        title="Webcam eye-tracking test"
        actions={<Button size="lg" loading={stage === 'starting'} onClick={start}>Start camera</Button>}
      >
        About 3 minutes: you look at a series of dots while your webcam
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
  return <Panel progress={false} title={stage === 'uploading' ? 'Uploading the video… please keep this tab open' : 'Starting…'} />;
}

export default TrackerPilot;
