// @ts-nocheck
import * as tf from '@tensorflow/tfjs';

// References
// https://js.tensorflow.org/api/latest/#class:LayersModel

export default class BlazeGaze {
    // private model: tf.GraphModel | null = null;
    private model: tf.LayersModel | null = null;  // Use LayersModel for tf.loadLayersModel

    constructor() {
        // Optionally trigger model load in constructor
    }

    async loadModel(baseUrl: string = self.location.origin): Promise<void> {
        const path = `${baseUrl.replace(/\/$/, '')}/web/model.json`;
        try {
            // Load model from local directory (adjust path if needed)
            const fresh = await tf.loadLayersModel(path);
            if (this.model) this.model.dispose();
            this.model = fresh;
            console.log('✅ BlazeGaze model loaded successfully');
        } catch (error) {
            console.error('❌ Error loading BlazeGaze model from path:', path);
            console.error(error);
            throw error;
        }
        
        // Freeze the ``cnn_model`` layers but keep the gaze_MLP trainable
        this.model.getLayer('cnn_encoder').trainable = false;
    }

    getWeights(): tf.Tensor[] {
        if (!this.model) throw new Error('Model not loaded. Call loadModel() first.');
        return this.model.getWeights();
    }

    setWeights(weights: tf.Tensor[]): void {
        if (!this.model) throw new Error('Model not loaded. Call loadModel() first.');
        this.model.setWeights(weights);
    }

    predict(image: tf.Tensor, head_vector: tf.Tensor, face_origin_3d: tf.Tensor): tf.Tensor {
        if (!this.model) {
            throw new Error('Model not loaded. Call loadModel() first.');
        }

        const inputList: tf.Tensor[] = [image, head_vector, face_origin_3d];

        // Run inference
        const output = this.model.predict(inputList) as tf.Tensor | tf.Tensor[];  // GraphModel always returns Tensor or Tensor[]

        if (Array.isArray(output)) {
            return output[0];  // Return the first tensor if multiple
        }

        return output;
    }
}
