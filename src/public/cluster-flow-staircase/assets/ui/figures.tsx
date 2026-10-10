/**
 * Instruction figures, drawn as plain SVG in the storyboard style of scatterplot_duration's
 * phase1.png: framed panels left to right, a bold label above each, a brace with the duration under
 * the timed ones. The sketches are schematic and cue-neutral (grey dots and arrows), because the
 * instructions are shown before the participant's cell is known; they are not drawn by the generator.
 * Every figure is one SVG with a viewBox, so it scales with the window.
 */
import { CSSProperties, ReactNode } from 'react';
import { DOT_R, MARK_POINTS } from '../generator/geometry';
import { mulberry32 } from '../generator/prng';
import type { NodeShape } from '../generator/types';
import { SvgKeyCap } from './KeyCap';
import { UI } from './theme';

const FRAME_STROKE = 3;
const DOT = '#777777';

type Pt = [number, number];

/** A labelled frame: step number and label above, content inside (translated to the frame's origin). */
function StepFrame({
  x, y, w, h, step, label, children, frame = true,
}: { x: number; y: number; w: number; h: number; step?: number; label: string; children?: ReactNode; frame?: boolean }) {
  return (
    <g>
      {step !== undefined && (
        <text x={x + w / 2} y={y - 40} textAnchor="middle" fontFamily={UI.font} fontSize={14} fontWeight={700} letterSpacing={1} fill={UI.accent}>
          {`STEP ${step}`}
        </text>
      )}
      <text x={x + w / 2} y={y - 14} textAnchor="middle" fontFamily={UI.font} fontSize={20} fontWeight={700} fill={UI.ink}>
        {label}
      </text>
      {frame && <rect x={x} y={y} width={w} height={h} fill="#ffffff" stroke={UI.ink} strokeWidth={FRAME_STROKE} />}
      <g transform={`translate(${x} ${y})`}>{children}</g>
    </g>
  );
}

/** A curly brace under [x0, x1] at y, opening upwards, with a label below. */
function Brace({
  x0, x1, y, label,
}: { x0: number; x1: number; y: number; label: string }) {
  const d = 16;
  const mid = (x0 + x1) / 2;
  const path = `M ${x0} ${y} Q ${x0} ${y + d} ${x0 + d} ${y + d} L ${mid - d} ${y + d} Q ${mid} ${y + d} ${mid} ${y + d * 1.6}`
    + ` Q ${mid} ${y + d} ${mid + d} ${y + d} L ${x1 - d} ${y + d} Q ${x1} ${y + d} ${x1} ${y}`;
  return (
    <g>
      <path d={path} fill="none" stroke={UI.ink} strokeWidth={2.5} strokeLinecap="round" />
      <text x={mid} y={y + d * 1.6 + 26} textAnchor="middle" fontFamily={UI.font} fontSize={22} fontWeight={700} fill={UI.ink}>
        {label}
      </text>
    </g>
  );
}

/** A horizontal arrow between two frames. */
function FlowArrow({ x0, x1, y }: { x0: number; x1: number; y: number }) {
  return (
    <g>
      <line x1={x0} y1={y} x2={x1 - 10} y2={y} stroke={UI.faint} strokeWidth={3} />
      <polygon points={`${x1},${y} ${x1 - 12},${y - 7} ${x1 - 12},${y + 7}`} fill={UI.faint} />
    </g>
  );
}

/** A link with an arrowhead from node a to node b, trimmed by the node radius. */
function Link({
  a, b, r, width = 1.6, color = UI.ink,
}: { a: Pt; b: Pt; r: number; width?: number; color?: string }) {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const ux = (b[0] - a[0]) / len;
  const uy = (b[1] - a[1]) / len;
  const head = r * 0.9 + 3;
  const x1 = a[0] + ux * (r + 2);
  const y1 = a[1] + uy * (r + 2);
  const x2 = b[0] - ux * (r + 2);
  const y2 = b[1] - uy * (r + 2);
  const bx = x2 - ux * head;
  const by = y2 - uy * head;
  const hw = head * 0.45;
  return (
    <g>
      <line x1={x1} y1={y1} x2={bx} y2={by} stroke={color} strokeWidth={width} />
      <polygon points={`${x2},${y2} ${bx - uy * hw},${by + ux * hw} ${bx + uy * hw},${by - ux * hw}`} fill={color} />
    </g>
  );
}

