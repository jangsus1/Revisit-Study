/**
 * Applies one grouping cue to a finished stimulus A display (SPEC deviation 7).
 * Cues never move a dot or change an arrow, so they cannot affect the layout invariants.
 * (The layout itself does depend on the cue, through `layoutModeFor`: only `proximity` is gapped.)
 */
import { GENERATOR_CONFIG as C } from './config';
import { DOT_R } from './geometry';
import { deltaE2000, hexToLab } from './palette';
import { Rng, randperm } from './prng';
import {
  Cue, Display, DisplayCluster, NodeShape, Rect,
} from './types';

/** The outward offset of the rect cue from a dot centre, in canvas px. */
export const CUE_PADDING = DOT_R + C.HULL_PADDING;

/** Axis-aligned bounding box of the cluster's dots, padded by `CUE_PADDING`. */
function paddedRect(display: Display, cluster: DisplayCluster): Rect {
  const ids = new Set(cluster.nodeIds);
  const pts = display.nodes.filter((n) => ids.has(n.id));
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const x = Math.min(...xs) - CUE_PADDING;
  const y = Math.min(...ys) - CUE_PADDING;
  return {
    x,
    y,
    w: Math.max(...xs) + CUE_PADDING - x,
    h: Math.max(...ys) + CUE_PADDING - y,
  };
}

/** Every ordering of 0..n-1, in lexicographic order. */
function permutations(n: number): number[][] {
  if (n <= 1) return [[0].slice(0, n)];
  return permutations(n - 1).flatMap((p) => Array.from({ length: n }, (_, k) => [...p.slice(0, k), n - 1, ...p.slice(k)]))
    .sort((a, b) => a.join(',').localeCompare(b.join(',')));
}

/**
 * `color-distinct`: which palette colour each cluster gets, so that the clusters nearest each other
 * get the most different colours. Over every assignment of the six colours to the six clusters it
 * maximises, first, the smallest CIEDE2000 difference between *neighbouring* clusters (centroids
 * within 1.5 times the closest centroid distance of the display) and then, among ties, the sum over
 * all pairs of CIEDE2000 divided by centroid distance, so nearer pairs weigh more. The first best
 * ordering in lexicographic order wins, so the result is deterministic.
 */
export function assignDistinctColours(clusters: readonly DisplayCluster[], palette: readonly string[]): string[] {
  const labs = palette.map(hexToLab);
  const de = labs.map((p) => labs.map((q) => deltaE2000(p, q)));
  const sorted = [...clusters].sort((a, b) => a.index - b.index);
  const n = sorted.length;
  const dist = sorted.map((a) => sorted.map((b) => Math.hypot(a.cx - b.cx, a.cy - b.cy)));
  let nearest = Infinity;
  dist.forEach((row, i) => row.forEach((d, j) => { if (i < j) nearest = Math.min(nearest, d); }));
  const pairs: [number, number][] = [];
  for (let i = 0; i < n; i += 1) for (let j = i + 1; j < n; j += 1) pairs.push([i, j]);
  const neighbours = pairs.filter(([i, j]) => dist[i][j] <= 1.5 * nearest);
  let best: number[] = [];
  let bestMin = -Infinity;
  let bestSum = -Infinity;
  permutations(n).forEach((perm) => {
    const minNb = Math.min(...neighbours.map(([i, j]) => de[perm[i]][perm[j]]));
    const sum = pairs.reduce((s, [i, j]) => s + de[perm[i]][perm[j]] / dist[i][j], 0);
    if (minNb > bestMin + 1e-9 || (Math.abs(minNb - bestMin) <= 1e-9 && sum > bestSum + 1e-9)) {
      best = perm;
      bestMin = minNb;
      bestSum = sum;
    }
  });
  const byIndex: string[] = [];
  sorted.forEach((c, i) => { byIndex[c.index] = palette[best[i] % palette.length]; });
  return byIndex;
}

/**
 * Mutates `display` so it carries the visual encoding of `cue`, and returns it.
 * `rng` supplies the seeded colour and shape permutations; `palette` is the participant's six
 * CIELAB colours (`makePalette(hueOffset)`).
 *
 * - `proximity`: nothing; the gapped layout is the cue.
 * - `rect`: a padded bounding rectangle per cluster.
 * - `color`: one palette colour per cluster, seeded permutation.
 * - `shape`: six distinct marks drawn at random (seeded) from the pool of seven filled
 *   silhouettes, one per cluster, so no two clusters share a mark (`shapeSubset` reads them back).
 * - `edge`: between-cluster links dashed, within-cluster links solid.
 */
export function applyCue(display: Display, cue: Cue, rng: Rng, palette: readonly string[]): Display {
  if (cue === 'rect') {
    display.clusters.forEach((cluster) => {
      cluster.rect = paddedRect(display, cluster);
    });
    // rect-shade: the areas are filled instead of outlined, and the nodes turn black
    if (display.variant === 'rect-shade') display.nodes.forEach((node) => { node.fill = C.SHADE_NODE; });
  } else if (cue === 'color') {
    // the seeded permutation is drawn in every case, so the rng stream does not depend on the variant
    const perm = randperm(rng, palette.length);
    const distinct = display.variant === 'color-distinct' ? assignDistinctColours(display.clusters, palette) : null;
    display.nodes.forEach((node) => {
      node.fill = distinct ? distinct[node.cluster] : palette[perm[node.cluster % palette.length]];
    });
  } else if (cue === 'edge') {
    display.edges.forEach((edge) => {
      edge.dashed = edge.kind === 'between';
    });
  } else if (cue === 'shape') {
    const perm = randperm(rng, C.SHAPES.length);
    display.nodes.forEach((node) => {
      node.shape = C.SHAPES[perm[node.cluster % C.SHAPES.length]] as NodeShape;
    });
  }
  return display;
}

/**
 * The marks a shape-cue stimulus A uses, in cluster order (the six it drew from the pool). B draws
 * its marks from these, so A and B always show the same six silhouettes.
 */
export function shapeSubset(display: Display): NodeShape[] {
  return [...display.clusters]
    .sort((a, b) => a.index - b.index)
    .map((cluster) => display.nodes.find((n) => n.id === cluster.nodeIds[0])?.shape ?? 'circle');
}
