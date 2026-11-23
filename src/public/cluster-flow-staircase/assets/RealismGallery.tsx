/**
 * Reviewer-only page of flowchart realism options (2026-11-23, for the group's discussion of which
 * to try next). One row per setting of `REALISM_PRESETS`: the current dagre chart, each realism
 * option on its own, and one combination. Each row shows one graph three ways: plain (as B would
 * be drawn), with the group highlight, and with the groups moved apart. Not part of any trial.
 */
import {
  Group, NumberInput, SegmentedControl, Stack, Text, Title,
} from '@mantine/core';
import { useMemo, useState } from 'react';
import {
  REALISM_PRESETS, RealismChart, buildRealism, chartBounds, countCrossings,
} from './generator/flowRealism';
import { FLOW_INKS, FlowInk } from './generator/types';
import { RealismSVG, fitScale } from './render/RealismSVG';

const PANEL_SCALE = 0.38;

function summary(chart: RealismChart): string {
  const b = chartBounds(chart);
  const fit = fitScale(chart);
  return `${Math.round(b.w)} × ${Math.round(b.h)} px · ${countCrossings(chart)} crossings${fit < 1 ? ` · shrunk to ${Math.round(fit * 100)} % to fit` : ''}`;
}

export default function RealismGallery() {
  const [seed, setSeed] = useState(1);
  const [ink, setInk] = useState<FlowInk>('dark');
  const rows = useMemo(() => REALISM_PRESETS.map((preset) => {
    try {
      return { ...preset, built: buildRealism(seed, preset.options), error: null };
    } catch (e) {
      return { ...preset, built: null, error: e instanceof Error ? e.message : String(e) };
    }
  }), [seed]);

  return (
    <Stack gap="lg" p="md">
      <Title order={3}>Flowchart realism options</Title>
      <Text size="sm" maw={1000}>
        Each row changes one thing about the whole chart (the last row combines several). The three panels show one
        24-box graph in six groups: plain (how B is drawn), with the group highlight, and with the groups moved apart.
        Grouping is done exactly as in the dagre gallery rows; only the look of the chart changes.
      </Text>
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
        <Stack gap={2}>
          <Text size="sm" fw={500}>Flowchart lines</Text>
          <SegmentedControl
            data={FLOW_INKS.map((value) => ({ label: value, value }))}
            value={ink}
            onChange={(value) => setInk(value as FlowInk)}
          />
        </Stack>
      </Group>
      {rows.map((row) => (
        <Stack key={row.key} gap={4} data-testid={`realism-row-${row.key}`}>
          <Title order={5}>{row.title}</Title>
          {row.error && <Text size="xs" c="red">{row.error}</Text>}
          {row.built && (
            <>
              <Group gap="sm" wrap="nowrap" align="flex-start" style={{ overflowX: 'auto' }}>
                {([['plain (as B)', row.built.plain], ['highlight', row.built.highlight], ['apart', row.built.apart]] as const).map(([label, chart]) => (
                  <Stack key={label} gap={2}>
                    <Text size="xs" fw={600}>{label}</Text>
                    <div style={{ border: '1px solid #ccc' }}>
                      <RealismSVG chart={chart} ink={ink} scale={PANEL_SCALE} />
                    </div>
                    <Text size="xs" c="dimmed">{summary(chart)}</Text>
                  </Stack>
                ))}
              </Group>
              <Text size="xs" c="dimmed">
                {`graph seed ${row.built.seed}${row.built.seed !== seed ? ` (seed ${seed} could not be moved apart)` : ''}`}
              </Text>
            </>
          )}
        </Stack>
      ))}
    </Stack>
  );
}
