/**
 * Pure SVG renderer for a `Display`. It has no state and no effects, so the stimulus is painted
 * in the same frame the component is mounted — a hard requirement for the 200 ms presentations.
 */
import { ReactNode } from 'react';
import { GENERATOR_CONFIG as C } from '../generator/config';
import { Display, DisplayNode } from '../generator/types';

const DOT_R = C.RDOT * C.SCALE;
const TRIM = (C.RDOT + C.LINK_TRIM) * C.SCALE;
const LINK_W = C.LINK_WIDTH * C.SCALE;
const HEAD_LEN = C.ARROWHEAD.length * C.SCALE;
const HEAD_W = C.ARROWHEAD.width * C.SCALE;
const DASH = C.DASH.map((d) => d * C.SCALE).join(' ');
/** Side of the square / diamond marks, area-matched to a circle of radius DOT_R. */
const SIDE = DOT_R * Math.sqrt(Math.PI);

function nodeMark(node: DisplayNode) {
  if (node.shape === 'square') {
    return (
      <rect
        key={node.id}
        x={node.x - SIDE / 2}
        y={node.y - SIDE / 2}
        width={SIDE}
        height={SIDE}
        fill={node.fill}
      />
    );
  }
  if (node.shape === 'diamond') {
    const h = SIDE / Math.SQRT2;
    const points = [
      [node.x, node.y - h], [node.x + h, node.y], [node.x, node.y + h], [node.x - h, node.y],
    ].map(([x, y]) => `${x},${y}`).join(' ');
    return <polygon key={node.id} points={points} fill={node.fill} />;
  }
  return <circle key={node.id} cx={node.x} cy={node.y} r={DOT_R} fill={node.fill} />;
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

      {/* cue layers sit under the dots */}
      {display.clusters.map((cluster) => (cluster.hull ? (
        <polygon
          key={`hull-${cluster.index}`}
          points={cluster.hull.map(([x, y]) => `${x},${y}`).join(' ')}
          fill="none"
          stroke={C.HULL_STROKE}
          strokeWidth={C.HULL_STROKE_WIDTH}
          strokeLinejoin="round"
        />
      ) : null))}
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
              strokeDasharray={edge.dashed ? DASH : undefined}
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
