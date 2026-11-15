/**
 * gaze_aoi_validation: letter-target block. Each target is cued by a dot at a known screen position, the dot turns
 * into a small letter for `letterMs`, a mask follows, and the participant types the letter. A correct answer means
 * the eyes were on the target, so its position is ground truth for comparing gaze models fitted on different
 * calibration sets (main model + the variants fitted by GazeCalibration, logged per sample in `alt`).
 *
 * Targets are placed relative to the scatterplot_gaze trial frame (taskLayout.ts), drawn here as an empty frame
 * (no data, no text): 'plot' (plot interior), 'yLabel' / 'xLabel' (label areas) or 'margin' (empty side margins,
 * outside the frame). 'check' targets are plain dots at a task point (plot centre, x label, y label) with no letter.
 *
 * Logged per target: position (px), region, letter, response, correct, rt, gaze samples
 * [t_ms_since_cue, x, y, open01, alt1_x, alt1_y, ...] (raw estimates, viewport px; altNames gives the order),
 * and per-model median error over the window [cueMs - 500, cueMs + letterMs] ms.
 */
import { Button } from '@mantine/core';
import {
  useCallback, useEffect, useRef, useState,
} from 'react';
import { StimulusParams } from '../../../store/types';
import {
  gazeTracker, headShiftMm, meanHeadPose, normToPx,
} from '../../scatterplot_gaze/assets/gazeTracker';
import type { GazeSample } from '../../scatterplot_gaze/assets/gazeTracker';
import {
  FullscreenGate, HeadStillNotice, Panel, fullscreenStats,
} from '../../scatterplot_gaze/assets/FullScreen';
import {
  TASK_MARGIN, TASK_SIZE, taskPoint, taskScale,
} from '../../scatterplot_gaze/assets/taskLayout';
import type { TaskTarget } from '../../scatterplot_gaze/assets/taskLayout';

type Region = 'plot' | 'yLabel' | 'xLabel' | 'margin' | 'check';
type Target = { id: string; region: Region; u?: number; v?: number; side?: 'L' | 'R'; point?: TaskTarget; letter?: string };
type Params = {
  block: number; nBlocks: number; practice?: boolean; targets: Target[];
  cueMs?: number; letterMs?: number; maskMs?: number; checkMs?: number;
};
type Logged = {
  id: string; region: Region; letter: string | null; px: [number, number]; response: string | null; correct: boolean | null; rtMs: number | null;
  errPx: Record<string, number | null>; n: number; headShiftMm: number | null; samples: number[][];
};

// Design-space boxes (taskLayout coordinates) of the regions
const PLOT = {
  x0: TASK_MARGIN.left, x1: TASK_SIZE.width - TASK_MARGIN.right, y0: TASK_MARGIN.top, y1: TASK_SIZE.height - TASK_MARGIN.bottom,
};
const YLAB = {
  x0: TASK_MARGIN.left - 155, x1: TASK_MARGIN.left - 5, y0: PLOT.y0, y1: PLOT.y1,
};
const XLAB = {
  x0: PLOT.x0, x1: PLOT.x1, y0: PLOT.y1 + 15, y1: TASK_SIZE.height - 5,
};
type Box = typeof PLOT;

function designToPx(sx: number, sy: number): [number, number] {
  const s = taskScale();
  return [window.innerWidth / 2 + (sx - TASK_SIZE.width / 2) * s, window.innerHeight / 2 + (sy - TASK_SIZE.height / 2) * s];
}
const inBox = (b: Box, u: number, v: number) => designToPx(b.x0 + u * (b.x1 - b.x0), b.y0 + v * (b.y1 - b.y0));

export function targetPx(t: Target): [number, number] {
  const u = t.u ?? 0.5;
  const v = t.v ?? 0.5;
  if (t.region === 'plot') return inBox(PLOT, u, v);
  if (t.region === 'yLabel') return inBox(YLAB, u, v);
  if (t.region === 'xLabel') return inBox(XLAB, u, v);
  if (t.region === 'margin') {
    const frameHalf = (TASK_SIZE.width * taskScale()) / 2;
    const m = window.innerWidth / 2 - frameHalf; // margin width (px)
    const x = t.side === 'L' ? u * m : window.innerWidth - m + u * m;
    return [x, v * window.innerHeight];
  }
  const p = taskPoint(t.point ?? 'plot');
  return normToPx(p.nx, p.ny);
}

const sleep = (ms: number) => new Promise<void>((r) => { setTimeout(r, ms); });
const median = (a: number[]) => {
  if (!a.length) return null;
  const b = [...a].sort((x, y) => x - y);
  return Math.round(b[Math.floor(b.length / 2)]);
};

