import {
  afterAll, beforeAll, describe, expect, test, vi,
} from 'vitest';
import type { NormalizedLandmark } from '@mediapipe/tasks-vision';
import {
  applyHomography, computeHomography, cropImage, estimateFaceWidthCm, eulerToMatrix, extractEyePatch, eyeAspectRatio,
  faceOrigin, fitAffine, headVector, intrinsicsMatrix, matrixToEuler, perspectiveMatrix, reconstructFace, toMatrix, warpImage,
} from '../geometry';
import type { Vec2 } from '../geometry';

function image(width: number, height: number, fill: (x: number, y: number) => number): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) data.fill(fill(x, y), (y * width + x) * 4, (y * width + x) * 4 + 4);
  }
  return { width, height, data } as ImageData;
}

class TestImageData {
  data: Uint8ClampedArray;

  constructor(public width: number, public height: number) {
    this.data = new Uint8ClampedArray(width * height * 4);
  }
}

beforeAll(() => { vi.stubGlobal('ImageData', TestImageData); });
afterAll(() => { vi.unstubAllGlobals(); });

describe('fitAffine', () => {
  test('recovers an exact affine map', () => {
    const map = ([x, y]: number[]) => [2 * x - y + 0.1, 0.5 * x + 3 * y - 0.2];
    const src = [[0, 0], [1, 0], [0, 1], [1, 1], [0.3, 0.7]];
    const a = fitAffine(src, src.map(map));
    expect(a[0][0]).toBeCloseTo(2);
    expect(a[0][1]).toBeCloseTo(-1);
    expect(a[0][2]).toBeCloseTo(0.1);
    expect(a[1][0]).toBeCloseTo(0.5);
    expect(a[1][1]).toBeCloseTo(3);
    expect(a[1][2]).toBeCloseTo(-0.2);
  });
});

describe('computeHomography', () => {
  test('maps each source corner onto its destination', () => {
    const src: Vec2[] = [[10, 20], [12, 90], [95, 80], [100, 15]];
    const dst: Vec2[] = [[0, 0], [0, 64], [64, 64], [64, 0]];
    const h = computeHomography(src, dst);
    src.forEach((p, i) => {
      const [x, y] = applyHomography(h, p);
      expect(x).toBeCloseTo(dst[i][0], 6);
      expect(y).toBeCloseTo(dst[i][1], 6);
    });
  });
});

describe('cropImage', () => {
  test('copies the requested rows and leaves rows outside the source empty', () => {
    const src = image(4, 3, (x, y) => 10 * y + x + 1);
    const out = cropImage(src, 1, -1, 2, 3);
    expect(Array.from(out.data.slice(0, 8))).toEqual(new Array(8).fill(0));
    expect(out.data[8]).toBe(2);
    expect(out.data[12]).toBe(3);
    expect(out.data[16]).toBe(12);
  });
});

describe('rotations', () => {
  test('euler angles survive a round trip through a rotation matrix', () => {
    const [pitch, yaw, roll] = matrixToEuler(eulerToMatrix(0.1, -0.2, 0.3));
    expect(pitch).toBeCloseTo(-0.2);
    expect(yaw).toBeCloseTo(0.1);
    expect(roll).toBeCloseTo(0.3);
  });

  test('a face looking straight at the camera points along -z', () => {
    const identity = toMatrix({ rows: 4, columns: 4, data: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] });
    const [x, y, z] = headVector(identity);
    expect(x).toBeCloseTo(0);
    expect(y).toBeCloseTo(0);
    expect(z).toBeCloseTo(-1);
  });
});

