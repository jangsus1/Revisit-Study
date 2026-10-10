/**
 * Reviewer-only gallery for the cluster-flow stimuli: every cue, stimulus A next to its paired
 * baseline B (built exactly as a trial builds it, with `generateTrialPair`) at 1:1 canvas size,
 * with ink and spacing metrics, the participant palette, the noise mask, and a "Play trial"
 * preview that runs the real timeline. Used for visual sign-off and screenshots.
 */
import {
  Button, Group, NumberInput, SegmentedControl, Stack, Text, Title,
} from '@mantine/core';
import { useEffect, useMemo, useState } from 'react';
import { GENERATOR_CONFIG } from './generator/config';
import { shapeSubset } from './generator/cues';
import { generateTrialPair, hashSeed } from './generator/generator';
import {
  CIRCLE_AREA, DOT_R, MARK_MAX_R, MARK_POINTS, MARK_REACH, NODE_INK,
} from './generator/geometry';
import { measureDisplay } from './generator/metrics';
import {
  deltaE2000, hexToLab, makePalette, palettePositions,
} from './generator/palette';
import {
  CUES, Cue, Density, Display, DisplayMetrics, NodeShape,
} from './generator/types';
import { NoiseMask } from './render/NoiseMask';
import { StimulusFrame } from './render/StimulusSVG';
import { TrialStage } from './render/TrialStage';
import { DEFAULT_REFRESH_MS, useTrialTimeline } from './useTrialTimeline';

interface Row {
  cue: Cue;
  displayA: Display | null;
  displayB: Display | null;
  metricsA: DisplayMetrics | null;
  metricsB: DisplayMetrics | null;
  error: string | null;
}

const fmt = (v: number, digits = 0) => (Number.isFinite(v) ? v.toFixed(digits) : '–');
const ratio = (b: number, a: number) => (a > 0 ? (b / a).toFixed(2) : '–');

function buildRow(cue: Cue, seed: number, density: Density, nB: number, hueOffset: number): Row {
  try {
    const { displayA, displayB } = generateTrialPair(seed, hashSeed(seed, 'B'), {
      cue, density, nB, hueOffset,
    });
    return {
      cue, displayA, displayB, metricsA: measureDisplay(displayA), metricsB: measureDisplay(displayB), error: null,
    };
  } catch (e) {
    return {
      cue, displayA: null, displayB: null, metricsA: null, metricsB: null, error: e instanceof Error ? e.message : String(e),
    };
  }
}

/** Generator diagnostics: seed, attempts, counts, and A's layout or B's sampling parameters. */
function diagnostics(display: Display): string {
  const base = `seed ${display.seed} · attempts ${display.attempts} · n ${display.n} · edges ${display.edges.length}`;
  const { meta } = display;
  if (display.kind === 'B') {
    const field = meta.field ? `${fmt(meta.field.w)}×${fmt(meta.field.h)}` : '–';
    return `${base} · field ${field} · spacing ${fmt(meta.spacing ?? NaN, 1)} · link target ${fmt(meta.linkTarget ?? NaN)}`;
  }
  const list = (values?: number[]) => (values ?? []).map((v) => fmt(v)).join(' ');
  return `${base} · ${meta.layout} layout · sizes [${meta.clusterSizes?.join(' ')}] · jitter ${meta.jitter} · gapX [${list(meta.gapX)}] · gapY [${list(meta.gapY)}] · order [${meta.order?.join(' ')}]`;
}

/** Ink and spacing statistics of one panel. */
function metricsLine(m: DisplayMetrics): string {
  return `ink ${fmt(m.ink)} px² (nodes ${fmt(m.nodeInk)} · links ${fmt(m.linkInk)} · outlines ${fmt(m.outlineInk)}) · link length ${fmt(m.linkLength)} · `
    + `NN mean ${fmt(m.meanNN, 1)} / min ${fmt(m.minNN, 1)} · pairwise ${fmt(m.meanPairwise, 1)} · hull area ${fmt(m.hullArea)}`;
}

