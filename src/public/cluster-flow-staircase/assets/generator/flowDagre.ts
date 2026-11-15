/**
 * Flowchart stimuli laid out by a real layout algorithm (decided 2026-11-15): dagre, the layered
 * layout Mermaid uses, on a top-to-bottom flow of boxes.
 *
 * One random directed flow is drawn per seed: groups of 3 to 6 boxes, a tree inside each group, one
 * link from an earlier group into each later one (plus matched extras when dense), with the depth of
 * the flow capped so the chart fits the canvas. Dagre lays it out as it is, with no knowledge of the
 * groups. That plain layout is the **baseline**.
 *
 * Stimulus B (N_B boxes) is always the baseline: plain dagre, nothing added. Stimulus A (24 boxes,
 * six groups) starts from the same baseline layout of its own graph and differs from it in exactly
 * one of three ways:
 * - `flow-dagre-highlight`: each group's boxes and the links inside it lie on a shaded region.
 *   No box moves.
 * - `flow-dagre-apart`: the groups are moved apart (`moveApart`): each group keeps its own shape
 *   and its place relative to the others, only the distances between groups grow. Nothing is shaded.
 * - `flow-dagre-both`: moved apart exactly as in `flow-dagre-apart`, and shaded.
 * For one seed the three variants share the graph, the baseline layout and B.
 *
 * As in `flow.ts`, nodes store `shape: 'circle'`; the box is read from `display.variant`. A link's
 * whole drawn route is stored in `DisplayEdge.points`.
 */
import * as dagre from '@dagrejs/dagre';
import { GENERATOR_CONFIG as C } from './config';
import { drawClusterSizes } from './clusterSizes';
import { checkInvariants } from './invariants';
import { Rng, mulberry32, randperm } from './prng';
import {
  Cue, Density, Display, DisplayCluster, DisplayEdge, DisplayNode, Rect, Variant,
} from './types';

const D = C.FLOW_DAGRE;
type Pt = { x: number; y: number };

interface FlowGraph {
  /** group index of every node */
  group: number[];
  /** [source, target, extra] with source < target, so the flow is a DAG */
  links: [number, number, boolean][];
}

/** Splits `n` boxes into groups of `min` to `max`, sizes as even as the random cuts allow. */
export function drawGroupSizes(rng: Rng, n: number): number[] {
  if (n === C.NTOTAL) return drawClusterSizes(rng).sizes;
  const { min, max } = D.groupSize;
  if (n <= max) return [n];
  const sizes: number[] = [];
  let left = n;
  while (left > 0) {
    // keep the rest splittable into groups of min..max
    const options = [];
    for (let s = min; s <= max; s += 1) {
      const rest = left - s;
      if (rest === 0 || (rest >= min && Math.ceil(rest / max) <= Math.floor(rest / min))) options.push(s);
    }
    const s = options.length > 0 ? options[Math.floor(rng() * options.length)] : left;
    sizes.push(s);
    left -= s;
  }
  return sizes;
}

