/**
 * A keyboard key drawn as a key cap (F, J, the arrows, Enter), optionally with a caption under it,
 * plus the study's standard answer-key reminder. `SvgKeyCap` is the same cap inside an SVG figure.
 */
import { CSSProperties, ReactNode } from 'react';
import { UI } from './theme';

export function KeyCap({
  label, caption, size = 44, testId,
}: { label: ReactNode; caption?: ReactNode; size?: number; testId?: string }) {
  const wide = typeof label === 'string' && label.length > 1;
  const cap: CSSProperties = {
    minWidth: size,
    height: size,
    padding: wide ? `0 ${Math.round(size * 0.3)}px` : 0,
    boxSizing: 'border-box',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: `2px solid ${UI.ink}`,
    borderBottomWidth: 5,
    borderRadius: Math.round(size * 0.18),
    background: '#ffffff',
    color: UI.ink,
    fontFamily: UI.font,
    fontWeight: 700,
    fontSize: Math.round(size * (wide ? 0.4 : 0.5)),
    lineHeight: 1,
  };
  return (
    <span
      data-testid={testId}
      style={{
        display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 6,
      }}
    >
      <kbd style={cap}>{label}</kbd>
      {caption && <span style={{ fontSize: 15, color: UI.muted, fontWeight: 600 }}>{caption}</span>}
    </span>
  );
}

/** F / ← = first, J / → = second, as two groups of key caps. */
export function AnswerKeys({ size = 44, testId = 'answer-keys' }: { size?: number; testId?: string }) {
  const group = (keys: string[], caption: string) => (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
    }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <KeyCap label={keys[0]} size={size} />
        <span style={{ fontSize: 15, color: UI.faint }}>or</span>
        <KeyCap label={keys[1]} size={size} />
      </div>
      <span style={{ fontSize: 16, color: UI.ink, fontWeight: 650 }}>{caption}</span>
    </div>
  );
  return (
    <div
      data-testid={testId}
      style={{
        display: 'flex', justifyContent: 'center', alignItems: 'flex-start', gap: 48,
      }}
    >
      {group(['F', '←'], 'first had more')}
      {group(['J', '→'], 'second had more')}
    </div>
  );
}

/** A key cap inside an SVG figure; (x, y) is its top-left corner. */
export function SvgKeyCap({
  x, y, label, size = 34, width,
}: { x: number; y: number; label: string; size?: number; width?: number }) {
  const w = width ?? size;
  return (
    <g>
      <rect x={x} y={y} width={w} height={size} rx={size * 0.18} fill="#ffffff" stroke={UI.ink} strokeWidth={2} />
      <line x1={x + 3} y1={y + size} x2={x + w - 3} y2={y + size} stroke={UI.ink} strokeWidth={4} strokeLinecap="round" />
      <text
        x={x + w / 2}
        y={y + size / 2 + 1}
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily={UI.font}
        fontWeight={700}
        fontSize={label.length > 1 ? size * 0.38 : size * 0.52}
        fill={UI.ink}
      >
        {label}
      </text>
    </g>
  );
}
