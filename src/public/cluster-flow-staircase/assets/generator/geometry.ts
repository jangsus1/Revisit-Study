/**
 * Drawing geometry in canvas px, derived once from `GENERATOR_CONFIG`. The renderer, the occlusion
 * invariants and the ink metrics all read these, so what is drawn and what is measured cannot
 * drift apart.
 */
import { GENERATOR_CONFIG as C } from './config';
import type { NodeShape } from './types';

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

/** The circle's area: every mark aims at it. */
export const CIRCLE_AREA = Math.PI * DOT_R * DOT_R;
/** No mark reaches further than this from its centre (arrowheads stop at TRIM = 1.4 RDOT). */
export const MARK_MAX_R = C.MARK_MAX_R * DOT_R;

type Pt = [number, number];

/** Area of a simple polygon (shoelace), always positive. */
export function polygonAreaOf(points: Pt[]): number {
  let twice = 0;
  points.forEach(([x, y], i) => {
    const [nx, ny] = points[(i + 1) % points.length];
    twice += x * ny - nx * y;
  });
  return Math.abs(twice) / 2;
}

/** Largest distance of a vertex from the origin. */
function circumradius(points: Pt[]): number {
  return Math.max(...points.map(([x, y]) => Math.hypot(x, y)));
}

const polar = (r: number, deg: number): Pt => [r * Math.cos((deg * Math.PI) / 180), r * Math.sin((deg * Math.PI) / 180)];

/**
 * Each polygon mark at unit size, centred on the origin, y pointing down (screen coordinates).
 * The square, diamond, triangle and pentagon are convex; the star and the Y are not.
 */
const UNIT_MARKS: Record<Exclude<NodeShape, 'circle'>, Pt[]> = {
  square: [[-1, -1], [1, -1], [1, 1], [-1, 1]],
  // a rhombus taller than wide (width / height = DIAMOND_ASPECT), like the reference sheet
  diamond: [[0, -1], [C.DIAMOND_ASPECT, 0], [0, 1], [-C.DIAMOND_ASPECT, 0]],
  // upward equilateral triangle on its centroid
  triangle: [0, 1, 2].map((k) => polar(1, -90 + 120 * k)),
  // five-point star, one point up; inner radius STAR_INNER of the outer one
  star: Array.from({ length: 10 }, (_, k) => polar(k % 2 === 0 ? 1 : C.STAR_INNER, -90 + 36 * k)),
  // three thick arms: a stem down and two arms up-left and up-right, flat ends
  y: [90, 210, 330].flatMap((a) => {
    const half = C.Y_ARM_WIDTH / 2;
    const [dx, dy] = polar(1, a);
    const [nx, ny] = polar(1, a + 90);
    return [
      [dx - half * nx, dy - half * ny] as Pt,
      [dx + half * nx, dy + half * ny] as Pt,
      // the inner corner between this arm and the next one, on their bisector
      polar(half / Math.sin(Math.PI / 3), a + 60),
    ];
  }),
  // regular pentagon, one vertex up
  pentagon: Array.from({ length: 5 }, (_, k) => polar(1, -90 + 72 * k)),
};

/**
 * The scale of each polygon mark: the circle's area, capped so the mark reaches at most
 * `MARK_MAX_R` from its centre. Spiky marks (diamond, triangle, star, Y) hit the cap and are
 * smaller in area; the square and the pentagon match the circle exactly.
 */
function sizeMark(unit: Pt[]): Pt[] {
  const byArea = Math.sqrt(CIRCLE_AREA / polygonAreaOf(unit));
  const byReach = MARK_MAX_R / circumradius(unit);
  const s = Math.min(byArea, byReach);
  return unit.map(([x, y]) => [x * s, y * s]);
}

/** The drawn outline of every polygon mark in canvas px, relative to the node centre. */
export const MARK_POINTS: Record<Exclude<NodeShape, 'circle'>, Pt[]> = Object.fromEntries(
  Object.entries(UNIT_MARKS).map(([shape, unit]) => [shape, sizeMark(unit)]),
) as Record<Exclude<NodeShape, 'circle'>, Pt[]>;

/** Outer side of the square (the circle's area: side r * sqrt(pi)). */
export const SQUARE_SIDE = MARK_POINTS.square[1][0] - MARK_POINTS.square[0][0];

/** How far each mark reaches from its centre. */
export const MARK_REACH: Record<NodeShape, number> = {
  circle: DOT_R,
  ...Object.fromEntries(Object.entries(MARK_POINTS).map(([shape, pts]) => [shape, circumradius(pts)])),
} as Record<NodeShape, number>;

/** Ink area of one node mark: every mark is filled. */
export const NODE_INK: Record<NodeShape, number> = {
  circle: CIRCLE_AREA,
  ...Object.fromEntries(Object.entries(MARK_POINTS).map(([shape, pts]) => [shape, polygonAreaOf(pts)])),
} as Record<NodeShape, number>;

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
