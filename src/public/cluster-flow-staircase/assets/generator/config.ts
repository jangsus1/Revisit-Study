/**
 * Every tunable constant of the cluster-flow stimulus generator, in one frozen object.
 *
 * Lengths without a `SCALE` in their name are in *source* pixels (the MATLAB lattice units of
 * SPEC sections 1-5). The layout applies `SCALE` exactly once, when it converts the source layout
 * into canvas coordinates; anything the renderer draws on top of a canvas coordinate (dot radius,
 * link width, arrowhead, shape strokes) multiplies its source constant by `SCALE` at draw time
 * (`geometry.ts` does that once for the renderer and the metrics). `HULL_PADDING`, `CANVAS*`,
 * `BETWEEN_DASH` and the `B_*` spacing constants are the exceptions: they are already canvas pixels.
 */
export const GENERATOR_CONFIG = {
  /** Total number of dots in stimulus A (MATLAB `totalRefNum`). */
  NTOTAL: 24,
  /** Number of clusters in stimulus A, laid out on a 2 x 3 meta grid. */
  NCLUST: 6,
  /** Within-cluster lattice pitch in source px (MATLAB `interDist`). */
  INTER: 100,
  /** Dot radius in source px (MATLAB `radius_clusterDots`); 20 px diameter before scaling. */
  RDOT: 10,
  /** Between-cluster spacing multiplier (MATLAB `customizedRatio`). */
  RATIO: 1.2,
  /** Smallest per-seed jitter amplitude in source px (inclusive). */
  JITTER_MIN: 3,
  /** Largest per-seed jitter amplitude in source px (inclusive). */
  JITTER_MAX: 15,
  /** The single scale factor from source px to canvas px (0.6 before the single-location redesign). */
  SCALE: 0.9,
  /** Canvas size in css px; both stimuli use exactly this frame, shown at one screen location. */
  CANVAS: { width: 720, height: 540 },
  /** Keep-out border in canvas px: no dot edge may come closer than this to the frame. */
  CANVAS_MARGIN: 16,
  /**
   * Ground colour. The MATLAB original used RGB 80 80 80 with light dots; the reVISit study uses
   * the inverse polarity (white ground, dark dots) so the trials run on a light page.
   */
  BACKGROUND: '#FFFFFF',
  /**
   * CIELAB lightness shared by every node colour. The colour cue samples a hue circle at this L*
   * (see `palette.ts`), and the default grey below sits at the same L*, so a colour display and a
   * grey display differ in hue only.
   */
  LAB_L: 50,
  /** Default node colour: neutral grey at L* = 50 (sRGB 119 119 119). */
  DOT_FILL: '#777777',
  /** Page colour around the canvas during a trial (surround, fixation and prompt page). */
  SURROUND: '#E6E6E6',
  /** Text and fixation-cross colour on the surround. */
  INK: '#111111',
  /** Link colour. */
  LINK_STROKE: '#111111',
  /** Link width in source px. */
  LINK_WIDTH: 2,
  /** Extra source px added to RDOT when trimming a link back to the dot's edge. */
  LINK_TRIM: 4,
  /** Filled arrowhead triangle at the target end, in source px. */
  ARROWHEAD: { length: 10, width: 8 },
  /** Minimum distance between two dot centres, in multiples of RDOT (invariant 1). */
  MIN_CENTRE_DISTANCE_FACTOR: 2.4,
  /** Extra source px added to RDOT for the clearance a link must keep from other dots. */
  ARROW_CLEARANCE: 2,
  /** Dense variant: extra rank-respecting within-cluster arrows added per cluster. */
  DENSE_EXTRA_WITHIN: 2,
  /** Dense variant: probability of a backbone skip link order[i] -> order[i+2]. */
  DENSE_SKIP_P: 0.3,
  /** Rect cue padding in canvas px, added on top of RDOT * SCALE. */
  HULL_PADDING: 10,
  /** Rect cue stroke colour. */
  HULL_STROKE: '#333333',
  /** Rect cue stroke width in canvas px. */
  HULL_STROKE_WIDTH: 1.5,
  /**
   * Dash pattern of the between-cluster links under the `edge` cue, in canvas px. Sterzik et al.,
   * "Perception of Line Attributes for Visualization", IEEE TVCG 30(1), 2024, Table 4: asynchronous
   * dashing level 3 of 13 is a 10.9 px dash in a 40 px period. The period is halved here (dash
   * 5.45, gap 14.55, period 20) so that short links still show several repeats. Links are drawn
   * with round caps and, as in the paper, the lengths exclude the caps. Within-cluster links stay
   * solid.
   */
  BETWEEN_DASH: { dash: 5.45, gap: 14.55 },
  /**
   * The three marks of the shape cue, one from each mark class (filled area, hollow outline,
   * open strokes); each is used by exactly two clusters.
   */
  SHAPES: ['circle', 'hollowSquare', 'cross'] as const,
  /** Outline width of the hollow square, in source px (0.25 x RDOT). */
  HOLLOW_STROKE: 2.5,
  /** Stroke width of the two cross bars, in source px (0.25 x RDOT). */
  CROSS_STROKE: 2.5,
  /** Half-length of each cross bar (centre to bar end), in source px (1.1 x RDOT). */
  CROSS_ARM: 11,
  /** How many derived seeds `generateDisplay` may try before giving up on the invariants. */
  MAX_SEED_ATTEMPTS: 200,
  /** Rejection-sampling budget for placing all stimulus B dots; exceeding it reseeds. */
  B_PLACEMENT_MAX_TRIES: 5000,
  /**
   * Stimulus B minimum centre spacing for N_B dots in a field of area F (canvas px^2):
   * `min(B_MAX_SPACING, B_SPACING_FACTOR * sqrt(F / N_B))`, never below the shared invariant
   * floor. It thins B out like A's lattice without letting its spacing leak N_B too strongly.
   * Tuned (from 0.7) so that at N_B = 24 B's mean nearest-neighbour distance is within 15 % of
   * A's and B's closest pair is never below 0.8 x A's typical closest pair (generator tests).
   */
  B_SPACING_FACTOR: 0.8,
  /** Upper bound of the B minimum spacing in canvas px (0.75 x INTER x SCALE). */
  B_MAX_SPACING: 0.75 * 100 * 0.9,
  /**
   * Stimulus B: how many nearest already-placed dots a new node may attach to. Among those that
   * clear every other dot, the one whose length best meets the remaining link-length budget wins.
   * Tuned (from 6) so the longer links needed to match the rect cue's outline ink are reachable;
   * for the other cues the budget asks for short links and the extra candidates are not used.
   */
  B_ATTACH_CANDIDATES: 10,
  /**
   * Stimulus B with a link budget: a node already carrying this many links is passed over while
   * another candidate is usable, so long budgeted links (rect) spread out instead of forming hubs.
   * A's nodes carry at most about four links.
   */
  B_MAX_DEGREE: 4,
  /**
   * Stimulus B built without a paired A (no link budget): each link goes to a random one of this
   * many nearest usable dots. Trials always pair B with A, so this only serves stand-alone calls.
   */
  B_NEAREST_K: 3,
  /** Dense stimulus B: extra rank-respecting arrows per 24 nodes (matches A's 6 x 2). */
  B_DENSE_EXTRA_PER_24: 12,
  /**
   * Proportion of stimulus B arrows drawn dashed under the `edge` cue, so B matches A's
   * dashed/solid statistics without any grouping. Sparse A has 18 within + 5 between arrows,
   * so 5/23 = 0.217 are dashed. Dense A has 18 + 12 within and 5 + 4 * DENSE_SKIP_P = 6.2
   * between arrows on average, so 6.2/36.2 = 0.171.
   */
  B_DASH_PROPORTION: { sparse: 5 / 23, dense: 6.2 / 36.2 },
  /** Retries allowed when drawing a random node pair for an extra (dense) arrow. */
  EXTRA_ARROW_MAX_DRAWS: 20,
} as const;