describe('eyeAspectRatio', () => {
  const eye = (height: number) => {
    const landmarks: NormalizedLandmark[] = Array.from({ length: 478 }, () => ({
      x: 0, y: 0, z: 0, visibility: 0,
    }));
    const set = (i: number, x: number, y: number) => { landmarks[i] = { ...landmarks[i], x, y }; };
    set(362, 0, 0);
    set(263, 1, 0);
    set(385, 0.33, -height / 2);
    set(380, 0.33, height / 2);
    set(387, 0.66, -height / 2);
    set(373, 0.66, height / 2);
    return landmarks;
  };

  test('is the eye height over its width', () => {
    expect(eyeAspectRatio(eye(0.3), 'left')).toBeCloseTo(0.3);
    expect(eyeAspectRatio(eye(0.05), 'left')).toBeLessThan(0.2);
  });
});

const IDENTITY = toMatrix({
  rows: 4, columns: 4, data: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
});

/** 478 landmarks on a 200 px wide face centred at (320, 240), with 20 px irises. */
function syntheticFace(): Vec2[] {
  const face: Vec2[] = Array.from({ length: 478 }, (_, i): Vec2 => [320 + ((i % 21) - 10) * 8, 240 + (Math.floor(i / 21) - 11) * 8]);
  const set = (i: number, x: number, y: number) => { face[i] = [x, y]; };
  set(4, 320, 250);
  set(356, 420, 230);
  set(127, 220, 230);
  set(103, 250, 180);
  set(150, 250, 300);
  set(379, 390, 300);
  set(332, 390, 180);
  set(151, 320, 185);
  set(195, 320, 245);
  [[474, 380], [476, 360], [469, 280], [471, 260]].forEach(([i, x]) => set(i, x, 220));
  set(362, 350, 220);
  set(263, 390, 220);
  set(33, 250, 220);
  set(133, 290, 220);
  return face;
}

describe('warpImage', () => {
  test('reproduces the image under the identity homography', () => {
    const src = image(3, 2, (x, y) => 40 * y + 10 * x);
    const out = warpImage(src, [[1, 0, 0], [0, 1, 0], [0, 0, 1]], 3, 2);
    expect(Array.from(out.data)).toEqual(Array.from(src.data));
  });

  test('leaves pixels that map outside the source empty', () => {
    const out = warpImage(image(2, 2, () => 9), [[1, 0, 5], [0, 1, 0], [0, 0, 1]], 2, 2);
    expect(Array.from(out.data)).toEqual(new Array(16).fill(0));
  });
});

describe('extractEyePatch', () => {
  test('returns a 512 x 128 patch of the eye region', () => {
    const frame = image(640, 480, (x) => (x > 300 ? 200 : 50));
    const patch = extractEyePatch(frame, syntheticFace());
    expect([patch.width, patch.height]).toEqual([512, 128]);
    expect(patch.data.some((v) => v === 200)).toBe(true);
    expect(patch.data.some((v) => v === 50)).toBe(true);
  });
});

describe('face geometry', () => {
  test('scales the face width from the average iris size', () => {
    // irises 20 px, face 200 px: 1.2 cm / (20 / 200)
    expect(estimateFaceWidthCm(syntheticFace())).toBeCloseTo(12);
  });

  test('reconstructs a face whose width matches the estimate', () => {
    const normalized = syntheticFace().map(([x, y]): Vec2 => [x / 640, y / 480]);
    const face = reconstructFace(perspectiveMatrix(640 / 480), normalized, IDENTITY, intrinsicsMatrix(640, 480), 12, 640, 480);
    const [l, r] = [face[356], face[127]];
    expect(Math.hypot(l[0] - r[0], l[1] - r[1], l[2] - r[2])).toBeCloseTo(12);
    expect(face[4][2]).toBeGreaterThan(0);
  });

  test('places the face origin between the two eye centres', () => {
    const face = Array.from({ length: 478 }, (): [number, number, number] => [0, 0, 0]);
    face[362] = [2, 0, 50];
    face[263] = [4, 0, 50];
    face[33] = [-4, 0, 50];
    face[133] = [-2, 2, 54];
    expect(faceOrigin(face)).toEqual([0, 0.5, 51]);
  });
});
