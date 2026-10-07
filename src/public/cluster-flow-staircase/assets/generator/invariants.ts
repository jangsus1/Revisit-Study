/**
 * Occlusion invariants (SPEC deviations 4 and 22). A display failing any of them is discarded and
 * the next derived seed is tried, so the participant never sees an ambiguous count or two links
 * crossing.
 */
import { GENERATOR_CONFIG as C } from './config';
import {
  DOT_R, LINK_W, MARK_POINTS, MARK_REACH, TRIM,
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

/**
 * Two links that share no endpoint must keep their centre lines at least this far apart, so their
 * strokes never cross, touch or overlap (one link width).
 */
export const LINK_GAP = LINK_W;

/** How far each end of a link is trimmed back from the dot centre, in canvas px. */
export const LINK_TRIM = TRIM;
/** Dot radius in canvas px. */
export const DOT_RADIUS = DOT_R;

const EPS = 1e-9;

type Pt = [number, number];

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
export function segmentSegmentDistance(p: Pt, q: Pt, r: Pt, s: Pt): number {
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

/** The outline polygon of a node's mark centred at (x, y); null for circles. */
export function markPolygon(shape: NodeShape, x: number, y: number): Pt[] | null {
  if (shape === 'circle') return null;
  return MARK_POINTS[shape].map(([dx, dy]) => [x + dx, y + dy]);
}

/** Even-odd point-in-polygon test; works for the non-convex star and Y. */
export function insidePolygon(poly: Pt[], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
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
  if (insidePolygon(poly, ax, ay) || insidePolygon(poly, bx, by)) return 0;
  return Math.min(...poly.map((v, i) => segmentSegmentDistance([ax, ay], [bx, by], v, poly[(i + 1) % poly.length])));
}

/** The drawn centre line of a link: from the trimmed source end to the trimmed target end. */
export function linkSegment(source: { x: number; y: number }, target: { x: number; y: number }): [Pt, Pt] | null {
  const len = Math.hypot(target.x - source.x, target.y - source.y);
  if (len < EPS) return null;
  const ux = (target.x - source.x) / len;
  const uy = (target.y - source.y) / len;
  const trim = Math.min(LINK_TRIM, len / 2);
  return [
    [source.x + ux * trim, source.y + uy * trim],
    [target.x - ux * trim, target.y - uy * trim],
  ];
}

type Dot = { id: number; x: number; y: number };

/**
 * True when the links u-v and w-z would cross, touch or overlap. Links sharing an endpoint meet
 * at that node by design; they conflict only when one runs back along the other (its far end
 * comes within `LINK_GAP` of the other link).
 */
export function linksConflict(u: Dot, v: Dot, w: Dot, z: Dot): boolean {
  const a = linkSegment(u, v);
  const b = linkSegment(w, z);
  if (!a || !b) return false;
  const shared = u.id === w.id || u.id === z.id || v.id === w.id || v.id === z.id;
  if (shared) {
    if (u.id === w.id && v.id === z.id) return true;
    if (u.id === z.id && v.id === w.id) return true;
    // the end of each link away from the shared node
    const farA = u.id === w.id || u.id === z.id ? a[1] : a[0];
    const farB = w.id === u.id || w.id === v.id ? b[1] : b[0];
    return pointSegmentDistance(farA[0], farA[1], b[0][0], b[0][1], b[1][0], b[1][1]) < LINK_GAP - EPS
      || pointSegmentDistance(farB[0], farB[1], a[0][0], a[0][1], a[1][0], a[1][1]) < LINK_GAP - EPS;
  }
  return segmentSegmentDistance(a[0], a[1], b[0], b[1]) < LINK_GAP - EPS;
}

/** True when a new link u-v would conflict with any of `links` (pairs of node ids). */
export function conflictsWithAny(
  u: Dot,
  v: Dot,
  links: readonly { source: number; target: number }[],
  byId: (id: number) => Dot,
): boolean {
  return links.some((l) => linksConflict(u, v, byId(l.source), byId(l.target)));
}

/**
 * True when the (trimmed) link between two dots keeps `MARK_MARGIN` from the mark of every dot that is
 * not one of its endpoints. With `reach`, every dot is treated as a disc of that radius instead of
 * its own mark; the builders pass `MAX_MARK_REACH`, so their links also pass `checkInvariants`
 * whatever marks the display gets.
 */
export function linkIsClear(
  source: Dot,
  target: Dot,
  nodes: { id: number; x: number; y: number; shape?: NodeShape }[],
  reach?: number,
): boolean {
  const seg = linkSegment(source, target);
  if (!seg) return false;
  const [[ax, ay], [bx, by]] = seg;
  return nodes.every((n) => n.id === source.id
    || n.id === target.id
    || (reach === undefined
      ? segmentMarkDistance(n, ax, ay, bx, by)
      : pointSegmentDistance(n.x, n.y, ax, ay, bx, by) - reach) >= MARK_MARGIN - EPS);
}

/**
 * The furthest any mark reaches from its centre (the capped tips, 1.35 RDOT). The builders keep
 * their links clear of a disc of this radius around every dot, so whichever marks are drawn
 * afterwards, every link clears them and B's geometry does not depend on the cue.
 */
export const MAX_MARK_REACH = Math.max(...Object.values(MARK_REACH));

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
  const at = (id: number) => byId.get(id) as Display['nodes'][number];
  const valid = display.edges.filter((edge) => {
    if (byId.has(edge.source) && byId.has(edge.target)) return true;
    violations.push(`edge ${edge.source}->${edge.target} references a missing dot`);
    return false;
  });
  valid.forEach((edge) => {
    const seg = linkSegment(at(edge.source), at(edge.target));
    if (!seg) return;
    const [[ax, ay], [bx, by]] = seg;
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

  // 4. no two links cross, touch or overlap
  for (let i = 0; i < valid.length; i += 1) {
    for (let j = i + 1; j < valid.length; j += 1) {
      const a = valid[i];
      const b = valid[j];
      if (linksConflict(at(a.source), at(a.target), at(b.source), at(b.target))) {
        violations.push(`links ${a.source}->${a.target} and ${b.source}->${b.target} cross or touch`);
      }
    }
  }

  return violations;
}