/** A small node-link sketch inside a w x h frame; node positions are fractions of the frame. */
function Sketch({
  w, h, nodes, edges, r = 5.5,
}: { w: number; h: number; nodes: Pt[]; edges: [number, number][]; r?: number }) {
  const pts = nodes.map(([fx, fy]) => [fx * w, fy * h] as Pt);
  return (
    <g>
      {edges.map(([s, t]) => <Link key={`${s}-${t}`} a={pts[s]} b={pts[t]} r={r} width={1.4} />)}
      {pts.map(([x, y]) => <circle key={`${x}-${y}`} cx={x} cy={y} r={r} fill={DOT} />)}
    </g>
  );
}

const SKETCH_1: { nodes: Pt[]; edges: [number, number][] } = {
  nodes: [[0.18, 0.25], [0.36, 0.2], [0.27, 0.48], [0.5, 0.42], [0.66, 0.24], [0.82, 0.36], [0.58, 0.7], [0.78, 0.74], [0.3, 0.78]],
  edges: [[0, 1], [0, 2], [1, 3], [2, 3], [3, 4], [4, 5], [3, 6], [6, 7], [2, 8]],
};
const SKETCH_2: { nodes: Pt[]; edges: [number, number][] } = {
  nodes: [[0.14, 0.3], [0.3, 0.18], [0.24, 0.55], [0.44, 0.34], [0.6, 0.18], [0.8, 0.22], [0.86, 0.5], [0.64, 0.52],
    [0.46, 0.72], [0.18, 0.82], [0.7, 0.8], [0.88, 0.8]],
  edges: [[0, 1], [0, 2], [1, 3], [3, 4], [4, 5], [5, 6], [3, 7], [7, 6], [2, 8], [8, 9], [8, 10], [10, 11]],
};

/** Square blocks of random grey, like the trial's noise mask. */
function Noise({
  w, h, block = 7, seed = 7,
}: { w: number; h: number; block?: number; seed?: number }) {
  const rng = mulberry32(seed);
  const cells: ReactNode[] = [];
  for (let y = 0; y < h; y += block) {
    for (let x = 0; x < w; x += block) {
      const g = Math.floor(rng() * 256);
      cells.push(<rect key={`${x}-${y}`} x={x} y={y} width={Math.min(block, w - x)} height={Math.min(block, h - y)} fill={`rgb(${g},${g},${g})`} />);
    }
  }
  return <g>{cells}</g>;
}

function Cross({ cx, cy, half = 12 }: { cx: number; cy: number; half?: number }) {
  return (
    <g stroke={UI.ink} strokeWidth={3}>
      <line x1={cx - half} y1={cy} x2={cx + half} y2={cy} />
      <line x1={cx} y1={cy - half} x2={cx} y2={cy + half} />
    </g>
  );
}

const figureStyle = (maxHeight: string): CSSProperties => ({
  display: 'block', width: '100%', height: 'auto', maxHeight, margin: '0 auto',
});

/**
 * How a trial works: cross, diagram 1 (0.2 s), noise (0.15 s), diagram 2 (0.2 s), noise (0.15 s),
 * answer. The blanks between the steps are not drawn; the arrows stand for them.
 */
