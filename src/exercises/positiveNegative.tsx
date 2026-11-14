/** positiveNegative: ① tap the clue words → ② choose Positive ✓ / Negative ✕ → ③ build the form. */
import { useState } from 'react';
import { checkText } from '@/engine/answer';
import { playSfx } from '@/engine/sfx';
import type { Item } from '@/engine/types';
import { compose, FormBuilder, gapFill, TypeBox, type GapValue } from './gapFill';
import type { ExercisePlugin, PluginRenderProps } from './types';

export interface PosNegValue extends GapValue {
  step: 1 | 2 | 3;
  clue: 'none' | 'found' | 'shown';
  polarity: 'positive' | 'negative' | null;
  polarityTries: number;
}

const BLANK = '______';

interface Tok { text: string; start: number; end: number; kind: 'word' | 'blank' | 'cue' | 'space' }
function tokenise(prompt: string): Tok[] {
  const out: Tok[] = [];
  const re = /______|\([^)]*\)|\s+|[^\s]+/g;
  for (let m = re.exec(prompt); m; m = re.exec(prompt)) {
    const text = m[0];
    out.push({ text, start: m.index, end: m.index + text.length, kind: text === BLANK ? 'blank' : /^\(/.test(text) ? 'cue' : /^\s+$/.test(text) ? 'space' : 'word' });
  }
  return out;
}
const inClue = (item: Item, t: Tok) => (item.clueSpans ?? []).some(([a, b]) => t.start < b && t.end > a);

