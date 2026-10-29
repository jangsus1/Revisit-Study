/**
 * Applies one grouping cue to a finished stimulus A display (SPEC deviation 7).
 * Cues never move a dot or change an arrow, so they cannot affect the layout invariants.
 * (The layout itself does depend on the cue, through `layoutModeFor`: only `proximity` is gapped.)
 */
import { GENERATOR_CONFIG as C } from './config';
import { DOT_R } from './geometry';
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

/**
 * `color-distinct` / `color-distinct-2`: which of the few palette colours each cluster gets, so that
 * neighbouring clusters never share one. Every colouring of the six clusters with the palette's k
 * colours (k^6 of them) is scored by the clashes it leaves: each pair of clusters with the same
 * colour costs (closest centroid distance / their centroid distance)^2, so a clash between the two
 * nearest clusters costs 1 and one between clusters twice as far apart 0.25. The cheapest colouring
 * wins; ties go to the one that uses the colours most evenly, then to the first in enumeration
 * order, so the result is deterministic. On the 2 x 3 cluster grid every side-by-side and
 * above-below pair gets different colours, with two colours as well as three.
 */
export function assignDistinctColours(clusters: readonly DisplayCluster[], palette: readonly string[]): string[] {
  const sorted = [...clusters].sort((a, b) => a.index - b.index);
  const n = sorted.length;
  const k = palette.length;
  const dist = sorted.map((a) => sorted.map((b) => Math.hypot(a.cx - b.cx, a.cy - b.cy)));
  let nearest = Infinity;
  dist.forEach((row, i) => row.forEach((d, j) => { if (i < j) nearest = Math.min(nearest, d); }));
  let best: number[] = [];
  let bestCost = Infinity;
  let bestSpread = Infinity;
  for (let code = 0; code < k ** n; code += 1) {
    const colours = Array.from({ length: n }, (_, i) => Math.floor(code / k ** i) % k);
    let cost = 0;
    for (let i = 0; i < n; i += 1) {
      for (let j = i + 1; j < n; j += 1) if (colours[i] === colours[j]) cost += (nearest / dist[i][j]) ** 2;
    }
    const counts = Array.from({ length: k }, (_, c) => colours.filter((x) => x === c).length);
    const spread = Math.max(...counts) - Math.min(...counts);
    if (cost < bestCost - 1e-9 || (Math.abs(cost - bestCost) <= 1e-9 && spread < bestSpread)) {
      best = colours;
      bestCost = cost;
      bestSpread = spread;
    }
  }
  const byIndex: string[] = [];
  sorted.forEach((c, i) => { byIndex[c.index] = palette[best[i]]; });
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
    const distinct = display.variant === 'color-distinct' || display.variant === 'color-distinct-2'
      ? assignDistinctColours(display.clusters, palette) : null;
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
