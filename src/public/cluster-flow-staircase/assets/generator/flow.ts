/**
 * Flowchart prototypes (`flow`, `flow-shade`; meeting 2026-11-04): shared lattice helpers and the
 * stimulus B builder. Nodes sit on lattice cells and are drawn as boxes (`FLOW_BOX`); every link is
 * a straight horizontal or vertical connector. A display still stores `shape: 'circle'` for its
 * nodes: the renderer, the metrics and the invariants read the box from `display.variant`.
 *
 * B is not placed in A's field with a link budget like the dot stimuli: on a shared lattice A's
 * even layout fills its own extent at 24 nodes, so B takes its cells from the whole `FLOW_GRID`
 * (8 x 7 cells centred in the canvas). It grows as one tree: each new box goes to a free cell that
 * sees an existing box along its row or column (nothing in between, no link crossed), nearer cells
 * being more likely, and is linked to the nearest such box.
 */
import { GENERATOR_CONFIG as C } from './config';
import { conflictsWithAny, linkIsClear, pointSegmentDistance } from './invariants';
import { mulberry32, randperm } from './prng';
import {
  Cue, Density, Display, DisplayEdge, DisplayNode, Rect, Variant,
} from './types';
import { markReach } from './variants';

/** The lattice pitch in canvas px. */
export const FLOW_PITCH = C.INTER * C.SCALE;

type Pt = { x: number; y: number };
type Dot = Pt & { id: number };

/** True when two points share a row or a column of the lattice. */
export function aligned(a: Pt, b: Pt): boolean {
  return Math.abs(a.x - b.x) < 0.5 || Math.abs(a.y - b.y) < 0.5;
}

/** The block of cells B of a flow variant uses for `nB` boxes (see `FLOW_FIT_BLOCKS`). */
export function flowBlock(variant: Variant, nB: number, field?: Rect): { cols: number; rows: number } {
  if (variant !== 'flow-shade-fit') return C.FLOW_GRID;
  // the rows of the paired A's packed layout (its dot-centre bounding box), 6 without one
  const rowsA = field ? Math.round(field.h / FLOW_PITCH) + 1 : C.FLOW_FIT_ROWS;
  let cols: number = C.FLOW_FIT_COLS;
  let rows = Math.min(C.FLOW_FIT_ROWS, Math.max(1, rowsA));
  const full = () => nB > cols * rows * C.FLOW_FIT_FILL;
  while (full() && rows < C.FLOW_FIT_ROWS) rows += 1;
  while (full() && cols < C.FLOW_GRID.cols) cols += 1;
  while (full() && rows < C.FLOW_GRID.rows) rows += 1;
  return { cols, rows };
}

/** Centres of the cells of a `cols` x `rows` block of the lattice, centred in the canvas. */
export function flowCells({ cols, rows }: { cols: number; rows: number } = C.FLOW_GRID): Pt[] {
  const x0 = (C.CANVAS.width - (cols - 1) * FLOW_PITCH) / 2;
  const y0 = (C.CANVAS.height - (rows - 1) * FLOW_PITCH) / 2;
  return Array.from({ length: cols * rows }, (_, i) => ({
    x: x0 + (i % cols) * FLOW_PITCH,
    y: y0 + Math.floor(i / cols) * FLOW_PITCH,
  }));
}

/** Builds the flowchart B for one seed, or `null` when the tree could not reach `nB` boxes. */
export function buildFlowBaseline(
  seed: number,
  nB: number,
  cue: Cue,
  density: Density,
  variant: Variant,
  field?: Rect,
): Display | null {
  const grid = flowBlock(variant, nB, field);
  const cells = flowCells(grid);
  if (nB > cells.length) return null;
  const rng = mulberry32(seed);
  const reach = markReach(variant);
  const free = new Set(cells.map((_, i) => i));
  const dots: Dot[] = [];
  const links: [number, number][] = [];
  const byId = (id: number) => dots[id];
  const asEdges = () => links.map(([source, target]) => ({ source, target }));
  /** A cell a link already runs through cannot take a box. */
  const onLink = (p: Pt) => links.some(([s, t]) => pointSegmentDistance(p.x, p.y, dots[s].x, dots[s].y, dots[t].x, dots[t].y) < 1);
  const sees = (p: Dot, v: Dot, others: Dot[]) => aligned(p, v)
    && linkIsClear(p, v, others, reach)
    && !conflictsWithAny(p, v, asEdges(), byId);

  const place = (cell: number) => {
    free.delete(cell);
    dots.push({ id: dots.length, ...cells[cell] });
  };
  place(Math.floor(rng() * cells.length));

  while (dots.length < nB) {
    const options: { cell: number; to: number; len: number }[] = [];
    free.forEach((cell) => {
      const p: Dot = { id: -1, ...cells[cell] };
      if (onLink(p)) return;
      let best = -1;
      let bestLen = Infinity;
      dots.forEach((v) => {
        const len = Math.hypot(p.x - v.x, p.y - v.y);
        if (len < bestLen && sees(p, v, dots)) {
          best = v.id;
          bestLen = len;
        }
      });
      if (best >= 0) options.push({ cell, to: best, len: bestLen });
    });
    if (options.length === 0) return null;
    // nearer cells are more likely: weight 1 / (length in pitches)^2
    const weights = options.map((o) => (FLOW_PITCH / o.len) ** 2);
    let draw = rng() * weights.reduce((a, b) => a + b, 0);
    let pick = options.length - 1;
    for (let i = 0; i < options.length; i += 1) {
      draw -= weights[i];
      if (draw <= 0) {
        pick = i;
        break;
      }
    }
    const { cell, to } = options[pick];
    place(cell);
    links.push([dots.length - 1, to]);
  }

  // dense: extra connectors between boxes that see each other, matched to dense A's count
  if (density === 'dense') {
    const extras = Math.round((nB / C.NTOTAL) * C.B_DENSE_EXTRA_PER_24);
    const linked = new Set(links.map(([a, b]) => `${Math.min(a, b)}-${Math.max(a, b)}`));
    for (let e = 0; e < extras; e += 1) {
      for (let tries = 0; tries < C.EXTRA_ARROW_MAX_DRAWS; tries += 1) {
        const u = Math.floor(rng() * nB);
        const v = Math.floor(rng() * nB);
        const key = `${Math.min(u, v)}-${Math.max(u, v)}`;
        if (u !== v && !linked.has(key) && sees(dots[u], dots[v], dots)) {
          linked.add(key);
          links.push([u, v]);
          break;
        }
      }
    }
  }

  // one random topological order; every link runs from the lower rank to the higher one
  const rank: number[] = [];
  randperm(rng, nB).forEach((id, q) => { rank[id] = q; });
  const edges: DisplayEdge[] = links.map(([u, v], i) => {
    const source = rank[u] < rank[v] ? u : v;
    return {
      source, target: source === u ? v : u, kind: 'within', dashed: false, extra: i >= nB - 1,
    };
  });
  const nodes: DisplayNode[] = dots.map((d) => ({
    id: d.id, x: d.x, y: d.y, cluster: -1, rank: rank[d.id], shape: 'circle', fill: C.FLOW_BOX.fill,
  }));

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
    variant,
    meta: { grid: { cols: grid.cols, rows: grid.rows } },
  };
}
