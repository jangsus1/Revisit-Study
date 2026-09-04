/**
 * Applies one grouping cue to a finished stimulus A display (SPEC deviation 7).
 * Cues never move a dot or change an arrow, so they cannot affect the layout invariants.
 */
import { polygonHull } from 'd3';
import { GENERATOR_CONFIG as C } from './config';
import { Rng, randperm } from './prng';
import {
  Cue, Display, DisplayCluster, NodeShape,
} from './types';

/** The outward offset of the hull / rect cue from a dot centre, in canvas px. */
export const CUE_PADDING = C.RDOT * C.SCALE + C.HULL_PADDING;

/** Points on a circle of radius `CUE_PADDING` around a dot, used to inflate the hull. */
const RING_STEPS = 12;

function ring(x: number, y: number): [number, number][] {
  return Array.from({ length: RING_STEPS }, (_, k) => {
    const a = (2 * Math.PI * k) / RING_STEPS;
    return [x + CUE_PADDING * Math.cos(a), y + CUE_PADDING * Math.sin(a)] as [number, number];
  });
}

function clusterPoints(display: Display, cluster: DisplayCluster) {
  const ids = new Set(cluster.nodeIds);
  return display.nodes.filter((n) => ids.has(n.id));
}

/** Axis-aligned bounding box of the cluster's dots, padded by `CUE_PADDING`. */
function paddedRect(display: Display, cluster: DisplayCluster) {
  const pts = clusterPoints(display, cluster);
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
 * `rng` supplies the seeded colour permutation and the seeded shape triple.
 */
export function applyCue(display: Display, cue: Cue, rng: Rng): Display {
  if (cue === 'hull') {
    display.clusters.forEach((cluster) => {
      const pts = clusterPoints(display, cluster).flatMap((p) => ring(p.x, p.y));
      const hull = polygonHull(pts);
      if (hull) {
        cluster.hull = hull.map(([x, y]) => [x, y] as [number, number]);
      } else {
        // degenerate (all dots at one point): fall back to the padded bounding rectangle
        const r = paddedRect(display, cluster);
        cluster.hull = [
          [r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.h], [r.x, r.y + r.h],
        ];
      }
    });
  } else if (cue === 'rect') {
    display.clusters.forEach((cluster) => {
      cluster.rect = paddedRect(display, cluster);
    });
  } else if (cue === 'color') {
    const perm = randperm(rng, C.COLOR_PALETTE.length);
    display.nodes.forEach((node) => {
      node.fill = C.COLOR_PALETTE[perm[node.cluster % C.COLOR_PALETTE.length]];
    });
  } else if (cue === 'edge') {
    display.edges.forEach((edge) => {
      edge.dashed = edge.kind === 'between';
    });
  } else if (cue === 'shape') {
    // three shapes, each used by two clusters, cycled along the traversal order so that
    // clusters adjacent in the flow never share a shape
    const perm = randperm(rng, C.SHAPES.length);
    const shapes = perm.map((i) => C.SHAPES[i] as NodeShape);
    const byCluster = new Map<number, NodeShape>();
    display.clusters.forEach((cluster) => {
      byCluster.set(cluster.index, shapes[cluster.orderPos % shapes.length]);
    });
    display.nodes.forEach((node) => {
      node.shape = byCluster.get(node.cluster) ?? 'circle';
    });
  }
  return display;
}
