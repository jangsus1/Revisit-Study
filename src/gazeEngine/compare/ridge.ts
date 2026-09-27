/**
 * Small ridge regression for the landmark-based engines: features are standardized (with a floor
 * on the scale so near-constant features such as head pose during calibration are not blown up),
 * the intercept is not penalized, and both screen axes are fitted at once.
 */

function solve(A: number[][], b: number[][]): number[][] {
  // Gaussian elimination with partial pivoting; A is n x n, b is n x k.
  const n = A.length;
  const k = b[0].length;
  const M = A.map((row, i) => [...row, ...b[i]]);
  for (let c = 0; c < n; c += 1) {
    let p = c;
    for (let r = c + 1; r < n; r += 1) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    const d = M[c][c] || 1e-12;
    for (let j = c; j < n + k; j += 1) M[c][j] /= d;
    for (let r = 0; r < n; r += 1) {
      if (r !== c && M[r][c] !== 0) {
        const f = M[r][c];
        for (let j = c; j < n + k; j += 1) M[r][j] -= f * M[c][j];
      }
    }
  }
  return M.map((row) => row.slice(n));
}

export class RidgeMap {
  private mean: number[] = [];

  private scale: number[] = [];

  private W: number[][] = [];   // d x 2

  private b: [number, number] = [0, 0];

  fitted = false;

  constructor(private lambda = 1e-2, private scaleFloor: number[] | number = 1e-6) {}

  fit(X: number[][], Y: number[][]): void {
    const n = X.length;
    const d = X[0]?.length ?? 0;
    if (n < 2 || d === 0) { this.fitted = false; return; }
    this.mean = Array.from({ length: d }, (_, j) => X.reduce((a, r) => a + r[j], 0) / n);
    this.scale = Array.from({ length: d }, (_, j) => {
      const v = X.reduce((a, r) => a + (r[j] - this.mean[j]) ** 2, 0) / n;
      const floor = Array.isArray(this.scaleFloor) ? this.scaleFloor[j] ?? 1e-6 : this.scaleFloor;
      return Math.max(Math.sqrt(v), floor);
    });
    const Z = X.map((r) => r.map((v, j) => (v - this.mean[j]) / this.scale[j]));
    const ym: [number, number] = [Y.reduce((a, r) => a + r[0], 0) / n, Y.reduce((a, r) => a + r[1], 0) / n];
    const A = Array.from({ length: d }, (_, i) => Array.from({ length: d }, (__, j) => {
      let s = 0;
      for (let r = 0; r < n; r += 1) s += Z[r][i] * Z[r][j];
      return s + (i === j ? this.lambda * n : 0);
    }));
    const B = Array.from({ length: d }, (_, i) => [0, 1].map((c) => {
      let s = 0;
      for (let r = 0; r < n; r += 1) s += Z[r][i] * (Y[r][c] - ym[c]);
      return s;
    }));
    this.W = solve(A, B);
    this.b = ym;
    this.fitted = true;
  }

  predict(x: number[]): [number, number] {
    if (!this.fitted) return [NaN, NaN];
    let px = this.b[0];
    let py = this.b[1];
    for (let j = 0; j < x.length; j += 1) {
      const z = (x[j] - this.mean[j]) / this.scale[j];
      px += z * this.W[j][0];
      py += z * this.W[j][1];
    }
    return [px, py];
  }
}
