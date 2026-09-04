/**
 * Reviewer-only gallery for the cluster-flow stimuli: every cue, stimulus A next to its
 * ungrouped baseline B, at 1:1 canvas size. Used for visual sign-off and screenshots.
 */
import {
  Button, Group, NumberInput, SegmentedControl, Stack, Text, Title,
} from '@mantine/core';
import { useMemo, useState } from 'react';
import { GENERATOR_CONFIG } from './generator/config';
import { generateDisplay, hashSeed } from './generator/generator';
import {
  CUES, Cue, Density, Display,
} from './generator/types';
import { StimulusFrame } from './render/StimulusSVG';

interface Panel {
  cue: Cue;
  label: string;
  display: Display | null;
  error: string | null;
}

function build(seed: number, opts: Parameters<typeof generateDisplay>[1]): { display: Display | null, error: string | null } {
  try {
    return { display: generateDisplay(seed, opts), error: null };
  } catch (e) {
    return { display: null, error: e instanceof Error ? e.message : String(e) };
  }
}

function footer(panel: Panel) {
  const { display } = panel;
  if (!display) return panel.error ?? '';
  const base = `seed ${display.seed} · attempts ${display.attempts} · n ${display.n} · edges ${display.edges.length}`;
  if (display.kind === 'B') return base;
  const { meta } = display;
  return `${base} · sizes [${meta.clusterSizes?.join(' ')}] · jitter ${meta.jitter} · gapX [${meta.gapX?.join(' ')}] · gapY [${meta.gapY?.join(' ')}] · order [${meta.order?.join(' ')}]`;
}

export default function Gallery() {
  const [seed, setSeed] = useState(1);
  const [nB, setNB] = useState(30);
  const [density, setDensity] = useState<Density>('sparse');

  const rows = useMemo(() => CUES.map((cue) => {
    const a = build(seed, { kind: 'A', cue, density });
    const b = build(hashSeed(seed, 'B'), {
      kind: 'B', cue, density, nB,
    });
    return {
      cue,
      panels: [
        {
          cue, label: 'A — 24 items, 6 clusters', ...a,
        },
        {
          cue, label: `B — ${nB} items, no grouping`, ...b,
        },
      ] as Panel[],
    };
  }), [seed, nB, density]);

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
          min={2}
          max={80}
          step={2}
          allowDecimal={false}
          onChange={(value) => setNB(typeof value === 'number' ? value : Number(value) || 2)}
          w={140}
        />
        <SegmentedControl
          data={[{ label: 'sparse', value: 'sparse' }, { label: 'dense', value: 'dense' }]}
          value={density}
          onChange={(value) => setDensity(value as Density)}
        />
        <Button onClick={() => setSeed(Math.floor(Math.random() * 1000000))}>Random seed</Button>
      </Group>

      {rows.map((row) => (
        <Stack key={row.cue} gap="xs">
          <Title order={5}>{`cue: ${row.cue}`}</Title>
          <Group align="flex-start" gap="md" wrap="nowrap" style={{ overflowX: 'auto' }}>
            {row.panels.map((panel) => (
              <Stack key={panel.label} gap={4} style={{ width: GENERATOR_CONFIG.CANVAS.width }}>
                <Text size="xs" fw={600}>{panel.label}</Text>
                <StimulusFrame display={panel.display ?? undefined} />
                <Text size="xs" c="dimmed">{footer(panel)}</Text>
              </Stack>
            ))}
          </Group>
        </Stack>
      ))}
    </Stack>
  );
}
