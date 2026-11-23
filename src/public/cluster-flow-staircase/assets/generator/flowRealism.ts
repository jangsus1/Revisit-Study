/**
 * Realism options for the flowchart stimuli (exploration of 2026-11-23, for the group's discussion).
 *
 * The dagre charts of `flowDagre.ts` are bare: identical empty boxes, straight links, a tree. This
 * module draws the same kind of 24-box, six-group flow with one or more realism options switched on
 * (text in boxes, box width, node types, link style, merges and loops, branching, spacing, fill,
 * layout direction, a force-directed layout) so their look can be compared before any of them goes
 * into the trial generator. Every option applies to the whole chart, not to the groups: what a
 * group is and how it is marked (`highlightRects`) or set apart (centroids scaled from the chart
 * centre, as in `moveApart`) is the same as in `flowDagre.ts`.
 *
 * Nothing here is used by a study; the gallery's realism page is its only caller. Charts are not
 * checked against the stage: the page scales a chart down when it does not fit.
 */
import * as dagre from '@dagrejs/dagre';
import * as d3 from 'd3';
import { GENERATOR_CONFIG as C } from './config';
import {
  drawGroupSizes, highlightRects, unionOf,
} from './flowDagre';
import { Rng, mulberry32 } from './prng';
import { Rect } from './types';

const D = C.FLOW_DAGRE;
type Pt = { x: number; y: number };

export interface Realism {
  /** dagre top to bottom (current), dagre left to right, or d3's force-directed layout */
  layout: 'dagre-tb' | 'dagre-lr' | 'force';
  /** inside the boxes: nothing (current), grey placeholder bars, or short text */
  labels: 'none' | 'bars' | 'text';
  /** box width: all the same (current) or varied; text always sizes its box */
  width: 'fixed' | 'varied';
  /** start / end ovals and decision diamonds with yes / no on their links */
  nodeTypes: boolean;
  /** link drawing: straight segments (current), smooth curves (Mermaid's default) or right angles */
  links: 'straight' | 'curved' | 'orthogonal';
  /** the flow: a tree (current), with branches merging again, or with loops back */
  structure: 'tree' | 'merges' | 'loops';
  /** how boxes hang from each other: as now, mostly long chains, or wide fans */
  branching: 'mixed' | 'linear' | 'bushy';
  /** dagre's gaps between boxes and between ranks */
  spacing: 'tight' | 'normal' | 'loose';
  /** boxes with a white (current) or a light grey fill */
  fill: 'outline' | 'filled';
}

export const REALISM_DEFAULT: Realism = {
  layout: 'dagre-tb',
  labels: 'none',
  width: 'fixed',
  nodeTypes: false,
  links: 'straight',
  structure: 'tree',
  branching: 'mixed',
  spacing: 'normal',
  fill: 'outline',
};

/** The gallery rows: the current chart, each option on its own, and one combination. */
export const REALISM_PRESETS: { key: string; title: string; options: Partial<Realism> }[] = [
  { key: 'current', title: 'Current: dagre top to bottom, empty boxes, straight links, tree', options: {} },
  { key: 'layout-lr', title: 'Layout: dagre left to right', options: { layout: 'dagre-lr' } },
  { key: 'layout-force', title: 'Layout: force-directed (d3-force), not layered', options: { layout: 'force' } },
  { key: 'labels-bars', title: 'Placeholder text bars in boxes', options: { labels: 'bars' } },
  { key: 'labels-text', title: 'Short text in boxes (box width follows the text)', options: { labels: 'text' } },
  { key: 'width-varied', title: 'Box width varies, no text', options: { width: 'varied' } },
  { key: 'node-types', title: 'Node types: start / end ovals, decision diamonds with yes / no', options: { nodeTypes: true } },
  { key: 'links-curved', title: 'Curved links (Mermaid style)', options: { links: 'curved' } },
  { key: 'links-orthogonal', title: 'Right-angle links', options: { links: 'orthogonal' } },
  { key: 'structure-merges', title: 'Structure: branches merge again', options: { structure: 'merges' } },
  { key: 'structure-loops', title: 'Structure: loops back', options: { structure: 'loops' } },
  { key: 'branching-linear', title: 'Branching: mostly long chains', options: { branching: 'linear' } },
  { key: 'branching-bushy', title: 'Branching: wide fans', options: { branching: 'bushy' } },
  { key: 'spacing-tight', title: 'Spacing: tight', options: { spacing: 'tight' } },
  { key: 'spacing-loose', title: 'Spacing: loose', options: { spacing: 'loose' } },
  { key: 'fill', title: 'Boxes filled light grey', options: { fill: 'filled' } },
  {
    key: 'combined',
    title: 'Combined, Mermaid-like: text, node types, curved links, merges',
    options: {
      labels: 'text', nodeTypes: true, links: 'curved', structure: 'merges',
    },
  },
];

