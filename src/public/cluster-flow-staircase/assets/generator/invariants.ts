/**
 * Occlusion invariants (SPEC deviation 4). A display failing any of them is discarded and the
 * next derived seed is tried, so the participant never sees an ambiguous count.
 */
import { GENERATOR_CONFIG as C } from './config';
import {
  DOT_R, SQUARE_SIDE, TRIANGLE_R, TRIM, trianglePoints,
} from './geometry';
import { Display, NodeShape } from './types';

/** Minimum allowed distance between two dot centres, in canvas px. */
export const MIN_CENTRE_DISTANCE = C.MIN_CENTRE_DISTANCE_FACTOR * C.RDOT * C.SCALE;
/** Minimum allowed distance from a link to a circle that is not one of its endpoints, in canvas px. */
export const ARROW_CLEARANCE = (C.RDOT + C.ARROW_CLEARANCE) * C.SCALE;

/**
 * The white margin a link must keep from any mark that is not one of its endpoints, measured from
 * the link's centre line to the mark's outline. For a circle this is exactly the original rule
 * (centre distance at least `ARROW_CLEARANCE`).
 */
export const MARK_MARGIN = C.ARROW_CLEARANCE * C.SCALE;

/** How far each end of a link is trimmed back from the dot centre, in canvas px. */
export const LINK_TRIM = TRIM;
/** Dot radius in canvas px. */
export const DOT_RADIUS = DOT_R;

const EPS = 1e-9;

/** Shortest distance from a point to a segment, in canvas px. */
export function pointSegmentDistance(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 < EPS) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function cross(ox: number, oy: number, ax: number, ay: number, bx: number, by: number): number {
  return (ax - ox) * (by - oy) - (ay - oy) * (bx - ox);
}

/** Shortest distance between two segments (0 when they cross). */
export function segmentSegmentDistance(
  p: [number, number],
  q: [number, number],
  r: [number, number],
  s: [number, number],
): number {
  const d1 = cross(r[0], r[1], s[0], s[1], p[0], p[1]);
  const d2 = cross(r[0], r[1], s[0], s[1], q[0], q[1]);
  const d3 = cross(p[0], p[1], q[0], q[1], r[0], r[1]);
  const d4 = cross(p[0], p[1], q[0], q[1], s[0], s[1]);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return 0;
  return Math.min(
    pointSegmentDistance(p[0], p[1], r[0], r[1], s[0], s[1]),
    pointSegmentDistance(q[0], q[1], r[0], r[1], s[0], s[1]),
    pointSegmentDistance(r[0], r[1], p[0], p[1], q[0], q[1]),
    pointSegmentDistance(s[0], s[1], p[0], p[1], q[0], q[1]),
  );
}

/** The outline polygon of a square or triangle mark centred at (x, y); null for circles. */
export function markPolygon(shape: NodeShape, x: number, y: number): [number, number][] | null {
  if (shape === 'square' || shape === 'hollowSquare') {
    const h = SQUARE_SIDE / 2;
    return [[x - h, y - h], [x + h, y - h], [x + h, y + h], [x - h, y + h]];
  }
  if (shape === 'triangle' || shape === 'hollowTriangle') {
    return trianglePoints(TRIANGLE_R).map(([dx, dy]) => [x + dx, y + dy]);
  }
  return null;
}

function inside(poly: [number, number][], x: number, y: number): boolean {
  // convex, consistently wound: inside when on the same side of every edge
  const signs = poly.map((v, i) => {
    const w = poly[(i + 1) % poly.length];
    return Math.sign(cross(v[0], v[1], w[0], w[1], x, y));
  });
  return signs.every((sg) => sg >= 0) || signs.every((sg) => sg <= 0);
}

/**
 * Distance from the segment (ax, ay)-(bx, by) to the outline of a node's mark: 0 when the segment
 * touches or enters it.
 */
export function segmentMarkDistance(
  node: { x: number; y: number; shape?: NodeShape },
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const poly = markPolygon(node.shape ?? 'circle', node.x, node.y);
  if (!poly) return Math.max(0, pointSegmentDistance(node.x, node.y, ax, ay, bx, by) - DOT_R);
  if (inside(poly, ax, ay) || inside(poly, bx, by)) return 0;
  return Math.min(...poly.map((v, i) => segmentSegmentDistance([ax, ay], [bx, by], v, poly[(i + 1) % poly.length])));
}