export function TrialStoryboard({ maxHeight = '40vh' }: { maxHeight?: string }) {
  const W = 172;
  const H = 138;
  const GAP = 34;
  const TOP = 70;
  const xs = [0, 1, 2, 3, 4, 5].map((i) => 10 + i * (W + GAP));
  const midY = TOP + H / 2;
  const noiseFrame = <rect x={0} y={0} width={W} height={H} fill="none" stroke={UI.ink} strokeWidth={FRAME_STROKE} />;
  return (
    <svg
      data-testid="trial-storyboard"
      viewBox="0 0 1222 300"
      style={figureStyle(maxHeight)}
      role="img"
      aria-label="A trial: look at the cross, diagram 1 for 0.2 seconds, noise for 0.15 seconds, diagram 2 for 0.2 seconds, noise for 0.15 seconds, then answer which had more items with F or left arrow, J or right arrow."
    >
      {xs.slice(0, 5).map((x) => <FlowArrow key={x} x0={x + W + 6} x1={x + W + GAP - 6} y={midY} />)}

      <StepFrame x={xs[0]} y={TOP} w={W} h={H} step={1} label="Look at the cross">
        <Cross cx={W / 2} cy={H / 2} />
      </StepFrame>
      <StepFrame x={xs[1]} y={TOP} w={W} h={H} step={2} label="Diagram 1">
        <Sketch w={W} h={H} nodes={SKETCH_1.nodes} edges={SKETCH_1.edges} />
      </StepFrame>
      <StepFrame x={xs[2]} y={TOP} w={W} h={H} step={3} label="Noise">
        <Noise w={W} h={H} />
        {noiseFrame}
      </StepFrame>
      <StepFrame x={xs[3]} y={TOP} w={W} h={H} step={4} label="Diagram 2">
        <Sketch w={W} h={H} nodes={SKETCH_2.nodes} edges={SKETCH_2.edges} />
      </StepFrame>
      <StepFrame x={xs[4]} y={TOP} w={W} h={H} step={5} label="Noise">
        <Noise w={W} h={H} seed={19} />
        {noiseFrame}
      </StepFrame>
      <StepFrame x={xs[5]} y={TOP} w={W} h={H} step={6} label="Which had more?">
        <SvgKeyCap x={12} y={40} label="F" size={31} />
        <SvgKeyCap x={48} y={40} label="←" size={31} />
        <text x={45} y={104} textAnchor="middle" fontFamily={UI.font} fontSize={16} fontWeight={700} fill={UI.ink}>first</text>
        <SvgKeyCap x={93} y={40} label="J" size={31} />
        <SvgKeyCap x={129} y={40} label="→" size={31} />
        <text x={126} y={104} textAnchor="middle" fontFamily={UI.font} fontSize={16} fontWeight={700} fill={UI.ink}>second</text>
        <line x1={W / 2 + 2} y1={32} x2={W / 2 + 2} y2={114} stroke={UI.line} strokeWidth={1.5} />
      </StepFrame>

      <Brace x0={xs[0] + 4} x1={xs[0] + W - 4} y={TOP + H + 10} label="0.5 s" />
      <Brace x0={xs[1] + 4} x1={xs[1] + W - 4} y={TOP + H + 10} label="0.2 s" />
      <Brace x0={xs[2] + 4} x1={xs[2] + W - 4} y={TOP + H + 10} label="0.15 s" />
      <Brace x0={xs[3] + 4} x1={xs[3] + W - 4} y={TOP + H + 10} label="0.2 s" />
      <Brace x0={xs[4] + 4} x1={xs[4] + W - 4} y={TOP + H + 10} label="0.15 s" />
      <text x={xs[5] + W / 2} y={TOP + H + 52} textAnchor="middle" fontFamily={UI.font} fontSize={20} fontWeight={600} fill={UI.muted}>
        no time limit
      </text>
    </svg>
  );
}

/** A count badge: a filled accent circle with a white number. */
function Badge({ x, y, n }: { x: number; y: number; n: number }) {
  return (
    <g data-testid="count-badge">
      <circle cx={x} cy={y} r={11} fill={UI.accent} />
      <text x={x} y={y + 0.5} textAnchor="middle" dominantBaseline="central" fontFamily={UI.font} fontSize={13} fontWeight={700} fill="#ffffff">{n}</text>
    </g>
  );
}

/** A filled mark of the shape-cue pool, drawn with the generator's own outline at radius `r`. */
function NodeMark({
  p, mark, fill, r,
}: { p: Pt; mark: NodeShape; fill: string; r: number }) {
  const [x, y] = p;
  if (mark === 'circle') return <circle cx={x} cy={y} r={r} fill={fill} />;
  const k = r / DOT_R;
  return <polygon points={MARK_POINTS[mark].map(([dx, dy]) => `${x + dx * k},${y + dy * k}`).join(' ')} fill={fill} />;
}

/** Leader line from a label to a point of the diagram. */
function Leader({ from, to }: { from: Pt; to: Pt }) {
  return (
    <g>
      <line x1={from[0]} y1={from[1]} x2={to[0]} y2={to[1]} stroke={UI.faint} strokeWidth={1.5} strokeDasharray="4 3" />
      <circle cx={to[0]} cy={to[1]} r={3} fill={UI.faint} />
    </g>
  );
}