export const SPACING = {
  tight: { nodeSep: 6, rankSep: 12 },
  normal: { nodeSep: D.nodeSep, rankSep: D.rankSep },
  loose: { nodeSep: 20, rankSep: 36 },
} as const;

export type NodeKind = 'process' | 'start' | 'end' | 'decision';

export interface RealismNode {
  id: number;
  group: number;
  kind: NodeKind;
  x: number;
  y: number;
  w: number;
  h: number;
  /** text, when `labels` is 'text' */
  text?: string;
  /** placeholder bar widths as fractions of the box width, when `labels` is 'bars' */
  bars?: number[];
}

export interface RealismLink {
  source: number;
  target: number;
  /** 'back' links run against the flow (loops) */
  kind: 'tree' | 'entry' | 'merge' | 'back';
  /** drawn route from the source border to the target border */
  points: Pt[];
  /** 'Yes' / 'No' on the links out of a decision */
  label?: string;
}

export interface RealismChart {
  options: Realism;
  seed: number;
  /** 'plain' is the layout as drawn; 'apart' has the groups moved apart */
  arrangement: 'plain' | 'apart';
  nodes: RealismNode[];
  links: RealismLink[];
  /** per group: the rough highlight rectangle, when the chart is highlighted */
  highlight: Rect[];
}

interface RealismGraph {
  group: number[];
  links: { source: number; target: number; kind: RealismLink['kind'] }[];
}

const VERBS = ['Check', 'Load', 'Send', 'Update', 'Validate', 'Read', 'Save', 'Parse', 'Notify', 'Compute', 'Fetch', 'Merge', 'Log', 'Retry'];
const NOUNS = ['input', 'order', 'user', 'file', 'record', 'payment', 'request', 'report', 'data', 'cache', 'item', 'status', 'form'];
const QUESTIONS = ['Valid?', 'Found?', 'Paid?', 'Done?', 'Empty?', 'OK?', 'Ready?', 'Match?'];
/** canvas px per character of the 9 px label font, and the box's side margin */
const CHAR_W = 5.2;
const TEXT_MARGIN = 12;

const pick = <T>(rng: Rng, list: readonly T[]): T => list[Math.floor(rng() * list.length)];

