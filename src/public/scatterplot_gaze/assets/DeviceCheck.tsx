/**
 * Screen-size calibration (card part of the "virtual chinrest", Li et al., 2020 Sci. Rep.; used by Saxena et
 * al., 2024): the participant resizes a picture of a bank/ID card (ISO/IEC 7810 ID-1, 85.60 x 53.98 mm) to
 * match a real card held against the screen -> CSS pixels per cm. (The blind-spot distance test was tried
 * and dropped on 2026-09-30: too hard for participants.)
 */
import { Button, Slider } from '@mantine/core';
import { useState } from 'react';
import { Panel } from './FullScreen';

export const CARD_W_CM = 8.56;
const CARD_H_CM = 5.398;

export type CardResult = { pxPerCm: number; cardWidthPx: number } | null;

export function CardCheck({ onDone }: { onDone: (r: CardResult) => void }) {
  const [w, setW] = useState(() => Math.round(CARD_W_CM * (96 / 2.54)));   // nominal 96 dpi start
  const h = (w * CARD_H_CM) / CARD_W_CM;
  return (
    <Panel
      title="Screen size"
      actions={(
        <>
          <Button size="lg" onClick={() => onDone({ pxPerCm: w / CARD_W_CM, cardWidthPx: w })}>Done</Button>
          <Button size="lg" variant="subtle" color="gray" onClick={() => onDone(null)}>I have no card</Button>
        </>
      )}
    >
      Hold a bank card or ID card against the screen.
      <br />
      Drag the slider until the picture is the same size.
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 22, marginTop: 24,
      }}
      >
        <svg width={w} height={h} style={{ display: 'block' }}>
          <rect x={1} y={1} width={w - 2} height={h - 2} rx={(w * 0.318) / CARD_W_CM} fill="#dbeafe" stroke="#1e3a8a" strokeWidth={2} />
          <rect x={w * 0.1} y={h * 0.3} width={w * 0.14} height={h * 0.2} rx={3} fill="#fbbf24" />
          <rect x={w * 0.1} y={h * 0.72} width={w * 0.6} height={h * 0.07} rx={2} fill="#93c5fd" />
        </svg>
        <Slider w={440} min={150} max={700} step={1} value={w} onChange={setW} label={null} />
      </div>
    </Panel>
  );
}