/**
 * What counts as an item: seven nodes of mixed marks and colours, each with its count badge, the
 * arrows and a group outline marked as not items, and the total.
 */
export function ItemCountFigure({ maxHeight = '26vh' }: { maxHeight?: string }) {
  const r = 11;
  const nodes: { p: Pt; mark: NodeShape; fill: string }[] = [
    { p: [62, 62], mark: 'circle', fill: DOT },
    { p: [148, 46], mark: 'circle', fill: '#3b5bdb' },
    { p: [128, 128], mark: 'square', fill: DOT },
    { p: [262, 88], mark: 'triangle', fill: '#e8590c' },
    { p: [352, 44], mark: 'star', fill: '#555555' },
    { p: [348, 150], mark: 'circle', fill: '#2b8a3e' },
    { p: [446, 98], mark: 'diamond', fill: '#3b5bdb' },
  ];
  const edges: [number, number][] = [[0, 1], [0, 2], [1, 3], [2, 3], [3, 4], [3, 5], [4, 6], [5, 6]];
  const outline = {
    x: 32, y: 18, w: 150, h: 142,
  };
  const p = (i: number) => nodes[i].p;
  const arrowMid: Pt = [(p(3)[0] + p(5)[0]) / 2 + 2, (p(3)[1] + p(5)[1]) / 2 + 2];
  return (
    <svg
      data-testid="item-count-figure"
      viewBox="0 0 760 240"
      style={figureStyle(maxHeight)}
      role="img"
      aria-label="Seven nodes of different shapes and colours, numbered 1 to 7. The arrows and the outline around three of them are not items."
    >
      <rect x={outline.x} y={outline.y} width={outline.w} height={outline.h} fill="none" stroke="#333333" strokeWidth={2} />
      {edges.map(([s, t]) => <Link key={`${s}-${t}`} a={p(s)} b={p(t)} r={r + 1} width={2} />)}
      {nodes.map((node) => <NodeMark key={`${node.p[0]}-${node.p[1]}`} p={node.p} mark={node.mark} fill={node.fill} r={r} />)}
      {nodes.map((node, i) => <Badge key={`b${node.p[0]}`} x={node.p[0] + 17} y={node.p[1] - 17} n={i + 1} />)}

      <Leader from={[107, 200]} to={[107, outline.y + outline.h]} />
      <text x={107} y={222} textAnchor="middle" fontFamily={UI.font} fontSize={17} fontWeight={600} fill={UI.muted}>outlines are not items</text>
      <Leader from={[318, 200]} to={arrowMid} />
      <text x={318} y={222} textAnchor="middle" fontFamily={UI.font} fontSize={17} fontWeight={600} fill={UI.muted}>arrows are not items</text>

      <line x1={520} y1={20} x2={520} y2={220} stroke={UI.line} strokeWidth={2} />
      <text x={640} y={100} textAnchor="middle" fontFamily={UI.font} fontSize={44} fontWeight={800} fill={UI.ink}>7 items</text>
      <text x={640} y={136} textAnchor="middle" fontFamily={UI.font} fontSize={18} fontWeight={600} fill={UI.muted}>one per node,</text>
      <text x={640} y={160} textAnchor="middle" fontFamily={UI.font} fontSize={18} fontWeight={600} fill={UI.muted}>whatever its shape</text>
      <text x={640} y={184} textAnchor="middle" fontFamily={UI.font} fontSize={18} fontWeight={600} fill={UI.muted}>or colour</text>
    </svg>
  );
}

