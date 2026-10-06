/**
 * Shared type contract for the cluster-flow stimulus generator and the experiment components.
 * All coordinates in a Display are final canvas pixels (already scaled), origin top-left.
 */

/** `proximity` is the control: grey circles and solid links, grouped by the gapped layout only. */
export type Cue = 'proximity' | 'rect' | 'color' | 'shape' | 'edge';
export type Density = 'sparse' | 'dense';
export type StimulusKind = 'A' | 'B';
export type NodeShape = 'circle' | 'square' | 'triangle' | 'hollowCircle' | 'hollowSquare' | 'hollowTriangle';
export type StaircaseId = 'above' | 'below' | 'catch' | 'practice';
/**
 * How stimulus A places its clusters. `grouped` (proximity) puts `PROXIMITY_GAP` within-cluster
 * pitches between the facing edges of neighbouring clusters; `even` puts exactly one pitch there,
 * so position does not group and only the cue does.
 */
export type LayoutMode = 'grouped' | 'even';

export const CUES: Cue[] = ['proximity', 'rect', 'color', 'shape', 'edge'];
export const DENSITIES: Density[] = ['sparse', 'dense'];

/** Only the `proximity` control keeps the gapped layout; every other cue is shown on the even one. */
export function layoutModeFor(cue: Cue): LayoutMode {
  return cue === 'proximity' ? 'grouped' : 'even';
}

/** An axis-aligned rectangle in canvas px. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

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
  /** padded bounding rectangle in canvas px, present only for the rect cue */
  rect?: Rect;
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
    /** A only: which layout placed the clusters */
    layout?: LayoutMode;
    /** B only: the field the dots were sampled in, in canvas px */
    field?: Rect;
    /** B only: the minimum centre spacing used for this N_B, in canvas px */
    spacing?: number;
    /** B only: the total visible link length the tree builder aimed for, in canvas px */
    linkTarget?: number;
  };
}

/** What stimulus B's link builder aims for, taken from the paired stimulus A (`generateTrialPair`). */
export interface InkTarget {
  /** A's total visible link length, canvas px */
  linkLength: number;
  /** A's number of links */
  edges: number;
}

/** Ink and spacing statistics of a display, all in canvas px (areas in px^2). */
export interface DisplayMetrics {
  /** nodeInk + linkInk + outlineInk */
  ink: number;
  nodeInk: number;
  /** visible line ink (dash duty cycle included) plus arrowheads */
  linkInk: number;
  outlineInk: number;
  /** summed visible length of the link lines (trimmed at both ends, arrowhead excluded) */
  linkLength: number;
  meanNN: number;
  minNN: number;
  meanPairwise: number;
  /** area of the convex hull of the node centres */
  hullArea: number;
}

export interface GenerateOptions {
  kind: StimulusKind;
  cue: Cue;
  density: Density;
  /** A only: override the cue's layout (`generateTrialPair` builds B's reference A as `even`) */
  layout?: LayoutMode;
  /** node count for stimulus B; ignored for A (always 24) */
  nB?: number;
  /** rotation of the colour-cue ellipse, degrees of its perimeter (60 = one colour); default 0 */
  hueOffset?: number;
  /** B only: sample the dots inside this rectangle (A's dot-centre bounding box); default the canvas */
  field?: Rect;
  /** B only: the link-length budget taken from the paired A; default: plain nearest-neighbour links */
  inkTarget?: InkTarget;
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
  /** true when stimulus A is shown in the first interval and B in the second; drawn per trial */
  aFirst: boolean;
  /** the participant's colour-ellipse rotation in degrees of its perimeter, drawn once per session */
  hueOffset: number;
  /** the participant's staircase starting levels for this cell; null for practice trials */
  starts: { above: number; below: number } | null;
  /** measured frame period in ms from the setup component; defaults to 1000/60 */
  refreshMs: number;
  /** CSS px per cm from the setup's card check; null (or absent) without a card */
  pxPerCm?: number | null;
  /**
   * show the "press any key or click to start" gate before the fixation: set by the blocks on the
   * block's first trial and on the first trial after a rest page
   */
  waitForStart?: boolean;
}

/** Paint-to-paint durations of the timed phases, in ms. */
export interface MeasuredDurations {
  fixation: number;
  /** first stimulus */
  s1: number;
  /** noise mask between the two stimuli */
  mask: number;
  /** blank after the mask */
  blank: number;
  /** second stimulus */
  s2: number;
  /** blank before the prompt */
  blank2: number;
}

/**
 * Telemetry stored in the hidden `trialData` response. Correctness is not stored here: reVISit keeps
 * the participant's `trial` answer and the block's `correctAnswer` on the same record, and the
 * dynamic block derives `correct` from those two when it replays the staircase.
 */
export interface TrialAnswer {
  /** the interval the participant judged to hold more items */
  response: 'first' | 'second';
  /** whether stimulus A was shown first; the participant chose A when (response === 'first') === aFirst */
  aFirst: boolean;
  hueOffset: number;
  starts: { above: number; below: number } | null;
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
  /** times full screen was left in this session up to this answer (a running total) */
  fullscreenExits: number;
  /** the CSS scale applied to the whole 800 x 640 design stage; displays and metrics stay in design px */
  displayScale: number;
  /** the stimulus width on screen in cm; null without a card calibration */
  stimulusWidthCm: number | null;
  /** ms from the start gate appearing to the key press or click that started the trial; null when there was no gate */
  startWaitMs: number | null;
  metricsA: DisplayMetrics;
  metricsB: DisplayMetrics;
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
  /** times full screen was left in the session before the setup finished */
  fullscreenExits: number;
  /** CSS px per cm from the card check; null when the participant had no card */
  pxPerCm: number | null;
  /** the matched card picture's width in CSS px; null without a card */
  cardWidthPx: number | null;
  /** screen diagonal in inches implied by the card; null without a card */
  screenInches: number | null;
  /** true when the participant kept a card size implying a screen outside 11-34 inches */
  confirmedImplausible: boolean;
}
