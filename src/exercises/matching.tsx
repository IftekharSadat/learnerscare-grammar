/** matching: tap the ending that follows the sentence; an animated connector links the pair. */
import { useLayoutEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { checkOption } from '@/engine/answer';
import { playSfx } from '@/engine/sfx';
import type { Exercise, Item } from '@/engine/types';
import { Rich } from '@/ui/basics';
import type { ExercisePlugin, PluginRenderProps } from './types';

export type MatchValue = string | null;

function useConnector(deps: unknown[]) {
  const box = useRef<HTMLDivElement>(null);
  const from = useRef<HTMLDivElement>(null);
  const to = useRef<HTMLButtonElement | null>(null);
  const [d, setD] = useState('');
  useLayoutEffect(() => {
    const calc = () => {
      if (!box.current || !from.current || !to.current) return setD('');
      const b = box.current.getBoundingClientRect();
      const f = from.current.getBoundingClientRect();
      const t = to.current.getBoundingClientRect();
      const side = t.left > f.right - 20;
      const x1 = side ? f.right - b.left : f.left + f.width / 2 - b.left;
      const y1 = side ? f.top + f.height / 2 - b.top : f.bottom - b.top;
      const x2 = side ? t.left - b.left : t.left + 18 - b.left;
      const y2 = side ? t.top + t.height / 2 - b.top : t.top - b.top + 2;
      const mx = (x1 + x2) / 2;
      setD(side ? `M${x1} ${y1} C${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}` : `M${x1} ${y1} C${x1} ${(y1 + y2) / 2}, ${x2} ${(y1 + y2) / 2}, ${x2} ${y2}`);
    };
    calc();
    window.addEventListener('resize', calc);
    return () => window.removeEventListener('resize', calc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { box, from, to, d };
}

function Render({ exercise, item, value, onChange, locked, result, used = [] }: PluginRenderProps<MatchValue>) {
  const shown = item.isExample ? item.acceptedAnswers[0] : value;
  const { box, from, to, d } = useConnector([shown, item.id]);
  const state = locked ? 'good' : result && !result.correct ? 'bad' : 'idle';
  return (
    <div ref={box} className="relative grid gap-6 md:grid-cols-2 md:gap-14">
      <div ref={from} className="card self-start p-4 md:sticky md:top-24">
        <span className="mb-2 grid h-8 w-8 place-items-center rounded-full bg-gold text-sm font-extrabold text-[#14184A]">{item.number}</span>
        <p className="hero-sentence">{item.prompt}</p>
      </div>
      <div className="flex flex-col gap-2" role="radiogroup" aria-label="Which sentence follows?">
        {exercise.options?.map((o) => {
          const isUsed = used.includes(o.key) && shown !== o.key;
          const picked = shown === o.key;
          return (
            <button key={o.key} ref={picked ? to : undefined} role="radio" aria-checked={picked} disabled={locked || isUsed} data-testid={`opt-${o.key}`}
              className={`flex min-h-[48px] items-center gap-3 rounded-2xl border-2 px-3 py-2 text-left font-bold transition-colors ${state === 'bad' && picked ? 'shake' : ''}`}
              style={{
                borderColor: picked ? (state === 'good' ? 'var(--good)' : state === 'bad' ? 'var(--bad)' : 'var(--primary)') : 'var(--line)',
                background: picked ? (state === 'good' ? 'var(--good-bg)' : state === 'bad' ? 'var(--bad-bg)' : 'var(--surface-2)') : 'var(--surface)',
                opacity: isUsed ? 0.45 : 1,
              }}
              onClick={() => { playSfx('snap'); onChange(o.key); }}>
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-surface2 text-sm font-extrabold">{o.key}</span>
              <span className="flex-1"><Rich text={o.text} guess={picked && locked} /></span>
              {isUsed && <span className="chip !py-0 !text-[0.65rem] uppercase">used</span>}
              {picked && state === 'good' && <span aria-label="correct" className="text-good">✓</span>}
              {picked && state === 'bad' && <span aria-label="incorrect" className="text-bad">✕</span>}
            </button>
          );
        })}
      </div>
      {d && (
        <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
          <motion.path key={d} d={d} fill="none" strokeWidth={4} strokeLinecap="round"
            stroke={state === 'good' ? 'var(--good)' : state === 'bad' ? 'var(--bad)' : 'var(--primary)'}
            initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.45, ease: 'easeOut' }} />
        </svg>
      )}
    </div>
  );
}

export const matching: ExercisePlugin<MatchValue> = {
  type: 'matching',
  label: 'Which goes with which?',
  icon: 'link',
  initial: () => null,
  Render,
  check: (item, v) => checkOption(item, v),
  ready: (_i, v) => v !== null,
  hint(item, level, exercise) {
    if (level === 1) return 'Ask yourself: what situation does the second sentence describe? Does it explain or continue the first one?';
    if (level === 2) {
      const right = item.answerSentences?.[0] ?? '';
      const ing = right.split(' ').find((w) => /ing\b/.test(w))?.replace(/[.,]/g, '');
      return ing ? `Look for the ending with “${ing}”. Careful: if two endings share a verb, the meaning decides.` : 'Read each ending after the sentence and listen: does it make sense?';
    }
    const key = item.acceptedAnswers[0];
    return `The answer: ${key} — ${exercise.options?.find((o) => o.key === key)?.text ?? ''}`;
  },
  revealAnswer: (item) => item.acceptedAnswers[0],
  serialize: (v) => v ?? '',
};

/** All-at-once board: connect every sentence, then check them together. */
export function MatchBoard({ exercise, onFinish }: { exercise: Exercise; onFinish: (results: { item: Item; tries: number; answer: string }[]) => void }) {
  const items = exercise.items;
  const example = items.find((i) => i.isExample);
  const [links, setLinks] = useState<Record<string, string>>(() => (example ? { [example.id]: example.acceptedAnswers[0] } : {}));
  const [active, setActive] = useState<string | null>(items.find((i) => !i.isExample)?.id ?? null);
  const [checked, setChecked] = useState(false);
  const [tries, setTries] = useState<Record<string, number>>({});
  const boxRef = useRef<HTMLDivElement>(null);
  const leftRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const rightRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [paths, setPaths] = useState<{ id: string; d: string }[]>([]);
  useLayoutEffect(() => {
    const calc = () => {
      const b = boxRef.current?.getBoundingClientRect();
      if (!b) return;
      setPaths(Object.entries(links).flatMap(([id, key]) => {
        const f = leftRefs.current[id]?.getBoundingClientRect();
        const t = rightRefs.current[key]?.getBoundingClientRect();
        if (!f || !t) return [];
        const x1 = f.right - b.left, y1 = f.top + f.height / 2 - b.top, x2 = t.left - b.left, y2 = t.top + t.height / 2 - b.top;
        const mx = (x1 + x2) / 2;
        return [{ id, d: `M${x1} ${y1} C${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}` }];
      }));
    };
    calc();
    window.addEventListener('resize', calc);
    return () => window.removeEventListener('resize', calc);
  }, [links]);
  const scored = items.filter((i) => !i.isExample);
  const ok = (i: Item) => checkOption(i, links[i.id] ?? null).correct;
  const allLinked = scored.every((i) => links[i.id]);
  const allRight = checked && scored.every(ok);
  const pickRight = (key: string) => {
    if (!active || checked && ok(items.find((i) => i.id === active)!)) return;
    playSfx('snap');
    setLinks((l) => {
      const next = Object.fromEntries(Object.entries(l).filter(([id, k]) => k !== key || id === example?.id));
      return { ...next, [active]: key };
    });
    setChecked(false);
    const order = scored.map((i) => i.id);
    const nextId = order.slice(order.indexOf(active) + 1).concat(order).find((id) => !links[id] && id !== active);
    if (nextId) setActive(nextId);
  };
  const check = () => {
    setChecked(true);
    const t = { ...tries };
    for (const i of scored) if (!ok(i)) t[i.id] = (t[i.id] ?? 0) + 1;
    setTries(t);
    playSfx(scored.every(ok) ? 'correct' : 'almost');
  };
  return (
    <div>
      <p className="mb-3 text-sm font-bold text-muted">Tap a sentence on the left, then the ending that follows it. Each ending is used once.</p>
      <div ref={boxRef} className="relative grid grid-cols-[1fr_1fr] gap-x-8 gap-y-2 sm:gap-x-16">
        <div className="flex flex-col gap-2">
          {items.map((i) => {
            const st = i.isExample ? 'example' : checked ? (ok(i) ? 'good' : 'bad') : 'idle';
            return (
              <button key={i.id} ref={(el) => { leftRefs.current[i.id] = el; }} disabled={i.isExample} aria-pressed={active === i.id} data-testid={`left-${i.number}`}
                className="min-h-[56px] rounded-2xl border-2 px-2 py-1.5 text-left text-[0.88rem] font-bold leading-tight sm:text-base"
                style={{ borderColor: st === 'good' ? 'var(--good)' : st === 'bad' ? 'var(--bad)' : active === i.id ? 'var(--primary)' : 'var(--line)', background: active === i.id ? 'var(--surface-2)' : 'var(--surface)', opacity: i.isExample ? 0.6 : 1 }}
                onClick={() => setActive(i.id)}>
                <span className="mr-1 font-extrabold text-primary">{i.number}</span>{i.prompt}{st === 'good' && ' ✓'}{st === 'bad' && ' ✕'}
              </button>
            );
          })}
        </div>
        <div className="flex flex-col gap-2">
          {exercise.options?.map((o) => {
            const taken = Object.values(links).includes(o.key);
            return (
              <button key={o.key} ref={(el) => { rightRefs.current[o.key] = el; }} data-testid={`right-${o.key}`} disabled={o.key === example?.acceptedAnswers[0]}
                className="min-h-[56px] rounded-2xl border-2 border-line bg-surface px-2 py-1.5 text-left text-[0.88rem] font-bold leading-tight sm:text-base"
                style={{ opacity: taken ? 0.6 : 1 }} onClick={() => pickRight(o.key)}>
                <span className="mr-1 font-extrabold text-primary">{o.key}</span>{o.text}
              </button>
            );
          })}
        </div>
        <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
          {paths.map((p) => {
            const it = items.find((i) => i.id === p.id)!;
            return <motion.path key={p.id + p.d} d={p.d} fill="none" strokeWidth={3.5} strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.4 }}
              stroke={it.isExample ? 'var(--muted)' : checked ? (ok(it) ? 'var(--good)' : 'var(--bad)') : 'var(--primary)'} strokeDasharray={it.isExample ? '6 6' : undefined} />;
          })}
        </svg>
      </div>
      <div className="mt-4 flex flex-col gap-2" aria-live="polite">
        {checked && !allRight && <p className="font-bold text-bad">✕ {scored.filter((i) => !ok(i)).length} to fix — tap a red sentence and choose again. If two endings share a verb, the meaning decides.</p>}
        {allRight && <p className="font-bold text-good">✓ All seven pairs are right.</p>}
        {!allRight ? (
          <button className="btn btn-primary" disabled={!allLinked} onClick={check} data-testid="check-all">Check all</button>
        ) : (
          <button className="btn btn-primary" data-testid="board-finish" onClick={() => onFinish(scored.map((i) => ({ item: i, tries: (tries[i.id] ?? 0) + 1, answer: links[i.id] })))}>See the reasons</button>
        )}
      </div>
    </div>
  );
}
