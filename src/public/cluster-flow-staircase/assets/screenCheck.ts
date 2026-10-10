/**
 * The screen-size requirement, checked once the participant has entered full screen (in the setup),
 * instead of reVISit's window-size rule at the start: a browser window is smaller than the screen
 * (menu bar, tabs, address bar), so the window rule turned away people whose screens were large
 * enough. In full screen the viewport is the whole screen, which is what the trials use.
 */

export interface MinScreen {
  /** minimum full-screen viewport width, CSS px */
  width: number;
  /** minimum full-screen viewport height, CSS px */
  height: number;
}

/** How long the setup watches the viewport after the full-screen request before judging it, ms. */
export const SCREEN_SETTLE_MS = 1000;

/** True when a viewport of `width` x `height` CSS px is smaller than `min` in either direction. */
export function screenTooSmall(width: number, height: number, min: MinScreen): boolean {
  return width < min.width || height < min.height;
}

/** The reason stored with reVISit's rejection. */
export function screenRejectionReason(width: number, height: number, min: MinScreen): string {
  return `Screen too small: ${Math.round(width)} x ${Math.round(height)} px in full screen (needs at least ${min.width} x ${min.height})`;
}
