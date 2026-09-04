/**
 * Occlusion invariants (SPEC deviation 4). A display failing any of them is discarded and the
 * next derived seed is tried, so the participant never sees an ambiguous count.
 */
import { GENERATOR_CONFIG as C } from './config';
import { Display } from './types';

/** Minimum allowed distance between two dot centres, in canvas px. */
export const MIN_CENTRE_DISTANCE = C.MIN_CENTRE_DISTANCE_FACTOR * C.RDOT * C.SCALE;
/** Minimum allowed distance from a link to a dot that is not one of its endpoints, in canvas px. */
export const ARROW_CLEARANCE = (C.RDOT + C.ARROW_CLEARANCE) * C.SCALE;
/** How far each end of a link is trimmed back from the dot centre, in canvas px. */
export const LINK_TRIM = (C.RDOT + C.LINK_TRIM) * C.SCALE;
/** Dot radius in canvas px. */
export const DOT_RADIUS = C.RDOT * C.SCALE;

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

/**
 * True when the (trimmed) link between two dots keeps `ARROW_CLEARANCE` from every dot that is
 * not one of its endpoints. Used both by `checkInvariants` and by the stimulus B tree builder,
 * which only ever proposes links that already pass this test.
 */
export function linkIsClear(
  source: { id: number; x: number; y: number },
  target: { id: number; x: number; y: number },
  nodes: { id: number; x: number; y: number }[],
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
    || pointSegmentDistance(n.x, n.y, ax, ay, bx, by) >= ARROW_CLEARANCE - EPS);
}

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
      const d = pointSegmentDistance(n.x, n.y, ax, ay, bx, by);
      if (d < ARROW_CLEARANCE - EPS) {
        violations.push(`edge ${edge.source}->${edge.target} passes ${d.toFixed(2)}px from dot ${n.id} (min ${ARROW_CLEARANCE})`);
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
