/**
 * Ink and spacing statistics of a display, computed from the same geometry the renderer draws
 * (`geometry.ts`). Used to equate stimulus B to stimulus A, stored with every trial, and printed
 * under each gallery panel.
 */
import { polygonArea, polygonHull } from 'd3';
import {
  DASH_DUTY, HEAD_AREA, LINK_W, NODE_INK, OUTLINE_W, visibleLinkLength,
} from './geometry';
import { Display, DisplayMetrics } from './types';

/** Nearest-neighbour distance of every node (Infinity for a lone node). */
function nearestNeighbours(nodes: Display['nodes']): number[] {
  return nodes.map((a, i) => {
    let best = Infinity;
    nodes.forEach((b, j) => {
      if (i !== j) best = Math.min(best, Math.hypot(a.x - b.x, a.y - b.y));
    });
    return best;
  });
}

/** Measures `display`. Every length is in canvas px, every area in canvas px squared. */
export function measureDisplay(display: Display): DisplayMetrics {
  const { nodes } = display;
  const byId = new Map(nodes.map((n) => [n.id, n]));

  const nodeInk = nodes.reduce((sum, n) => sum + NODE_INK[n.shape], 0);

  let linkLength = 0;
  let linkInk = 0;
  display.edges.forEach((edge) => {
    const s = byId.get(edge.source);
    const t = byId.get(edge.target);
    if (!s || !t) return;
    const d = Math.hypot(t.x - s.x, t.y - s.y);
    if (d === 0) return;
    const visible = visibleLinkLength(d);
    linkLength += visible;
    linkInk += visible * LINK_W * (edge.dashed ? DASH_DUTY : 1) + HEAD_AREA;
  });

  const outlineInk = display.clusters.reduce(
    (sum, c) => sum + (c.rect ? 2 * (c.rect.w + c.rect.h) * OUTLINE_W : 0),
    0,
  );

  const nn = nearestNeighbours(nodes);
  const finiteNN = nn.filter(Number.isFinite);
  let pairSum = 0;
  let pairs = 0;
  for (let i = 0; i < nodes.length; i += 1) {
    for (let j = i + 1; j < nodes.length; j += 1) {
      pairSum += Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y);
      pairs += 1;
    }
  }
  const hull = nodes.length >= 3 ? polygonHull(nodes.map((n) => [n.x, n.y] as [number, number])) : null;

  return {
    ink: nodeInk + linkInk + outlineInk,
    nodeInk,
    linkInk,
    outlineInk,
    linkLength,
    meanNN: finiteNN.length ? finiteNN.reduce((a, b) => a + b, 0) / finiteNN.length : 0,
    minNN: finiteNN.length ? Math.min(...finiteNN) : 0,
    meanPairwise: pairs ? pairSum / pairs : 0,
    hullArea: hull ? Math.abs(polygonArea(hull)) : 0,
  };
}
