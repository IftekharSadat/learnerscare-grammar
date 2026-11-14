/**
 * conversation plugin: a Talk turn as an exercise item (Type mode, Fix-it sessions).
 * check = evaluateUtterance, so typing passes exactly the same grammar gate as speaking.
 */
import type { CheckResult } from '@/engine/answer';
import type { Item } from '@/engine/types';
import { evaluateUtterance, FEEDBACK_COPY } from '@/speech/evaluate';
import type { Turn } from '@/speech/schema';
import { TypeBox } from './gapFill';
import type { ExercisePlugin, PluginRenderProps } from './types';

export type ConvValue = string;
const turns = new Map<string, Turn>();

export function turnToItem(turn: Turn, unitId: string): Item {
  const id = `talk:${turn.id}`;
  turns.set(`${unitId}:${id}`, turn);
  turns.set(id, turn);
  return {
    id, number: Number(turn.id.replace(/\D/g, '')) || 1, isExample: false, origin: turn.origin,
    prompt: [turn.partner?.text, turn.prompt.context, turn.prompt.text].filter(Boolean).join(' — ') || 'Say it.',
    cueWords: turn.prompt.cueWords, clue: turn.prompt.clue,
    acceptedAnswers: [turn.target.canonical, ...turn.target.acceptedUtterances], officialAnswer: turn.target.canonical,
    answerSentences: [turn.target.canonical], why: turn.feedback.recast ?? '', hints: { bn: '' },
    audio: { question: null, answer: null, pauseMs: 0 }, mapsToSection: turn.sectionRef.length === 1 ? turn.sectionRef : undefined,
  };
}
const turnOf = (item: Item) => turns.get(item.id);

function Render({ item, value, onChange, locked }: PluginRenderProps<ConvValue>) {
  const turn = turnOf(item);
  return (
    <div className="flex flex-col gap-4">
      <div className="card p-4">
        <p className="hero-sentence">{item.prompt}</p>
        {item.cueWords && <p className="mt-2"><span className="eyebrow mr-2">Cue words</span><span className="chip font-display !text-base">{item.cueWords}</span></p>}
        {turn?.prompt.responseIdeas && <p className="mt-2 flex flex-wrap gap-1.5">{turn.prompt.responseIdeas.map((r) => <span key={r} className="chip">{r}</span>)}</p>}
      </div>
      <TypeBox value={value} onChange={onChange} locked={locked} placeholder="Type what you would say" />
    </div>
  );
}

export const conversation: ExercisePlugin<ConvValue> = {
  type: 'conversation',
  label: 'Talk',
  icon: 'mic',
  initial: () => '',
  Render,
  check(item, value): CheckResult {
    const turn = turnOf(item);
    if (!turn) return { correct: false, code: 'other', message: 'This turn is not available.' };
    const e = evaluateUtterance(turn, value);
    return e.gate === 'pass' ? { correct: true, code: 'correct', message: FEEDBACK_COPY[e.feedbackKey], matched: e.matched } : { correct: false, code: 'other', message: turn.feedback.onWrong?.[e.feedbackKey] ?? FEEDBACK_COPY[e.feedbackKey] };
  },
  ready: (_i, v) => v.trim().length > 0,
  hint: (item, level) => turnOf(item)?.hints[Math.min(level, 3) - 1 + (level === 3 ? 0 : 0)] ?? `It starts with “${item.officialAnswer.split(' ')[0]} …”`,
  revealAnswer: (item) => item.officialAnswer,
  serialize: (v) => v,
};
