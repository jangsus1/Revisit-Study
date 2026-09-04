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

  // The tree only ever proposes links that already clear every other dot; a link that would
  // pass behind a third dot would make the display unreadable and be rejected by the invariants.
  const dots = pts.map((p, id) => ({ id, x: p.x, y: p.y }));
  for (let k = 1; k < nB; k += 1) {
    const earlier = attach.slice(0, k);
    const clear = earlier.filter((o) => linkIsClear(dots[attach[k]], dots[o], dots));
    const pool = clear.length > 0 ? clear : earlier;
    add(attach[k], pool[Math.floor(rng() * pool.length)], false);
  }

  if (density === 'dense') {
    const extras = denseExtraCount(nB);
    for (let e = 0; e < extras; e += 1) {
      let added = false;
      for (let draw = 0; draw < C.EXTRA_ARROW_MAX_DRAWS && !added; draw += 1) {
        const u = Math.floor(rng() * nB);
        const v = Math.floor(rng() * nB);
        added = u !== v && linkIsClear(dots[u], dots[v], dots) && add(u, v, true);
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
