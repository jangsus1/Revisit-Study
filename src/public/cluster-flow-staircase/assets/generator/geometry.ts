/**
 * Drawing geometry in canvas px, derived once from `GENERATOR_CONFIG`. The renderer, the occlusion
 * invariants and the ink metrics all read these, so what is drawn and what is measured cannot
 * drift apart.
 */
import { GENERATOR_CONFIG as C } from './config';

/** Dot (circle) radius. */
export const DOT_R = C.RDOT * C.SCALE;
/** How far each end of a link is trimmed back from the dot centre. */
export const TRIM = (C.RDOT + C.LINK_TRIM) * C.SCALE;
/** Link line width. */
export const LINK_W = C.LINK_WIDTH * C.SCALE;
/** Arrowhead length along the link and base width across it. */
export const HEAD_LEN = C.ARROWHEAD.length * C.SCALE;
export const HEAD_W = C.ARROWHEAD.width * C.SCALE;
/** Filled arrowhead triangle area. */
export const HEAD_AREA = (HEAD_LEN * HEAD_W) / 2;

/** Between-cluster dash and gap of the edge cue (round caps, lengths exclude the caps). */
export const DASH_ON = C.BETWEEN_DASH.dash;
export const DASH_OFF = C.BETWEEN_DASH.gap;
export const DASH_PERIOD = DASH_ON + DASH_OFF;
/** SVG `stroke-dasharray` for a dashed link. */
export const DASH_ARRAY = `${DASH_ON} ${DASH_OFF}`;
/**
 * Fraction of a dashed line's length that carries ink: each dash is `DASH_ON` long plus half a
 * line width of round cap at either end.
 */
export const DASH_DUTY = (DASH_ON + LINK_W) / DASH_PERIOD;

/**
 * Outer side of the squares. A square of side r * sqrt(pi) covers the same area as the circle.
 */
export const SQUARE_SIDE = DOT_R * Math.sqrt(Math.PI);
/** Circumradius of the upward equilateral triangles (see `TRIANGLE_R`). */
export const TRIANGLE_R = C.TRIANGLE_R * DOT_R;
/** Outline width of the hollow marks; the outline is drawn inside the outer footprint. */
export const HOLLOW_STROKE = C.HOLLOW_STROKE * C.SCALE;

/** Area of an equilateral triangle with circumradius `r`. */
function triangleArea(r: number): number {
  return (3 * Math.sqrt(3) * r * r) / 4;
}

/**
 * The three vertices of the upward equilateral triangle with circumradius `r` centred (on its
 * centroid) at the origin, top vertex first.
 */
export function trianglePoints(r: number): [number, number][] {
  return [0, 1, 2].map((k) => {
    const a = -Math.PI / 2 + (2 * Math.PI * k) / 3;
    return [r * Math.cos(a), r * Math.sin(a)];
  });
}

/**
 * Ink area of one node mark. A hollow mark is its filled footprint minus the footprint shrunk by
 * the stroke width (the inradius of a triangle is half its circumradius, so insetting it by w
 * shrinks the circumradius by 2w).
 */
export const NODE_INK = {
  circle: Math.PI * DOT_R * DOT_R,
  square: SQUARE_SIDE * SQUARE_SIDE,
  triangle: triangleArea(TRIANGLE_R),
  hollowCircle: Math.PI * (DOT_R * DOT_R - (DOT_R - HOLLOW_STROKE) ** 2),
  hollowSquare: SQUARE_SIDE * SQUARE_SIDE - (SQUARE_SIDE - 2 * HOLLOW_STROKE) ** 2,
  hollowTriangle: triangleArea(TRIANGLE_R) - triangleArea(TRIANGLE_R - 2 * HOLLOW_STROKE),
} as const;

/** Rect cue outline width. */
export const OUTLINE_W = C.HULL_STROKE_WIDTH;

/**
 * The drawn line of a link between two dot centres `d` px apart: from the trimmed source end to
 * the base of the arrowhead at the trimmed target end. Returns the visible line length.
 */
export function visibleLinkLength(d: number): number {
  const trim = Math.min(TRIM, d / 2);
  return Math.max(0, d - 2 * trim - HEAD_LEN);
}
