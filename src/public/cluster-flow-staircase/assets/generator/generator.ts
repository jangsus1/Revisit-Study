/**
 * The public entry point of the generator: a pure, deterministic `Display` for a given seed.
 *
 * `generateDisplay(seed, opts)` always returns the same object for the same arguments. When a
 * seed produces a display that violates an occlusion invariant, the next seed of a derived
 * sequence (`hashSeed(seed, attempt)`) is tried and `display.attempts` records how many seeds
 * were consumed. `display.seed` is always the *requested* seed, so a trial can be reproduced
 * from the stored record alone.
 *
 * Stimulus A depends on the cue as well as the seed: `proximity` uses the gapped layout and every
 * other cue the even one (`layoutModeFor`), so one seed gives different geometry for `proximity`
 * than for the other cues (the templates and jitter are the same). Stimulus B depends on its paired
 * A (field and link budget), so it must always be regenerated through `generateTrialPair`.
 */
import { buildBaseline } from './baseline';
import { GENERATOR_CONFIG as C } from './config';
import { numDistributer } from './clusterSizes';
import { applyCue } from './cues';
import { GraphCluster, buildGraph } from './graph';
import { checkInvariants } from './invariants';
import { buildLayout, drawJitter } from './layout';
import { measureDisplay } from './metrics';
import { makePalette } from './palette';
import { jitterRng, mulberry32 } from './prng';
import {
  Cue, Density, Display, DisplayCluster, DisplayNode, GenerateOptions, Rect, layoutModeFor,
} from './types';

/**
 * A deterministic 32-bit FNV-1a hash of the string form of `parts`, joined by `|`.
 * Used to derive trial seeds from the session salt and to walk the retry sequence.
 */
export function hashSeed(...parts: (number | string)[]): number {
  /* eslint-disable no-bitwise -- a 32-bit hash is bitwise by definition */
  const text = parts.join('|');
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
  /* eslint-enable no-bitwise */
}

/** Builds stimulus A (24 dots in 6 clusters) for one concrete seed. */
function buildStimulusA(seed: number, opts: GenerateOptions): Display {
  const rng = mulberry32(seed);
  const jitter = drawJitter(jitterRng(seed));
  const sizes = numDistributer(rng, C.NCLUST, C.NTOTAL);
  const layout = buildLayout(rng, sizes, jitter, layoutModeFor(opts.cue));

  let nextId = 0;
  const graphClusters: GraphCluster[] = layout.clusters.map((cluster) => {
    const nodeIds = cluster.points.map(() => {
      const id = nextId;
      nextId += 1;
      return id;
    });
    return {
      index: cluster.index,
      nodeIds,
      positions: cluster.points,
      cx: cluster.cx,
      cy: cluster.cy,
    };
  });

  const graph = buildGraph(rng, graphClusters, opts.density);

  const nodes: DisplayNode[] = graphClusters.flatMap((cluster) => cluster.nodeIds.map((id, i) => ({
    id,
    x: cluster.positions[i].x,
    y: cluster.positions[i].y,
    cluster: cluster.index,
    rank: graph.rank[id],
    shape: 'circle' as const,
    fill: C.DOT_FILL,
  })));

  const clusters: DisplayCluster[] = graphClusters.map((cluster) => ({
    index: cluster.index,
    nodeIds: cluster.nodeIds,
    cx: cluster.cx,
    cy: cluster.cy,
    orderPos: graph.order.indexOf(cluster.index),
  }));

  const display: Display = {
    kind: 'A',
    seed,
    cue: opts.cue,
    density: opts.density,
    n: nodes.length,
    width: C.CANVAS.width,
    height: C.CANVAS.height,
    background: C.BACKGROUND,
    nodes,
    edges: graph.edges,
    clusters,
    attempts: 1,
    meta: {
      clusterSizes: sizes,
      jitter: layout.jitter,
      gapX: layout.gapX,
      gapY: layout.gapY,
      order: graph.order,
      layout: layout.mode,
    },
  };

  return applyCue(display, opts.cue, rng, makePalette(opts.hueOffset ?? 0));
}

/**
 * Generates a display that satisfies every occlusion invariant, retrying with derived seeds.
 * Throws when `MAX_SEED_ATTEMPTS` seeds in a row all fail.
 */
export function generateDisplay(seed: number, opts: GenerateOptions): Display {
  const nB = opts.nB ?? C.NTOTAL;
  if (opts.kind === 'B' && (!Number.isInteger(nB) || nB < 1)) {
    throw new Error(`stimulus B needs a positive integer nB, got ${opts.nB}`);
  }
  let lastViolations: string[] = ['no display was built'];
  for (let attempt = 0; attempt < C.MAX_SEED_ATTEMPTS; attempt += 1) {
    // eslint-disable-next-line no-bitwise -- normalise the requested seed to a 32-bit integer
    const derived = attempt === 0 ? seed >>> 0 : hashSeed(seed, attempt);
    const display = opts.kind === 'A'
      ? buildStimulusA(derived, opts)
      : buildBaseline(derived, nB, opts.cue, opts.density, {
        field: opts.field,
        palette: makePalette(opts.hueOffset ?? 0),
        target: opts.inkTarget,
      });
    if (display) {
      const violations = checkInvariants(display);
      if (violations.length === 0) {
        display.seed = seed;
        display.attempts = attempt + 1;
        return display;
      }
      lastViolations = violations;
    } else {
      lastViolations = [`could not place ${nB} dots within ${C.B_PLACEMENT_MAX_TRIES} tries`];
    }
  }
  throw new Error(
    `generateDisplay: no valid ${opts.kind} display for seed ${seed} (cue ${opts.cue}, ${opts.density}, nB ${nB}) `
    + `after ${C.MAX_SEED_ATTEMPTS} attempts; last violations: ${lastViolations.join('; ')}`,
  );
}

/** The bounding box of a display's dot centres, canvas px. */
export function nodeBounds(display: Display): Rect {
  const xs = display.nodes.map((n) => n.x);
  const ys = display.nodes.map((n) => n.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return {
    x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y,
  };
}

export interface TrialPairOptions {
  cue: Cue;
  density: Density;
  nB: number;
  /** colour-wheel rotation in degrees; default 0 */
  hueOffset?: number;
}

/**
 * The two displays of one trial. A is built first; B is then sampled inside A's dot-centre
 * bounding box and aims its links at A's link length plus A's outline ink (`measureDisplay`).
 * This is the only way B is ever built for a trial, so the runner, the gallery and the analysis
 * regenerate identical pairs from `seedA`, `seedB`, cue, density, `nB` and `hueOffset`.
 */
export function generateTrialPair(
  seedA: number,
  seedB: number,
  opts: TrialPairOptions,
): { displayA: Display; displayB: Display } {
  const hueOffset = opts.hueOffset ?? 0;
  const displayA = generateDisplay(seedA, {
    kind: 'A', cue: opts.cue, density: opts.density, hueOffset,
  });
  const metricsA = measureDisplay(displayA);
  const displayB = generateDisplay(seedB, {
    kind: 'B',
    cue: opts.cue,
    density: opts.density,
    nB: opts.nB,
    hueOffset,
    field: nodeBounds(displayA),
    inkTarget: {
      linkLength: metricsA.linkLength,
      outlineInk: metricsA.outlineInk,
      edges: displayA.edges.length,
    },
  });
  return { displayA, displayB };
}