/** The random flow: a tree inside each group, one link into each later group, dense extras. */
export function drawFlowGraph(rng: Rng, sizes: number[], density: Density, depthCap: number = D.maxDepth): FlowGraph {
  const group: number[] = [];
  const links: [number, number, boolean][] = [];
  const members: number[][] = [];
  const children = new Map<number, number>();
  const depth: number[] = [];
  const link = (s: number, t: number, extra: boolean) => {
    links.push([s, t, extra]);
    children.set(s, (children.get(s) ?? 0) + 1);
  };
  /**
   * A random node of `pool` no deeper than `maxDepth` that still has room for a child; failing
   * that the room is waived, then the depth.
   */
  const parentFrom = (pool: number[], maxDepth: number) => {
    const shallow = pool.filter((id) => depth[id] <= maxDepth);
    const open = shallow.filter((id) => (children.get(id) ?? 0) < D.maxChildren);
    const from = [open, shallow, pool].find((list) => list.length > 0) as number[];
    return from[Math.floor(rng() * from.length)];
  };
  sizes.forEach((size, g) => {
    const ids: number[] = [];
    for (let k = 0; k < size; k += 1) {
      const id = group.length;
      group.push(g);
      depth.push(0);
      if (k === 0 && g > 0) {
        // the flow enters this group from an earlier one, high enough to leave the group room below
        const back = Math.min(g, D.attachBack);
        const parent = parentFrom(members.slice(g - back, g).flat(), depthCap - D.groupRoom - 1);
        depth[id] = depth[parent] + 1;
        link(parent, id, false);
      } else if (k > 0) {
        const parent = parentFrom(ids, depthCap - 1);
        depth[id] = depth[parent] + 1;
        link(parent, id, false);
      }
      ids.push(id);
    }
    members.push(ids);
  });
  if (density === 'dense') {
    const n = group.length;
    const seen = new Set(links.map(([s, t]) => `${s}>${t}`));
    const extras = Math.round((n / C.NTOTAL) * C.B_DENSE_EXTRA_PER_24);
    for (let e = 0; e < extras; e += 1) {
      for (let tries = 0; tries < C.EXTRA_ARROW_MAX_DRAWS; tries += 1) {
        // mostly inside a group, as in the dot stimuli's dense extras; always from the shallower box
        // to a deeper one, so an extra never lengthens the flow
        const g = Math.floor(rng() * members.length);
        const pool = rng() < D.extraWithin || g === 0 ? members[g] : [...members[g - 1], ...members[g]];
        const a = pool[Math.floor(rng() * pool.length)];
        const b = pool[Math.floor(rng() * pool.length)];
        const [s, t] = depth[a] <= depth[b] ? [a, b] : [b, a];
        if (depth[s] < depth[t] && !seen.has(`${s}>${t}`) && !seen.has(`${t}>${s}`)) {
          seen.add(`${s}>${t}`);
          link(s, t, true);
          break;
        }
      }
    }
  }
  return { group, links };
}

interface FlowLayout {
  /** box centres */
  pts: Pt[];
  /** per link (parallel to `graph.links`): its drawn route (`routeOf`) */
  routes: Pt[][];
}

/** Drops the route points that lie on the straight line between their neighbours. */
function simplify(route: Pt[]): Pt[] {
  const out = [...route];
  for (let i = out.length - 2; i >= 1; i -= 1) {
    const [a, p, b] = [out[i - 1], out[i], out[i + 1]];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const off = len === 0 ? 0 : Math.abs((b.x - a.x) * (a.y - p.y) - (a.x - p.x) * (b.y - a.y)) / len;
    if (off < D.bendTolerance) out.splice(i, 1);
  }
  return out;
}

/** How far a link's ends sit from the centres of its boxes: on the box edge, plus the gap. */
const PORT = D.box.height / 2 + C.FLOW_LINK_GAP;

/**
 * The drawn route of a link, top to bottom: out of the bottom edge of its source box (centre), into
 * the top edge of its target box (centre). Where it passes a row of boxes on the way (`rows`: the y
 * of every row), it runs straight down through that row's band at the x dagre reserved for it
 * there. So a link only runs at an angle in the free channels between rows and never touches a box
 * of a row it passes.
 */
export function routeOf(source: Pt, target: Pt, passes: Pt[], rows: number[]): Pt[] {
  const between = rows.filter((y) => y > source.y + PORT && y < target.y - PORT);
  return simplify([
    { x: source.x, y: source.y + PORT },
    ...passes.flatMap((p) => {
      const row = between.find((y) => Math.abs(y - p.y) < PORT);
      return row === undefined ? [] : [{ x: p.x, y: row - PORT }, { x: p.x, y: row + PORT }];
    }),
    { x: target.x, y: target.y - PORT },
  ]);
}

/** The baseline: dagre's layout of the flow, which knows nothing of the groups. */
export function layoutFlow(graph: FlowGraph): FlowLayout {
  const g = new dagre.graphlib.Graph({ multigraph: false });
  g.setGraph({
    rankdir: D.rankdir, nodesep: D.nodeSep, ranksep: D.rankSep, marginx: 0, marginy: 0,
  });
  g.setDefaultEdgeLabel(() => ({}));
  graph.group.forEach((_, id) => g.setNode(`${id}`, { width: D.box.width, height: D.box.height }));
  graph.links.forEach(([s, t]) => g.setEdge(`${s}`, `${t}`));
  dagre.layout(g);
  const pts = graph.group.map((_, id) => {
    const node = g.node(`${id}`);
    return { x: node.x, y: node.y };
  });
  const rows = [...new Set(pts.map((p) => Math.round(p.y * 100) / 100))];
  // dagre's route starts and ends on the box borders; what is used is where it passes each rank
  const routes = graph.links.map(([s, t]) => routeOf(
    pts[s],
    pts[t],
    ((g.edge(`${s}`, `${t}`).points ?? []) as Pt[]).slice(1, -1).map((p) => ({ x: p.x, y: p.y })),
    rows,
  ));
  return { pts, routes };
}

