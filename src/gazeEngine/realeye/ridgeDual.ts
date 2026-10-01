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

/** Inverse of a lower-triangular Cholesky factor (row-major n x n, lower part). */
function lowerInverse(L: Float64Array, n: number): Float64Array {
  const M = new Float64Array(n * n);
  for (let j = 0; j < n; j += 1) {
    M[j * n + j] = 1 / L[j * n + j];
    for (let i = j + 1; i < n; i += 1) {
      let s = 0;
      for (let k = j; k < i; k += 1) s += L[i * n + k] * M[k * n + j];
      M[i * n + j] = -s / L[i * n + i];
    }
  }
  return M;
}

/** Solve the small dense system B x = b in place (Gaussian elimination with partial pivoting). */
function solveSmall(B: Float64Array, m: number, bs: Float64Array[]): Float64Array[] {
  const A = B.slice();
  const rhs = bs.map((b) => b.slice());
  for (let c = 0; c < m; c += 1) {
    let piv = c;
    for (let r = c + 1; r < m; r += 1) if (Math.abs(A[r * m + c]) > Math.abs(A[piv * m + c])) piv = r;
    if (piv !== c) {
      for (let k = 0; k < m; k += 1) { const t = A[c * m + k]; A[c * m + k] = A[piv * m + k]; A[piv * m + k] = t; }
      rhs.forEach((b) => { const t = b[c]; b[c] = b[piv]; b[piv] = t; });
    }
    const d = A[c * m + c];
    for (let r = c + 1; r < m; r += 1) {
      const f = A[r * m + c] / d;
      if (f === 0) continue;
      for (let k = c; k < m; k += 1) A[r * m + k] -= f * A[c * m + k];
      rhs.forEach((b) => { b[r] -= f * b[c]; });
    }
  }
  return rhs.map((b) => {
    const x = new Float64Array(m);
    for (let r = m - 1; r >= 0; r -= 1) {
      let s = b[r];
      for (let k = r + 1; k < m; k += 1) s -= A[r * m + k] * x[k];
      x[r] = s / A[r * m + r];
    }
    return x;
  });
}

export type RidgeCV = { W: Float64Array[]; lambda: number; cv: { lambda: number; err: number }[] };

/**
 * Ridge with lambda chosen by leave-one-group-out cross-validation (2026-09-30). With lambda ~0 the dual
 * solution interpolates the training rows, and as the row count approaches the feature count the weights blow
 * up and predictions get noisy (pilots 3 and 4: fixation noise doubled after pooled refits with 1,050-1,320
 * rows vs 1,653 features). Held-out residuals of a group g come from one factorization per lambda:
 *   alpha = (G + lambda I)^-1 y,  y_g - yhat_g(without g) = [(G + lambda I)^-1]_gg^-1 alpha_g.
 * groups[i] = group of row i (calibration entry); the error is the mean Euclidean held-out error over rows.
 */
export function ridgeDualCV(X: Float32Array[], targets: number[][], groups: number[], lambdas: number[]): RidgeCV {
  const n = X.length;
  const p = X[0].length;
  const G0 = gram(X);
  const byGroup = new Map<number, number[]>();
  groups.forEach((g, i) => { if (!byGroup.has(g)) byGroup.set(g, []); byGroup.get(g)!.push(i); });
  let best: { lambda: number; err: number; alphas: Float64Array[] } | null = null;
  const cv: { lambda: number; err: number }[] = [];
  lambdas.forEach((lambda) => {
    const L = G0.slice();
    for (let i = 0; i < n; i += 1) L[i * n + i] += lambda;
    try { cholesky(L, n); } catch { cv.push({ lambda, err: Infinity }); return; }
    const alphas = targets.map((y) => cholSolve(L, n, y));
    const Mi = lowerInverse(L, n);   // (G + lambda I)^-1 = Mi' Mi
    let sum = 0;
    byGroup.forEach((idx) => {
      const m = idx.length;
      const B = new Float64Array(m * m);
      for (let a = 0; a < m; a += 1) {
        for (let b = 0; b <= a; b += 1) {
          const ia = idx[a];
          const ib = idx[b];
          let s = 0;
          for (let k = Math.max(ia, ib); k < n; k += 1) s += Mi[k * n + ia] * Mi[k * n + ib];
          B[a * m + b] = s;
          B[b * m + a] = s;
        }
      }
      const res = solveSmall(B, m, alphas.map((al) => Float64Array.from(idx, (i) => al[i])));
      for (let a = 0; a < m; a += 1) sum += Math.hypot(...res.map((r) => r[a]));
    });
    const err = sum / n;
    cv.push({ lambda, err });
    if (Number.isFinite(err) && (!best || err < best.err)) best = { lambda, err, alphas };
  });
  const chosen = best as { lambda: number; err: number; alphas: Float64Array[] } | null;
  if (!chosen) {
    // every candidate failed (non-finite error or factorization): the strongest regularization is the safest
    const lam = Math.max(...lambdas);
    return { W: ridgeDual(X, targets, lam), lambda: lam, cv };
  }
  const W = chosen.alphas.map((a) => {
    const w = new Float64Array(p);
    for (let i = 0; i < n; i += 1) {
      const r = X[i];
      const ai = a[i];
      for (let k = 0; k < p; k += 1) w[k] += ai * r[k];
    }
    return w;
  });
  return { W, lambda: chosen.lambda, cv };
}