/** The empty task frame: plot square and the two label areas, faint, no data and no text. */
function EmptyFrame() {
  const s = taskScale();
  const box = (b: Box, fill: string, stroke: string) => (
    <rect x={b.x0} y={b.y0} width={b.x1 - b.x0} height={b.y1 - b.y0} fill={fill} stroke={stroke} strokeWidth={1.5} rx={4} />
  );
  return (
    <svg
      width={TASK_SIZE.width * s}
      height={TASK_SIZE.height * s}
      viewBox={`0 0 ${TASK_SIZE.width} ${TASK_SIZE.height}`}
      style={{
        position: 'absolute', left: window.innerWidth / 2 - (TASK_SIZE.width * s) / 2, top: window.innerHeight / 2 - (TASK_SIZE.height * s) / 2,
      }}
    >
      {box(PLOT, '#fafafa', '#cfd4da')}
      {box(YLAB, '#f4f5f7', '#e3e6ea')}
      {box(XLAB, '#f4f5f7', '#e3e6ea')}
    </svg>
  );
}

type Stage = { kind: 'cue' | 'letter' | 'mask' | 'respond' | 'feedback' | 'blank'; px?: [number, number]; text?: string };

function LetterTargets({ parameters, setAnswer, advance }: StimulusParams<Params>) {
  const {
    block, nBlocks, practice = false, targets, cueMs = 1000, letterMs = 200, maskMs = 300, checkMs = 1500,
  } = parameters;
  const [phase, setPhase] = useState<'intro' | 'running' | 'done'>('intro');
  const [stage, setStage] = useState<Stage>({ kind: 'blank' });
  const [log, setLog] = useState<Logged[]>([]);
  const [altNames, setAltNames] = useState<string[]>([]);
  const keyWaiter = useRef<((k: string) => void) | null>(null);
  const cancelled = useRef(false);
  const startedAt = useRef(0);

  useEffect(() => {
    cancelled.current = false;
    return () => { cancelled.current = true; };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!keyWaiter.current || !/^[a-zA-Z]$/.test(e.key)) return;
      e.preventDefault();
      const fn = keyWaiter.current;
      keyWaiter.current = null;
      fn(e.key.toUpperCase());
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    setAnswer({
      status: phase === 'done',
      answers: {
        targets: JSON.stringify({
          block,
          practice,
          altNames,
          cueMs,
          letterMs,
          maskMs,
          checkMs,
          viewport: [window.innerWidth, window.innerHeight],
          dpr: window.devicePixelRatio,
          taskScale: taskScale(),
          hz: Math.round(gazeTracker.hz * 10) / 10,
          trackerState: gazeTracker.state,
          offsetPx: gazeTracker.offsetPx.map((v) => Math.round(v)),
          device: gazeTracker.device,
          durationMs: startedAt.current ? Math.round(performance.now() - startedAt.current) : null,
          frameErrors: gazeTracker.frameErrors,
          fullscreenExits: fullscreenStats.exits,
          trials: log,
        }),
      },
    });
  }, [phase, log, altNames, setAnswer, block, practice, cueMs, letterMs, maskMs, checkMs]);

  const runOne = useCallback(async (t: Target): Promise<Logged> => {
    const px = targetPx(t);
    const isCheck = t.region === 'check' || !t.letter;
    const onset = performance.now();
    const samples: number[][] = [];
    const poseSamples: GazeSample[] = [];
    let names: string[] | null = null;
    const winFrom = onset + (isCheck ? checkMs - 700 : cueMs - 500);
    const winTo = onset + (isCheck ? checkMs : cueMs + letterMs);
    const errs: Record<string, number[]> = { main: [] };
    const unsub = gazeTracker.onSample((s: GazeSample) => {
      if (!names) names = s.alt ? Object.keys(s.alt).sort() : [];
      const ok = s.open && s.face;
      const [x, y] = normToPx(s.rx, s.ry);
      const row = [Math.round(s.t - onset), Math.round(x), Math.round(y), ok ? 1 : 0];
      const inWin = ok && s.t >= winFrom && s.t <= winTo;
      if (inWin) errs.main.push(Math.hypot(x - px[0], y - px[1]));
      names.forEach((nm) => {
        const a = s.alt?.[nm];
        if (!a) { row.push(-9999, -9999); return; }
        const [ax, ay] = normToPx(a[0], a[1]);
        row.push(Math.round(ax), Math.round(ay));
        if (inWin) { if (!errs[nm]) errs[nm] = []; errs[nm].push(Math.hypot(ax - px[0], ay - px[1])); }
      });
      samples.push(row);
      if (inWin) poseSamples.push(s);
    });
    let response: string | null = null;
    let rtMs: number | null = null;
    if (isCheck) {
      setStage({ kind: 'cue', px });
      await sleep(checkMs);
      unsub();
    } else {
      setStage({ kind: 'cue', px });
      await sleep(cueMs);
      setStage({ kind: 'letter', px, text: t.letter });
      await sleep(letterMs);
      setStage({ kind: 'mask', px });
      await sleep(maskMs);
      unsub();
      setStage({ kind: 'respond' });
      const t0 = performance.now();
      response = await new Promise<string>((resolve) => { keyWaiter.current = resolve; });
      rtMs = Math.round(performance.now() - t0);
    }
    if (names) setAltNames(names);
    const errPx: Record<string, number | null> = {};
    Object.entries(errs).forEach(([k, v]) => { errPx[k] = median(v); });
    const correct = isCheck ? null : response === t.letter;
    if (practice && !isCheck) {
      setStage({ kind: 'feedback', text: correct ? 'Correct' : `It was ${t.letter}` });
      await sleep(900);
    }
    setStage({ kind: 'blank' });
    await sleep(350);
    return {
      id: t.id,
      region: t.region,
      letter: isCheck ? null : t.letter ?? null,
      px: [Math.round(px[0]), Math.round(px[1])],
      response,
      correct,
      rtMs,
      errPx,
      n: errs.main.length,
      headShiftMm: headShiftMm(meanHeadPose(poseSamples), gazeTracker.calibHead),
      samples,
    };
  }, [cueMs, letterMs, maskMs, checkMs, practice]);

  const run = useCallback(async () => {
    setPhase('running');
    startedAt.current = performance.now();
    setStage({ kind: 'blank' });
    await sleep(600);
    const out: Logged[] = [];
    for (let i = 0; i < targets.length; i += 1) {
      if (cancelled.current) return;
      // eslint-disable-next-line no-await-in-loop
      out.push(await runOne(targets[i]));
      setLog([...out]);
    }
    setPhase('done');
  }, [targets, runOne]);

  useEffect(() => { if (phase === 'done' && !practice) advance?.(); }, [phase, practice, advance]);

  const nLetters = targets.filter((t) => t.region !== 'check' && t.letter).length;
  const nCorrect = log.filter((l) => l.correct).length;

  if (phase === 'intro') {
    return (
      <>
        <FullscreenGate />
        <Panel
          kicker={practice ? 'Practice' : `Part ${block} of ${nBlocks}`}
          title={practice ? 'Read the tiny letter' : 'Keep going'}
          maxWidth={680}
          actions={<Button size="lg" onClick={run}>Start</Button>}
        >
          {practice ? (
            <ul style={{
              textAlign: 'left', margin: '4px auto 0', paddingLeft: 22, display: 'flex', flexDirection: 'column', gap: 8,
            }}
            >
              <li>
                A
                <strong>blue dot</strong>
                {' '}
                appears somewhere on the screen.
                <strong>Look at it.</strong>
              </li>
              <li>
                The dot turns into a
                <strong>tiny letter</strong>
                {' '}
                for a split second.
              </li>
              <li>
                <strong>Type that letter</strong>
                {' '}
                on your keyboard. If you are not sure, guess.
              </li>
              <li>Some dots have no letter: just look at them until they disappear.</li>
            </ul>
          ) : (
            <>
              {`${nLetters} letters. Look at each blue dot, then type the letter.`}
              <HeadStillNotice />
            </>
          )}
        </Panel>
      </>
    );
  }

  if (phase === 'done' && practice) {
    return (
      <>
        <FullscreenGate />
        <Panel
          kicker="Practice"
          title={`${nCorrect} of ${nLetters} correct`}
          actions={<Button size="lg" onClick={() => advance?.()}>Continue</Button>}
        >
          {nCorrect < nLetters ? 'The letter is small and brief: keep your eyes on the dot until it changes.' : 'Well done.'}
        </Panel>
      </>
    );
  }

  const LETTER_PX = 15;
  return (
    <>
      <div style={{
        position: 'fixed', inset: 0, zIndex: 2000, background: '#ffffff', cursor: 'none', userSelect: 'none',
      }}
      >
        <EmptyFrame />
        {stage.kind === 'cue' && stage.px && (
          <div style={{
            position: 'absolute', left: stage.px[0] - 9, top: stage.px[1] - 9, width: 18, height: 18, borderRadius: 9, background: '#1c4e80',
          }}
          >
            <div style={{
              position: 'absolute', left: 7, top: 7, width: 4, height: 4, borderRadius: 2, background: '#fff',
            }}
            />
          </div>
        )}
        {(stage.kind === 'letter' || stage.kind === 'mask') && stage.px && (
          <div style={{
            position: 'absolute',
            left: stage.px[0] - 20,
            top: stage.px[1] - 20,
            width: 40,
            height: 40,
            lineHeight: '40px',
            textAlign: 'center',
            fontFamily: 'Arial, sans-serif',
            fontWeight: 700,
            fontSize: LETTER_PX,
            color: '#111',
          }}
          >
            {stage.kind === 'letter' ? stage.text : '#'}
          </div>
        )}
        {(stage.kind === 'respond' || stage.kind === 'feedback') && (
          <div style={{
            position: 'absolute', top: '50%', left: 0, right: 0, marginTop: -20, textAlign: 'center', fontSize: 22, color: stage.kind === 'feedback' ? '#1c4e80' : '#444',
          }}
          >
            {stage.kind === 'respond' ? 'Which letter? Press its key.' : stage.text}
          </div>
        )}
      </div>
      <FullscreenGate />
    </>
  );
}

export default LetterTargets;
