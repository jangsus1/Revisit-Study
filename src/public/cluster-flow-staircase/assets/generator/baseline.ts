/**
 * Stimulus B: the ungrouped baseline (SPEC deviation 8, revised by deviations 13 to 15).
 *
 * N_B dots are scattered by dart throwing inside the paired A's field (the bounding box of A's dot
 * centres) with a minimum spacing that thins B out like A's lattice, wired into one random
 * directed spanning tree (plus matched extra arrows when dense) whose links are chosen to meet a
 * link-length budget taken from A. Cue features are drawn without any spatial structure, so B
 * matches A's spacing, extent, ink and feature statistics roughly but carries no grouping.
 */
import { GENERATOR_CONFIG as C } from './config';
import { visibleLinkLength } from './geometry';
import {
  MAX_MARK_REACH, MIN_CENTRE_DISTANCE, conflictsWithAny, linkIsClear,
} from './invariants';
import { makePalette } from './palette';
import { Rng, mulberry32, randperm } from './prng';
import {
  Cue, Density, Display, DisplayEdge, DisplayNode, InkTarget, NodeShape, Rect,
} from './types';

export interface BaselineOptions {
  /** where the dot centres may go, canvas px; default the whole canvas minus the margin */
  field?: Rect;
  /** colour-cue palette; default `makePalette(0)` */
  palette?: readonly string[];
  /** link-length budget from the paired A; without it links go to a random near neighbour */
  target?: InkTarget;
  /** shape cue: the marks to draw from (A's six); default the whole pool */
  shapes?: readonly NodeShape[];
}

/** How many extra rank-respecting arrows the dense variant adds for `n` nodes. */
export function denseExtraCount(n: number): number {
  return Math.round((n / C.NTOTAL) * C.B_DENSE_EXTRA_PER_24);
}

/** How many links B will have: the spanning tree plus, when dense, the matched extras. */
export function plannedEdgeCount(n: number, density: Density): number {
  return n - 1 + (density === 'dense' ? denseExtraCount(n) : 0);
}

/** The sampling rectangle: `field` (or the canvas) clipped so every dot keeps the canvas margin. */
export function clipField(field?: Rect): Rect {
  const r = C.RDOT * C.SCALE;
  const lo = C.CANVAS_MARGIN + r;
  const hiX = C.CANVAS.width - C.CANVAS_MARGIN - r;
  const hiY = C.CANVAS.height - C.CANVAS_MARGIN - r;
  const x0 = Math.max(lo, field ? field.x : lo);
  const y0 = Math.max(lo, field ? field.y : lo);
  const x1 = Math.min(hiX, field ? field.x + field.w : hiX);
  const y1 = Math.min(hiY, field ? field.y + field.h : hiY);
  return {
    x: x0, y: y0, w: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0),
  };
}

/**
 * The minimum centre spacing of B for `n` dots in `field`:
 * `min(B_MAX_SPACING, B_SPACING_FACTOR * sqrt(area / n))`, never below the invariant floor.
 */
export function baselineSpacing(n: number, field: Rect): number {
  const fromArea = C.B_SPACING_FACTOR * Math.sqrt((field.w * field.h) / Math.max(1, n));
  return Math.max(MIN_CENTRE_DISTANCE, Math.min(C.B_MAX_SPACING, fromArea));
}

/**
 * The total visible link length B aims for: A's link length scaled from A's link count to B's.
 * A's rect outlines are deliberately left out (SPEC deviation 19): making up for them took links
 * 2.4 times as long, which crossed and cluttered B, so rect B is built like every other B.
 */
export function linkBudget(target: InkTarget, edgesB: number): number {
  if (target.edges <= 0) return 0;
  return (target.linkLength * edgesB) / target.edges;
}

function placeNodes(rng: Rng, n: number, field: Rect, spacing: number): { x: number; y: number }[] | null {
  const pts: { x: number; y: number }[] = [];
  let tries = 0;
  while (pts.length < n) {
    if (tries >= C.B_PLACEMENT_MAX_TRIES) return null;
    tries += 1;
    const x = field.x + rng() * field.w;
    const y = field.y + rng() * field.h;
    const ok = pts.every((p) => Math.hypot(p.x - x, p.y - y) >= spacing);
    if (ok) pts.push({ x, y });
  }
  return pts;
}

/**
 * Builds stimulus B for one seed, or returns `null` when the dart thrower ran out of tries (the
 * caller then tries the next derived seed).
 */