/**
 * True when the (trimmed) link between two dots keeps `MARK_MARGIN` from the mark of every dot that is
 * not one of its endpoints. With `reach`, every dot is treated as a disc of that radius instead of
 * its own mark; the stimulus B tree builder passes `MAX_MARK_REACH`, so its links also pass
 * `checkInvariants` whatever marks B gets.
 */
export function linkIsClear(
  source: { id: number; x: number; y: number },
  target: { id: number; x: number; y: number },
  nodes: { id: number; x: number; y: number; shape?: NodeShape }[],
  reach?: number,
): boolean {
  const len = Math.hypot(target.x - source.x, target.y - source.y);
  if (len < EPS) return false;
  const ux = (target.x - source.x) / len;
  const uy = (target.y - source.y) / len;
  const trim = Math.min(LINK_TRIM, len / 2);
  const ax = source.x + ux * trim;
  const ay = source.y + uy * trim;
  const bx = target.x - ux * trim;
  const by = target.y - uy * trim;
  return nodes.every((n) => n.id === source.id
    || n.id === target.id
    || (reach === undefined
      ? segmentMarkDistance(n, ax, ay, bx, by)
      : pointSegmentDistance(n.x, n.y, ax, ay, bx, by) - reach) >= MARK_MARGIN - EPS);
}

/**
 * The furthest any mark reaches from its centre (a triangle's tip). Stimulus B builds its links
 * against a disc of this radius around every dot, so whichever marks are drawn afterwards, every
 * link clears them and B's geometry does not depend on the cue.
 */
export const MAX_MARK_REACH = Math.max(DOT_R, (SQUARE_SIDE / 2) * Math.SQRT2, TRIANGLE_R);

/**
 * Returns one human-readable string per violated invariant; an empty array means the display
 * is usable.
 */
export function checkInvariants(display: Display): string[] {
  const violations: string[] = [];
  const { nodes } = display;

  // 1. dot centres far enough apart
  for (let i = 0; i < nodes.length; i += 1) {
    for (let j = i + 1; j < nodes.length; j += 1) {
      const d = Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y);
      if (d < MIN_CENTRE_DISTANCE - EPS) {
        violations.push(`dots ${nodes[i].id} and ${nodes[j].id} are ${d.toFixed(2)}px apart (min ${MIN_CENTRE_DISTANCE})`);
      }
    }
  }

  // 2. no link passes too close to a dot that is not one of its endpoints
  const byId = new Map(nodes.map((n) => [n.id, n]));
  display.edges.forEach((edge) => {
    const s = byId.get(edge.source);
    const t = byId.get(edge.target);
    if (!s || !t) {
      violations.push(`edge ${edge.source}->${edge.target} references a missing dot`);
      return;
    }
    const len = Math.hypot(t.x - s.x, t.y - s.y);
    if (len < EPS) return;
    const ux = (t.x - s.x) / len;
    const uy = (t.y - s.y) / len;
    const trim = Math.min(LINK_TRIM, len / 2);
    const ax = s.x + ux * trim;
    const ay = s.y + uy * trim;
    const bx = t.x - ux * trim;
    const by = t.y - uy * trim;
    nodes.forEach((n) => {
      if (n.id === edge.source || n.id === edge.target) return;
      const d = segmentMarkDistance(n, ax, ay, bx, by);
      if (d < MARK_MARGIN - EPS) {
        violations.push(`edge ${edge.source}->${edge.target} passes ${d.toFixed(2)}px from the mark of dot ${n.id} (min ${MARK_MARGIN.toFixed(2)})`);
      }
    });
  });

  // 3. every dot, with its radius, inside the canvas minus the margin
  const m = C.CANVAS_MARGIN + DOT_RADIUS;
  nodes.forEach((n) => {
    if (n.x < m - EPS || n.y < m - EPS || n.x > display.width - m + EPS || n.y > display.height - m + EPS) {
      violations.push(`dot ${n.id} at (${n.x.toFixed(1)}, ${n.y.toFixed(1)}) leaves the ${C.CANVAS_MARGIN}px canvas margin`);
    }
  });

  return violations;
}
