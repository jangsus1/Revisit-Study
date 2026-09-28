/**
 * Camera page (full window, minimal text): allow the camera, then the position guide (preview, face
 * oval, distance meter). Continue unlocks after the position has been good for 1.5 s (or after 30 s,
 * "Continue anyway") and advances by itself; the platform's Next button is covered.
 */
import { Button, Loader } from '@mantine/core';
import {
  useCallback, useEffect, useRef, useState,
} from 'react';
import { StimulusParams } from '../../../store/types';
import { gazeTracker } from './gazeTracker';
import { PositionGuide } from './PositionGuide';
import type { PositionState } from './PositionGuide';
import { FullscreenGate, Panel, fullscreenStats } from './FullScreen';

type Params = { failLink?: string };

const OVERRIDE_MS = 30000;

function WebcamPermission({ parameters, setAnswer, advance }: StimulusParams<Params>) {
  const [, bump] = useState(0);
  const [faceSeen, setFaceSeen] = useState(false);
  const [pos, setPos] = useState<PositionState | null>(null);
  const [canOverride, setCanOverride] = useState(false);
  const readySince = useRef<number | null>(null);
  const submitted = useRef(false);

  useEffect(() => gazeTracker.onStateChange(() => bump((n) => n + 1)), []);
  const { state, error } = gazeTracker;

  useEffect(() => {
    if (state !== 'ready') return undefined;
    readySince.current = performance.now();
    const t = setTimeout(() => setCanOverride(true), OVERRIDE_MS);
    const unsub = gazeTracker.onSample((s) => { if (s.face) setFaceSeen(true); });
    return () => { clearTimeout(t); unsub(); };
  }, [state]);

  const answer = useCallback((position: PositionState | null) => JSON.stringify({
    engine: gazeTracker.engine,
    granted: gazeTracker.state === 'ready',
    faceDetected: faceSeen,
    error: gazeTracker.error ?? null,
    hz: Math.round(gazeTracker.hz * 10) / 10,
    viewport: [window.innerWidth, window.innerHeight],
    dpr: window.devicePixelRatio,
    ua: navigator.userAgent,
    screen: [window.screen.width, window.screen.height],
    windowPos: [window.screenX, window.screenY, window.outerWidth, window.outerHeight],
    cores: navigator.hardwareConcurrency ?? null,
    fullscreen: !!document.fullscreenElement,
    fullscreenExits: fullscreenStats.exits,
    // distance / position when Continue was pressed
    position: position ? {
      distanceCm: position.distanceCm === null ? null : Math.round(position.distanceCm),
      ready: position.ready,
      guideMs: readySince.current === null ? null : Math.round(performance.now() - readySince.current),
    } : null,
    // camera capture settings (no device name)
    camera: (() => {
      const tr = gazeTracker.getStream()?.getVideoTracks()[0]?.getSettings();
      return tr ? { width: tr.width ?? null, height: tr.height ?? null, frameRate: tr.frameRate ?? null } : null;
    })(),
  }), [faceSeen]);

  // Next stays disabled (and covered) until Continue
  useEffect(() => {
    if (!submitted.current) setAnswer({ status: false, answers: { webcamPermission: answer(null) } });
  }, [setAnswer, answer]);

  const next = () => {
    submitted.current = true;
    setAnswer({ status: true, answers: { webcamPermission: answer(pos) } });
    advance?.();
  };

  let body;
  if (state === 'idle') {
    body = (
      <Panel
        title="Camera"
        actions={<Button size="lg" onClick={() => { gazeTracker.init().catch(() => undefined); }}>Allow camera</Button>}
      >
        Your webcam estimates where you look.
        <br />
        <strong>Video never leaves your computer and nothing is recorded.</strong>
      </Panel>
    );
  } else if (state === 'starting') {
    body = <Panel title="Camera"><Loader /></Panel>;
  } else if (state === 'error') {
    body = (
      <Panel
        title="The camera could not start"
        actions={<Button size="lg" onClick={() => { gazeTracker.init().catch(() => undefined); }}>Retry</Button>}
      >
        Allow camera access for this site and close other apps that use the camera.
        {parameters?.failLink && (
          <div style={{ fontSize: 15, marginTop: 10 }}>
            No camera?
            {' '}
            <a href={parameters.failLink}>Return the study on Prolific</a>
          </div>
        )}
        <div style={{ fontSize: 12, color: '#999', marginTop: 8 }}>{error}</div>
      </Panel>
    );
  } else {
    const ok = !!pos?.ready && faceSeen;
    body = (
      <Panel
        title="Sit at arm's length, face in the oval"
        actions={(
          <Button size="lg" onClick={next} disabled={!ok && !(canOverride && faceSeen)}>
            {ok || !canOverride ? 'Continue' : 'Continue anyway'}
          </Button>
        )}
      >
        <PositionGuide onChange={setPos} />
      </Panel>
    );
  }

  return (
    <>
      {body}
      <FullscreenGate />
    </>
  );
}

export default WebcamPermission;