export function buildBaseline(
  seed: number,
  nB: number,
  cue: Cue,
  density: Density,
  options: BaselineOptions = {},
): Display | null {
  const rng = mulberry32(seed);
  const field = clipField(options.field);
  const spacing = baselineSpacing(nB, field);
  const pts = placeNodes(rng, nB, field, spacing);
  if (!pts) return null;
  const palette = options.palette ?? makePalette(0);

  // One random topological order over all nodes, then a random spanning tree that respects it.
  // The tree grows outwards from a random point of the field (nodes join in order of distance
  // from it), so every joining node already has placed neighbours close by and no early link has
  // to bridge the whole field.
  const ox = field.x + rng() * field.w;
  const oy = field.y + rng() * field.h;
  const attach = pts.map((p, id) => ({ id, d: Math.hypot(p.x - ox, p.y - oy) }))
    .sort((a, b) => a.d - b.d)
    .map((entry) => entry.id);
  const topo = randperm(rng, nB);
  const rank: number[] = [];
  topo.forEach((id, q) => { rank[id] = q; });

  const edges: DisplayEdge[] = [];
  const seen = new Set<string>();
  const key = (s: number, t: number) => `${s}>${t}`;
  const add = (u: number, v: number, extra: boolean): boolean => {
    if (u === v || rank[u] === rank[v]) return false;
    const s = rank[u] < rank[v] ? u : v;
    const t = s === u ? v : u;
    if (seen.has(key(s, t))) return false;
    seen.add(key(s, t));
    edges.push({
      source: s, target: t, kind: 'within', dashed: false, extra,
    });
    return true;
  };

  // Links keep clear of a disc of the largest mark's reach around every dot, so the geometry is the
  // same for every cue and any mark drawn afterwards is cleared.
  // They also never cross, touch or overlap a link already drawn (SPEC deviation 22): every
  // candidate is checked against the links so far, so the crossing invariant rarely rejects a B.
  const dots = pts.map((p, id) => ({ id, x: p.x, y: p.y }));
  const clear = (u: number, v: number) => linkIsClear(dots[u], dots[v], dots, MAX_MARK_REACH)
    && !conflictsWithAny(dots[u], dots[v], edges, (id) => dots[id]);
  const dist = (a: number, b: number) => Math.hypot(dots[a].x - dots[b].x, dots[a].y - dots[b].y);
  const byDistance = (from: number, candidates: number[]) => [...candidates]
    .sort((a, b) => dist(a, from) - dist(b, from));

  // Link-length budget. Each link goes to the one of the few nearest usable candidates whose
  // visible length is closest to what is left of the budget per link still to draw, so B's total
  // link length tracks A's while its links stay local.
  const totalEdges = plannedEdgeCount(nB, density);
  const budget = options.target ? linkBudget(options.target, totalEdges) : null;
  let remaining = budget ?? 0;
  let drawn = 0;
  const degree = new Array<number>(nB).fill(0);
  const choose = (from: number, candidates: number[]): number => {
    if (budget === null) {
      const near = candidates.slice(0, C.B_NEAREST_K);
      return near[Math.floor(rng() * near.length)];
    }
    const want = Math.max(0, remaining / Math.max(1, totalEdges - drawn));
    // A long wanted link would otherwise keep picking the same far node and grow a hub; nodes that
    // already carry B_MAX_DEGREE links are skipped while any other candidate is left.
    const open = candidates.filter((c) => degree[c] < C.B_MAX_DEGREE);
    const pool = open.length > 0 ? open : candidates;
    let best = pool[0];
    let bestErr = Infinity;
    pool.forEach((c) => {
      const err = Math.abs(visibleLinkLength(dist(from, c)) - want);
      if (err < bestErr) {
        bestErr = err;
        best = c;
      }
    });
    return best;
  };
  const record = (u: number, v: number) => {
    remaining -= visibleLinkLength(dist(u, v));
    drawn += 1;
    degree[u] += 1;
    degree[v] += 1;
  };

  for (let k = 1; k < nB; k += 1) {
    const u = attach[k];
    const ordered = byDistance(u, attach.slice(0, k));
    const near = ordered.slice(0, C.B_ATTACH_CANDIDATES).filter((o) => clear(u, o));
    // nothing among the nearest is usable: fall back to the nearest candidate that clears, and
    // failing that to the nearest one at all (the invariants then reject the seed)
    const v = near.length > 0
      ? choose(u, near)
      : ordered.find((o) => clear(u, o)) ?? ordered[0];
    add(u, v, false);
    record(u, v);
  }

  if (density === 'dense') {
    const allIds = dots.map((d) => d.id);
    const extras = denseExtraCount(nB);
    for (let e = 0; e < extras; e += 1) {
      let added = false;
      for (let draw = 0; draw < C.EXTRA_ARROW_MAX_DRAWS && !added; draw += 1) {
        const u = Math.floor(rng() * nB);
        const candidates = byDistance(u, allIds.filter((id) => id !== u))
          .slice(0, C.B_ATTACH_CANDIDATES)
          .filter((v) => rank[u] !== rank[v]
            && !seen.has(rank[u] < rank[v] ? key(u, v) : key(v, u))
            && clear(u, v));
        if (candidates.length > 0) {
          const v = choose(u, candidates);
          added = add(u, v, true);
          if (added) record(u, v);
        }
      }
    }
  }

  const nodes: DisplayNode[] = pts.map((p, id) => ({
    id,
    x: p.x,
    y: p.y,
    cluster: -1,
    rank: rank[id],
    shape: 'circle' as NodeShape,
    fill: C.DOT_FILL,
  }));

  // feature matching, with no spatial structure
  if (cue === 'color') {
    nodes.forEach((node) => {
      node.fill = palette[Math.floor(rng() * palette.length)];
    });
  } else if (cue === 'shape') {
    const shapes = options.shapes && options.shapes.length > 0 ? options.shapes : C.SHAPES;
    nodes.forEach((node) => {
      node.shape = shapes[Math.floor(rng() * shapes.length)] as NodeShape;
    });
  } else if (cue === 'edge') {
    const dashCount = Math.round(edges.length * C.B_DASH_PROPORTION[density]);
    const perm = randperm(rng, edges.length);
    perm.slice(0, dashCount).forEach((i) => { edges[i].dashed = true; });
  }

  return {
    kind: 'B',
    seed,
    cue,
    density,
    n: nB,
    width: C.CANVAS.width,
    height: C.CANVAS.height,
    background: C.BACKGROUND,
    nodes,
    edges,
    clusters: [],
    attempts: 1,
    meta: {
      field,
      spacing,
      ...(budget === null ? {} : { linkTarget: budget }),
    },
  };
}
