import { describe, expect, test } from 'vitest';
import {
  deviceRejectionReason, deviceUnsupported, screenRejectionReason, screenTooSmall,
} from '../screenCheck';

describe('screenCheck', () => {
  const min = { width: 1280, height: 800 };
  test('too small in either direction', () => {
    expect(screenTooSmall(1440, 900, min)).toBe(false);
    expect(screenTooSmall(1280, 800, min)).toBe(false);
    expect(screenTooSmall(1366, 768, min)).toBe(true);
    expect(screenTooSmall(1200, 900, min)).toBe(true);
  });
  test('the stored reason names both sizes', () => {
    expect(screenRejectionReason(1366.4, 767.6, min)).toBe('Screen too small: 1366 x 768 px in full screen (needs at least 1280 x 800)');
  });
  test('portrait viewports and touch-only devices are unsupported', () => {
    expect(deviceUnsupported(1440, 900, true)).toBe(false);
    expect(deviceUnsupported(820, 1180, true)).toBe(true);
    expect(deviceUnsupported(1180, 820, false)).toBe(true);
    expect(deviceRejectionReason(820, 1180, false)).toBe('Unsupported device: 820 x 1180 px in full screen, fine pointer no');
  });
});
