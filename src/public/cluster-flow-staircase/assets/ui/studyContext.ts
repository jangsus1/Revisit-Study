/**
 * The two places where the study's pages read reVISit's own state (the participant's flat sequence,
 * the current step and the dynamic-block index). Kept in one module so unit tests can mock it.
 */
import { useMemo } from 'react';
import { useParams } from 'react-router';
import { useCurrentStep } from '../../../../routes/utils';
import { useFlatSequence, useStoreSelector } from '../../../../store/store';
import { decryptIndex } from '../../../../utils/encryptDecryptIndex';
import { findFuncBlock } from '../../../../utils/getSequenceFlatMap';
import type { Cue, Density } from '../generator/types';
import { BlockInfo, ProgressSummary, progressSummary } from './studyProgress';

export function useStudyProgress(): ProgressSummary | null {
  const config = useStoreSelector((state) => state.config);
  const flat = useFlatSequence();
  const step = useCurrentStep();
  const { funcIndex } = useParams();
  return useMemo(() => {
    if (typeof step !== 'number' || !flat?.length) return null;
    const blockInfo = (name: string) => (config?.sequence
      ? findFuncBlock(name, config.sequence)?.parameters as BlockInfo | undefined
      : undefined);
    return progressSummary(flat, step, funcIndex ? decryptIndex(funcIndex) : null, blockInfo);
  }, [config, flat, step, funcIndex]);
}

/**
 * The participant's cell (cue x density), read from the first practice or staircase block at or
 * after the current step, with the practice block's `trials` when it sets one. Null outside the
 * participant flow (reviewer pages, tests).
 */
export function useUpcomingCell(): { cue: Cue; density: Density; trials?: number } | null {
  const config = useStoreSelector((state) => state.config);
  const flat = useFlatSequence();
  const step = useCurrentStep();
  return useMemo(() => {
    if (typeof step !== 'number' || !flat?.length || !config?.sequence) return null;
    for (let i = step; i < flat.length; i += 1) {
      if (/^(practice|cell)-/.test(flat[i]) && flat[i] !== 'practice-intro') {
        const params = findFuncBlock(flat[i], config.sequence)?.parameters as { cue?: Cue; density?: Density; trials?: number } | undefined;
        if (params?.cue && params.density) {
          return { cue: params.cue, density: params.density, trials: flat[i].startsWith('practice-') ? params.trials : undefined };
        }
      }
    }
    return null;
  }, [config, flat, step]);
}
