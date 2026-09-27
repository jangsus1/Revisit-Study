/**
 * Cluster templates, jitter, extents, gaps and the cluster centres, either the ADJUSTED MATLAB
 * centres (SPEC sections 4 and 5b, `grouped`) or the gap-free `even` centres, followed by the
 * single scale into canvas coordinates.
 */
import { GENERATOR_CONFIG as C } from './config';
import { Rng, randi, uj } from './prng';
import type { LayoutMode } from './types';

export interface LayoutPoint { x: number; y: number; }

export interface LayoutCluster {
  index: number;
  /** node positions in canvas px */
  points: LayoutPoint[];
  /** centroid in canvas px */
  cx: number;
  cy: number;
}

export interface LayoutResult {
  clusters: LayoutCluster[];
  /** the jitter amplitude used for this seed, in source px */
  jitter: number;
  /** the four horizontal centroid distances, source px: (0,1), (1,2), (3,4), (4,5) */
  gapX: number[];
  /** the three vertical centroid distances, source px: (0,3), (1,4), (2,5) */
  gapY: number[];
  mode: LayoutMode;
}

/**
 * The fixed 2-wide lattice template for a cluster of `n` nodes.
 * `s` is -1 for the top row of clusters (Up forms) and +1 for the bottom row (Down forms).
 */
export function template(rng: Rng, n: number, s: number): LayoutPoint[] {
  const d = C.INTER;
  const c4: LayoutPoint[] = [
    { x: 0, y: 0 }, { x: d, y: 0 }, { x: 0, y: s * d }, { x: d, y: s * d },
  ];
  if (n === 3) {
    const alt = randi(rng, 2);
    return alt === 1
      ? [{ x: 0, y: 0 }, { x: d, y: 0 }, { x: 0, y: s * d }]
      : [{ x: 0, y: 0 }, { x: d, y: 0 }, { x: d, y: s * d }];
  }
  if (n === 4) return c4;
  if (n === 5) {
    const alt = randi(rng, 2);
    return [...c4, alt === 1 ? { x: 0, y: s * 2 * d } : { x: d, y: s * 2 * d }];
  }
  if (n === 6) return [...c4, { x: 0, y: s * 2 * d }, { x: d, y: s * 2 * d }];
  throw new Error(`unsupported cluster size ${n}`);
}

function span(values: number[]): number {
  return Math.max(...values) - Math.min(...values);
}

function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

interface Extent {
  minX: number;
  maxX: number;
  meanX: number;
  minY: number;
  maxY: number;
  meanY: number;
}

function extent(pts: LayoutPoint[]): Extent {
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    meanX: mean(xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
    meanY: mean(ys),
  };
}

/**
 * The MATLAB gapped layout (SPEC 5 and 5b): centroid spacing from `RATIO` and the cluster
 * extents, one shared baseline per row, each row centred on its own midpoint.
 */
function groupedCentres(raw: LayoutPoint[][], sizes: number[]) {
  const mdx = raw.map((pts) => span(pts.map((p) => p.x)));
  const mry = raw.map((pts) => span(pts.map((p) => p.y)));
  const mdy = raw.map((pts, i) => (sizes[i] > 4 ? mry[i] / 2 : mry[i]));

  const gap = (a: number, b: number) => Math.round(Math.max(mdx[a], mdx[b]) * C.RATIO + (mdx[a] + mdx[b]) / 2);
  const gapX = [gap(0, 1), gap(1, 2), gap(3, 4), gap(4, 5)];
  const gapY = [0, 1, 2].map((c) => Math.round(Math.max(mdy[c], mdy[c + 3]) * C.RATIO + (mry[c] + mry[c + 3]) / 2));

  const rowGap = Math.max(...gapY);
  const top = [0, gapX[0], gapX[0] + gapX[1]];
  const bot = [0, gapX[2], gapX[2] + gapX[3]];
  const topMid = (top[0] + top[2]) / 2;
  const botMid = (bot[0] + bot[2]) / 2;
  const centres: LayoutPoint[] = [
    ...top.map((x) => ({ x: x - topMid, y: 0 })),
    ...bot.map((x) => ({ x: x - botMid, y: rowGap })),
  ];
  return { centres, gapX, gapY };
}

