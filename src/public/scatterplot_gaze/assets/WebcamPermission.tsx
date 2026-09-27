import {
  Alert, Box, Button, Group, List, Text, Title,
} from '@mantine/core';
import { useEffect, useRef, useState } from 'react';
import { StimulusParams } from '../../../store/types';
import { gazeTracker } from './gazeTracker';

type Params = { failLink?: string };

function WebcamPermission({ parameters, setAnswer }: StimulusParams<Params>) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [, bump] = useState(0);
  const [faceSeen, setFaceSeen] = useState(false);
  const [noFaceFor, setNoFaceFor] = useState(0);

  // Re-render on tracker state changes
  useEffect(() => gazeTracker.onStateChange(() => bump((n) => n + 1)), []);

  // Attach the live preview once the stream exists; watch for a detected face
  useEffect(() => {
    if (gazeTracker.state !== 'ready') return undefined;
    if (videoRef.current && gazeTracker.getStream()) {
      videoRef.current.srcObject = gazeTracker.getStream() ?? null;
    }
    let lastFace = performance.now();
    const unsub = gazeTracker.onSample((s) => {
      if (s.face) {
        lastFace = performance.now();
        setFaceSeen(true);
        setNoFaceFor(0);
      } else {
        setNoFaceFor(performance.now() - lastFace);
      }
    });
    return unsub;
  }, [gazeTracker.state]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setAnswer({
      status: faceSeen,
      answers: {
        webcamPermission: JSON.stringify({
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
          // camera capture settings (no device name)
          camera: (() => {
            const tr = gazeTracker.getStream()?.getVideoTracks()[0]?.getSettings();
            return tr ? { width: tr.width ?? null, height: tr.height ?? null, frameRate: tr.frameRate ?? null } : null;
          })(),
        }),
      },
    });
  }, [faceSeen, setAnswer, gazeTracker.state]); // eslint-disable-line react-hooks/exhaustive-deps

  const { state, error } = gazeTracker;
  const busy = state === 'starting';

  return (
    <Box p="md" maw={760}>
      <Title order={2}>Camera Setup</Title>
      <Text mt="sm">
        The final task uses your <strong>webcam</strong> to estimate where on the screen you are looking.
      </Text>
      <Alert color="blue" mt="sm" title="Nothing is recorded">
        <strong>Your camera video and your screen are never recorded, uploaded, or stored.</strong>
        {' '}
        The video is processed entirely inside your browser and discarded frame by frame. Only numbers
        are saved: the estimated on-screen gaze position and the approximate head position.
      </Alert>
      <Alert color="orange" mt="sm" title="Please keep your head still">
        Eye tracking only works if <strong>your head stays as still as possible</strong> from the
        calibration until the end of the task. Move only your eyes. Leaning, turning, or moving closer
        to the screen makes the measurement inaccurate.
      </Alert>
      <List mt="sm" spacing="xs">
        <List.Item>Sit about an arm&apos;s length (50–70 cm) from the screen, facing it directly, in a position you can hold comfortably.</List.Item>
        <List.Item>Make sure your face is well lit and avoid a bright window behind you.</List.Item>
        <List.Item>Please do not resize or move the browser window from now on.</List.Item>
      </List>

      <Group mt="md">
        <Button onClick={() => { gazeTracker.init().catch(() => undefined); }} disabled={busy || state === 'ready'} loading={busy}>
          {state === 'ready' ? 'Camera enabled' : 'Enable camera'}
        </Button>
        {state === 'error' && (
          <Button variant="light" onClick={() => { gazeTracker.init().catch(() => undefined); }}>Retry</Button>
        )}
      </Group>

      {state === 'error' && (
        <Alert color="red" mt="md" title="Camera could not be started">
          {error}
          <br />
          Check that your browser has camera permission for this site and that no other app is using the camera, then retry.
          {parameters?.failLink && (
            <>
              <br />
              If you cannot enable a camera, you may
              {' '}
              <a href={parameters.failLink}>return the study on Prolific</a>
              .
            </>
          )}
        </Alert>
      )}

      <Box mt="md" style={{ display: state === 'ready' ? 'block' : 'none' }}>
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          style={{
            width: 320, height: 240, border: '1px solid #ccc', transform: 'scaleX(-1)', background: '#000',
          }}
        />
        <Text mt="xs" c={faceSeen && noFaceFor < 3000 ? 'green' : 'orange'}>
          {faceSeen && noFaceFor < 3000
            ? 'Face detected. You can continue.'
            : 'Looking for your face… adjust your position or lighting.'}
        </Text>
      </Box>
      {busy && <Text mt="md" c="dimmed">Loading the eye-tracking model (a few seconds)…</Text>}
    </Box>
  );
}

export default WebcamPermission;