/** The random flow, as `drawFlowGraph` draws it, with the branching and structure options. */
export function drawRealismGraph(rng: Rng, options: Realism): RealismGraph {
  const sizes = drawGroupSizes(rng, C.NTOTAL);
  const group: number[] = [];
  const parentOf: number[] = [];
  const depth: number[] = [];
  const children = new Map<number, number>();
  const links: RealismGraph['links'] = [];
  const members: number[][] = [];
  const maxChildren = options.branching === 'bushy' ? 4 : options.branching === 'linear' ? 2 : D.maxChildren;
  const link = (source: number, target: number, kind: RealismLink['kind']) => {
    links.push({ source, target, kind });
    if (kind !== 'back') children.set(source, (children.get(source) ?? 0) + 1);
  };
  const choose = (pool: number[]) => {
    const open = pool.filter((id) => (children.get(id) ?? 0) < maxChildren);
    const from = open.length > 0 ? open : pool;
    if (options.branching === 'linear' && rng() < 0.75) return from[from.length - 1];
    if (options.branching === 'bushy') {
      // the shallowest boxes first, so the flow fans out
      const top = Math.min(...from.map((id) => depth[id]));
      return pick(rng, from.filter((id) => depth[id] <= top + 1));
    }
    return pick(rng, from);
  };
  sizes.forEach((size, g) => {
    const ids: number[] = [];
    for (let k = 0; k < size; k += 1) {
      const id = group.length;
      group.push(g);
      if (k === 0 && g > 0) {
        const parent = choose(members.slice(Math.max(0, g - D.attachBack), g).flat());
        link(parent, id, 'entry');
        parentOf.push(parent);
        depth.push(depth[parent] + 1);
      } else if (k > 0) {
        const parent = choose(ids);
        link(parent, id, 'tree');
        parentOf.push(parent);
        depth.push(depth[parent] + 1);
      } else {
        parentOf.push(-1);
        depth.push(0);
      }
      ids.push(id);
    }
    members.push(ids);
  });
  const ancestors = (id: number) => {
    const out = new Set<number>();
    for (let p = parentOf[id]; p >= 0; p = parentOf[p]) out.add(p);
    return out;
  };
  const has = (s: number, t: number) => links.some((l) => (l.source === s && l.target === t) || (l.source === t && l.target === s));
  if (options.structure === 'merges') {
    // a box joins a second branch: a link from a box that is neither its ancestor nor below it
    for (let m = 0, tries = 0; m < 4 && tries < 200; tries += 1) {
      const g = Math.floor(rng() * members.length);
      const pool = [...members[g], ...(members[g + 1] ?? [])];
      const t = pick(rng, pool);
      const s = pick(rng, pool);
      if (s !== t && depth[s] < depth[t] && !ancestors(t).has(s) && !ancestors(s).has(t) && !has(s, t)) {
        link(s, t, 'merge');
        m += 1;
      }
    }
  }
  if (options.structure === 'loops') {
    // a box sends the flow back to one of its ancestors in the same group, two levels up or more
    for (let m = 0, tries = 0; m < 3 && tries < 200; tries += 1) {
      const g = Math.floor(rng() * members.length);
      const s = pick(rng, members[g]);
      const up = [...ancestors(s)].filter((a) => group[a] === g && depth[s] - depth[a] >= 2);
      if (up.length > 0) {
        const t = pick(rng, up);
        if (!has(s, t)) {
          link(s, t, 'back');
          m += 1;
        }
      }
    }
  }
  return { group, links };
}

/** The kind, text and box size of every node. */
function dressNodes(rng: Rng, graph: RealismGraph, options: Realism) {
  const n = graph.group.length;
  const out = new Array(n).fill(0).map(() => 0);
  const into = new Array(n).fill(0).map(() => 0);
  graph.links.forEach((l) => {
    if (l.kind === 'back') return;
    out[l.source] += 1;
    into[l.target] += 1;
  });
  return graph.group.map((g, id) => {
    let kind: NodeKind = 'process';
    if (options.nodeTypes) {
      if (into[id] === 0) kind = 'start';
      else if (out[id] === 0) kind = 'end';
      else if (out[id] >= 2) kind = 'decision';
    }
    let text: string | undefined;
    if (options.labels === 'text') {
      if (kind === 'start') text = 'Start';
      else if (kind === 'end') text = 'End';
      else if (kind === 'decision') text = pick(rng, QUESTIONS);
      else text = `${pick(rng, VERBS)} ${pick(rng, NOUNS)}`;
    }
    let w: number = D.box.width;
    let h: number = D.box.height;
    if (text) w = Math.max(D.box.width, text.length * CHAR_W + TEXT_MARGIN);
    else if (options.width === 'varied') w = Math.round(D.box.width * (0.7 + rng() * 0.9));
    if (kind === 'decision') {
      // a diamond needs about twice the box to hold the same text
      w = Math.max(44, w * 1.3);
      h = 32;
    }
    const bars = options.labels === 'bars'
      ? (rng() < 0.5 ? [0.5 + rng() * 0.3] : [0.55 + rng() * 0.3, 0.3 + rng() * 0.3])
      : undefined;
    return {
      id, group: g, kind, x: 0, y: 0, w, h, text, bars,
    };
  });
}

/** Where the segment from the centre of `box` towards `to` leaves the box. */
function clipToBox(box: RealismNode, to: Pt, gap = C.FLOW_LINK_GAP): Pt {
  const dx = to.x - box.x;
  const dy = to.y - box.y;
  const len = Math.hypot(dx, dy) || 1;
  const t = Math.min((box.w / 2) / Math.abs(dx || 1e-9), (box.h / 2) / Math.abs(dy || 1e-9));
  return { x: box.x + dx * t + (dx / len) * gap, y: box.y + dy * t + (dy / len) * gap };
}

