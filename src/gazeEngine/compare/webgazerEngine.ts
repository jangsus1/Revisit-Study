/**
 * WebGazer.js (Brown HCI, GPL-3.0) loaded at runtime from jsDelivr, only on the bench page, so
 * GPL code is never bundled into the study build. Ridge regression on 120-D eye-patch features;
 * calibration = recordScreenPosition(target) on every frame of the fixation window ('click' data).
 * Mouse listeners are removed so UI clicks do not train it; Kalman smoothing is off so the output
 * is comparable to the other engines' raw estimates.
 */
import { GazeEngineBase } from './types';

const VERSION = '3.5.3';
const CDN = `https://cdn.jsdelivr.net/npm/webgazer@${VERSION}/dist`;

type WebGazer = {
  params: Record<string, unknown>;
  begin(): Promise<unknown>;
  end(): WebGazer;
  stopVideo(): WebGazer;
  clearData(): Promise<void>;
  setRegression(r: string): WebGazer;
  setGazeListener(fn: (data: { x: number; y: number } | null, elapsed: number) => void): WebGazer;
  recordScreenPosition(x: number, y: number, type?: string): WebGazer;
  removeMouseEventListeners(): WebGazer;
  getTracker(): { getPositions(): unknown[] | null };
  saveDataAcrossSessions(v: boolean): WebGazer;
  applyKalmanFilter(v: boolean): WebGazer;
  showVideoPreview(v: boolean): WebGazer;
  showPredictionPoints(v: boolean): WebGazer;
  showFaceOverlay(v: boolean): WebGazer;
  showFaceFeedbackBox(v: boolean): WebGazer;
};

let loading: Promise<WebGazer> | undefined;
function loadWebGazer(): Promise<WebGazer> {
  const w = window as unknown as { webgazer?: WebGazer };
  if (w.webgazer) return Promise.resolve(w.webgazer);
  if (!loading) {
    loading = new Promise<WebGazer>((resolve, reject) => {
      const s = document.createElement('script');
      s.src = `${CDN}/webgazer.js`;
      s.async = true;
      s.onload = () => (w.webgazer ? resolve(w.webgazer) : reject(new Error('webgazer global missing')));
      s.onerror = () => { loading = undefined; reject(new Error('could not load webgazer.js from jsDelivr')); };
      document.head.appendChild(s);
    });
  }
  return loading;
}

export class WebGazerEngine extends GazeEngineBase {
  readonly info = {
    id: 'webgazer',
    name: `WebGazer.js ${VERSION}`,
    method: 'MediaPipe face mesh -> 2 eye patches (10x6 grey, equalized) -> ridge regression on calibration dots',
    license: 'GPL-3.0 (loaded from CDN on this page only)',
    color: '#2563eb',
  };

  private wg?: WebGazer;

  private target: [number, number] | null = null;

  private targets = new Set<string>();

  private framesInPoint = 0;

  protected async startImpl() {
    const wg = await loadWebGazer();
    this.wg = wg;
    wg.params.faceMeshSolutionPath = `${CDN}/mediapipe/face_mesh`;
    wg.saveDataAcrossSessions(false)
      .applyKalmanFilter(false)
      .setRegression('ridge')
      .showVideoPreview(false)
      .showPredictionPoints(false)
      .setGazeListener((data) => {
        const t = performance.now();
        // predict() returns null until the first sample is stored, so gate on face landmarks instead
        if (this.target && wg.getTracker().getPositions()) {
          wg.recordScreenPosition(this.target[0], this.target[1], 'click');
          this.framesInPoint += 1;
        }
        if (!data) { this.emit(t, NaN, NaN, false); return; }
        this.emit(t, data.x, data.y, this.targets.size > 0);
      });
    await wg.begin();
    wg.removeMouseEventListeners();
    wg.showVideoPreview(false).showPredictionPoints(false).showFaceOverlay(false).showFaceFeedbackBox(false);
  }

  protected stopImpl() {
    try { this.wg?.end(); } catch { /* already ended */ }
    try { this.wg?.stopVideo(); } catch { /* no video */ }
    this.targets.clear();
  }

  protected async resetImpl() {
    this.targets.clear();
    await this.wg?.clearData();
  }

  beginPoint(x: number, y: number) {
    this.target = [x, y];
    this.framesInPoint = 0;
  }

  async endPoint() {
    if (this.target && this.framesInPoint > 0) this.targets.add(this.target.map(Math.round).join(','));
    this.target = null;
    this.calibTargets = this.targets.size;
  }
}