/**
 * The even layout: every pair of neighbouring clusters is placed so that the gap between their
 * facing extreme dots equals the within-cluster pitch `INTER`, horizontally and vertically.
 * Horizontal centroid distance is `(maxX - meanX)_a + INTER + (meanX - minX)_b`; each column is
 * placed on its own so that `(maxY - meanY)_top + INTER + (meanY - minY)_bottom` holds in every
 * column (the top row's bottom edges share one line, the bottom row's top edges another). Rows
 * are centred on their own midpoints as in the grouped layout.
 */
function evenCentres(raw: LayoutPoint[][]) {
  const ext = raw.map(extent);
  const gap = (a: number, b: number) => (ext[a].maxX - ext[a].meanX) + C.INTER + (ext[b].meanX - ext[b].minX);
  const gapX = [gap(0, 1), gap(1, 2), gap(3, 4), gap(4, 5)];
  const gapY = [0, 1, 2].map((c) => (ext[c].maxY - ext[c].meanY) + C.INTER + (ext[c + 3].meanY - ext[c + 3].minY));

  const top = [0, gapX[0], gapX[0] + gapX[1]];
  const bot = [0, gapX[2], gapX[2] + gapX[3]];
  const topMid = (top[0] + top[2]) / 2;
  const botMid = (bot[0] + bot[2]) / 2;
  const centres: LayoutPoint[] = [
    ...top.map((x, c) => ({ x: x - topMid, y: -(ext[c].maxY - ext[c].meanY) })),
    ...bot.map((x, c) => ({ x: x - botMid, y: C.INTER + (ext[c + 3].meanY - ext[c + 3].minY) })),
  ];
  return { centres, gapX, gapY };
}

/**
 * Builds the whole stimulus A layout for one seed: templates, jitter, then the cluster centres of
 * the requested `mode`, then a single `SCALE` multiplication and a translation that centres the
 * bounding box of the dot centres inside the canvas. Both modes consume exactly the same random
 * draws, so `grouped` and `even` layouts of one seed have the same templates and jitter.
 */
export function buildLayout(rng: Rng, sizes: number[], jitter: number, mode: LayoutMode = 'grouped'): LayoutResult {
  // 4. templates + jitter, in source px
  const raw: LayoutPoint[][] = sizes.map((n, i) => {
    const s = i < 3 ? -1 : 1;
    return template(rng, n, s).map((p) => ({
      x: p.x + Math.round(uj(rng, jitter)),
      y: p.y + Math.round(uj(rng, jitter)),
    }));
  });

  // 5. / 5b. cluster centres
  const { centres, gapX, gapY } = mode === 'even' ? evenCentres(raw) : groupedCentres(raw, sizes);

  // translate each cluster so its centroid sits on its centre
  const placed = raw.map((pts, i) => {
    const dx = centres[i].x - mean(pts.map((p) => p.x));
    const dy = centres[i].y - mean(pts.map((p) => p.y));
    return pts.map((p) => ({ x: p.x + dx, y: p.y + dy }));
  });

  // single SCALE, then centre the bounding box of the dot centres in the canvas
  const all = placed.flat();
  const minX = Math.min(...all.map((p) => p.x)) * C.SCALE;
  const maxX = Math.max(...all.map((p) => p.x)) * C.SCALE;
  const minY = Math.min(...all.map((p) => p.y)) * C.SCALE;
  const maxY = Math.max(...all.map((p) => p.y)) * C.SCALE;
  const offsetX = (C.CANVAS.width - (maxX - minX)) / 2 - minX;
  const offsetY = (C.CANVAS.height - (maxY - minY)) / 2 - minY;

  const clusters: LayoutCluster[] = placed.map((pts, i) => {
    const points = pts.map((p) => ({
      x: p.x * C.SCALE + offsetX,
      y: p.y * C.SCALE + offsetY,
    }));
    return {
      index: i,
      points,
      cx: mean(points.map((p) => p.x)),
      cy: mean(points.map((p) => p.y)),
    };
  });

  return {
    clusters, jitter, gapX, gapY, mode,
  };
}

/** The per-seed jitter amplitude, drawn from the separate jitter stream (SPEC sections 1 and 2). */
export function drawJitter(jitter: Rng): number {
  return C.JITTER_MIN + Math.floor(jitter() * (C.JITTER_MAX - C.JITTER_MIN + 1));
}
