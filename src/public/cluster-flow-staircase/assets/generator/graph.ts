/**
 * The directed flow graph of stimulus A: greedy cluster order (SPEC 6), a random spanning tree
 * inside each cluster oriented by a random topological rank (SPEC 7), the backbone between
 * consecutive clusters (SPEC 8), and the dense-variant extras.
 */
import { GENERATOR_CONFIG as C } from './config';
import { conflictsWithAny, linkIsClear } from './invariants';
import { LayoutPoint } from './layout';
import { Rng, randperm } from './prng';
import { Density, DisplayEdge, Variant } from './types';
import { FLOW_PITCH, aligned } from './flow';
import { allowsCrossings, isFlow, markReach } from './variants';

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

/**
 * A random Hamiltonian path over the 2 x 3 cluster grid (cluster i sits in row floor(i / 3), column
 * i % 3) whose consecutive clusters are side by side or one above the other.
 */
export function gridPath(rng: Rng, n: number): number[] {
  const cols = n / 2;
  const neighbours = (a: number, b: number) => (Math.floor(a / cols) === Math.floor(b / cols) && Math.abs(a - b) === 1)
    || Math.abs(a - b) === cols;
  const paths: number[][] = [];
  const walk = (path: number[]) => {
    if (path.length === n) {
      paths.push(path);
      return;
    }
    for (let next = 0; next < n; next += 1) {
      if (!path.includes(next) && neighbours(path[path.length - 1], next)) walk([...path, next]);
    }
  };
  for (let start = 0; start < n; start += 1) walk([start]);
  return paths[Math.floor(rng() * paths.length)];
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
export function buildGraph(rng: Rng, clusters: GraphCluster[], density: Density, variant?: Variant): GraphResult {
  const idToPos = new Map<number, LayoutPoint>();
  clusters.forEach((c) => c.nodeIds.forEach((id, i) => idToPos.set(id, c.positions[i])));

  const rank: number[] = [];
  const edges: DisplayEdge[] = [];
  const seen = new Set<string>();
  const key = (s: number, t: number) => `${s}>${t}`;

  // Where the builder has a choice it takes a link that crosses, touches or overlaps no link drawn
  // so far and keeps clear of every other dot's largest possible mark (SPEC deviation 22), so the
  // invariants rarely have to reject the display. The rng draws are the same as before; only the
  // candidate that is finally taken changes.
  const dots = clusters.flatMap((c) => c.nodeIds.map((id, i) => ({ id, x: c.positions[i].x, y: c.positions[i].y })));
  const dotById = new Map(dots.map((d) => [d.id, d]));
  const at = (id: number) => dotById.get(id) as { id: number; x: number; y: number };
  // the fully connected variants allow links to cross; every variant keeps clear of its own marks
  const crossesNothing = (u: number, v: number) => allowsCrossings(variant) || !conflictsWithAny(at(u), at(v), edges, at);
  const reach = markReach(variant);
  const usable = (u: number, v: number) => crossesNothing(u, v) && linkIsClear(at(u), at(v), dots, reach);
  /** The first candidate that is usable, else the first that crosses nothing, else `fallback`. */
  const pick = <T>(candidates: T[], ends: (c: T) => [number, number], fallback: T | null): T | null => (
    candidates.find((c) => usable(...ends(c)))
    ?? candidates.find((c) => crossesNothing(...ends(c)))
    ?? fallback
  );

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
  const flow = isFlow(variant);
  /** Lattice neighbours: on one row or column, one pitch apart. */
  const adjacent = (u: number, v: number) => aligned(at(u), at(v))
    && Math.hypot(at(u).x - at(v).x, at(u).y - at(v).y) < FLOW_PITCH * 1.01;
  clusters.forEach((c) => {
    const n = c.nodeIds.length;
    const attach = randperm(rng, n);
    const topo = randperm(rng, n);
    topo.forEach((local, q) => { rank[c.nodeIds[local]] = q; });
    const treeEdges: [number, number][] = [];
    if (flow) {
      // flowchart: a random spanning tree over the lattice neighbours (randomised Prim), so every
      // within-cluster link is a straight connector between adjacent boxes
      const inTree = [c.nodeIds[attach[0]]];
      while (inTree.length < n) {
        const options = c.nodeIds.filter((u) => !inTree.includes(u))
          .flatMap((u) => inTree.filter((v) => adjacent(u, v)).map((v) => [u, v] as [number, number]));
        if (options.length === 0) break;
        const [u, v] = options[Math.floor(rng() * options.length)];
        addWithin(u, v, false);
        const s = rank[u] < rank[v] ? u : v;
        treeEdges.push([s, s === u ? v : u]);
        inTree.push(u);
      }
    }
    for (let k = 1; k < n && !flow; k += 1) {
      // the drawn earlier node first, then the others in turn
      const first = Math.floor(rng() * k);
      const u = c.nodeIds[attach[k]];
      const options = Array.from({ length: k }, (_, off) => c.nodeIds[attach[(first + off) % k]]);
      const v = pick(options, (o): [number, number] => [u, o], options[0]) as number;
      addWithin(u, v, false);
      const s = rank[u] < rank[v] ? u : v;
      treeEdges.push([s, s === u ? v : u]);
    }
    const hasIn = new Set(treeEdges.map(([, t]) => t));
    const hasOut = new Set(treeEdges.map(([s]) => s));
    sources[c.index] = c.nodeIds.filter((id) => !hasIn.has(id));
    sinks[c.index] = c.nodeIds.filter((id) => !hasOut.has(id));
  });

  // flowchart: the greedy chain often jumps over a cluster, which no straight connector can do, so
  // the order is a random path through the 2 x 3 cluster grid that only steps between neighbours
  const order = flow ? gridPath(rng, clusters.length) : greedyOrder(clusters);

  /**
   * The nearest-sink -> nearest-source link between two clusters (SPEC 8). When that pair would
   * cross a link or graze a mark, the next pair by the same distance sum is taken. A backbone link
   * falls back to the nearest pair (the invariants then reject the display); a skip link that has
   * no usable pair is left out.
   */
  const linkClusters = (a: number, b: number, extra: boolean) => {
    const ca = clusters[a];
    const cb = clusters[b];
    const d = (id: number, x: number, y: number) => {
      const p = idToPos.get(id) as LayoutPoint;
      return Math.sqrt(dist2(p.x, p.y, x, y));
    };
    const nearestPair: [number, number] = [nearest(sinks[a], idToPos, cb.cx, cb.cy), nearest(sources[b], idToPos, ca.cx, ca.cy)];
    const pairs = sinks[a].flatMap((s) => sources[b].map((t) => [s, t] as [number, number]))
      .map((pair) => ({ pair, cost: d(pair[0], cb.cx, cb.cy) + d(pair[1], ca.cx, ca.cy) }))
      .sort((p, q) => p.cost - q.cost)
      .map(({ pair }) => pair);
    // the separable cost puts the nearest pair first; it is moved to the front explicitly for ties
    const ordered = [nearestPair, ...pairs.filter(([s, t]) => s !== nearestPair[0] || t !== nearestPair[1])];
    let chosen: [number, number] | null;
    if (flow) {
      // flowchart: any two boxes of the two clusters that face each other on one row or column;
      // the shortest such connector wins (ties at random). Without one, a backbone link falls back
      // to the nearest pair and the invariants reject the display.
      const straight = ca.nodeIds.flatMap((s) => cb.nodeIds.map((t) => [s, t] as [number, number]))
        .filter(([s, t]) => aligned(at(s), at(t)) && !seen.has(key(s, t)) && usable(s, t))
        .map((pair) => ({ pair, len: Math.sqrt(dist2(at(pair[0]).x, at(pair[0]).y, at(pair[1]).x, at(pair[1]).y)) }));
      const shortest = Math.min(...straight.map((p) => p.len));
      const best = straight.filter((p) => p.len < shortest + 0.5);
      chosen = best.length > 0 ? best[Math.floor(rng() * best.length)].pair : (extra ? null : nearestPair);
    } else {
      chosen = extra
        ? ordered.find(([s, t]) => !seen.has(key(s, t)) && usable(s, t)) ?? null
        : pick(ordered, (p) => p, nearestPair);
    }
    if (!chosen) return;
    const [source, target] = chosen;
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
          // a draw whose link would cross a link or graze a mark counts as a failed draw
          added = u !== v && (!flow || adjacent(u, v)) && usable(u, v) && addWithin(u, v, true);
        }
      }
    });
    // + backbone skip links order[i] -> order[i + 2]
    for (let i = 0; i + 2 < order.length; i += 1) {
      if (rng() < C.DENSE_SKIP_P) linkClusters(order[i], order[i + 2], true);
    }
  }

  if (variant === 'intra-full-plus') {
    // a second link between every pair of consecutive clusters
    for (let i = 0; i < order.length - 1; i += 1) linkClusters(order[i], order[i + 1], true);
  }
  if (allowsCrossings(variant)) {
    // every cluster fully connected inside: each pair whose link keeps clear of the other nodes
    clusters.forEach((c) => {
      c.nodeIds.forEach((u, i) => c.nodeIds.slice(i + 1).forEach((v) => {
        if (linkIsClear(at(u), at(v), dots, reach)) addWithin(u, v, true);
      }));
    });
  }

  return { edges, rank, order };
}
