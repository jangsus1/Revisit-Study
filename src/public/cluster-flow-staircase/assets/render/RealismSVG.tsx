/**
 * Renderer of the realism prototypes (`generator/flowRealism.ts`): boxes, ovals and diamonds with
 * optional text or placeholder bars, links straight, curved or at right angles, yes / no labels,
 * and the rough group rectangles. Drawn on the 800 x 640 stage; a chart larger than the stage is
 * scaled down to fit (the gallery reports the scale).
 */
import * as d3 from 'd3';
import { GENERATOR_CONFIG as C } from '../generator/config';
import {
  RealismChart, RealismLink, RealismNode, chartBounds,
} from '../generator/flowRealism';
import { FlowInk } from '../generator/types';
import { HEAD_LEN, HEAD_W, LINK_W } from '../generator/geometry';

type Pt = { x: number; y: number };
const MARGIN = 20;
const LABEL_FONT = 9;
const FILLED = '#EDEDED';

/** The scale at which a chart fits the stage with a margin (1 when it already fits). */
export function fitScale(chart: RealismChart): number {
  const b = chartBounds(chart);
  return Math.min(1, (C.CANVAS.width - 2 * MARGIN) / b.w, (C.CANVAS.height - 2 * MARGIN) / b.h);
}

/** Right-angle version of a route: leaves along the flow, turns half way, arrives along the flow. */
function orthogonal(points: Pt[], across: boolean): Pt[] {
  const out: Pt[] = [points[0]];
  for (let i = 1; i < points.length; i += 1) {
    const a = out[out.length - 1];
    const b = points[i];
    if (across) {
      const mx = (a.x + b.x) / 2;
      out.push({ x: mx, y: a.y }, { x: mx, y: b.y }, b);
    } else {
      const my = (a.y + b.y) / 2;
      out.push({ x: a.x, y: my }, { x: b.x, y: my }, b);
    }
  }
  return out;
}

function linkPath(link: RealismLink, chart: RealismChart, head: number): { d: string; tip: Pt; from: Pt } {
  const { links, layout } = chart.options;
  let pts = link.points;
  if (links === 'orthogonal' && layout !== 'force') pts = orthogonal(pts, layout === 'dagre-lr');
  const tip = pts[pts.length - 1];
  const prev = pts[pts.length - 2];
  const len = Math.hypot(tip.x - prev.x, tip.y - prev.y) || 1;
  // the line stops at the base of the arrowhead
  const base = { x: tip.x - ((tip.x - prev.x) / len) * head, y: tip.y - ((tip.y - prev.y) / len) * head };
  const body = [...pts.slice(0, -1), base];
  if (links === 'curved') {
    // Mermaid-style: each stretch an S-curve that leaves and arrives along the flow direction
    // (down, or right when left to right; force layouts have no direction, so a gentle bow)
    const across = layout === 'dagre-lr';
    let d = `M${body[0].x},${body[0].y}`;
    for (let i = 1; i < body.length; i += 1) {
      const a = body[i - 1];
      const b = body[i];
      if (layout === 'force') {
        const mx = (a.x + b.x) / 2 - (b.y - a.y) * 0.2;
        const my = (a.y + b.y) / 2 + (b.x - a.x) * 0.2;
        d += ` Q${mx},${my} ${b.x},${b.y}`;
      } else if (across) {
        const mx = (a.x + b.x) / 2;
        d += ` C${mx},${a.y} ${mx},${b.y} ${b.x},${b.y}`;
      } else {
        const my = (a.y + b.y) / 2;
        d += ` C${a.x},${my} ${b.x},${my} ${b.x},${b.y}`;
      }
    }
    // the arrowhead points along the flow, as the curve arrives
    const along = layout === 'force' ? prev : (across ? { x: tip.x - 1, y: tip.y } : { x: tip.x, y: tip.y - 1 });
    return { d, tip, from: along };
  }
  const line = d3.line<Pt>().x((p) => p.x).y((p) => p.y);
  return { d: line(body) ?? '', tip, from: prev };
}

