import {
  afterEach, beforeEach, describe, expect, test, vi,
} from 'vitest';
import { VideoFrameSource } from '../VideoFrameSource';

let ticks: (() => void)[] = [];
const drawImage = vi.fn();
const getImageData = vi.fn((_x: number, _y: number, w: number, h: number) => ({ width: w, height: h }));

function fakeVideo() {
  return {
    videoWidth: 640, videoHeight: 480, paused: false, currentTime: 0,
  } as unknown as HTMLVideoElement;
}

function runTick() {
  const tick = ticks.shift();
  tick?.();
}

beforeEach(() => {
  ticks = [];
  vi.stubGlobal('requestAnimationFrame', (cb: () => void) => { ticks.push(cb); return ticks.length; });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage, getImageData } as never);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('VideoFrameSource', () => {
  test('calls back once per new video frame', () => {
    const video = fakeVideo();
    const onFrame = vi.fn();
    new VideoFrameSource(video).start(onFrame);

    (video as { currentTime: number }).currentTime = 0.033;
    runTick();
    runTick();
    expect(onFrame).toHaveBeenCalledTimes(1);

    (video as { currentTime: number }).currentTime = 0.066;
    runTick();
    expect(onFrame).toHaveBeenCalledTimes(2);
  });

  test('stops calling back after stop()', () => {
    const video = fakeVideo();
    const onFrame = vi.fn();
    const source = new VideoFrameSource(video);
    source.start(onFrame);
    source.stop();
    (video as { currentTime: number }).currentTime = 1;
    runTick();
    expect(onFrame).not.toHaveBeenCalled();
    expect(ticks).toHaveLength(0);
  });

  test('captures the full video frame', () => {
    const frame = new VideoFrameSource(fakeVideo()).capture();
    expect(drawImage).toHaveBeenCalled();
    expect(frame).toEqual({ width: 640, height: 480 });
  });
});