/** Bounding rectangle of the boxes centred on `pts`. */
export function boxBounds(pts: Pt[]): Rect {
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const x = Math.min(...xs) - D.box.width / 2;
  const y = Math.min(...ys) - D.box.height / 2;
  return {
    x, y, w: Math.max(...xs) + D.box.width / 2 - x, h: Math.max(...ys) + D.box.height / 2 - y,
  };
}

/**
 * Moves the groups of a baseline layout apart. Every group moves as a rigid block, away from the
 * centre of the chart: its centroid goes `apart.x` (`apart.y`) times as far from the centre as it
 * was, so the groups keep their arrangement and only the distances between them grow. A link
 * inside a group moves with it; a link between two groups is redrawn as a straight line from the
 * bottom of its source box to the top of its target box. Returns `null` when such a link would no
 * longer run downwards (the caller then tries the next seed).
 */
export function moveApart(graph: FlowGraph, base: FlowLayout): FlowLayout | null {
  const b = boxBounds(base.pts);
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  const shift = new Map<number, Pt>();
  new Set(graph.group).forEach((k) => {
    const mine = base.pts.filter((_, id) => graph.group[id] === k);
    const gx = mine.reduce((sum, p) => sum + p.x, 0) / mine.length;
    const gy = mine.reduce((sum, p) => sum + p.y, 0) / mine.length;
    shift.set(k, { x: (D.apart.x - 1) * (gx - cx), y: (D.apart.y - 1) * (gy - cy) });
  });
  const moved = (p: Pt, k: number) => ({ x: p.x + (shift.get(k) as Pt).x, y: p.y + (shift.get(k) as Pt).y });
  const pts = base.pts.map((p, id) => moved(p, graph.group[id]));
  let ok = true;
  const routes = graph.links.map(([s, t], i) => {
    if (graph.group[s] === graph.group[t]) return base.routes[i].map((p) => moved(p, graph.group[s]));
    if (pts[t].y - pts[s].y < 2 * PORT + D.minDrop) ok = false;
    return [{ x: pts[s].x, y: pts[s].y + PORT }, { x: pts[t].x, y: pts[t].y - PORT }];
  });
  return ok ? { pts, routes } : null;
}

/** Translates a layout so the bounding rectangle of its boxes is centred in the canvas. */
function centred(layout: FlowLayout): FlowLayout {
  const b = boxBounds(layout.pts);
  const dx = (C.CANVAS.width - b.w) / 2 - b.x;
  const dy = (C.CANVAS.height - b.h) / 2 - b.y;
  const move = (p: Pt) => ({ x: p.x + dx, y: p.y + dy });
  return { pts: layout.pts.map(move), routes: layout.routes.map((route) => route.map(move)) };
}

/**
 * The shaded region of group `k`: a padded rectangle around each of its boxes, and for each link
 * inside the group either the strip between the facing edges of its two boxes (boxes in
 * neighbouring rows: the strip lies in the free channel between them) or a thick line along its
 * route (a link that passes a row). The pad is under half of dagre's gap between boxes, so the
 * regions of two groups never touch.
 */
export function highlightOf(k: number, graph: FlowGraph, pts: Pt[], edges: DisplayEdge[]): NonNullable<DisplayCluster['shade']> {
  const hw = D.box.width / 2 + D.highlightPad;
  const hh = D.box.height / 2 + D.highlightPad;
  const polygons: Pt[][] = [];
  const lines: { points: Pt[]; width: number }[] = [];
  pts.forEach((p, id) => {
    if (graph.group[id] !== k) return;
    polygons.push([
      { x: p.x - hw, y: p.y - hh }, { x: p.x + hw, y: p.y - hh }, { x: p.x + hw, y: p.y + hh }, { x: p.x - hw, y: p.y + hh },
    ]);
  });
  edges.forEach((edge) => {
    if (graph.group[edge.source] !== k || graph.group[edge.target] !== k) return;
    const s = pts[edge.source];
    const t = pts[edge.target];
    if ((edge.points ?? []).length <= 2) {
      polygons.push([
        { x: s.x - hw, y: s.y + hh }, { x: s.x + hw, y: s.y + hh }, { x: t.x + hw, y: t.y - hh }, { x: t.x - hw, y: t.y - hh },
      ]);
    } else {
      lines.push({ points: [s, ...(edge.points ?? []).slice(1, -1), t], width: D.highlightLine });
    }
  });
  return { polygons, lines };
}

