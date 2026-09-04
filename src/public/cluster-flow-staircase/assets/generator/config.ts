/**
 * Every tunable constant of the cluster-flow stimulus generator, in one frozen object.
 *
 * Lengths without a `SCALE` in their name are in *source* pixels (the MATLAB lattice units of
 * SPEC sections 1-5). The layout applies `SCALE` exactly once, when it converts the source layout
 * into canvas coordinates; anything the renderer draws on top of a canvas coordinate (dot radius,
 * link width, dash pattern, arrowhead) multiplies its source constant by `SCALE` at draw time.
 * `HULL_PADDING` and `CANVAS*` are the exceptions: they are already canvas pixels.
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
  /** The single scale factor from source px to canvas px. */
  SCALE: 0.6,
  /** Canvas size in css px; both stimuli use exactly this frame. */
  CANVAS: { width: 480, height: 360 },
  /** Keep-out border in canvas px: no dot edge may come closer than this to the frame. */
  CANVAS_MARGIN: 16,
  /**
   * Ground colour. The MATLAB original used RGB 80 80 80 with light dots; the reVISit study uses
   * the inverse polarity (white ground, dark dots) so the trials run on a light page.
   */
  BACKGROUND: '#FFFFFF',
  /** Default dot fill: mid-dark grey, relative luminance Y = 0.133 on the white ground. */
  DOT_FILL: '#666666',
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
  /** Hull / rect cue padding in canvas px, added on top of RDOT * SCALE. */
  HULL_PADDING: 10,
  /** Hull / rect cue stroke colour. */
  HULL_STROKE: '#333333',
  /** Hull / rect cue stroke width in canvas px. */
  HULL_STROKE_WIDTH: 1.5,
  /** Dash pattern for the edge cue, in source px. */
  DASH: [6, 4],
  /**
   * Six categorical fills for the colour cue. Each is an Okabe-Ito hue pushed along its own
   * HSL lightness (and, where the hue could not otherwise reach it, desaturated) until its
   * relative luminance equals that of the default dot grey #666666 (Y = 0.133). Equal luminance
   * means no colour pops out of the display, so the cue is categorical only. Order follows
   * Okabe-Ito: orange, sky blue, bluish green, yellow, reddish purple, vermillion.
   */
  COLOR_PALETTE: ['#895E00', '#146B9D', '#007555', '#6F6809', '#A84079', '#A94A00'],
  /** The three marks of the shape cue; each is used by exactly two clusters. */
  SHAPES: ['circle', 'square', 'diamond'] as const,
  /** How many derived seeds `generateDisplay` may try before giving up on the invariants. */
  MAX_SEED_ATTEMPTS: 200,
  /** Rejection-sampling budget for placing all stimulus B dots; exceeding it reseeds. */
  B_PLACEMENT_MAX_TRIES: 5000,
  /**
   * Stimulus B: how many nearest already-placed dots a new node may attach to. B edges connect
   * spatial neighbours so link lengths match A's within-cluster links.
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
