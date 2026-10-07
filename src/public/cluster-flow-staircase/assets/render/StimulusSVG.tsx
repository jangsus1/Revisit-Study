/**
 * Pure SVG renderer for a `Display`. It has no state and no effects, so the stimulus is painted
 * in the same frame the component is mounted — a hard requirement for the 200 ms presentations.
 */
import { ReactNode } from 'react';
import { GENERATOR_CONFIG as C } from '../generator/config';
import {
  DASH_ARRAY, DOT_R, HEAD_LEN, HEAD_W, LINK_W, MARK_POINTS, TRIM,
} from '../generator/geometry';
import { Display, DisplayNode, NodeShape } from '../generator/types';

/** SVG `points` of a polygon mark centred at (x, y). */
export function markPoints(shape: Exclude<NodeShape, 'circle'>, x: number, y: number): string {
  return MARK_POINTS[shape].map(([dx, dy]) => `${x + dx},${y + dy}`).join(' ');
}

/**
 * One node mark, always filled. The outlines come from `MARK_POINTS`, the same polygons the
 * invariants and the ink metrics use.
 */
function nodeMark(node: DisplayNode) {
  const {
    id, x, y, fill, shape,
  } = node;
  if (shape === 'circle') return <circle key={id} cx={x} cy={y} r={DOT_R} fill={fill} />;
  return <polygon key={id} points={markPoints(shape, x, y)} fill={fill} strokeLinejoin="miter" />;
}

/** The stimulus itself: an SVG of exactly `display.width` x `display.height` canvas px. */
export function StimulusSVG({ display }: { display: Display }) {
  const byId = new Map(display.nodes.map((n) => [n.id, n]));

  return (
    <svg
      data-testid="stimulus-svg"
      width={display.width}
      height={display.height}
      viewBox={`0 0 ${display.width} ${display.height}`}
      shapeRendering="geometricPrecision"
    >
      <rect x={0} y={0} width={display.width} height={display.height} fill={display.background} />

      {/* the rect cue sits under the links and dots */}
      {display.clusters.map((cluster) => (cluster.rect ? (
        <rect
          key={`rect-${cluster.index}`}
          x={cluster.rect.x}
          y={cluster.rect.y}
          width={cluster.rect.w}
          height={cluster.rect.h}
          fill="none"
          stroke={C.HULL_STROKE}
          strokeWidth={C.HULL_STROKE_WIDTH}
        />
      ) : null))}

      {display.edges.map((edge) => {
        const s = byId.get(edge.source);
        const t = byId.get(edge.target);
        if (!s || !t) return null;
        const len = Math.hypot(t.x - s.x, t.y - s.y);
        if (len === 0) return null;
        const ux = (t.x - s.x) / len;
        const uy = (t.y - s.y) / len;
        const trim = Math.min(TRIM, len / 2);
        const x1 = s.x + ux * trim;
        const y1 = s.y + uy * trim;
        const x2 = t.x - ux * trim;
        const y2 = t.y - uy * trim;
        // arrowhead: a filled triangle computed from the segment direction, so no <marker>
        const bx = x2 - ux * HEAD_LEN;
        const by = y2 - uy * HEAD_LEN;
        const head = [
          [x2, y2],
          [bx - (uy * HEAD_W) / 2, by + (ux * HEAD_W) / 2],
          [bx + (uy * HEAD_W) / 2, by - (ux * HEAD_W) / 2],
        ].map(([x, y]) => `${x},${y}`).join(' ');
        return (
          <g key={`${edge.source}-${edge.target}`}>
            <line
              x1={x1}
              y1={y1}
              x2={bx}
              y2={by}
              stroke={C.LINK_STROKE}
              strokeWidth={LINK_W}
              strokeDasharray={edge.dashed ? DASH_ARRAY : undefined}
              strokeLinecap={edge.dashed ? 'round' : 'butt'}
            />
            <polygon points={head} fill={C.LINK_STROKE} />
          </g>
        );
      })}

      {display.nodes.map((node) => nodeMark(node))}
    </svg>
  );
}

/**
 * A fixed-size block of the canvas colour with the stimulus centred inside it. Rendering a frame
 * without a `display` gives the blank / fixation frame exactly the same geometry as a stimulus
 * frame, so nothing shifts between the phases of a trial.
 */
export function StimulusFrame({ display, children }: { display?: Display, children?: ReactNode }) {
  const width = display?.width ?? C.CANVAS.width;
  const height = display?.height ?? C.CANVAS.height;
  return (
    <div
      data-testid="stimulus-frame"
      style={{
        width,
        height,
        background: display?.background ?? C.BACKGROUND,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {display ? <StimulusSVG display={display} /> : null}
      {children}
    </div>
  );
}
