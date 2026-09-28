/**
 * Ridge regression in dual form for wide feature matrices (n rows << p = 1,653 features):
 *   w = X' (X X' + lambda I)^-1 y
 * Same solution as RealEye's primal ridgeOptimized ((X'X + lambda I) w = X'y), checked to ~1e-9, but
 * O(n^2 p) instead of O(n p^2 + p^3): ~0.15 s for 400 rows and ~0.7 s for 900 rows instead of 3-5 s,
 * and both screen axes share one Cholesky factorization. Float64 Gram matrix.
 */

function gram(X: Float32Array[]): Float64Array {
  const n = X.length;
  const p = X[0].length;
  const G = new Float64Array(n * n);
  for (let i = 0; i < n; i += 1) {
    const a = X[i];
    for (let j = 0; j <= i; j += 1) {
      const b = X[j];
      let s = 0;
      for (let k = 0; k < p; k += 1) s += a[k] * b[k];
      G[i * n + j] = s;
      G[j * n + i] = s;
    }
  }
  return G;
}

function cholesky(A: Float64Array, n: number): void {
  for (let j = 0; j < n; j += 1) {
    let s = A[j * n + j];
    for (let k = 0; k < j; k += 1) s -= A[j * n + k] * A[j * n + k];
    if (!(s > 0)) throw new Error('ridge: matrix not positive definite');
    const d = Math.sqrt(s);
    A[j * n + j] = d;
    for (let i = j + 1; i < n; i += 1) {
      let t = A[i * n + j];
      for (let k = 0; k < j; k += 1) t -= A[i * n + k] * A[j * n + k];
      A[i * n + j] = t / d;
    }
  }
}

function cholSolve(L: Float64Array, n: number, b: ArrayLike<number>): Float64Array {
  const y = new Float64Array(n);
  for (let i = 0; i < n; i += 1) {
    let s = b[i];
    for (let k = 0; k < i; k += 1) s -= L[i * n + k] * y[k];
    y[i] = s / L[i * n + i];
  }
  const x = new Float64Array(n);
  for (let i = n - 1; i >= 0; i -= 1) {
    let s = y[i];
    for (let k = i + 1; k < n; k += 1) s -= L[k * n + i] * x[k];
    x[i] = s / L[i * n + i];
  }
  return x;
}

/** Fit one weight vector per target column (e.g. [xs, ys]). */
export function ridgeDual(X: Float32Array[], targets: number[][], lambda: number): Float64Array[] {
  const n = X.length;
  const p = X[0].length;
  const G = gram(X);
  for (let i = 0; i < n; i += 1) G[i * n + i] += lambda;
  cholesky(G, n);
  return targets.map((y) => {
    const a = cholSolve(G, n, y);
    const w = new Float64Array(p);
    for (let i = 0; i < n; i += 1) {
      const r = X[i];
      const ai = a[i];
      for (let k = 0; k < p; k += 1) w[k] += ai * r[k];
    }
    return w;
  });
}

export function dot(w: Float64Array, x: ArrayLike<number>): number {
  let s = 0;
  for (let k = 0; k < w.length; k += 1) s += w[k] * x[k];
  return s;
}