/** Lays the dressed nodes out with dagre or d3-force; links get their routes. */
function layoutRealism(graph: RealismGraph, nodes: RealismNode[], options: Realism): RealismLink[] {
  if (options.layout === 'force') {
    const sim: d3.SimulationNodeDatum[] = nodes.map((n) => ({ index: n.id }));
    const simLinks = graph.links.map((l) => ({ source: l.source, target: l.target }));
    const simulation = d3.forceSimulation(sim)
      .force('link', d3.forceLink(simLinks).distance(46).strength(0.8))
      .force('charge', d3.forceManyBody().strength(-90))
      .force('collide', d3.forceCollide(D.box.width / 2 + 4))
      .force('x', d3.forceX(0).strength(0.03))
      .force('y', d3.forceY(0).strength(0.03))
      .stop();
    // d3-force starts from a fixed phyllotaxis and uses its own seeded jiggle, so this is deterministic
    for (let i = 0; i < 400; i += 1) simulation.tick();
    sim.forEach((p, id) => {
      nodes[id].x = p.x ?? 0;
      nodes[id].y = p.y ?? 0;
    });
    return graph.links.map((l) => ({
      ...l,
      points: [clipToBox(nodes[l.source], nodes[l.target]), clipToBox(nodes[l.target], nodes[l.source])],
    }));
  }
  const g = new dagre.graphlib.Graph({ multigraph: false });
  const space = SPACING[options.spacing];
  g.setGraph({
    rankdir: options.layout === 'dagre-lr' ? 'LR' : 'TB', nodesep: space.nodeSep, ranksep: space.rankSep, marginx: 0, marginy: 0,
  });
  g.setDefaultEdgeLabel(() => ({}));
  nodes.forEach((n) => g.setNode(`${n.id}`, { width: n.w, height: n.h }));
  graph.links.forEach((l) => g.setEdge(`${l.source}`, `${l.target}`));
  dagre.layout(g);
  nodes.forEach((n) => {
    const p = g.node(`${n.id}`);
    n.x = p.x;
    n.y = p.y;
  });
  return graph.links.map((l) => {
    const pts = ((g.edge(`${l.source}`, `${l.target}`).points ?? []) as Pt[]).map((p) => ({ x: p.x, y: p.y }));
    // dagre's ends lie on the box borders; pull them back by the usual gap
    const inner = pts.slice(1, -1);
    const first = inner[0] ?? nodes[l.target];
    const last = inner[inner.length - 1] ?? nodes[l.source];
    return {
      ...l,
      points: [clipToBox(nodes[l.source], first), ...inner, clipToBox(nodes[l.target], last)],
    };
  });
}

/** Box of a node. */
export function nodeRect(n: RealismNode): Rect {
  return {
    x: n.x - n.w / 2, y: n.y - n.h / 2, w: n.w, h: n.h,
  };
}

/** True when two boxes overlap or come closer than `gap`. */
function tooClose(a: Rect, b: Rect, gap: number) {
  return a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap;
}

/**
 * The groups moved apart as in `moveApart`: each group rigid, its centroid scaled from the chart
 * centre by `FLOW_DAGRE.apart` (the larger factor across the flow, so left to right swaps them).
 * Links inside a group move with it; links between groups are redrawn straight. `null` when two
 * boxes would then overlap.
 */
function apartOf(nodes: RealismNode[], links: RealismLink[], options: Realism) {
  const b = unionOf(nodes.map(nodeRect));
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  const [fx, fy] = options.layout === 'dagre-lr' ? [D.apart.y, D.apart.x] : [D.apart.x, D.apart.y];
  const shift = new Map<number, Pt>();
  new Set(nodes.map((n) => n.group)).forEach((k) => {
    const mine = nodes.filter((n) => n.group === k);
    const gx = mine.reduce((s, n) => s + n.x, 0) / mine.length;
    const gy = mine.reduce((s, n) => s + n.y, 0) / mine.length;
    shift.set(k, { x: (fx - 1) * (gx - cx), y: (fy - 1) * (gy - cy) });
  });
  const moved = nodes.map((n) => ({ ...n, x: n.x + (shift.get(n.group) as Pt).x, y: n.y + (shift.get(n.group) as Pt).y }));
  const rects = moved.map(nodeRect);
  for (let i = 0; i < rects.length; i += 1) {
    for (let j = i + 1; j < rects.length; j += 1) if (tooClose(rects[i], rects[j], 4)) return null;
  }
  const movedLinks = links.map((l) => {
    const gs = nodes[l.source].group;
    if (gs === nodes[l.target].group) {
      const d = shift.get(gs) as Pt;
      return { ...l, points: l.points.map((p) => ({ x: p.x + d.x, y: p.y + d.y })) };
    }
    const s = moved[l.source];
    const t = moved[l.target];
    return { ...l, points: [clipToBox(s, t), clipToBox(t, s)] };
  });
  return { nodes: moved, links: movedLinks };
}

