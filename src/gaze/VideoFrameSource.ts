/** Calls back once per new frame of a playing video and captures frames as ImageData on request. */
export class VideoFrameSource {
  private readonly canvas = document.createElement('canvas');

  private readonly context = this.canvas.getContext('2d', { willReadFrequently: true });

  private running = false;

  private lastTime = -1;

  constructor(private readonly video: HTMLVideoElement) {}

  start(onFrame: () => void): void {
    if (this.running) return;
    this.running = true;
    const tick = () => {
      if (!this.running) return;
      const v = this.video;
      if (v.videoWidth > 0 && !v.paused && v.currentTime !== this.lastTime) {
        this.lastTime = v.currentTime;
        onFrame();
      }
      this.schedule(tick);
    };
    this.schedule(tick);
  }

  capture(): ImageData {
    if (!this.context) throw new Error('2D canvas is not available');
    const { videoWidth: width, videoHeight: height } = this.video;
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    this.context.drawImage(this.video, 0, 0);
    return this.context.getImageData(0, 0, width, height);
  }

  stop(): void {
    this.running = false;
  }

  private schedule(tick: () => void): void {
    if (typeof this.video.requestVideoFrameCallback === 'function' && !this.video.paused) {
      this.video.requestVideoFrameCallback(tick);
    } else {
      requestAnimationFrame(tick);
    }
  }
}
