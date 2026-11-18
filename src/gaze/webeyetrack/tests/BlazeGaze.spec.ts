import * as tf from '@tensorflow/tfjs';
import {
  afterEach, describe, expect, test, vi,
} from 'vitest';
import { BlazeGaze } from '../BlazeGaze';

vi.mock('@tensorflow/tfjs', () => ({ loadLayersModel: vi.fn() }));

function fakeModel(output: unknown) {
  const encoder = { trainable: true };
  return {
    encoder,
    getLayer: vi.fn(() => encoder),
    predict: vi.fn(() => output),
    dispose: vi.fn(),
  };
}

afterEach(() => { vi.mocked(tf.loadLayersModel).mockReset(); });

describe('BlazeGaze', () => {
  test('freezes the CNN encoder and disposes the previous model on reload', async () => {
    const first = fakeModel('a');
    const second = fakeModel('b');
    vi.mocked(tf.loadLayersModel)
      .mockResolvedValueOnce(first as unknown as tf.LayersModel)
      .mockResolvedValueOnce(second as unknown as tf.LayersModel);
    const model = new BlazeGaze();
    await model.load('m.json');
    expect(first.getLayer).toHaveBeenCalledWith('cnn_encoder');
    expect(first.encoder.trainable).toBe(false);
    await model.load('m.json');
    expect(first.dispose).toHaveBeenCalled();
    expect(second.dispose).not.toHaveBeenCalled();
  });

  test('returns the first output of a multi-output model', async () => {
    vi.mocked(tf.loadLayersModel).mockResolvedValue(fakeModel(['gaze', 'other']) as unknown as tf.LayersModel);
    const model = new BlazeGaze();
    await model.load('m.json');
    const t = {} as tf.Tensor;
    expect(model.predict(t, t, t)).toBe('gaze');
  });

  test('refuses to predict before the model is loaded', () => {
    const t = {} as tf.Tensor;
    expect(() => new BlazeGaze().predict(t, t, t)).toThrow('not loaded');
  });
});
