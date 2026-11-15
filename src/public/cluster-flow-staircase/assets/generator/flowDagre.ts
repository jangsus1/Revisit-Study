/**
 * Flowchart stimuli laid out by a real layout algorithm (`flow-dagre`, `flow-dagre-shade`; decided
 * 2026-11-15): dagre, the layered layout Mermaid uses, on a top-to-bottom flow of boxes. Positions
 * and link routes are dagre's own; nothing is moved afterwards.
 *
 * One random directed flow is drawn per seed: groups of 3 to 6 boxes, a tree inside each group, one
 * link from an earlier group into each later one (plus matched extras when dense), with the depth of
 * the flow capped so the chart fits the canvas. With `clustered`, every group is a dagre cluster (a
 * Mermaid subgraph): a compact block, set apart from the other groups by dagre's cluster spacing.
 *
 * The graph of stimulus A (24 boxes, six groups) is the same in every variant for a seed. Two
 * variants lay it out with clusters, from the same dagre run, and differ only in the shading:
 * - `flow-dagre` (proximity): nothing is drawn for the clusters (Mermaid's invisible subgraphs), so
 *   the groups are marked by their spacing alone.
 * - `flow-dagre-shade`: each cluster also lies on a shaded region (Mermaid's visible subgraphs). A
 *   layout algorithm cannot shade a group without also setting it apart, so this is proximity plus
 *   shading, and the pair of variants isolates what the shading adds.
 * - `flow-dagre-highlight` (highlight only): A is laid out without clusters, exactly as B is, so
 *   position does not group; each group's boxes and the links between them lie on a shaded region
 *   that follows the group (`highlightOf`). Its B needs no stretch.
 * Stimulus B (N_B boxes) is the same kind of flow laid out without clusters, in every variant. It
 * is stretched about its centre so that it covers the area its A covers at equal counts: by the
 * square root of (A's bounding area / the bounding area of A's own graph laid out without
 * clusters).
 *
 * As in `flow.ts`, nodes store `shape: 'circle'`; the box is read from `display.variant`. A link's
 * whole drawn route (`routeOf`) is stored in `DisplayEdge.points`.
 */
import * as dagre from '@dagrejs/dagre';
import { GENERATOR_CONFIG as C } from './config';
import { drawClusterSizes } from './clusterSizes';
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
  /** per link (parallel to `graph.links`): where dagre's route passes the ranks between its two boxes */
  bends: Pt[][];
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

/**
 * The drawn route of a link, top to bottom: out of the bottom edge of its source box (centre), into
 * the top edge of its target box (centre). Where it passes a row of boxes on the way (`rows`: the y
 * of every row), it runs straight down through that row's band at the x dagre reserved for it
 * there. So a link only runs at an angle in the free channels between rows and never touches a box
 * of a row it passes. Dagre's other route points (with clusters it also has ranks that hold no
 * boxes) all lie in those channels and are not needed.
 */
export function routeOf(source: Pt, target: Pt, passes: Pt[], rows: number[]): Pt[] {
  const half = D.box.height / 2 + C.FLOW_LINK_GAP;
  const between = rows.filter((y) => y > source.y + half && y < target.y - half);
  return simplify([
    { x: source.x, y: source.y + half },
    ...passes.flatMap((p) => {
      const row = between.find((y) => Math.abs(y - p.y) < half);
      return row === undefined ? [] : [{ x: p.x, y: row - half }, { x: p.x, y: row + half }];
    }),
    { x: target.x, y: target.y - half },
  ]);
}

/** Dagre's layout of the flow; with `clustered`, every group is a dagre cluster. */
export interface FlowLayoutOptions { rankdir: 'TB' | 'LR'; nodeSep: number; rankSep: number; width: number; height: number }
const LAYOUT_DEFAULTS: FlowLayoutOptions = {
  rankdir: D.rankdir, nodeSep: D.nodeSep, rankSep: D.rankSep, width: D.box.width, height: D.box.height,
};

