/**
 * Drawing parameters of the follow-up variants (`Variant`, meeting 2026-10-21), shared by the
 * renderer, the builders and the invariants so what is drawn and what is checked agree. Every
 * function returns the original value when the display has no variant.
 */
import { GENERATOR_CONFIG as C } from './config';
import {
  DOT_R, HEAD_LEN, HEAD_W, LINK_W, MARK_REACH, TRIM,
} from './geometry';
import { makePalette } from './palette';
import { Display, Variant } from './types';

/** Node radius multiplier: `color-large` only. */
export function nodeScale(variant?: Variant): number {
  return variant === 'color-large' ? C.VARIANT_NODE_SCALE : 1;
}

/** The furthest a node mark reaches, for the builders' clearance (the largest mark, scaled). */
export function markReach(variant?: Variant): number {
  return Math.max(...Object.values(MARK_REACH)) * nodeScale(variant);
}

/** Drawn link geometry of a display: width, trim at both ends, arrowhead size. */
export function linkStyle(variant?: Variant): { width: number; trim: number; headLen: number; headW: number } {
  const k = variant === 'edge-bold' ? C.VARIANT_LINK_SCALE : 1;
  const s = nodeScale(variant);
  return {
    width: LINK_W * k,
    // trimmed back past the larger node by the same margin as the original (LINK_TRIM)
    trim: TRIM + DOT_R * (s - 1),
    headLen: HEAD_LEN * Math.max(1, k * 0.75),
    headW: HEAD_W * Math.max(1, k * 0.75),
  };
}

/** The colour-cue palette for a variant: one of the distinct sets, else the participant's ellipse. */
export function variantPalette(variant: Variant | undefined, hueOffset: number): readonly string[] {
  if (variant === 'color-distinct') return C.DISTINCT_PALETTE;
  return makePalette(hueOffset);
}

/** True for the variants whose clusters are fully connected inside (links may cross). */
export function allowsCrossings(variant?: Variant): boolean {
  return variant === 'intra-full' || variant === 'intra-full-plus';
}

/** `rect-shade`: the ground of a display (B gets the yellow everywhere). */
export function groundOf(display: Pick<Display, 'kind' | 'variant' | 'background'>): string {
  return display.variant === 'rect-shade' && display.kind === 'B' ? C.SHADE_FILL : display.background;
}
