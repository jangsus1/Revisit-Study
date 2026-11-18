import {
  describe, expect, test, vi,
} from 'vitest';
import { createGazeEngine } from '../createGazeEngine';
import { WebEyeTrackEngine } from '../webeyetrack/WebEyeTrackEngine';

vi.mock('../webeyetrack/WebEyeTrackEngine', () => ({
  WebEyeTrackEngine: vi.fn(class MockWebEyeTrackEngine {
    constructor(readonly modelUrl: string) {}
  }),
}));

describe('createGazeEngine', () => {
  test('creates WebEyeTrack with an absolute model URL by default', () => {
    createGazeEngine();
    expect(WebEyeTrackEngine).toHaveBeenCalledWith(`${window.location.origin}/revisitAssets/webeyetrack/model.json`);
  });

  test('rejects an engine that is not available', () => {
    expect(() => createGazeEngine('realeye')).toThrow('not available');
  });
});
