import { Matrix, inverse, solve } from 'ml-matrix';
import type { Matrix as MediaPipeMatrix, NormalizedLandmark } from '@mediapipe/tasks-vision';

export type Vec2 = [number, number];
export type Vec3 = [number, number, number];

const LEFTMOST_LANDMARK = 356;
const RIGHTMOST_LANDMARK = 127;
const RIGHT_IRIS_LANDMARKS = [468, 470, 469, 472, 471];
const LEFT_IRIS_LANDMARKS = [473, 475, 474, 477, 476];
const AVERAGE_IRIS_SIZE_CM = 1.2;
const LEFT_EYE_HORIZONTAL_LANDMARKS = [362, 263];
const RIGHT_EYE_HORIZONTAL_LANDMARKS = [33, 133];
const LEFT_EYE_EAR_LANDMARKS = [362, 385, 387, 263, 373, 380];
const RIGHT_EYE_EAR_LANDMARKS = [133, 158, 160, 33, 144, 153];
const NOSE_LANDMARK = 4;
const MAX_DEPTH_STEP_CM = 5;

// MediaPipe face_effect graph camera
const VERTICAL_FOV_DEGREES = 60;
const NEAR = 1.0;
const FAR = 10000;

const DEG = Math.PI / 180;

/** Least-squares affine map (2 x 3) from `src` to `dst` points. */
export function fitAffine(src: number[][], dst: number[][]): number[][] {
  const x = new Matrix(src.map(([a, b]) => [a, b, 1]));
  return solve(x, new Matrix(dst)).transpose().to2DArray();
}

/** Homography (3 x 3, h33 = 1) mapping four source points to four destination points. */
export function computeHomography(src: Vec2[], dst: Vec2[]): number[][] {
  const a: number[][] = [];
  const b: number[] = [];
  src.forEach(([x, y], i) => {
    const [u, v] = dst[i];
    a.push([x, y, 1, 0, 0, 0, -x * u, -y * u]);
    b.push(u);
    a.push([0, 0, 0, x, y, 1, -x * v, -y * v]);
    b.push(v);
  });
  const h = solve(new Matrix(a), Matrix.columnVector(b)).to1DArray();
  return [h.slice(0, 3), h.slice(3, 6), [h[6], h[7], 1]];
}

export function applyHomography(h: number[][], [x, y]: Vec2): Vec2 {
  const w = h[2][0] * x + h[2][1] * y + h[2][2];
  return [
    (h[0][0] * x + h[0][1] * y + h[0][2]) / w,
    (h[1][0] * x + h[1][1] * y + h[1][2]) / w,
  ];
}

/** Warps `src` with homography `h` into a `width` x `height` image (nearest neighbour). */
export function warpImage(src: ImageData, h: number[][], width: number, height: number): ImageData {
  const inv = inverse(new Matrix(h)).to2DArray();
  const out = new ImageData(width, height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const w = inv[2][0] * x + inv[2][1] * y + inv[2][2];
      const sx = Math.floor((inv[0][0] * x + inv[0][1] * y + inv[0][2]) / w);
      const sy = Math.floor((inv[1][0] * x + inv[1][1] * y + inv[1][2]) / w);
      if (sx >= 0 && sy >= 0 && sx < src.width && sy < src.height) {
        const s = (sy * src.width + sx) * 4;
        const d = (y * width + x) * 4;
        out.data[d] = src.data[s];
        out.data[d + 1] = src.data[s + 1];
        out.data[d + 2] = src.data[s + 2];
        out.data[d + 3] = src.data[s + 3];
      }
    }
  }
  return out;
}

export function cropImage(src: ImageData, x: number, y: number, width: number, height: number): ImageData {
  const out = new ImageData(width, height);
  for (let j = 0; j < height; j += 1) {
    if (y + j >= 0 && y + j < src.height) {
      const s = ((y + j) * src.width + x) * 4;
      out.data.set(src.data.subarray(s, s + width * 4), j * width * 4);
    }
  }
  return out;
}

function quad(width: number, height: number): Vec2[] {
  return [[0, 0], [0, height], [width, height], [width, 0]];
}

/** Rectified eye-region patch (512 x 128) from a frame and its pixel landmarks. */
export function extractEyePatch(frame: ImageData, landmarks: Vec2[], cropSize = 512, outSize: Vec2 = [512, 128]): ImageData {
  const center = landmarks[NOSE_LANDMARK];
  const padding = [0.4, 0.2];
  const srcPts = [103, 150, 379, 332].map((i): Vec2 => {
    const [x, y] = landmarks[i];
    return [x + (x - center[0]) * padding[0], y + (y - center[1]) * padding[1]];
  });
  const h = computeHomography(srcPts, quad(cropSize, cropSize));
  const face = warpImage(frame, h, cropSize, cropSize);
  const top = applyHomography(h, landmarks[151])[1];
  const bottom = applyHomography(h, landmarks[195])[1];
  const eyes = cropImage(face, 0, Math.round(top), face.width, Math.round(bottom - top));
  const resize = computeHomography(quad(eyes.width, eyes.height), quad(outSize[0], outSize[1]));
  return warpImage(eyes, resize, outSize[0], outSize[1]);
}

