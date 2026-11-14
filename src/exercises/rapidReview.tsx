/** rapidReview (boss round): one tap per item, three options built from the book item + generated wrong forms. */
import type { CheckResult } from '@/engine/answer';
import { normalise } from '@/engine/answer';
import { BE, ingMisspellings, joinBe, personOf } from '@/engine/spelling';
import type { Exercise, Item } from '@/engine/types';
import { baseVerb } from './gapFill';
import type { ExercisePlugin, PluginRenderProps } from './types';
import { shuffled } from './types';

export type RapidValue = string | null;

/** [correct, wrong, wrong] — wrong options are produced by rule (wrong be, misspelling, word order, wrong polarity). */
export function rapidOptions(item: Item, exercise: Exercise): string[] {
  const right = exercise.type === 'matching' ? item.answerSentences![0] : item.acceptedAnswers[0];
  const wrong = new Set<string>();
  const tiles = item.tiles ?? [];
  const subject = tiles.find((t) => t.role === 'subject')?.t ?? '';
  const verb = tiles.find((t) => t.role === 'verb')?.t ?? '';
  if (exercise.type === 'matching') {
    const opts = exercise.options ?? [];
    const idx = opts.findIndex((o) => o.text === right);
    wrong.add(opts[(idx + 2) % opts.length].text);
    wrong.add(opts[(idx + 5) % opts.length].text);
  } else if (exercise.type === 'buildQuestion') {
    const be = tiles.findIndex((t) => t.role === 'be');
    const sub = tiles.findIndex((t) => t.role === 'subject');
    const swapped = tiles.map((t) => t.t);
    [swapped[be], swapped[sub]] = [swapped[sub], swapped[be]];
    wrong.add(swapped.join(' ') + '?');
    const wrongBe = BE[personOf(subject)].full === 'are' ? 'is' : 'are';
    wrong.add(tiles.map((t) => (t.role === 'be' ? wrongBe : t.t)).join(' ') + '?');
  } else {
    const p = personOf(subject);
    const prefix = item.subjectInBlank === false ? '' : subject;
    const mk = (be: string, v: string) => (prefix ? `${joinBe(prefix, be)} ${v}` : `${be} ${v}`);
    const miss = ingMisspellings(baseVerb(item)).find((m) => m !== verb.toLowerCase());
    if (item.polarity === 'negative') {
      wrong.add(mk(p === 'sg' ? 'doesn’t' : 'don’t', verb));
      wrong.add(mk(BE[p].short, verb));
    } else {
      wrong.add(mk(p === 'pl' ? 'is' : 'are', verb));
      if (miss) wrong.add(mk(BE[p].short, miss));
      else wrong.add(mk(BE[p].neg[0], verb));
    }
  }
  wrong.delete(right);
  return shuffled([right, ...[...wrong].slice(0, 2)], item.id + 'rapid');
}

function Render({ exercise, item, value, onChange, locked }: PluginRenderProps<RapidValue>) {
  const options = rapidOptions(item, exercise);
  const right = exercise.type === 'matching' ? item.answerSentences![0] : item.acceptedAnswers[0];
  return (
    <div className="flex flex-col gap-2" role="radiogroup" aria-label="Choose the answer">
      {options.map((o) => {
        const picked = value === o;
        const good = locked && o === right;
        const bad = locked && picked && o !== right;
        return (
          <button key={o} role="radio" aria-checked={picked} disabled={locked} data-testid={o === right ? 'rapid-right' : 'rapid-wrong'}
            className={`min-h-[56px] rounded-2xl border-2 px-4 py-2 text-left font-display text-xl ${bad ? 'shake' : ''}`}
            style={{ borderColor: good ? 'var(--good)' : bad ? 'var(--bad)' : 'var(--line)', background: good ? 'var(--good-bg)' : bad ? 'var(--bad-bg)' : 'var(--surface)' }}
            onClick={() => onChange(o)}>
            {good && '✓ '}{bad && '✕ '}{o}
          </button>
        );
      })}
    </div>
  );
}

export const rapidReview: ExercisePlugin<RapidValue> = {
  type: 'rapidReview',
  label: 'Rapid Review',
  icon: 'bolt',
  initial: () => null,
  Render,
  check(item, v, exercise): CheckResult {
    const right = exercise.type === 'matching' ? item.answerSentences![0] : item.acceptedAnswers[0];
    return v !== null && normalise(v) === normalise(right)
      ? { correct: true, code: 'correct', message: 'Correct!', matched: right }
      : { correct: false, code: 'other', message: `The answer is “${right}”.` };
  },
  ready: (_i, v) => v !== null,
  hint: (item) => item.why || 'Think of the pattern: subject + am / is / are + verb-ing.',
  revealAnswer: (item, exercise) => (exercise.type === 'matching' ? item.answerSentences![0] : item.acceptedAnswers[0]),
  serialize: (v) => v ?? '',
};
