// Public API of the generator. Implemented in generator.ts; this barrel is the only import path
// the experiment components should use.
export * from './types';
export {
  generateAttentionPair, generateDisplay, generateTrialPair, hashSeed, nodeBounds,
} from './generator';
export { GENERATOR_CONFIG } from './config';
export { measureDisplay } from './metrics';
export { makePalette, paletteLab, palettePositions } from './palette';