/** MediaPipe matrix data read row by row, as the BlazeGaze pipeline expects. */
export function toMatrix(m: MediaPipeMatrix): Matrix {
  const out = new Matrix(m.rows, m.columns);
  for (let i = 0; i < m.rows; i += 1) {
    for (let j = 0; j < m.columns; j += 1) out.set(i, j, m.data[i * m.columns + j]);
  }
  return out;
}

export function perspectiveMatrix(aspectRatio: number): Matrix {
  const f = 1 / Math.tan((VERTICAL_FOV_DEGREES * DEG) / 2);
  const denom = 1 / (NEAR - FAR);
  const m = new Matrix(4, 4).fill(0);
  m.set(0, 0, f / aspectRatio);
  m.set(1, 1, f);
  m.set(2, 2, (NEAR + FAR) * denom);
  m.set(2, 3, -1);
  m.set(3, 2, 2 * FAR * NEAR * denom);
  return m;
}

export function intrinsicsMatrix(width: number, height: number): Matrix {
  return new Matrix([[width, 0, width / 2], [0, width, height / 2], [0, 0, 1]]);
}

function dist2(a: number[], b: number[]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

/** Face width in cm, from the iris diameter relative to the face width. */
export function estimateFaceWidthCm(landmarks: Vec2[]): number {
  const iris = [LEFT_IRIS_LANDMARKS, RIGHT_IRIS_LANDMARKS]
    .map((ids) => dist2(landmarks[ids[4]], landmarks[ids[2]]));
  const irisPx = (iris[0] + iris[1]) / 2;
  const facePx = dist2(landmarks[LEFTMOST_LANDMARK], landmarks[RIGHTMOST_LANDMARK]);
  return AVERAGE_IRIS_SIZE_CM / (irisPx / facePx);
}

function uvToXyz(invPerspective: Matrix, u: number, v: number, z: number): Vec3 {
  const p = invPerspective.mmul(Matrix.columnVector([2 * u - 1, 1 - 2 * v, -1, 1]));
  const w = p.get(3, 0);
  return [-p.get(0, 0) / w, p.get(1, 0) / w, z];
}

function transform(p: Vec3, m: Matrix): Vec3 {
  const r = m.mmul(Matrix.columnVector([p[0], p[1], p[2], 1])).to1DArray();
  return [r[0], r[1], r[2]];
}

function project(p: Vec3, k: Matrix): Vec2 {
  const r = k.mmul(Matrix.columnVector(p)).to1DArray();
  const z = Math.abs(r[2]) < 1e-6 ? 1e-6 : r[2];
  return [Math.round(r[0] / z), Math.round(r[1] / z)];
}

function rotate(v: Vec3, m: Matrix): Vec3 {
  const r = m.mmul(Matrix.columnVector(v)).to1DArray();
  return [r[0], r[1], r[2]];
}

/** [pitch, yaw, roll] in radians. */
export function matrixToEuler(m: Matrix): Vec3 {
  return [Math.asin(-m.get(2, 0)), Math.atan2(m.get(2, 1), m.get(2, 2)), Math.atan2(m.get(1, 0), m.get(0, 0))];
}

export function eulerToMatrix(pitch: number, yaw: number, roll: number): Matrix {
  const [cp, sp, cy, sy, cr, sr] = [Math.cos(pitch), Math.sin(pitch), Math.cos(yaw), Math.sin(yaw), Math.cos(roll), Math.sin(roll)];
  const rx = new Matrix([[1, 0, 0], [0, cp, -sp], [0, sp, cp]]);
  const ry = new Matrix([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]]);
  const rz = new Matrix([[cr, -sr, 0], [sr, cr, 0], [0, 0, 1]]);
  return rz.mmul(ry).mmul(rx);
}

function refineDepth(projected: Vec2[], detected: Vec2[], z: number): number {
  const n = projected.length;
  const center = detected.reduce((acc, [x, y]) => [acc[0] + x / n, acc[1] + y / n], [0, 0]);
  const total = projected.reduce((acc, p, i) => {
    const v = [detected[i][0] - p[0], detected[i][1] - p[1]];
    const c = [center[0] - p[0], center[1] - p[1]];
    const norm = Math.hypot(v[0], v[1]);
    return acc + (v[0] * c[0] + v[1] * c[1] < 0 ? -norm : norm);
  }, 0);
  const delta = 0.1 * (total / n);
  return z + Math.max(-MAX_DEPTH_STEP_CM, Math.min(MAX_DEPTH_STEP_CM, delta));
}

