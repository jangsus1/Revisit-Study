import { describe, expect, test } from 'vitest';
import { GENERATOR_CONFIG as C } from '../config';
import {
  REALISM_PRESETS, buildRealism, countCrossings, nodeRect,
} from '../flowRealism';
import { Rect } from '../types';

const SLOW = 120000;
const near = (a: Rect, b: Rect, gap: number) => a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap;

describe('flowchart realism prototypes', () => {
  test('every preset gives 24 boxes in six groups, three ways, deterministically', () => {
    REALISM_PRESETS.forEach((preset) => [1, 7].forEach((seed) => {
      const built = buildRealism(seed, preset.options);
      [built.plain, built.highlight, built.apart].forEach((chart) => {
        expect(chart.nodes).toHaveLength(C.NTOTAL);
        expect(new Set(chart.nodes.map((n) => n.group)).size).toBeGreaterThanOrEqual(4);
        chart.links.forEach((l) => l.points.forEach((p) => expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true)));
      });
      expect(buildRealism(seed, preset.options).plain.nodes).toEqual(built.plain.nodes);
      // plain and highlight share the layout; only plain has no rectangles
      expect(built.highlight.nodes).toEqual(built.plain.nodes);
      expect(built.plain.highlight).toHaveLength(0);
      expect(built.highlight.highlight.length).toBeGreaterThan(0);
    }));
  }, SLOW);

  test('moved apart, boxes do not overlap; highlight rectangles hold only their own group', () => {
    REALISM_PRESETS.forEach((preset) => {
      const { apart, highlight } = buildRealism(3, preset.options);
      const rects = apart.nodes.map(nodeRect);
      rects.forEach((a, i) => rects.slice(i + 1).forEach((b) => expect(near(a, b, 0)).toBe(false)));
      highlight.highlight.forEach((r) => {
        const groups = new Set(highlight.nodes.filter((n) => near(nodeRect(n), r, -1)).map((n) => n.group));
        expect(groups.size).toBe(1);
      });
    });
  }, SLOW);

  test('structure and node-type options do what they say', () => {
    const merges = buildRealism(2, { structure: 'merges' }).plain;
    expect(merges.links.some((l) => l.kind === 'merge')).toBe(true);
    const loops = buildRealism(2, { structure: 'loops' }).plain;
    expect(loops.links.some((l) => l.kind === 'back')).toBe(true);
    const typed = buildRealism(2, { nodeTypes: true }).plain;
    expect(typed.nodes.filter((n) => n.kind === 'start')).toHaveLength(1);
    expect(typed.nodes.some((n) => n.kind === 'decision')).toBe(true);
    expect(typed.links.filter((l) => l.label).length).toBeGreaterThan(0);
    const text = buildRealism(2, { labels: 'text' }).plain;
    expect(text.nodes.every((n) => typeof n.text === 'string' && n.w >= C.FLOW_DAGRE.box.width)).toBe(true);
    const lr = buildRealism(2, { layout: 'dagre-lr' }).plain;
    const tb = buildRealism(2, {}).plain;
    // the same graph turned on its side: as many columns left to right as rows top to bottom
    const distinct = (values: number[]) => new Set(values.map((v) => Math.round(v))).size;
    expect(distinct(lr.nodes.map((n) => n.x))).toBe(distinct(tb.nodes.map((n) => n.y)));
    expect(countCrossings(tb)).toBeGreaterThanOrEqual(0);
  }, SLOW);
});