export function layoutFlow(graph: FlowGraph, clustered: boolean, o: FlowLayoutOptions = LAYOUT_DEFAULTS): FlowLayout {
  const g = new dagre.graphlib.Graph({ compound: clustered, multigraph: false });
  g.setGraph({
    rankdir: o.rankdir, nodesep: o.nodeSep, ranksep: o.rankSep, marginx: 0, marginy: 0,
  });
  g.setDefaultEdgeLabel(() => ({}));
  if (clustered) new Set(graph.group).forEach((k) => g.setNode(`g${k}`, {}));
  graph.group.forEach((k, id) => {
    g.setNode(`${id}`, { width: o.width, height: o.height });
    if (clustered) g.setParent(`${id}`, `g${k}`);
  });
  graph.links.forEach(([s, t]) => g.setEdge(`${s}`, `${t}`));
  dagre.layout(g);
  const pts = graph.group.map((_, id) => {
    const node = g.node(`${id}`);
    return { x: node.x, y: node.y };
  });
  // dagre's route starts and ends on the box borders; what is kept is where it passes each rank in
  // between (`routeOf` turns that into the drawn link)
  const bends = graph.links.map(([s, t]) => ((g.edge(`${s}`, `${t}`).points ?? []) as Pt[])
    .slice(1, -1).map((p) => ({ x: p.x, y: p.y })));
  return { pts, bends };
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

/** Scales a layout by `k` about its centre and centres its bounding rectangle in the canvas. */
function place(layout: FlowLayout, k = 1): FlowLayout {
  const b = boxBounds(layout.pts);
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  const scale = (p: Pt) => ({ x: cx + (p.x - cx) * k, y: cy + (p.y - cy) * k });
  const scaled = layout.pts.map(scale);
  const after = boxBounds(scaled);
  const dx = (C.CANVAS.width - after.w) / 2 - after.x;
  const dy = (C.CANVAS.height - after.h) / 2 - after.y;
  const move = (p: Pt) => ({ x: p.x + dx, y: p.y + dy });
  return { pts: scaled.map(move), bends: layout.bends.map((route) => route.map(scale).map(move)) };
}

/**
 * The shaded region of group `k` in a chart laid out without clusters: a padded rectangle around
 * each of its boxes, and for each link inside the group either the strip between the facing edges
 * of its two boxes (boxes in neighbouring rows: the strip lies in the free channel between them) or
 * a thick line along its route (a link that passes a row). The pad is under half of dagre's gap
 * between boxes, so the regions of two groups never touch.
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
  shade: 'none' | 'rect' | 'highlight',
): Display {
  const { pts } = layout;
  const rows = [...new Set(pts.map((p) => Math.round(p.y * 100) / 100))];
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
    points: routeOf(pts[source], pts[target], layout.bends[i], rows),
  }));
  const clusters: DisplayCluster[] = kind === 'A' ? [...new Set(graph.group)].map((k, orderPos) => {
    const mine = pts.filter((_, id) => graph.group[id] === k);
    const b = boxBounds(mine);
    return {
      index: k,
      nodeIds: graph.group.map((g, id) => (g === k ? id : -1)).filter((id) => id >= 0),
      cx: mine.reduce((s, p) => s + p.x, 0) / mine.length,
      cy: mine.reduce((s, p) => s + p.y, 0) / mine.length,
      orderPos,
      ...(shade === 'rect' ? {
        rect: {
          x: b.x - D.shadePad, y: b.y - D.shadePad, w: b.w + 2 * D.shadePad, h: b.h + 2 * D.shadePad,
        },
      } : {}),
      ...(shade === 'highlight' ? { shade: highlightOf(k, graph, pts, edges) } : {}),
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

/** Stimulus A for one concrete seed: 24 boxes in six groups, with the stretch for its B. */
export function buildDagreA(seed: number, cue: Cue, density: Density, variant: Variant): { display: Display; stretch: number } {
  const rng = mulberry32(seed);
  const graph = drawFlowGraph(rng, drawGroupSizes(rng, C.NTOTAL), density);
  // highlight only: no clusters, so A is laid out exactly as B is and B needs no stretch
  const clustered = variant !== 'flow-dagre-highlight';
  const layout = place(layoutFlow(graph, clustered));
  const flat = boxBounds(layoutFlow(graph, false).pts);
  const mine = boxBounds(layout.pts);
  const shade = { 'flow-dagre-shade': 'rect', 'flow-dagre-highlight': 'highlight' }[variant as string] ?? 'none';
  const display = toDisplay('A', seed, cue, density, variant, graph, layout, rng, shade as 'none' | 'rect' | 'highlight');
  display.meta = {
    clusterSizes: display.clusters.map((c) => c.nodeIds.length),
    jitter: 0,
    order: display.clusters.map((c) => c.index),
    layout: clustered ? 'grouped' : 'even',
  };
  return { display, stretch: clustered ? Math.sqrt((mine.w * mine.h) / (flat.w * flat.h)) : 1 };
}

/**
 * Stimulus B for one concrete seed: `nB` boxes, no clusters, stretched about the centre by
 * `stretch` (at least 1, at most what the canvas margin allows).
 */
export function buildDagreB(seed: number, nB: number, cue: Cue, density: Density, variant: Variant, stretch = 1): Display {
  const rng = mulberry32(seed);
  const graph = drawFlowGraph(rng, drawGroupSizes(rng, nB), density);
  const raw = layoutFlow(graph, false);
  const b = boxBounds(raw.pts);
  const room = (span: number, box: number, canvas: number) => (span > box ? (canvas - 2 * C.CANVAS_MARGIN - box) / (span - box) : Infinity);
  const fit = Math.min(room(b.w, D.box.width, C.CANVAS.width), room(b.h, D.box.height, C.CANVAS.height));
  const k = Math.max(1, Math.min(stretch, fit));
  const display = toDisplay('B', seed, cue, density, variant, graph, place(raw, k), rng, 'none');
  display.meta = { spacing: k, layout: 'even' };
  return display;
}
