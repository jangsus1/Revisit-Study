/**
 * Stimulus B: the ungrouped baseline (SPEC deviation 8).
 *
 * N_B dots are scattered uniformly over the same canvas with the same minimum spacing as A, wired
 * into one random directed spanning tree (plus matched extra arrows when dense). Cue features are
 * drawn without any spatial structure, so B matches A's low-level feature statistics but carries
 * no grouping.
 */
import { GENERATOR_CONFIG as C } from './config';
import { MIN_CENTRE_DISTANCE, linkIsClear } from './invariants';
import { Rng, mulberry32, randperm } from './prng';
import {
  Cue, Density, Display, DisplayEdge, DisplayNode, NodeShape,
} from './types';

/** How many extra rank-respecting arrows the dense variant adds for `n` nodes. */
export function denseExtraCount(n: number): number {
  return Math.round((n / C.NTOTAL) * C.B_DENSE_EXTRA_PER_24);
}

function placeNodes(rng: Rng, n: number): { x: number; y: number }[] | null {
  const r = C.RDOT * C.SCALE;
  const lo = C.CANVAS_MARGIN + r;
  const hiX = C.CANVAS.width - C.CANVAS_MARGIN - r;
  const hiY = C.CANVAS.height - C.CANVAS_MARGIN - r;
  const pts: { x: number; y: number }[] = [];
  let tries = 0;
  while (pts.length < n) {
    if (tries >= C.B_PLACEMENT_MAX_TRIES) return null;
    tries += 1;
    const x = lo + rng() * (hiX - lo);
    const y = lo + rng() * (hiY - lo);
    const ok = pts.every((p) => Math.hypot(p.x - x, p.y - y) >= MIN_CENTRE_DISTANCE);
    if (ok) pts.push({ x, y });
  }
  return pts;
}

/**
 * Builds stimulus B for one seed, or returns `null` when the rejection sampler ran out of
 * attempts (the caller then tries the next derived seed).
 */
export function buildBaseline(seed: number, nB: number, cue: Cue, density: Density): Display | null {
  const rng = mulberry32(seed);
  const pts = placeNodes(rng, nB);
  if (!pts) return null;

  // one random topological order over all nodes, then a random spanning tree that respects it
  const attach = randperm(rng, nB);
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

  // B edges connect spatial neighbours, so their lengths match A's within-cluster links instead
  // of criss-crossing the canvas, and they only ever run where they clear every other dot (a link
  // passing behind a third dot would be unreadable and is rejected by the invariants anyway).
  const dots = pts.map((p, id) => ({ id, x: p.x, y: p.y }));
  const byDistance = (from: number, candidates: number[]) => [...candidates]
    .sort((a, b) => Math.hypot(dots[a].x - dots[from].x, dots[a].y - dots[from].y)
      - Math.hypot(dots[b].x - dots[from].x, dots[b].y - dots[from].y));

  for (let k = 1; k < nB; k += 1) {
    const u = attach[k];
    const ordered = byDistance(u, attach.slice(0, k));
    const near = ordered.slice(0, C.B_NEAREST_K).filter((o) => linkIsClear(dots[u], dots[o], dots));
    if (near.length > 0) {
      add(u, near[Math.floor(rng() * near.length)], false);
    } else {
      // nothing among the K nearest is usable: fall back to the nearest candidate that clears,
      // and failing that to the nearest one at all (the invariants then reject the seed)
      const fallback = ordered.find((o) => linkIsClear(dots[u], dots[o], dots)) ?? ordered[0];
      add(u, fallback, false);
    }
  }

  if (density === 'dense') {
    const allIds = dots.map((d) => d.id);
    const extras = denseExtraCount(nB);
    for (let e = 0; e < extras; e += 1) {
      let added = false;
      for (let draw = 0; draw < C.EXTRA_ARROW_MAX_DRAWS && !added; draw += 1) {
        const u = Math.floor(rng() * nB);
        const candidates = byDistance(u, allIds.filter((id) => id !== u))
          .slice(0, C.B_NEAREST_K)
          .filter((v) => rank[u] !== rank[v]
            && !seen.has(rank[u] < rank[v] ? key(u, v) : key(v, u))
            && linkIsClear(dots[u], dots[v], dots));
        if (candidates.length > 0) {
          added = add(u, candidates[Math.floor(rng() * candidates.length)], true);
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
      node.fill = C.COLOR_PALETTE[Math.floor(rng() * C.COLOR_PALETTE.length)];
    });
  } else if (cue === 'shape') {
    nodes.forEach((node) => {
      node.shape = C.SHAPES[Math.floor(rng() * C.SHAPES.length)] as NodeShape;
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
    meta: {},
  };
}
