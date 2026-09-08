/**
 * Shared type contract for the cluster-flow stimulus generator and the experiment components.
 * All coordinates in a Display are final canvas pixels (already scaled), origin top-left.
 */

export type Cue = 'none' | 'hull' | 'rect' | 'color' | 'edge' | 'shape';
export type Density = 'sparse' | 'dense';
export type StimulusKind = 'A' | 'B';
export type NodeShape = 'circle' | 'square' | 'diamond';
export type StaircaseId = 'above' | 'below' | 'catch' | 'practice';

export const CUES: Cue[] = ['none', 'hull', 'rect', 'color', 'edge', 'shape'];
export const DENSITIES: Density[] = ['sparse', 'dense'];

export interface DisplayNode {
  id: number;
  /** canvas px */
  x: number;
  y: number;
  /** cluster index 0..5 for stimulus A; -1 for stimulus B */
  cluster: number;
  /** topological rank within its cluster (A) or within the whole graph (B) */
  rank: number;
  shape: NodeShape;
  /** CSS fill colour */
  fill: string;
}

export interface DisplayEdge {
  source: number;
  target: number;
  /** 'within' = both endpoints in one cluster, 'between' = backbone or skip link (A); B edges are 'within' */
  kind: 'within' | 'between';
  /** true when rendered dashed (edge cue) */
  dashed: boolean;
  /** true for dense-only extra arrows or skip links */
  extra: boolean;
}

export interface DisplayCluster {
  index: number;
  nodeIds: number[];
  /** canvas px centroid */
  cx: number;
  cy: number;
  /** position of this cluster in the greedy traversal order (0 = first) */
  orderPos: number;
  /** padded hull polygon in canvas px, present only for the hull cue */
  hull?: [number, number][];
  /** padded bounding rectangle in canvas px, present only for the rect cue */
  rect?: { x: number; y: number; w: number; h: number };
}

export interface Display {
  kind: StimulusKind;
  seed: number;
  cue: Cue;
  density: Density;
  /** number of nodes actually placed */
  n: number;
  width: number;
  height: number;
  /** ground colour */
  background: string;
  nodes: DisplayNode[];
  edges: DisplayEdge[];
  /** empty for stimulus B */
  clusters: DisplayCluster[];
  /** how many seeds were tried before one satisfied the invariants (1 = first try) */
  attempts: number;
  /** generator diagnostics for the gallery footer; A only */
  meta: {
    clusterSizes?: number[];
    jitter?: number;
    gapX?: number[];
    gapY?: number[];
    /** cluster indices in traversal order */
    order?: number[];
  };
}

export interface GenerateOptions {
  kind: StimulusKind;
  cue: Cue;
  density: Density;
  /** node count for stimulus B; ignored for A (always 24) */
  nB?: number;
}

export interface TrialParams {
  seedA: number;
  seedB: number;
  nB: number;
  cue: Cue;
  density: Density;
  cellId: string;
  trialIndex: number;
  staircaseId: StaircaseId;
  feedback: boolean;
  /** measured frame period in ms from the setup component; defaults to 1000/60 */
  refreshMs: number;
}

export interface MeasuredDurations {
  fixation: number;
  a: number;
  blank1: number;
  b: number;
  blank2: number;
}

export interface TrialAnswer {
  response: 'first' | 'second';
  correct: boolean;
  rtMs: number;
  nA: number;
  nB: number;
  cue: Cue;
  density: Density;
  cellId: string;
  staircaseId: StaircaseId;
  trialIndex: number;
  seedA: number;
  seedB: number;
  attemptsA: number;
  attemptsB: number;
  measured: MeasuredDurations;
  refreshMs: number;
  fullscreen: boolean;
  displayA: Display;
  displayB: Display;
}

export interface SetupAnswer {
  sessionSalt: number;
  refreshMs: number;
  calibration: { targetMs: number; measuredMs: number }[];
  medianErrorMs: number;
  maxErrorMs: number;
  screen: { w: number; h: number; dpr: number };
  userAgent: string;
  fullscreen: boolean;
}