/** B relative to A, the numbers the equating aims at. */
function ratiosLine(a: DisplayMetrics, b: DisplayMetrics, displayB: Display): string {
  const target = displayB.meta.linkTarget;
  const ofTarget = target ? ` (${ratio(b.linkLength, target)} of B's target)` : '';
  return `B / A: ink ${ratio(b.ink, a.ink)} · mean NN ${ratio(b.meanNN, a.meanNN)} · min NN ${ratio(b.minNN, a.minNN)} · `
    + `link length ${ratio(b.linkLength, a.linkLength)}${ofTarget} · hull area ${ratio(b.hullArea, a.hullArea)}`;
}

/** Median frame period from a short run of animation frames; 60 Hz until measured. */
function useRefreshEstimate(): number {
  const [refreshMs, setRefreshMs] = useState(DEFAULT_REFRESH_MS);
  useEffect(() => {
    if (typeof requestAnimationFrame !== 'function') return undefined;
    const stamps: number[] = [];
    let rafId = 0;
    const step = (now: number) => {
      stamps.push(now);
      if (stamps.length < 31) {
        rafId = requestAnimationFrame(step);
        return;
      }
      const deltas = stamps.slice(1).map((t, i) => t - stamps[i]).sort((x, y) => x - y);
      const median = deltas[Math.floor(deltas.length / 2)];
      if (median > 2 && median < 100) setRefreshMs(median);
    };
    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
  }, []);
  return refreshMs;
}

/** One trial played in place with the real timeline, mask and interval order. */
function TrialPreview({
  displayA, displayB, aFirst, runKey, refreshMs,
}: { displayA: Display; displayB: Display; aFirst: boolean; runKey: number; refreshMs: number }) {
  const { phase } = useTrialTimeline(true, refreshMs, runKey);
  return (
    <Stack gap={4} data-testid="trial-preview">
      <Text size="xs" c="dimmed">{`phase: ${phase} · ${aFirst ? 'A first' : 'B first'} · frame period ${refreshMs.toFixed(2)} ms`}</Text>
      <TrialStage
        first={aFirst ? displayA : displayB}
        second={aFirst ? displayB : displayA}
        maskSeed={hashSeed(displayA.seed, displayB.seed, 'mask')}
        mask2Seed={hashSeed(displayA.seed, displayB.seed, 'mask2')}
        phase={phase}
      />
    </Stack>
  );
}

function PaletteStrip({ hueOffset }: { hueOffset: number }) {
  const palette = makePalette(hueOffset);
  const positions = palettePositions(hueOffset);
  const labs = palette.map(hexToLab);
  const grey = hexToLab(GENERATOR_CONFIG.DOT_FILL);
  let worst = Infinity;
  labs.forEach((p, i) => labs.slice(i + 1).forEach((q) => { worst = Math.min(worst, deltaE2000(p, q)); }));
  const {
    centre, major, minor, axisHue, tilt,
  } = GENERATOR_CONFIG.COLOR_ELLIPSE;
  return (
    <Stack gap={4}>
      <Text size="sm" fw={600}>
        {`Colour cue palette: tilted CIELAB ellipse (centre L* ${centre[0]}, a* ${centre[1]}, b* ${centre[2]}; radii ${major} and ${minor}; axis ${axisHue}°, tilt ${tilt}°), `
          + `six colours evenly spaced along it, closest pair ${fmt(worst, 1)} CIEDE2000`}
      </Text>
      <Group gap="xs" data-testid="palette-strip">
        {palette.map((hex, k) => {
          const lab = labs[k];
          const hue = ((Math.atan2(lab.b, lab.a) * 180) / Math.PI + 360) % 360;
          return (
            <Stack key={hex} gap={2} align="center">
              <div style={{
                width: 56, height: 32, background: hex, borderRadius: 4,
              }}
              />
              <Text size="xs">{hex}</Text>
              <Text size="xs" c="dimmed">{`L* ${fmt(lab.L, 1)} · C ${fmt(Math.hypot(lab.a, lab.b), 1)} · h ${fmt(hue)}°`}</Text>
              <Text size="xs" c="dimmed">{`at ${fmt(positions[k])}°`}</Text>
            </Stack>
          );
        })}
        <Stack gap={2} align="center">
          <div style={{
            width: 56, height: 32, background: GENERATOR_CONFIG.DOT_FILL, borderRadius: 4,
          }}
          />
          <Text size="xs">{`${GENERATOR_CONFIG.DOT_FILL} (grey)`}</Text>
          <Text size="xs" c="dimmed">{`L* ${fmt(grey.L, 1)} · C 0`}</Text>
        </Stack>
      </Group>
    </Stack>
  );
}