/** Practice: answer with F or J, the feedback appears at once, the next trial follows by itself. */
export function PracticeStoryboard({ maxHeight = '26vh' }: { maxHeight?: string }) {
  const W = 220;
  const H = 120;
  const GAP = 70;
  const TOP = 60;
  const xs = [0, 1, 2].map((i) => 20 + i * (W + GAP));
  const midY = TOP + H / 2;
  const caption = (x: number, text: string) => (
    <text x={x + W / 2} y={TOP + H + 30} textAnchor="middle" fontFamily={UI.font} fontSize={17} fontWeight={600} fill={UI.muted}>{text}</text>
  );
  return (
    <svg
      data-testid="practice-storyboard"
      viewBox="0 0 900 220"
      style={figureStyle(maxHeight)}
      role="img"
      aria-label="Practice: answer with F or left arrow (first) or J or right arrow (second), the feedback appears at once, then the next trial starts by itself."
    >
      {xs.slice(0, 2).map((x) => <FlowArrow key={x} x0={x + W + 8} x1={x + W + GAP - 8} y={midY} />)}

      <StepFrame x={xs[0]} y={TOP} w={W} h={H} step={1} label="Answer" frame={false}>
        <SvgKeyCap x={W / 2 - 92} y={42} label="F" size={34} />
        <SvgKeyCap x={W / 2 - 52} y={42} label="←" size={34} />
        <text x={W / 2} y={59} textAnchor="middle" dominantBaseline="central" fontFamily={UI.font} fontSize={15} fill={UI.faint}>or</text>
        <SvgKeyCap x={W / 2 + 18} y={42} label="J" size={34} />
        <SvgKeyCap x={W / 2 + 58} y={42} label="→" size={34} />
      </StepFrame>
      {caption(xs[0], 'first or second')}

      <StepFrame x={xs[1]} y={TOP} w={W} h={H} step={2} label="Instant feedback" frame={false}>
        <rect x={10} y={14} width={W - 20} height={40} rx={8} fill="#ebfbee" stroke={UI.correct} strokeWidth={2} />
        <text x={W / 2} y={35} textAnchor="middle" dominantBaseline="central" fontFamily={UI.font} fontSize={17} fontWeight={700} fill={UI.correct}>Correct</text>
        <rect x={10} y={66} width={W - 20} height={40} rx={8} fill="#fff5f5" stroke={UI.wrong} strokeWidth={2} />
        <text x={W / 2} y={87} textAnchor="middle" dominantBaseline="central" fontFamily={UI.font} fontSize={17} fontWeight={700} fill={UI.wrong}>Not quite</text>
      </StepFrame>
      {caption(xs[1], 'practice only')}

      <StepFrame x={xs[2]} y={TOP} w={W} h={H} step={3} label="Next trial" frame={false}>
        <circle cx={W / 2} cy={60} r={34} fill="none" stroke={UI.faint} strokeWidth={3} />
        <path d={`M ${W / 2 - 8} 44 L ${W / 2 + 14} 60 L ${W / 2 - 8} 76 Z`} fill={UI.faint} />
      </StepFrame>
      {caption(xs[2], 'starts by itself')}
    </svg>
  );
}

/** Two tiny frames, 5 vs 30 dots: what an attention check looks like (instructions page). */
export function AttentionMini({ height = 46 }: { height?: number }) {
  const W = 70;
  const H = 56;
  const dots = (n: number, seed: number) => {
    const rng = mulberry32(seed);
    const pts: Pt[] = [];
    let tries = 0;
    while (pts.length < n && tries < 5000) {
      tries += 1;
      const p: Pt = [6 + rng() * (W - 12), 6 + rng() * (H - 12)];
      if (pts.every(([x, y]) => Math.hypot(x - p[0], y - p[1]) > (n > 10 ? 7.5 : 16))) pts.push(p);
    }
    return pts.map(([x, y]) => <circle key={`${x}-${y}`} cx={x} cy={y} r={2.4} fill={DOT} />);
  };
  return (
    <svg
      data-testid="attention-mini"
      viewBox={`0 0 ${2 * W + 44} ${H + 4}`}
      style={{
        height, width: 'auto', display: 'inline-block', verticalAlign: 'middle',
      }}
      role="img"
      aria-label="An attention check: 5 items against 30 items"
    >
      <rect x={1} y={2} width={W} height={H} fill="#ffffff" stroke={UI.ink} strokeWidth={2} />
      <g transform="translate(1 2)">{dots(5, 11)}</g>
      <text x={W + 22} y={H / 2 + 8} textAnchor="middle" fontFamily={UI.font} fontSize={16} fontWeight={700} fill={UI.muted}>vs</text>
      <rect x={W + 43} y={2} width={W} height={H} fill="#ffffff" stroke={UI.ink} strokeWidth={2} />
      <g transform={`translate(${W + 43} 2)`}>{dots(30, 23)}</g>
    </svg>
  );
}
