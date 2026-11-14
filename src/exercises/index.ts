/** Exercise plugin registry. A new exercise type = one new file + one line here. */
import { buildQuestion } from './buildQuestion';
import { conversation } from './conversation';
import { gapFill, pictureVerb } from './gapFill';
import { matching } from './matching';
import { positiveNegative } from './positiveNegative';
import { rapidReview } from './rapidReview';
import { spotMistake } from './spotMistake';
import type { ExercisePlugin } from './types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const registry: Record<string, ExercisePlugin<any>> = { gapFill, pictureVerb, matching, buildQuestion, positiveNegative, spotMistake, rapidReview, conversation };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function pluginFor(type: string): ExercisePlugin<any> {
  return registry[type] ?? gapFill;
}
export const exerciseTypes = Object.keys(registry);