/**
 * The shape cue's pool: the seven filled marks at 4x, with their area relative to the circle and
 * their reach in RDOT. The six a display uses are highlighted.
 */
function ShapePool({ used }: { used: readonly NodeShape[] }) {
  const zoom = 4;
  const box = 2 * MARK_MAX_R * zoom + 8;
  return (
    <Stack gap={4}>
      <Text size="sm" fw={600}>
        {`Shape cue pool: ${GENERATOR_CONFIG.SHAPES.length} filled marks, the circle's area unless that would reach beyond ${GENERATOR_CONFIG.MARK_MAX_R} RDOT; `
          + 'each shape-cue A draws six (highlighted: this seed\'s), its B draws from the same six (shown at 4x)'}
      </Text>
      <Group gap="xs" data-testid="shape-pool">
        {GENERATOR_CONFIG.SHAPES.map((shape) => {
          const c = box / 2;
          const inUse = used.includes(shape);
          return (
            <Stack key={shape} gap={2} align="center" data-testid={`shape-${shape}`} data-used={inUse}>
              <svg width={box} height={box} style={{ background: inUse ? '#e7f1fb' : '#f8f9fa', borderRadius: 6 }}>
                <circle cx={c} cy={c} r={MARK_MAX_R * zoom} fill="none" stroke="#ced4da" strokeDasharray="3 3" />
                {shape === 'circle'
                  ? <circle cx={c} cy={c} r={DOT_R * zoom} fill={GENERATOR_CONFIG.DOT_FILL} />
                  : (
                    <polygon
                      points={MARK_POINTS[shape].map(([x, y]) => `${c + x * zoom},${c + y * zoom}`).join(' ')}
                      fill={GENERATOR_CONFIG.DOT_FILL}
                    />
                  )}
              </svg>
              <Text size="xs" fw={inUse ? 700 : 400}>{shape}</Text>
              <Text size="xs" c="dimmed">{`area ${fmt(NODE_INK[shape] / CIRCLE_AREA, 2)} · reach ${fmt(MARK_REACH[shape] / DOT_R, 2)} r`}</Text>
            </Stack>
          );
        })}
      </Group>
    </Stack>
  );
}

