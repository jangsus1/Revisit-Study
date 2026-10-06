/**
 * Screen-size calibration with a credit-card-sized card (adapted from scatterplot_gaze's
 * DeviceCheck.tsx; the card part of the "virtual chinrest", Li et al., 2020): the participant
 * resizes a picture of an ISO/IEC 7810 ID-1 card (85.60 x 53.98 mm) until it matches a real card
 * held against the screen, which gives CSS pixels per cm. The implied screen diagonal is shown
 * live; one outside 11-34 inches asks for a second look before it is accepted
 * (`confirmedImplausible`). "I have no card" returns null and the stimuli keep their nominal size.
 */
import { Button, Slider } from '@mantine/core';
import { useState } from 'react';
import { Panel } from './Panel';
import { UI } from './theme';

export const CARD_W_CM = 8.56;
const CARD_H_CM = 5.398;
export const PLAUSIBLE_INCHES: [number, number] = [11, 34];
/** The card picture starts at its nominal 96-dpi size. */
export const NOMINAL_CARD_PX = Math.round(CARD_W_CM * (96 / 2.54));

export interface CardResult {
  pxPerCm: number;
  cardWidthPx: number;
  screenInches: number;
  confirmedImplausible: boolean;
}

/** Diagonal of the physical screen in inches implied by a card width, from the screen size in CSS px. */
export function impliedScreenInches(cardWidthPx: number, screenW: number, screenH: number): number {
  const pxPerCm = cardWidthPx / CARD_W_CM;
  return Math.hypot(screenW, screenH) / pxPerCm / 2.54;
}

export function isPlausible(inches: number): boolean {
  return inches >= PLAUSIBLE_INCHES[0] && inches <= PLAUSIBLE_INCHES[1];
}

export function cardResult(cardWidthPx: number, screenW: number, screenH: number, confirmedImplausible: boolean): CardResult {
  return {
    pxPerCm: Math.round((cardWidthPx / CARD_W_CM) * 1000) / 1000,
    cardWidthPx,
    screenInches: Math.round(impliedScreenInches(cardWidthPx, screenW, screenH) * 10) / 10,
    confirmedImplausible,
  };
}

export function CardCheck({ onDone }: { onDone: (result: CardResult | null) => void }) {
  const [w, setW] = useState(NOMINAL_CARD_PX);
  const [warn, setWarn] = useState(false);
  const screenW = typeof window === 'undefined' ? 0 : window.screen?.width ?? 0;
  const screenH = typeof window === 'undefined' ? 0 : window.screen?.height ?? 0;
  const h = (w * CARD_H_CM) / CARD_W_CM;
  const inches = impliedScreenInches(w, screenW, screenH);
  const done = (confirmed: boolean) => onDone(cardResult(w, screenW, screenH, confirmed));

  return (
    <Panel
      testId="card-check"
      kicker="Display check · 2 of 2"
      title="Screen size"
      maxWidth={720}
      actions={warn ? (
        <>
          <Button size="lg" onClick={() => setWarn(false)}>Check the card again</Button>
          <Button size="lg" variant="subtle" color="gray" onClick={() => done(true)}>My screen really is this size</Button>
        </>
      ) : (
        <>
          <Button size="lg" onClick={() => (isPlausible(inches) ? done(false) : setWarn(true))}>Done</Button>
          <Button size="lg" variant="subtle" color="gray" onClick={() => onDone(null)}>I have no card</Button>
        </>
      )}
    >
      Hold a bank card or ID card flat against the screen and drag the slider until the picture is
      exactly as wide as the card. This sets the size of the diagrams.
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 22, marginTop: 24,
      }}
      >
        <svg width={w} height={h} style={{ display: 'block' }} data-testid="card-picture">
          <rect x={1} y={1} width={w - 2} height={h - 2} rx={(w * 0.318) / CARD_W_CM} fill="#dbeafe" stroke="#1e3a8a" strokeWidth={2} />
          <rect x={w * 0.1} y={h * 0.3} width={w * 0.14} height={h * 0.2} rx={3} fill="#fbbf24" />
          <rect x={w * 0.1} y={h * 0.72} width={w * 0.6} height={h * 0.07} rx={2} fill="#93c5fd" />
        </svg>
        <Slider
          w={440}
          min={150}
          max={700}
          step={1}
          value={w}
          onChange={(v) => { setW(v); setWarn(false); }}
          label={null}
          aria-label="Card width"
        />
        <div style={{ fontSize: 15, color: UI.muted }}>
          That makes your screen about
          {' '}
          <strong>{`${Math.round(inches)} inches`}</strong>
          {` (${Math.round(inches * 2.54)} cm) diagonally.`}
        </div>
        {warn && (
          <div
            data-testid="card-warning"
            style={{
              fontSize: 15, color: '#8a5a00', background: '#fff4db', border: '1px solid #f2c46d', borderRadius: 8, padding: '10px 14px', maxWidth: 520,
            }}
          >
            Screens are rarely this size. Please hold the card flat against the screen and match its
            width again.
          </div>
        )}
      </div>
    </Panel>
  );
}