/** Puts the chart's bounding box at the centre of the canvas. */
function centre(nodes: RealismNode[], links: RealismLink[]) {
  const b = unionOf(nodes.map(nodeRect));
  const dx = C.CANVAS.width / 2 - (b.x + b.w / 2);
  const dy = C.CANVAS.height / 2 - (b.y + b.h / 2);
  return {
    nodes: nodes.map((n) => ({ ...n, x: n.x + dx, y: n.y + dy })),
    links: links.map((l) => ({ ...l, points: l.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) })),
  };
}

/** Yes / No on the first two links out of each decision. */
function labelDecisions(nodes: RealismNode[], links: RealismLink[]) {
  nodes.filter((n) => n.kind === 'decision').forEach((n) => {
    links.filter((l) => l.source === n.id && l.kind !== 'back').slice(0, 2).forEach((l, i) => {
      l.label = i === 0 ? 'Yes' : 'No';
    });
  });
}

/**
 * The three panels of one realism setting for `seed`, all of the same graph: plain, highlighted
 * (plain layout with the rough group rectangles) and apart. The first seed from `seed` on whose
 * groups can be moved apart without boxes overlapping is used, so all three always exist.
 */
export function buildRealism(seed: number, partial: Partial<Realism>): { plain: RealismChart; highlight: RealismChart; apart: RealismChart; seed: number } {
  const options = { ...REALISM_DEFAULT, ...partial };
  for (let s = seed; ; s += 1) {
    const rng = mulberry32(s);
    const graph = drawRealismGraph(rng, options);
    const nodes = dressNodes(rng, graph, options);
    const links = layoutRealism(graph, nodes, options);
    if (options.nodeTypes) labelDecisions(nodes, links);
    const moved = apartOf(nodes, links, options);
    if (moved || s > seed + 50) {
      const plain = centre(nodes, links);
      const apart = moved ? centre(moved.nodes, moved.links) : plain;
      const shade = (chart: { nodes: RealismNode[] }) => [...highlightRects(
        { group: chart.nodes.map((n) => n.group) },
        chart.nodes.map((n) => ({ x: n.x, y: n.y })),
        chart.nodes.map(nodeRect),
      ).values()].filter((r) => r).map((r) => (r as { rect: Rect }).rect);
      const chart = (arrangement: 'plain' | 'apart', c: { nodes: RealismNode[]; links: RealismLink[] }, highlight: Rect[]): RealismChart => ({
        options, seed: s, arrangement, nodes: c.nodes, links: c.links, highlight,
      });
      return {
        seed: s,
        plain: chart('plain', plain, []),
        highlight: chart('plain', plain, shade(plain)),
        apart: chart('apart', apart, []),
      };
    }
  }
}

/** Number of pairs of link segments that cross (links sharing a box are not counted). */
export function countCrossings(chart: RealismChart): number {
  const segs = chart.links.flatMap((l, li) => l.points.slice(1).map((p, i) => ({
    li, a: l.points[i], b: p, s: l.source, t: l.target,
  })));
  const cross = (p: Pt, q: Pt, r: Pt, u: Pt) => {
    const d = (a: Pt, b: Pt, c: Pt) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    return d(p, q, r) * d(p, q, u) < 0 && d(r, u, p) * d(r, u, q) < 0;
  };
  let n = 0;
  for (let i = 0; i < segs.length; i += 1) {
    for (let j = i + 1; j < segs.length; j += 1) {
      const A = segs[i];
      const B = segs[j];
      const shared = A.s === B.s || A.s === B.t || A.t === B.s || A.t === B.t;
      if (A.li !== B.li && !shared && cross(A.a, A.b, B.a, B.b)) n += 1;
    }
  }
  return n;
}

/** Bounding box of the boxes. */
export function chartBounds(chart: RealismChart): Rect {
  return unionOf(chart.nodes.map(nodeRect));
}
