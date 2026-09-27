/**
 * One MediaPipe FaceLandmarker (478 landmarks incl. irises + head transform) on the main thread,
 * shared by the landmark-regression engines so the face is only detected once per video frame.
 * Opens its own camera stream (browsers let several getUserMedia calls share one camera).
 */
import type { FaceLandmarker } from '@mediapipe/tasks-vision';

// Same wasm version as the installed @mediapipe/tasks-vision (see FaceLandmarkerClient.ts).
const WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm';
const MODEL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

export type FaceFrame = {
  t: number;
  w: number;                       // video size in px
  h: number;
  lm: { x: number; y: number; z: number }[] | null;   // normalized [0, 1] image coords
  matrix: number[] | null;         // 4x4 facial transformation, column-major (cm)
};

type Listener = (f: FaceFrame) => void;

class FaceLandmarkSource {
  private landmarker?: FaceLandmarker;

  private video?: HTMLVideoElement;

  private stream?: MediaStream;

  private listeners = new Set<Listener>();

  private running = false;

  private startPromise?: Promise<void>;

  private lastTime = -1;

  start(): Promise<void> {
    if (!this.startPromise) {
      this.startPromise = this.doStart().catch((e) => { this.startPromise = undefined; this.teardown(); throw e; });
    }
    return this.startPromise;
  }

  private async doStart() {
    const { FaceLandmarker: FL, FilesetResolver } = await import('@mediapipe/tasks-vision');
    const files = await FilesetResolver.forVisionTasks(WASM);
    this.landmarker = await FL.createFromOptions(files, {
      baseOptions: { modelAssetPath: MODEL, delegate: 'GPU' },
      outputFacialTransformationMatrixes: true,
      runningMode: 'VIDEO',
      numFaces: 1,
    });
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }, audio: false,
    });
    const v = document.createElement('video');
    v.muted = true;
    v.playsInline = true;
    v.autoplay = true;
    Object.assign(v.style, {
      position: 'fixed', width: '1px', height: '1px', opacity: '0', pointerEvents: 'none', bottom: '0', left: '0',
    });
    document.body.appendChild(v);
    v.srcObject = this.stream;
    await new Promise<void>((resolve) => {
      if (v.readyState >= 2) resolve(); else v.addEventListener('loadeddata', () => resolve(), { once: true });
    });
    try { await v.play(); } catch { /* muted autoplay */ }
    this.video = v;
    this.running = true;
    this.loop();
  }

  private loop = () => {
    if (!this.running || !this.video || !this.landmarker) return;
    const v = this.video;
    const next = () => {
      if (!this.running) return;
      if ('requestVideoFrameCallback' in v) v.requestVideoFrameCallback(this.loop);
      else requestAnimationFrame(this.loop);
    };
    if (v.videoWidth === 0 || v.currentTime === this.lastTime) { next(); return; }
    this.lastTime = v.currentTime;
    const t = performance.now();
    try {
      const r = this.landmarker.detectForVideo(v, t);
      const frame: FaceFrame = {
        t,
        w: v.videoWidth,
        h: v.videoHeight,
        lm: r.faceLandmarks?.[0] ?? null,
        matrix: r.facialTransformationMatrixes?.[0]?.data ? Array.from(r.facialTransformationMatrixes[0].data) : null,
      };
      this.listeners.forEach((fn) => fn(frame));
    } catch (e) {
      console.warn('[FaceLandmarkSource]', e);
    }
    next();
  };

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
      if (this.listeners.size === 0) this.stop();
    };
  }

  getStream() { return this.stream; }

  stop() {
    this.teardown();
    this.startPromise = undefined;
  }

  private teardown() {
    this.running = false;
    this.stream?.getTracks().forEach((tr) => tr.stop());
    this.stream = undefined;
    this.video?.remove();
    this.video = undefined;
    this.landmarker?.close();
    this.landmarker = undefined;
    this.lastTime = -1;
  }
}

export const faceSource = new FaceLandmarkSource();
