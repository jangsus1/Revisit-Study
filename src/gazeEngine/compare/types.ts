/**
 * Common interface for the gaze-tracker comparison bench (gaze_playground).
 *
 * Every webcam tracker we compare follows the same calibration mechanism: while the participant
 * fixates a known screen target, the tracker pairs its per-frame eye features with that target,
 * then fits a mapping (ridge / linear / affine / few-shot CNN) from features to screen position.
 * Each adapter exposes exactly that: beginPoint(target) -> collect -> endPoint(), per dot; then
 * finishCalibration() fits once all dots are done (so no dot waits on the fit). Smooth pursuit uses
 * beginPursuit(targetAt) / endPursuit() instead: every frame is paired with the moving dot's position.
 * All coordinates are viewport CSS pixels.
 */

export type EngineSample = {
  t: number;       // performance.now() when the frame was captured (or processed)
  x: number;       // viewport px, unsmoothed output of the engine, drift offset applied
  y: number;
  valid: boolean;  // face found, eyes open, engine calibrated
};

export type EngineState = 'idle' | 'starting' | 'ready' | 'error';

export type EngineInfo = {
  id: string;
  name: string;
  method: string;   // one line: features + mapping
  license: string;
  color: string;
};

/** Where the participant should be looking at frame time t (viewport px), or null to skip the frame. */
export type TargetFn = (t: number) => [number, number] | null;

type Listener = (s: EngineSample) => void;

export abstract class GazeEngineBase {
  abstract readonly info: EngineInfo;

  state: EngineState = 'idle';

  error?: string;

  /** Drift correction in px added to every output (the same generic fix for every engine). */
  offset: [number, number] = [0, 0];

  /** Number of calibration targets used by the current fit. */
  calibTargets = 0;

  private listeners = new Set<Listener>();

  private stateListeners = new Set<() => void>();

  private times: number[] = [];

  private startPromise?: Promise<void>;

  start(): Promise<void> {
    if (this.startPromise) return this.startPromise;
    this.setState('starting');
    this.startPromise = this.startImpl()
      .then(() => this.setState('ready'))
      .catch((e: unknown) => {
        this.error = e instanceof Error ? e.message : String(e);
        this.setState('error');
        this.startPromise = undefined;
        throw e;
      });
    return this.startPromise;
  }

  stop(): void {
    this.stopImpl();
    this.startPromise = undefined;
    this.calibTargets = 0;
    this.offset = [0, 0];
    this.setState('idle');
  }

  async reset(): Promise<void> {
    this.offset = [0, 0];
    this.calibTargets = 0;
    await this.resetImpl();
  }

  /** Start pairing frames with the target (viewport px) the participant is looking at. */
  abstract beginPoint(x: number, y: number): void;

  /** Stop collecting for the current target (cheap: no fitting while a dot is on screen). */
  abstract endPoint(): Promise<void>;

  /**
   * Smooth-pursuit (continuous) calibration: from now on pair every frame with targetAt(frame time).
   * The caller builds lag compensation and the excluded catch-up window into targetAt.
   */
  abstract beginPursuit(targetAt: TargetFn): void;

  /** Stop pairing frames with the moving target (fit happens in finishCalibration). */
  abstract endPursuit(): Promise<void>;

  /** Fit the mapping to every collected point; called once after the last calibration dot. */
  abstract finishCalibration(): Promise<void>;

  protected abstract startImpl(): Promise<void>;

  protected abstract stopImpl(): void;

  protected abstract resetImpl(): Promise<void>;

  protected emit(t: number, x: number, y: number, valid: boolean) {
    const s: EngineSample = {
      t, x: x + this.offset[0], y: y + this.offset[1], valid: valid && Number.isFinite(x) && Number.isFinite(y),
    };
    this.times.push(t);
    if (this.times.length > 60) this.times.shift();
    this.listeners.forEach((fn) => fn(s));
  }

  get hz(): number {
    const n = this.times.length;
    if (n < 2) return 0;
    const span = this.times[n - 1] - this.times[0];
    return span > 0 ? ((n - 1) * 1000) / span : 0;
  }

  onSample(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }

  onStateChange(fn: () => void): () => void {
    this.stateListeners.add(fn);
    return () => { this.stateListeners.delete(fn); };
  }

  protected setState(s: EngineState) {
    this.state = s;
    if (s !== 'error') this.error = undefined;
    this.stateListeners.forEach((fn) => fn());
  }
}
