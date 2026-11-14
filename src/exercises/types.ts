import type { FC } from 'react';
import type { CheckResult } from '@/engine/answer';
import type { Exercise, Item } from '@/engine/types';

export interface PluginRenderProps<V> {
  unitId: string;
  exercise: Exercise;
  item: Item;
  value: V;
  onChange: (v: V) => void;
  /** true after a correct check / reveal, and for worked examples */
  locked: boolean;
  result: CheckResult | null;
  inputMode: 'tiles' | 'type';
  advanced: boolean;
  hintLevel: number;
  /** option keys already used by earlier items (matching) */
  used?: string[];
  onEvent?: (event: 'clue') => void;
}

/** Contract every exercise type implements. New units add types here without touching the engine core. */
export interface ExercisePlugin<V = unknown> {
  type: string;
  label: string;
  icon: string;
  initial(item: Item, exercise: Exercise): V;
  /** render */
  Render: FC<PluginRenderProps<V>>;
  check(item: Item, value: V, exercise: Exercise, inputMode: 'tiles' | 'type'): CheckResult;
  ready(item: Item, value: V, inputMode: 'tiles' | 'type'): boolean;
  /** hint ladder: 1 nudge, 2 clue / skeleton, 3 answer */
  hint(item: Item, level: 1 | 2 | 3, exercise: Exercise): string;
  revealAnswer(item: Item, exercise: Exercise): V;
  serialize(value: V, item: Item, inputMode: 'tiles' | 'type'): string;
  /** wrong attempts made inside the plugin before the final check (e.g. choosing the wrong polarity) */
  extraTries?(value: V): number;
}

export function shuffled<T>(list: T[], seed: string): T[] {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
    const j = h % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