function Render(p: PluginRenderProps<PosNegValue>) {
  const { item, value, onChange, locked, inputMode, advanced, exercise, onEvent } = p;
  const [miss, setMiss] = useState<number | null>(null);
  const toks = tokenise(item.prompt);
  const showClue = value.clue !== 'none' || locked || item.isExample;
  const step = locked || item.isExample ? 3 : value.step;
  const polarity = item.isExample || locked ? item.polarity! : value.polarity;
  const tapWord = (t: Tok, i: number) => {
    if (step !== 1) return;
    if (inClue(item, t)) { playSfx('correct'); onEvent?.('clue'); onChange({ ...value, clue: 'found', step: 2 }); }
    else { playSfx('wrong'); setMiss(i); setTimeout(() => setMiss(null), 500); }
  };
  const choose = (pol: 'positive' | 'negative') => {
    if (pol === item.polarity) { playSfx('correct'); onChange({ ...value, polarity: pol, step: 3 }); }
    else { playSfx('wrong'); onChange({ ...value, polarityTries: value.polarityTries + 1, polarity: pol }); }
  };
  const filled = locked || item.isExample ? (item.isExample ? item.acceptedAnswers[0] : compose(item, value) || value.typed) : '';
  const method = exercise.method?.length ? exercise.method : ['Find the clue', 'Decide: positive or negative', 'Build the form'];
  return (
    <div className="flex flex-col gap-4">
      {!item.isExample && !locked && (
        <ol className="flex gap-1.5 text-xs font-extrabold" aria-label="Steps">
          {method.map((m, i) => (
            <li key={m} className="flex-1 rounded-xl px-2 py-1.5 text-center" aria-current={step === i + 1 ? 'step' : undefined}
              style={{ background: step === i + 1 ? 'var(--gold)' : step > i + 1 ? 'var(--good-bg)' : 'var(--surface-2)', color: step === i + 1 ? '#14184A' : step > i + 1 ? 'var(--good)' : 'var(--muted)' }}>
              {step > i + 1 ? '✓ ' : `${i + 1} `}{m}
            </li>
          ))}
        </ol>
      )}
      <div className="card p-4">
        <p className="hero-sentence" data-testid="passage">
          {toks.map((t, i) => {
            if (t.kind === 'space') return ' ';
            if (t.kind === 'blank') return filled ? <span key={i} className="rounded-lg bg-good-bg px-1 text-good">{filled}</span> : <span key={i} className="inline-block min-w-[5rem] border-b-4 border-dashed border-muted" aria-label="blank">&nbsp;</span>;
            if (t.kind === 'cue') return <span key={i} className="chip mx-1 align-middle font-sans !text-sm">{t.text}</span>;
            const clue = showClue && inClue(item, t);
            if (step === 1) return (
              <button key={i} onClick={() => tapWord(t, i)} data-clue={inClue(item, t) ? '1' : undefined}
                className={`rounded-md px-0.5 underline decoration-dotted decoration-2 underline-offset-4 ${miss === i ? 'shake inline-block text-bad' : ''}`}>{t.text}</button>
            );
            return <span key={i} className={clue ? 'rounded-md bg-gold px-0.5 text-[#14184A]' : undefined}>{t.text}</span>;
          })}
        </p>
        {showClue && item.clue && <p className="mt-3 text-sm font-bold"><span className="eyebrow mr-2">Clue</span>{item.clue}</p>}
      </div>
      {step === 1 && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-bold">① Tap the words that tell you positive or negative.</p>
          <button className="btn btn-ghost !min-h-[44px] text-sm" data-testid="show-clue" onClick={() => onChange({ ...value, clue: 'shown', step: 2 })}>Show me the clue</button>
        </div>
      )}
      {step === 2 && (
        <div>
          <p className="mb-2 font-bold">② Positive or negative?</p>
          <div className="grid grid-cols-2 gap-3" role="group" aria-label="Positive or negative">
            {(['positive', 'negative'] as const).map((pol) => (
              <button key={pol} data-testid={`pol-${pol}`} onClick={() => choose(pol)}
                className={`btn !min-h-[64px] text-lg ${value.polarity === pol && pol !== item.polarity ? 'shake' : ''}`}
                style={{ background: pol === 'positive' ? 'var(--good-bg)' : 'var(--bad-bg)', color: pol === 'positive' ? 'var(--good)' : 'var(--bad)', border: '2px solid currentColor' }}>
                {pol === 'positive' ? '✓ Positive' : '✕ Negative'}
              </button>
            ))}
          </div>
          {value.polarity && value.polarity !== item.polarity && <p className="mt-2 text-sm font-bold text-bad" role="status">Look at the clue again: “{item.clue}”.</p>}
        </div>
      )}
      {step === 3 && (
        <div className="flex flex-col gap-2">
          {!locked && !item.isExample && <p className="font-bold">③ Build the form <span className="chip ml-1">{polarity === 'negative' ? '✕ negative' : '✓ positive'}</span></p>}
          {(locked || item.isExample) && <span className="chip w-fit" style={{ background: polarity === 'negative' ? 'var(--bad-bg)' : 'var(--good-bg)', color: polarity === 'negative' ? 'var(--bad)' : 'var(--good)' }}>{polarity === 'negative' ? 'NEGATIVE ✕' : 'POSITIVE ✓'}</span>}
          {inputMode === 'type' && !item.isExample
            ? <TypeBox value={value.typed} onChange={(typed) => onChange({ ...value, typed })} locked={locked} placeholder="Type the missing words" />
            : <FormBuilder item={item} exercise={exercise} value={value} onChange={(v) => onChange({ ...value, ...v })} locked={locked || item.isExample} advanced={advanced} polarity={polarity ?? undefined} />}
          {(locked || item.isExample) && item.structure && <p className="text-xs font-extrabold uppercase tracking-wider text-muted">{item.structure}</p>}
        </div>
      )}
    </div>
  );
}

export const positiveNegative: ExercisePlugin<PosNegValue> = {
  type: 'positiveNegative',
  label: 'Positive or negative?',
  icon: 'plusminus',
  initial: (item, ex) => ({ ...gapFill.initial(item, ex), step: 1, clue: 'none', polarity: null, polarityTries: 0 }),
  Render,
  check(item, v, _ex, mode) {
    if (v.polarity !== item.polarity) return { correct: false, code: 'polarity', message: `Decide first: positive or negative? The clue is “${item.clue}”.` };
    return checkText(item, mode === 'type' ? v.typed : compose(item, v));
  },
  ready: (item, v, mode) => v.step === 3 && gapFill.ready(item, v, mode),
  hint(item, level, ex) {
    if (level === 1) return 'Read the sentence before and after the blank. Which words tell you what is really happening?';
    if (level === 2) return `The clue is “${item.clue}” → ${item.polarity}. ${item.structure ? `Structure: ${item.structure}.` : ''}`;
    return gapFill.hint(item, 3, ex);
  },
  revealAnswer: (item, ex) => ({ ...gapFill.revealAnswer(item, ex), step: 3, clue: 'shown', polarity: item.polarity ?? 'positive', polarityTries: 0 }),
  serialize: (v, item, mode) => gapFill.serialize(v, item, mode),
  extraTries: (v) => v.polarityTries,
};
