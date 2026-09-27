/**
 * RealEye Webcam EyeTracker Light Open (RealEye sp. z o.o., 2025-26; AGPL-3.0 or a no-fee
 * commercial license for academic projects), loaded at runtime from jsDelivr's ESM build so the
 * AGPL code is not bundled into the study. Features per frame: 15 landmarks + 22 blendshapes +
 * two 40x20 eye crops (1,653 values, +-1 px augmentation during calibration), ridge regression,
 * head-pose compensation relative to the calibration pose. Its own UI uses 17 dots x 5 frames;
 * here it gets the same dots as every other engine, up to MAX_FRAMES frames per dot.
 */
import { GazeEngineBase } from './types';

const URL_ESM = 'https://cdn.jsdelivr.net/npm/@realeye-io/webcam-eyetracker-light-open@1.1.0/+esm';
// The ESM build resolves @mediapipe/tasks-vision 0.10.35; the library's default wasm is 0.10.18.
const WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm';
const MAX_FRAMES = 8;

type Detection = unknown;
type Tracker = {
  initialize(): Promise<void>;
  detectFace(img: ImageData): Detection | null;
  predictWithDetection(img: ImageData, d: Detection): { x: number; y: number };
  calibrate(samples: { image: ImageData; gazeX: number; gazeY: number }[]): void;
  dispose?: () => void;
};

export class RealEyeEngine extends GazeEngineBase {
  readonly info = {
    id: 'realeye',
    name: 'RealEye Light 1.1',
    method: 'MediaPipe landmarks + blendshapes + 2 eye crops (1,653 features) -> ridge, head-pose compensation',
    license: 'AGPL-3.0 / free academic licence (loaded from CDN on this page only)',
    color: '#ea580c',
  };

  private tracker?: Tracker;

  private video?: HTMLVideoElement;

  private stream?: MediaStream;

  private ctx?: CanvasRenderingContext2D;

  private running = false;

  private lastTime = -1;

  private target: [number, number] | null = null;

  private frameInPoint = 0;

  private samples: { image: ImageData; gazeX: number; gazeY: number }[] = [];

  private targets = new Set<string>();

  private fitted = false;

  protected async startImpl() {
    const mod = await import(/* @vite-ignore */ URL_ESM) as { WebcamETLight: new (cfg: object) => Tracker };
    const make = async (delegate: 'GPU' | 'CPU') => {
      const t = new mod.WebcamETLight({
        delegate, runningMode: 'IMAGE', wasmPath: WASM, faceDetectorMode: 'landmarker',
      });
      await t.initialize();
      return t;
    };
    const tracker = await make('GPU').catch(() => make('CPU'));
    this.tracker = tracker;
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }, audio: false,
    });
    const v = document.createElement('video');
    v.muted = true;
    v.playsInline = true;
    v.autoplay = true;
    Object.assign(v.style, {
      position: 'fixed', width: '1px', height: '1px', opacity: '0', pointerEvents: 'none', top: '0', right: '0',
    });
    document.body.appendChild(v);
    v.srcObject = this.stream;
    await new Promise<void>((resolve) => {
      if (v.readyState >= 2) resolve(); else v.addEventListener('loadeddata', () => resolve(), { once: true });
    });
    try { await v.play(); } catch { /* muted autoplay */ }
    const canvas = document.createElement('canvas');
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    this.ctx = canvas.getContext('2d', { willReadFrequently: true }) ?? undefined;
    this.video = v;
    this.running = true;
    this.loop();
  }

  private loop = () => {
    const v = this.video;
    if (!this.running || !v || !this.ctx || !this.tracker) return;
    const next = () => {
      if (!this.running) return;
      if ('requestVideoFrameCallback' in v) v.requestVideoFrameCallback(this.loop);
      else requestAnimationFrame(this.loop);
    };
    if (v.videoWidth === 0 || v.currentTime === this.lastTime) { next(); return; }
    this.lastTime = v.currentTime;
    const t = performance.now();
    try {
      this.ctx.drawImage(v, 0, 0, this.ctx.canvas.width, this.ctx.canvas.height);
      const img = this.ctx.getImageData(0, 0, this.ctx.canvas.width, this.ctx.canvas.height);
      const det = this.tracker.detectFace(img);
      if (det && this.target && this.frameInPoint < MAX_FRAMES) {
        this.frameInPoint += 1;
        this.samples.push({ image: img, gazeX: this.target[0], gazeY: this.target[1] });
      }
      if (det && this.fitted) {
        const p = this.tracker.predictWithDetection(img, det);
        this.emit(t, p.x, p.y, true);
      } else {
        this.emit(t, NaN, NaN, false);
      }
    } catch (e) {
      console.warn('[RealEyeEngine]', e);
      this.emit(t, NaN, NaN, false);
    }
    next();
  };

  protected stopImpl() {
    this.running = false;
    this.stream?.getTracks().forEach((tr) => tr.stop());
    this.stream = undefined;
    this.video?.remove();
    this.video = undefined;
    try { this.tracker?.dispose?.(); } catch { /* ignore */ }
    this.tracker = undefined;
    this.clear();
  }

  protected async resetImpl() { this.clear(); }

  private clear() {
    this.samples = [];
    this.targets.clear();
    this.fitted = false;
    this.lastTime = -1;
  }

  beginPoint(x: number, y: number) {
    this.target = [x, y];
    this.frameInPoint = 0;
  }

  async endPoint() {
    if (this.target && this.frameInPoint > 0) this.targets.add(this.target.map(Math.round).join(','));
    this.target = null;
    this.calibTargets = this.targets.size;
  }

  async finishCalibration() {
    if (this.tracker && this.targets.size >= 3 && this.samples.length >= 5) {
      this.tracker.calibrate(this.samples);
      this.fitted = true;
    }
  }
}
