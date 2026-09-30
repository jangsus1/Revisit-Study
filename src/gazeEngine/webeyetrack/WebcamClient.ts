// @ts-nocheck
// Vendored from RedForestAI/WebEyeTrack (MIT) and modified for reVISit:
//  - takes an HTMLVideoElement instead of an element id
//  - getUserMedia failures reject instead of being swallowed
//  - double-start guard, getStream(), clean stop
//  - each video frame is processed once (requestVideoFrameCallback, or skip unchanged currentTime):
//    on 120 Hz displays the rAF loop otherwise re-processed the same 30 fps frame ~4 times
import { convertVideoFrameToImageData } from './utils/misc';

export default class WebcamClient {
    private videoElement: HTMLVideoElement;
    private stream?: MediaStream;
    private frameCallback?: (frame: ImageData, timestamp: number) => Promise<void>;
    private running = false;
    private lastTime = -1;

    constructor(videoElement: HTMLVideoElement) {
        this.videoElement = videoElement;
    }

    getStream(): MediaStream | undefined {
        return this.stream;
    }

    async startWebcam(frameCallback?: (frame: ImageData, timestamp: number) => Promise<void>): Promise<void> {
        if (frameCallback) this.frameCallback = frameCallback;
        if (this.running) return;

        const constraints: MediaStreamConstraints = {
            video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
            audio: false,
        };
        // Throws (NotAllowedError / NotFoundError ...) for the caller to surface.
        this.stream = await navigator.mediaDevices.getUserMedia(constraints);
        this.videoElement.srcObject = this.stream;
        this.running = true;

        await new Promise<void>((resolve) => {
            if (this.videoElement.readyState >= 2) { resolve(); return; }
            this.videoElement.addEventListener('loadeddata', () => resolve(), { once: true });
        });
        try { await this.videoElement.play(); } catch { /* autoplay muted video; ignore */ }
        this._processFrames();
    }

    stopWebcam(): void {
        this.running = false;
        if (this.stream) {
            this.stream.getTracks().forEach((track) => track.stop());
            this.stream = undefined;
        }
        this.videoElement.srcObject = null;
    }

    private _processFrames(): void {
        const v = this.videoElement;
        const next = () => {
            if (!this.running) return;
            if (v && 'requestVideoFrameCallback' in v) (v as any).requestVideoFrameCallback(() => { process(); });
            else requestAnimationFrame(process);
        };
        const process = async () => {
            if (!this.running) return;
            if (!v || v.paused || v.ended || v.videoWidth === 0 || v.currentTime === this.lastTime) {
                // no new frame yet (rVFC normally only fires on new frames; the check covers rAF)
                if (!v || v.paused || v.ended || v.videoWidth === 0) requestAnimationFrame(process); else next();
                return;
            }
            this.lastTime = v.currentTime;
            const imageData = convertVideoFrameToImageData(v);
            if (this.frameCallback) {
                await this.frameCallback(imageData, v.currentTime);
            }
            next();
        };
        requestAnimationFrame(process);
    }
}
