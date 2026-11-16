/**
 * Pure SVG renderer for a `Display`. It has no state and no effects, so the stimulus is painted
 * in the same frame the component is mounted — a hard requirement for the 200 ms presentations.
 */
import { ReactNode } from 'react';
import { GENERATOR_CONFIG as C } from '../generator/config';
import { DASH_ARRAY, DOT_R, MARK_POINTS } from '../generator/geometry';
import { Display, DisplayNode, NodeShape } from '../generator/types';

type InkStyle = typeof C.FLOW_INK[keyof typeof C.FLOW_INK];
import {
  flowBox, groundOf, isFlow, isShade, linkStyle, nodeScale,
} from '../generator/variants';

/** SVG `points` of a polygon mark centred at (x, y). */
export function markPoints(shape: Exclude<NodeShape, 'circle'>, x: number, y: number, scale = 1): string {
  return MARK_POINTS[shape].map(([dx, dy]) => `${x + dx * scale},${y + dy * scale}`).join(' ');
}

/**
 * One node mark, always filled. The outlines come from `MARK_POINTS`, the same polygons the
 * invariants and the ink metrics use.
 */
function nodeMark(node: DisplayNode, scale: number, flow: { width: number; height: number } | null, ink: InkStyle) {
  const {
    id, x, y, fill, shape,
  } = node;
  if (flow) {
    // flowchart prototypes: every node is a box, whatever `shape` the record carries
    const box = C.FLOW_BOX;
    // `ink` is `FLOW_INK.dark` (FLOW_BOX's own stroke) unless the display asks for a lighter one
    return (
      <rect
        key={id}
        x={x - flow.width / 2}
        y={y - flow.height / 2}
        width={flow.width}
        height={flow.height}
        rx={box.radius}
        fill={box.fill}
        stroke={ink.box}
        strokeWidth={ink.boxWidth}
      />
    );
  }
  if (shape === 'circle') return <circle key={id} cx={x} cy={y} r={DOT_R * scale} fill={fill} />;
  return <polygon key={id} points={markPoints(shape, x, y, scale)} fill={fill} strokeLinejoin="miter" />;
}

/** The link geometry scaled for a flowchart's line strength. */
function flowInkLink(base: ReturnType<typeof linkStyle>, ink: InkStyle | null) {
  if (!ink) return base;
  return {
    ...base, width: base.width * ink.linkScale, headLen: base.headLen * ink.head, headW: base.headW * ink.head,
  };
}