export default function Gallery() {
  const [seed, setSeed] = useState(1);
  const [nB, setNB] = useState(24);
  const [density, setDensity] = useState<Density>('sparse');
  const [hueOffset, setHueOffset] = useState(0);
  const [aFirstByCue, setAFirstByCue] = useState<Record<string, boolean>>({});
  // the frame period is frozen when Play is clicked, so a late refresh estimate cannot restart a run
  const [playing, setPlaying] = useState<{ cue: Cue; runKey: number; refreshMs: number } | null>(null);
  const refreshMs = useRefreshEstimate();

  const rows = useMemo(
    () => CUES.map((cue) => buildRow(cue, seed, density, nB, hueOffset)),
    [seed, nB, density, hueOffset],
  );
  const { width, height } = GENERATOR_CONFIG.CANVAS;
  const previewScale = 1 / 3;
  const shapeRow = rows.find((row) => row.cue === 'shape');

  return (
    <Stack gap="lg" p="md">
      <Title order={3}>Cluster-flow stimulus gallery</Title>
      <Group align="flex-end" gap="md">
        <NumberInput
          label="Seed"
          value={seed}
          min={0}
          step={1}
          allowDecimal={false}
          onChange={(value) => setSeed(typeof value === 'number' ? value : Number(value) || 0)}
          w={140}
        />
        <NumberInput
          label="N_B"
          value={nB}
          min={8}
          max={48}
          step={1}
          allowDecimal={false}
          clampBehavior="strict"
          onChange={(value) => setNB(Math.min(48, Math.max(8, typeof value === 'number' ? value : Number(value) || 8)))}
          w={120}
        />
        <NumberInput
          label="Colour rotation (° of ellipse)"
          value={hueOffset}
          min={0}
          max={59}
          step={1}
          allowDecimal={false}
          clampBehavior="strict"
          onChange={(value) => setHueOffset(Math.min(59, Math.max(0, typeof value === 'number' ? value : Number(value) || 0)))}
          w={140}
        />
        <SegmentedControl
          data={[{ label: 'sparse', value: 'sparse' }, { label: 'dense', value: 'dense' }]}
          value={density}
          onChange={(value) => setDensity(value as Density)}
        />
        <Button onClick={() => setSeed(Math.floor(Math.random() * 1000000))}>Random seed</Button>
      </Group>

      <ShapePool used={shapeRow?.displayA ? shapeSubset(shapeRow.displayA) : []} />

      <Group align="flex-start" gap="xl">
        <PaletteStrip hueOffset={hueOffset} />
        <Stack gap={4}>
          <Text size="sm" fw={600}>Noise masks (150 ms after each stimulus, two patterns; the first shown at 1:3)</Text>
          <div style={{ width: width * previewScale, height: height * previewScale, overflow: 'hidden' }}>
            <div style={{ transform: `scale(${previewScale})`, transformOrigin: 'top left' }}>
              <NoiseMask width={width} height={height} seed={hashSeed(seed, hashSeed(seed, 'B'), 'mask')} />
            </div>
          </div>
        </Stack>
      </Group>

      {rows.map((row) => {
        const aFirst = aFirstByCue[row.cue] ?? true;
        return (
          <Stack key={row.cue} gap="xs" data-testid={`gallery-row-${row.cue}`}>
            <Group gap="md" align="center">
              <Title order={5}>{`cue: ${row.cue}`}</Title>
              <SegmentedControl
                size="xs"
                data={[{ label: 'A first', value: 'A' }, { label: 'B first', value: 'B' }]}
                value={aFirst ? 'A' : 'B'}
                onChange={(value) => setAFirstByCue((prev) => ({ ...prev, [row.cue]: value === 'A' }))}
              />
              <Button
                size="xs"
                disabled={!row.displayA || !row.displayB}
                onClick={() => setPlaying((prev) => ({ cue: row.cue, runKey: (prev?.runKey ?? 0) + 1, refreshMs }))}
              >
                Play trial
              </Button>
            </Group>
            {row.error && <Text size="xs" c="red">{row.error}</Text>}
            <Group align="flex-start" gap="md" wrap="nowrap" style={{ overflowX: 'auto' }}>
              {([['A — 24 items, 6 clusters', row.displayA, row.metricsA], [`B — ${nB} items, no grouping`, row.displayB, row.metricsB]] as const)
                .map(([label, display, metrics]) => (
                  <Stack key={label} gap={4} style={{ width, flexShrink: 0 }}>
                    <Text size="xs" fw={600}>{label}</Text>
                    <StimulusFrame display={display ?? undefined} />
                    {display && <Text size="xs" c="dimmed">{diagnostics(display)}</Text>}
                    {metrics && <Text size="xs" c="dimmed" data-testid="metrics-footer">{metricsLine(metrics)}</Text>}
                  </Stack>
                ))}
            </Group>
            {row.metricsA && row.metricsB && row.displayB && (
              <Text size="xs" fw={600} data-testid="ratios-line">{ratiosLine(row.metricsA, row.metricsB, row.displayB)}</Text>
            )}
            {playing?.cue === row.cue && row.displayA && row.displayB && (
              <TrialPreview
                key={`${row.cue}-${aFirst}`}
                displayA={row.displayA}
                displayB={row.displayB}
                aFirst={aFirst}
                runKey={playing.runKey}
                refreshMs={playing.refreshMs}
              />
            )}
          </Stack>
        );
      })}
    </Stack>
  );
}
