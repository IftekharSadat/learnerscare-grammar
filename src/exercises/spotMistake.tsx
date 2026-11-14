/** spotMistake (Mistake Hunt): tap the part that is wrong, then choose the corrected sentence. Teacher's illustration. */
import { useState } from 'react';
import type { CheckResult } from '@/engine/answer';
import { normalise } from '@/engine/answer';
import { playSfx } from '@/engine/sfx';
import type { Item, Mistake } from '@/engine/types';
import type { ExercisePlugin, PluginRenderProps } from './types';
import { shuffled } from './types';

export interface SpotValue {
  found: boolean;
  misses: number;
  choice: string | null;
}

const words = (s: string) => s.split(/\s+/).filter(Boolean);
/** word indexes of the wrong sentence that do not survive into the right sentence at the same position/order */
export function wrongIndexes(wrong: string, right: string): number[] {
  const w = words(wrong), r = words(right);
  const out: number[] = [];
  let j = 0;
  for (let i = 0; i < w.length; i++) {
    if (w[i] === '/') continue;
    if (j < r.length && normalise(w[i]) === normalise(r[j])) { j++; continue; }
    const ahead = r.findIndex((x, k) => k > j && normalise(x) === normalise(w[i]));
    if (ahead > -1 && w.length === r.length) { out.push(i); j++; continue; }
    out.push(i);
    if (w.length === r.length) j++;
  }
  // a missing word (e.g. no be-verb): mark the word where it should attach
  if (!out.length) {
    const k = w.findIndex((x, i) => normalise(x) !== normalise(r[i] ?? ''));
    out.push(Math.max(0, k));
  }
  return out;
}

export function mistakeToItem(m: Mistake): Item {
  return {
    id: m.id, number: Number(m.id.replace(/\D/g, '')) || 1, isExample: false, origin: 'learnerscare', prompt: m.wrong,
    acceptedAnswers: [m.right], officialAnswer: m.right, answerSentences: [m.right], why: '', hints: { bn: '' },
    cueWords: m.label, audio: { question: null, answer: m.audio, pauseMs: 0 },
  };
}

function Render({ item, value, onChange, locked }: PluginRenderProps<SpotValue>) {
  const [miss, setMiss] = useState<number | null>(null);
  const right = item.acceptedAnswers[0];
  const bad = wrongIndexes(item.prompt, right);
  const ws = words(item.prompt);
  const options = shuffled([right, item.prompt], item.id);
  return (
    <div className="flex flex-col gap-4">
      <div className="card p-4">
        <p className="eyebrow mb-2 !text-[color:var(--bad)]">✕ {item.cueWords}</p>
        <p className="hero-sentence" data-testid="mistake-sentence">
          {ws.map((w, i) => {
            const isBad = bad.includes(i);
            if (value.found || locked) return <span key={i} className={isBad ? 'rounded-md bg-bad-bg px-1 text-bad line-through decoration-2' : undefined}>{w} </span>;
            return (
              <button key={i} data-bad={isBad ? '1' : undefined} className={`mr-1 rounded-md px-0.5 underline decoration-dotted decoration-2 underline-offset-4 ${miss === i ? 'shake inline-block text-bad' : ''}`}
                onClick={() => {
                  if (isBad) { playSfx('correct'); onChange({ ...value, found: true }); }
                  else { playSfx('wrong'); setMiss(i); setTimeout(() => setMiss(null), 500); onChange({ ...value, misses: value.misses + 1 }); }
                }}>{w}</button>
            );
          })}
        </p>
      </div>
      {!value.found && !locked && <p className="font-bold">① Tap the part that is wrong.</p>}
      {(value.found || locked) && (
        <div>
          <p className="mb-2 font-bold">② Which sentence is correct?</p>
          <div className="flex flex-col gap-2" role="radiogroup" aria-label="Choose the correct sentence">
            {options.map((o) => {
              const picked = value.choice === o;
              const good = locked && o === right;
              return (
                <button key={o} role="radio" aria-checked={picked} disabled={locked} data-testid={o === right ? 'fix-right' : 'fix-wrong'}
                  className="min-h-[52px] rounded-2xl border-2 px-4 py-2 text-left font-display text-lg"
                  style={{ borderColor: good ? 'var(--good)' : picked ? 'var(--primary)' : 'var(--line)', background: good ? 'var(--good-bg)' : picked ? 'var(--surface-2)' : 'var(--surface)' }}
                  onClick={() => { playSfx('snap'); onChange({ ...value, choice: o }); }}>
                  {good && '✓ '}{o}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export const spotMistake: ExercisePlugin<SpotValue> = {
  type: 'spotMistake',
  label: 'Mistake Hunt',
  icon: 'search',
  initial: () => ({ found: false, misses: 0, choice: null }),
  Render,
  check(item, v): CheckResult {
    if (v.choice === item.acceptedAnswers[0]) return { correct: true, code: 'correct', message: 'Fixed!', matched: v.choice };
    return { correct: false, code: 'other', message: 'That is the sentence with the mistake. Choose the corrected one.' };
  },
  ready: (_i, v) => v.found && v.choice !== null,
  hint(item, level) {
    const tips: Record<string, string> = {
      'MISSING BE': 'Every present continuous sentence needs am / is / are before the -ing verb.',
      SPELLING: 'Check the -ing spelling: a final e is dropped, and ie changes to y.',
      'QUESTION ORDER': 'In a question, be goes before the subject.',
      'NEGATIVE FORM': 'The negative is be + not — never don’t + -ing.',
    };
    if (level === 1) return 'Compare it with the pattern: subject + am / is / are + verb-ing.';
    if (level === 2) return tips[item.cueWords ?? ''] ?? 'Look at the be-verb, the -ing spelling and the word order.';
    return `Correct: ${item.acceptedAnswers[0]}`;
  },
  revealAnswer: (item) => ({ found: true, misses: 0, choice: item.acceptedAnswers[0] }),
  serialize: (v) => v.choice ?? '',
  extraTries: (v) => (v.misses > 1 ? 1 : 0),
};