/** The stimulus itself: an SVG of exactly `display.width` x `display.height` canvas px. */
export function StimulusSVG({ display }: { display: Display }) {
  const byId = new Map(display.nodes.map((n) => [n.id, n]));
  const scale = nodeScale(display.variant);
  const ink = C.FLOW_INK[display.ink ?? 'dark'];
  const base = linkStyle(display.variant);
  // the flowcharts' line strength (`Display.ink`); every other display is drawn as before
  const link = flowInkLink(base, display.ink ? ink : null);
  const shade = isShade(display.variant);
  const flow = isFlow(display.variant);
  const box = flowBox(display.variant);
  const bold = display.variant === 'edge-bold';
  const linkColour = display.ink ? ink.link : C.LINK_STROKE;

  return (
    <svg
      data-testid="stimulus-svg"
      width={display.width}
      height={display.height}
      viewBox={`0 0 ${display.width} ${display.height}`}
      shapeRendering="geometricPrecision"
    >
      <rect x={0} y={0} width={display.width} height={display.height} fill={groundOf(display)} />

      {/* the rect cue sits under the links and dots */}
      {display.clusters.map((cluster) => (cluster.rect ? (
        <rect
          key={`rect-${cluster.index}`}
          x={cluster.rect.x}
          y={cluster.rect.y}
          width={cluster.rect.w}
          height={cluster.rect.h}
          fill={shade ? C.SHADE_FILL : 'none'}
          stroke={shade ? 'none' : C.HULL_STROKE}
          strokeWidth={C.HULL_STROKE_WIDTH}
        />
      ) : null))}

      {/* dagre flowcharts with highlighting: one rough rectangle per group, under the links and boxes */}
      {display.clusters.map((cluster) => (cluster.shade ? (
        <rect
          key={`shade-${cluster.index}`}
          data-testid="group-highlight"
          x={cluster.shade.rect.x}
          y={cluster.shade.rect.y}
          width={cluster.shade.rect.w}
          height={cluster.shade.rect.h}
          rx={C.FLOW_DAGRE.highlightRadius}
          fill={C.SHADE_FILL}
        />
      ) : null))}

      {display.edges.map((edge) => {
        const s = byId.get(edge.source);
        const t = byId.get(edge.target);
        if (!s || !t) return null;
        if (edge.points && edge.points.length >= 2) {
          // dagre flowcharts: the stored route is drawn as it is, with the arrowhead at its last point
          const pts = edge.points;
          const tip = pts[pts.length - 1];
          const prev = pts[pts.length - 2];
          const d = Math.hypot(tip.x - prev.x, tip.y - prev.y) || 1;
          const dx = (tip.x - prev.x) / d;
          const dy = (tip.y - prev.y) / d;
          const baseX = tip.x - dx * link.headLen;
          const baseY = tip.y - dy * link.headLen;
          const arrow = [
            [tip.x, tip.y],
            [baseX - (dy * link.headW) / 2, baseY + (dx * link.headW) / 2],
            [baseX + (dy * link.headW) / 2, baseY - (dx * link.headW) / 2],
          ].map(([x, y]) => `${x},${y}`).join(' ');
          return (
            <g key={`${edge.source}-${edge.target}`}>
              <polyline
                points={[...pts.slice(0, -1).map((q) => [q.x, q.y]), [baseX, baseY]].map(([x, y]) => `${x},${y}`).join(' ')}
                fill="none"
                stroke={linkColour}
                strokeWidth={link.width}
                strokeLinejoin="round"
              />
              <polygon points={arrow} fill={linkColour} />
            </g>
          );
        }
        const route = [s, t];
        const last = route[route.length - 2];
        const len = Math.hypot(t.x - last.x, t.y - last.y);
        const len0 = Math.hypot(route[1].x - s.x, route[1].y - s.y);
        if (len === 0 || len0 === 0) return null;
        const ux = (t.x - last.x) / len;
        const uy = (t.y - last.y) / len;
        const ux0 = (route[1].x - s.x) / len0;
        const uy0 = (route[1].y - s.y) / len0;
        // flowchart connectors end just outside the box edge they meet
        // (where the centre line leaves the box, plus the gap)
        const boxTrim = (dx: number, dy: number) => Math.min(box.width / 2 / Math.abs(dx || 1e-9), box.height / 2 / Math.abs(dy || 1e-9)) + C.FLOW_LINK_GAP;
        const single = route.length === 2;
        const trim0 = Math.min(flow ? boxTrim(ux0, uy0) : link.trim, single ? len0 / 2 : len0);
        const trim = Math.min(flow ? boxTrim(ux, uy) : link.trim, single ? len / 2 : len);
        const x1 = s.x + ux0 * trim0;
        const y1 = s.y + uy0 * trim0;
        const x2 = t.x - ux * trim;
        const y2 = t.y - uy * trim;
        // arrowhead: a filled triangle computed from the segment direction, so no <marker>
        const bx = x2 - ux * link.headLen;
        const by = y2 - uy * link.headLen;
        const head = [
          [x2, y2],
          [bx - (uy * link.headW) / 2, by + (ux * link.headW) / 2],
          [bx + (uy * link.headW) / 2, by - (ux * link.headW) / 2],
        ].map(([x, y]) => `${x},${y}`).join(' ');
        const stroke = bold && edge.dashed ? C.VARIANT_DOTS.stroke : linkColour;
        const dash = edge.dashed ? (bold ? `${C.VARIANT_DOTS.dash} ${C.VARIANT_DOTS.gap}` : DASH_ARRAY) : undefined;
        return (
          <g key={`${edge.source}-${edge.target}`}>
            {single ? (
              <line
                x1={x1}
                y1={y1}
                x2={bx}
                y2={by}
                stroke={stroke}
                strokeWidth={link.width}
                strokeDasharray={dash}
                strokeLinecap={edge.dashed ? 'round' : 'butt'}
              />
            ) : (
              <polyline
                points={[[x1, y1], ...route.slice(1, -1).map((p) => [p.x, p.y]), [bx, by]].map(([x, y]) => `${x},${y}`).join(' ')}
                fill="none"
                stroke={stroke}
                strokeWidth={link.width}
                strokeLinejoin="round"
              />
            )}
            <polygon points={head} fill={stroke} />
          </g>
        );
      })}

      {display.nodes.map((node) => nodeMark(node, scale, flow ? box : null, ink))}
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
