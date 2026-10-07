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
  } else if (cue === 'color') {
    const perm = randperm(rng, palette.length);
    display.nodes.forEach((node) => {
      node.fill = palette[perm[node.cluster % palette.length]];
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