function toDisplay(
  kind: 'A' | 'B',
  seed: number,
  cue: Cue,
  density: Density,
  variant: Variant,
  graph: FlowGraph,
  layout: FlowLayout,
  rng: Rng,
  highlight: boolean,
): Display {
  const { pts } = layout;
  // the links follow the flow; the rank is only kept for the record
  const rank = randperm(rng, pts.length);
  const nodes: DisplayNode[] = pts.map((p, id) => ({
    id, x: p.x, y: p.y, cluster: kind === 'A' ? graph.group[id] : -1, rank: rank[id], shape: 'circle', fill: C.FLOW_BOX.fill,
  }));
  const edges: DisplayEdge[] = graph.links.map(([source, target, extra], i) => ({
    source,
    target,
    kind: kind === 'A' && graph.group[source] !== graph.group[target] ? 'between' : 'within',
    dashed: false,
    extra,
    points: layout.routes[i],
  }));
  const clusters: DisplayCluster[] = kind === 'A' ? [...new Set(graph.group)].map((k, orderPos) => {
    const mine = pts.filter((_, id) => graph.group[id] === k);
    return {
      index: k,
      nodeIds: graph.group.map((g, id) => (g === k ? id : -1)).filter((id) => id >= 0),
      cx: mine.reduce((sum, p) => sum + p.x, 0) / mine.length,
      cy: mine.reduce((sum, p) => sum + p.y, 0) / mine.length,
      orderPos,
      ...(highlight ? { shade: highlightOf(k, graph, pts, edges) } : {}),
    };
  }) : [];
  return {
    kind,
    seed,
    cue,
    density,
    n: pts.length,
    width: C.CANVAS.width,
    height: C.CANVAS.height,
    background: C.BACKGROUND,
    nodes,
    edges,
    clusters,
    attempts: 1,
    variant,
    meta: {},
  };
}

/**
 * Stimulus A for one concrete seed: 24 boxes in six groups, the baseline layout with the variant's
 * one change. `null` when the groups could not be moved apart (the caller tries the next seed).
 */
export function buildDagreA(seed: number, cue: Cue, density: Density, variant: Variant): Display | null {
  const rng = mulberry32(seed);
  const graph = drawFlowGraph(rng, drawGroupSizes(rng, C.NTOTAL), density);
  const base = layoutFlow(graph);
  // A seed is used only when its groups can be moved apart into a valid chart, whichever variant is
  // asked for, so the three variants always show the same graph for a seed.
  const moved = moveApart(graph, base);
  if (!moved) return null;
  const build = (layout: FlowLayout, highlight: boolean) => toDisplay('A', seed, cue, density, variant, graph, centred(layout), mulberry32(seed + 1), highlight);
  if (checkInvariants(build(moved, false)).length > 0) return null;
  const apart = variant !== 'flow-dagre-highlight';
  const display = build(apart ? moved : base, variant !== 'flow-dagre-apart');
  display.meta = {
    clusterSizes: display.clusters.map((c) => c.nodeIds.length),
    jitter: 0,
    order: display.clusters.map((c) => c.index),
    layout: apart ? 'grouped' : 'even',
  };
  return display;
}

/** Stimulus B for one concrete seed: `nB` boxes in the baseline layout, nothing added. */
export function buildDagreB(seed: number, nB: number, cue: Cue, density: Density, variant: Variant): Display {
  const rng = mulberry32(seed);
  const graph = drawFlowGraph(rng, drawGroupSizes(rng, nB), density);
  const display = toDisplay('B', seed, cue, density, variant, graph, centred(layoutFlow(graph)), rng, false);
  display.meta = { layout: 'even' };
  return display;
}
