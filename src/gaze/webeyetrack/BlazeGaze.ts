import * as tf from '@tensorflow/tfjs';

/** The BlazeGaze network: eye patch, head direction and face origin in, normalized gaze out. */
export class BlazeGaze {
  private model: tf.LayersModel | null = null;

  async load(modelUrl: string): Promise<void> {
    const model = await tf.loadLayersModel(modelUrl);
    model.getLayer('cnn_encoder').trainable = false;
    this.model?.dispose();
    this.model = model;
  }

  predict(eyePatches: tf.Tensor, headVectors: tf.Tensor, faceOrigins: tf.Tensor): tf.Tensor {
    if (!this.model) throw new Error('BlazeGaze model is not loaded');
    const out = this.model.predict([eyePatches, headVectors, faceOrigins]);
    return Array.isArray(out) ? out[0] : out;
  }

  dispose(): void {
    this.model?.dispose();
    this.model = null;
  }
}
