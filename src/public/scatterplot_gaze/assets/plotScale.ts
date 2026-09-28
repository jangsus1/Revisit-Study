/**
 * Larger scatterplots (2026-09-28): the plots keep their 600-px design size (all D3 code draws in
 * those units) and are shown scaled through an SVG viewBox. The scale fills the available height
 * (window height minus `reservedH` for surrounding UI) and width, between 1 and `max`:
 * about 1.35-1.4 on 900-1000 px tall full-screen laptops, 1.0 on 768 px tall screens.
 */
import { useEffect, useState } from 'react';

export function plotScale(baseW: number, baseH: number, reservedW: number, reservedH: number, max = 1.4): number {
  if (typeof window === 'undefined') return 1;
  const s = Math.min((window.innerHeight - reservedH) / baseH, (window.innerWidth - reservedW) / baseW, max);
  return Math.max(1, s);
}

export function usePlotScale(baseW: number, baseH: number, reservedW: number, reservedH: number, max = 1.4): number {
  const [s, setS] = useState(() => plotScale(baseW, baseH, reservedW, reservedH, max));
  useEffect(() => {
    const on = () => setS(plotScale(baseW, baseH, reservedW, reservedH, max));
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, [baseW, baseH, reservedW, reservedH, max]);
  return s;
}