/** Metric 3D face points (cm, camera frame) from normalized landmarks and the face transform. */
export function reconstructFace(
  perspective: Matrix,
  normalized: Vec2[],
  faceRt: Matrix,
  intrinsics: Matrix,
  faceWidthCm: number,
  width: number,
  height: number,
  zGuess = 60,
): Vec3[] {
  const invPerspective = inverse(perspective);
  const mesh = normalized.map(([u, v]) => uvToXyz(invPerspective, u, v, zGuess));
  const nose = mesh[NOSE_LANDMARK];
  const centered = mesh.map(([x, y, z]): Vec3 => [-(x - nose[0]), -(y - nose[1]), z - nose[2]]);
  const left = centered[LEFTMOST_LANDMARK];
  const right = centered[RIGHTMOST_LANDMARK];
  const scale = faceWidthCm / Math.hypot(left[0] - right[0], left[1] - right[1], left[2] - right[2]);
  const metric = centered.map(([x, y, z]): Vec3 => [x * scale, y * scale, z * scale]);

  const faceR = faceRt.subMatrix(0, 2, 0, 2);
  const [pitch, yaw, roll] = matrixToEuler(faceR);
  const rotation = eulerToMatrix(-yaw, pitch, roll);
  const canonical = metric.map((p) => rotate(p, rotation.transpose()));

  const faceScale = [0, 1, 2]
    .map((i) => Math.hypot(faceR.get(0, i), faceR.get(1, i), faceR.get(2, i)))
    .reduce((a, b) => a + b, 0) / 3;
  const pose = Matrix.eye(4);
  pose.setSubMatrix(rotation.div(faceScale), 0, 0);
  pose.set(2, 3, zGuess);

  const detected = normalized.map(([x, y]): Vec2 => [x * width, y * height]);
  const projectedNose = project(transform(canonical[NOSE_LANDMARK], pose), intrinsics);
  const shift = [detected[NOSE_LANDMARK][0] - projectedNose[0], detected[NOSE_LANDMARK][1] - projectedNose[1]];
  const x0 = shift[0] * (zGuess / intrinsics.get(0, 0));
  const y0 = shift[1] * (zGuess / intrinsics.get(1, 1));
  pose.set(0, 3, x0);
  pose.set(1, 3, y0);

  for (let i = 0; i < 10; i += 1) {
    const projected = canonical.map((p) => project(transform(p, pose), intrinsics));
    const z = refineDepth(projected, detected, pose.get(2, 3));
    if (Math.abs(z - pose.get(2, 3)) < 0.25) break;
    pose.set(0, 3, x0 * (z / zGuess));
    pose.set(1, 3, y0 * (z / zGuess));
    pose.set(2, 3, z);
  }
  return canonical.map((p) => transform(p, pose));
}

/** Midpoint between the two eye centres. */
export function faceOrigin(face: Vec3[]): Vec3 {
  const mean = (ids: number[]) => ids
    .map((i) => face[i])
    .reduce((a, p) => [a[0] + p[0] / ids.length, a[1] + p[1] / ids.length, a[2] + p[2] / ids.length], [0, 0, 0]);
  const l = mean(LEFT_EYE_HORIZONTAL_LANDMARKS);
  const r = mean(RIGHT_EYE_HORIZONTAL_LANDMARKS);
  return [(l[0] + r[0]) / 2, (l[1] + r[1]) / 2, (l[2] + r[2]) / 2];
}

/** Unit head direction from the face transform. */
export function headVector(faceRt: Matrix): Vec3 {
  const [pitch, yaw, roll] = matrixToEuler(faceRt.subMatrix(0, 2, 0, 2));
  const [p, y, r] = [-yaw, pitch, roll];
  const v: Vec3 = [Math.cos(p) * Math.sin(y), Math.sin(p), -Math.cos(p) * Math.cos(y)];
  return [Math.cos(r) * v[0] - Math.sin(r) * v[1], Math.sin(r) * v[0] + Math.cos(r) * v[1], v[2]];
}

/** Eye aspect ratio; below about 0.2 the eye is closed. */
export function eyeAspectRatio(landmarks: NormalizedLandmark[], side: 'left' | 'right'): number {
  const ids = side === 'left' ? LEFT_EYE_EAR_LANDMARKS : RIGHT_EYE_EAR_LANDMARKS;
  const [p1, p2, p3, p4, p5, p6] = ids.map((i) => [landmarks[i].x, landmarks[i].y]);
  return (dist2(p2, p6) + dist2(p3, p5)) / (2 * dist2(p1, p4));
}
