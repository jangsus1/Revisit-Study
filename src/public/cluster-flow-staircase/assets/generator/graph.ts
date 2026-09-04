/**
 * The directed flow graph of stimulus A: greedy cluster order (SPEC 6), a random spanning tree
 * inside each cluster oriented by a random topological rank (SPEC 7), the backbone between
 * consecutive clusters (SPEC 8), and the dense-variant extras.
 */
import { GENERATOR_CONFIG as C } from './config';
import { LayoutPoint } from './layout';
import { Rng, randperm } from './prng';
import { Density, DisplayEdge } from './types';

export interface GraphCluster {
  index: number;
  /** global node ids, parallel to `positions` */
  nodeIds: number[];
  /** canvas px positions of those nodes */
  positions: LayoutPoint[];
  /** canvas px centroid */
  cx: number;
  cy: number;
}

export interface GraphResult {
  edges: DisplayEdge[];
  /** topological rank inside its own cluster, indexed by global node id */
  rank: number[];
  /** cluster indices in traversal order */
  order: number[];
}

function dist2(ax: number, ay: number, bx: number, by: number): number {
  return (ax - bx) ** 2 + (ay - by) ** 2;
}

/** Greedy nearest-neighbour chain over the cluster centroids, starting top-left (SPEC 6). */
export function greedyOrder(clusters: GraphCluster[]): number[] {
  let start = 0;
  clusters.forEach((c, i) => {
    if (c.cx + c.cy < clusters[start].cx + clusters[start].cy) start = i;
  });
  const order = [start];
  const visited = new Set([start]);
  while (order.length < clusters.length) {
    const last = clusters[order[order.length - 1]];
    let best = -1;
    let bestD = Infinity;
    clusters.forEach((c, i) => {
      if (visited.has(i)) return;
      const d = dist2(last.cx, last.cy, c.cx, c.cy);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    visited.add(best);
    order.push(best);
  }
  return order;
}

/** The node of `candidates` (global ids) closest to (x, y). */
function nearest(candidates: number[], idToPos: Map<number, LayoutPoint>, x: number, y: number): number {
  let best = candidates[0];
  let bestD = Infinity;
  candidates.forEach((id) => {
    const p = idToPos.get(id) as LayoutPoint;
    const d = dist2(p.x, p.y, x, y);
    if (d < bestD) {
      bestD = d;
      best = id;
    }
  });
  return best;
}

/**
 * Builds every arrow of stimulus A. Arrows always run from the lower topological rank to the
 * higher one, so the graph is a DAG and no link is ever backward.
 */
export function buildGraph(rng: Rng, clusters: GraphCluster[], density: Density): GraphResult {
  const idToPos = new Map<number, LayoutPoint>();
  clusters.forEach((c) => c.nodeIds.forEach((id, i) => idToPos.set(id, c.positions[i])));

  const rank: number[] = [];
  const edges: DisplayEdge[] = [];
  const seen = new Set<string>();
  const key = (s: number, t: number) => `${s}>${t}`;

  const addWithin = (u: number, v: number, extra: boolean): boolean => {
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

  // 7. one random spanning tree per cluster, oriented by a random topological order
  const sources: number[][] = [];
  const sinks: number[][] = [];
  clusters.forEach((c) => {
    const n = c.nodeIds.length;
    const attach = randperm(rng, n);
    const topo = randperm(rng, n);
    topo.forEach((local, q) => { rank[c.nodeIds[local]] = q; });
    const treeEdges: [number, number][] = [];
    for (let k = 1; k < n; k += 1) {
      const other = attach[Math.floor(rng() * k)];
      const u = c.nodeIds[attach[k]];
      const v = c.nodeIds[other];
      addWithin(u, v, false);
      const s = rank[u] < rank[v] ? u : v;
      treeEdges.push([s, s === u ? v : u]);
    }
    const hasIn = new Set(treeEdges.map(([, t]) => t));
    const hasOut = new Set(treeEdges.map(([s]) => s));
    sources[c.index] = c.nodeIds.filter((id) => !hasIn.has(id));
    sinks[c.index] = c.nodeIds.filter((id) => !hasOut.has(id));
  });

  const order = greedyOrder(clusters);

  /** The nearest-sink -> nearest-source link between two clusters (SPEC 8). */
  const linkClusters = (a: number, b: number, extra: boolean) => {
    const ca = clusters[a];
    const cb = clusters[b];
    const source = nearest(sinks[a], idToPos, cb.cx, cb.cy);
    const target = nearest(sources[b], idToPos, ca.cx, ca.cy);
    if (source === target || seen.has(key(source, target))) return;
    seen.add(key(source, target));
    edges.push({
      source, target, kind: 'between', dashed: false, extra,
    });
  };

  // 8. backbone
  for (let i = 0; i < order.length - 1; i += 1) {
    linkClusters(order[i], order[i + 1], false);
  }

  if (density === 'dense') {
    // + 2 extra rank-respecting arrows per cluster
    clusters.forEach((c) => {
      const n = c.nodeIds.length;
      for (let e = 0; e < C.DENSE_EXTRA_WITHIN; e += 1) {
        let added = false;
        for (let draw = 0; draw < C.EXTRA_ARROW_MAX_DRAWS && !added; draw += 1) {
          const u = c.nodeIds[Math.floor(rng() * n)];
          const v = c.nodeIds[Math.floor(rng() * n)];
          added = addWithin(u, v, true);
        }
      }
    });
    // + backbone skip links order[i] -> order[i + 2]
    for (let i = 0; i + 2 < order.length; i += 1) {
      if (rng() < C.DENSE_SKIP_P) linkClusters(order[i], order[i + 2], true);
    }
  }

  return { edges, rank, order };
}