function nodeShape(n: RealismNode, stroke: string, strokeWidth: number, fill: string) {
  const common = { fill, stroke, strokeWidth };
  if (n.kind === 'decision') {
    const pts = [[n.x, n.y - n.h / 2], [n.x + n.w / 2, n.y], [n.x, n.y + n.h / 2], [n.x - n.w / 2, n.y]].map((p) => p.join(',')).join(' ');
    return <polygon points={pts} {...common} />;
  }
  const rx = n.kind === 'start' || n.kind === 'end' ? n.h / 2 : C.FLOW_BOX.radius;
  return <rect x={n.x - n.w / 2} y={n.y - n.h / 2} width={n.w} height={n.h} rx={rx} {...common} />;
}

export function RealismSVG({ chart, ink = 'dark', scale = 1 }: { chart: RealismChart; ink?: FlowInk; scale?: number }) {
  const style = C.FLOW_INK[ink];
  const fit = fitScale(chart);
  const { width, height } = C.CANVAS;
  const head = HEAD_LEN * style.head;
  const headW = HEAD_W * style.head;
  const fill = chart.options.fill === 'filled' ? FILLED : C.FLOW_BOX.fill;
  return (
    <svg
      data-testid="realism-svg"
      width={width * scale}
      height={height * scale}
      viewBox={`0 0 ${width} ${height}`}
      shapeRendering="geometricPrecision"
      style={{ background: C.BACKGROUND, display: 'block' }}
    >
      <g transform={`translate(${width / 2} ${height / 2}) scale(${fit}) translate(${-width / 2} ${-height / 2})`}>
        {chart.highlight.map((r, i) => (
          <rect key={`h${i}`} data-testid="group-highlight" x={r.x} y={r.y} width={r.w} height={r.h} rx={C.FLOW_DAGRE.highlightRadius} fill={C.SHADE_FILL} />
        ))}
        {chart.links.map((link) => {
          const { d, tip, from } = linkPath(link, chart, head);
          const len = Math.hypot(tip.x - from.x, tip.y - from.y) || 1;
          const ux = (tip.x - from.x) / len;
          const uy = (tip.y - from.y) / len;
          const bx = tip.x - ux * head;
          const by = tip.y - uy * head;
          const arrow = [[tip.x, tip.y], [bx - (uy * headW) / 2, by + (ux * headW) / 2], [bx + (uy * headW) / 2, by - (ux * headW) / 2]]
            .map((p) => p.join(',')).join(' ');
          const start = link.points[0];
          const next = link.points[1];
          return (
            <g key={`${link.source}-${link.target}`}>
              <path d={d} fill="none" stroke={style.link} strokeWidth={LINK_W * style.linkScale} strokeLinejoin="round" />
              <polygon points={arrow} fill={style.link} />
              {link.label && (
                <text
                  x={start.x + (next.x - start.x) * 0.3 + 4}
                  y={start.y + (next.y - start.y) * 0.3}
                  fontSize={LABEL_FONT - 1}
                  fontFamily="Arial, Helvetica, sans-serif"
                  fill={style.link}
                  dominantBaseline="middle"
                >
                  {link.label}
                </text>
              )}
            </g>
          );
        })}
        {chart.nodes.map((n) => (
          <g key={n.id}>
            {nodeShape(n, style.box, style.boxWidth, fill)}
            {n.text && (
              <text
                x={n.x}
                y={n.y}
                fontSize={LABEL_FONT}
                fontFamily="Arial, Helvetica, sans-serif"
                fill={style.box}
                textAnchor="middle"
                dominantBaseline="central"
              >
                {n.text}
              </text>
            )}
            {n.bars && n.bars.map((f, i) => (
              <rect
                key={`b${i}`}
                x={n.x - (n.w * f) / 2}
                y={n.y - (n.bars!.length * 5 - 2) / 2 + i * 5}
                width={n.w * f}
                height={3}
                rx={1}
                fill={style.box}
                opacity={0.45}
              />
            ))}
          </g>
        ))}
      </g>
    </svg>
  );
}
