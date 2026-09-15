// @ts-nocheck
// Vendored from RedForestAI/WebEyeTrack (MIT) and modified for reVISit:
//  - takes an HTMLVideoElement instead of an element id
//  - getUserMedia failures reject instead of being swallowed
//  - double-start guard, getStream(), clean stop
import { convertVideoFrameToImageData } from './utils/misc';

export default class WebcamClient {
    private videoElement: HTMLVideoElement;
    private stream?: MediaStream;
    private frameCallback?: (frame: ImageData, timestamp: number) => Promise<void>;
    private running = false;

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
        const process = async () => {
            if (!this.running) return;
            if (!this.videoElement || this.videoElement.paused || this.videoElement.ended || this.videoElement.videoWidth === 0) {
                requestAnimationFrame(process);
                return;
            }
            const imageData = convertVideoFrameToImageData(this.videoElement);
            if (this.frameCallback) {
                await this.frameCallback(imageData, this.videoElement.currentTime);
            }
            requestAnimationFrame(process);
        };
        requestAnimationFrame(process);
    }
}
