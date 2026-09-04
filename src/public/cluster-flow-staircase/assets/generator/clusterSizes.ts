/**
 * `numDistributer(6, 24)` from the MATLAB source, live branch only (SPEC section 3).
 *
 * Four candidate rows are assembled first (so the number of draws does not depend on which row
 * wins), one is chosen with probabilities 4/16, 6/16, 3/16, 3/16, and the six sizes are shuffled.
 */
import { Rng, randi, randperm } from './prng';

const GS9 = [[3, 3, 3]];
const GS10 = [[3, 3, 4]];
const GS11 = [[3, 4, 4], [3, 5, 3]];
const GS12 = [[3, 4, 5], [3, 6, 3]];
const GS13 = [[3, 4, 6], [3, 5, 5], [4, 5, 4]];
const GS14 = [[3, 5, 6], [4, 4, 6], [4, 5, 5]];
const GS15 = [[3, 6, 6], [4, 5, 6], [5, 5, 5]];

function pick(rng: Rng, table: number[][]): number[] {
  return table[randi(rng, table.length) - 1];
}

/** Which of the four rows a `draw` value of 1..16 selects. */
export function rowForDraw(draw: number): number {
  if (draw <= 4) return 0;
  if (draw <= 10) return 1;
  if (draw <= 13) return 2;
  return 3;
}

/**
 * Draws the six cluster sizes together with the index of the row they came from.
 * Sizes are always in {3,4,5,6} and always sum to 24. The four rows split the 24 items as
 * 12+12, 11+13, 10+14 and 9+15 and are chosen with probabilities 4/16, 6/16, 3/16, 3/16.
 */
export function drawClusterSizes(rng: Rng): { sizes: number[]; row: number } {
  const rows = [
    [...pick(rng, GS12), ...pick(rng, GS12)],
    [...pick(rng, GS11), ...pick(rng, GS13)],
    [...pick(rng, GS10), ...pick(rng, GS14)],
    [...pick(rng, GS9), ...pick(rng, GS15)],
  ];
  const draw = randi(rng, 16);
  const row = rowForDraw(draw);
  const sizes = rows[row];
  const perm = randperm(rng, 6);
  return { sizes: perm.map((i) => sizes[i]), row };
}

/** `numDistributer(6, 24)`: the six shuffled cluster sizes. */
export function numDistributer(rng: Rng, nclust = 6, ntotal = 24): number[] {
  if (nclust !== 6 || ntotal !== 24) {
    throw new Error(`numDistributer only implements the live 6 x 24 branch, got ${nclust} x ${ntotal}`);
  }
  return drawClusterSizes(rng).sizes;
}
