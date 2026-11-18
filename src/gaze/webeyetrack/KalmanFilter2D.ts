import { Matrix, inverse } from 'ml-matrix';

/** Constant-velocity Kalman filter over a 2D point. */
export class KalmanFilter2D {
  private x = Matrix.zeros(4, 1);

  private p = Matrix.eye(4);

  private readonly f: Matrix;

  private readonly h = new Matrix([[1, 0, 0, 0], [0, 1, 0, 0]]);

  private readonly q: Matrix;

  private readonly r: Matrix;

  constructor(dt = 1, processNoise = 1e-4, measurementNoise = 1e-2) {
    this.f = new Matrix([[1, 0, dt, 0], [0, 1, 0, dt], [0, 0, 1, 0], [0, 0, 0, 1]]);
    this.q = Matrix.eye(4).mul(processNoise);
    this.r = Matrix.eye(2).mul(measurementNoise);
  }

  step([zx, zy]: number[]): [number, number] {
    this.x = this.f.mmul(this.x);
    this.p = this.f.mmul(this.p).mmul(this.f.transpose()).add(this.q);
    const innovation = new Matrix([[zx], [zy]]).sub(this.h.mmul(this.x));
    const s = this.h.mmul(this.p).mmul(this.h.transpose()).add(this.r);
    const k = this.p.mmul(this.h.transpose()).mmul(inverse(s));
    this.x = this.x.add(k.mmul(innovation));
    this.p = Matrix.eye(4).sub(k.mmul(this.h)).mmul(this.p);
    return [this.x.get(0, 0), this.x.get(1, 0)];
  }
}
