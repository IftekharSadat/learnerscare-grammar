/** Small interactive widgets used by explanation scenes. All content comes from step data. */
import { useState } from 'react';
import { motion } from 'framer-motion';
import { Tile } from '@/ui/basics';
import { playSfx } from '@/engine/sfx';
import { whyBe } from '@/engine/spelling';

/** start — NOW — finish bar. Tap the three labels to reveal them (or they appear on the narration cue). */
export function TimelineBar({ now, left, right, nowAt = 0.55, reveal = true, interactive = false }: {
  now: string; left: string; right: string; nowAt?: number; reveal?: boolean; interactive?: boolean;
}) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const shown = (k: string) => !interactive || !!open[k] || !reveal;
  const tap = (k: string) => { playSfx('snap'); setOpen((o) => ({ ...o, [k]: true })); };
  const Label = ({ k, text, cls }: { k: string; text: string; cls: string }) =>
    interactive && !shown(k) ? (
      <button className={`chip !bg-gold !text-[#14184A] ${cls}`} onClick={() => tap(k)} aria-label={`Reveal: ${k}`}>tap ?</button>
    ) : (
      <motion.span initial={interactive ? { scale: 0.6, opacity: 0 } : false} animate={{ scale: 1, opacity: 1 }} className={`text-xs font-extrabold tracking-wider text-muted ${cls}`}>{text}</motion.span>
    );
  return (
    <div className="w-full select-none pt-8" role="img" aria-label={`${left} … ${now} … ${right}`}>
      <div className="relative h-4 rounded-full bg-line">
        <motion.div className="absolute left-0 top-0 h-full rounded-full bg-primary" initial={{ width: 0 }} animate={{ width: `${nowAt * 100}%` }} transition={{ duration: 1.1, ease: 'easeOut' }} />
        <div className="absolute top-0 h-full rounded-r-full" style={{ left: `${nowAt * 100}%`, right: 0, background: 'repeating-linear-gradient(90deg, var(--line) 0 8px, transparent 8px 14px)' }} />
        <motion.div className="absolute -top-8 flex -translate-x-1/2 flex-col items-center" style={{ left: `${nowAt * 100}%` }}
          initial={{ y: -10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.9, type: 'spring' }}>
          {interactive && !shown('now') ? (
            <button className="chip !bg-gold !text-[#14184A]" onClick={() => tap('now')} aria-label="Reveal: now">tap ?</button>
          ) : (
            <span className="rounded-full bg-gold px-2 py-0.5 text-xs font-extrabold text-[#14184A]">{now}</span>
          )}
          <span className="h-3 w-0.5 bg-gold" />
          <span className="h-5 w-5 rounded-full border-4 border-gold bg-surface" />
        </motion.div>
      </div>
      <div className="mt-2 flex justify-between">
        <Label k="start" text={left} cls="" />
        <Label k="finish" text={right} cls="" />
      </div>
    </div>
  );
}

/** Pick a subject, then the be-verb. Wrong combinations wobble and explain gently. */
export function FormLab({ rows }: { rows: { subjects: string[]; be: string; verb: string }[] }) {
  const subjects = rows.flatMap((r) => r.subjects.map((s) => ({ s, be: r.be, verb: r.verb })));
  const [pick, setPick] = useState<number | null>(null);
  const [be, setBe] = useState<string | null>(null);
  const [wrong, setWrong] = useState<string | null>(null);
  const cur = pick === null ? null : subjects[pick];
  const options = [...new Set(rows.map((r) => r.be))];
  const choose = (b: string) => {
    if (!cur) return;
    if (b === cur.be) { setBe(b); setWrong(null); playSfx('correct'); }
    else { setWrong(b); setBe(null); playSfx('wrong'); }
  };
  return (
    <div className="card p-4" data-testid="form-lab">
      <p className="eyebrow mb-2">Try it · build the form</p>
      <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label="Choose a subject">
        {subjects.map((x, i) => (
          <Tile key={x.s} size="sm" role={pick === i ? 'subject' : undefined} selected={pick === i} onClick={() => { setPick(i); setBe(null); setWrong(null); }}>{x.s}</Tile>
        ))}
      </div>
      {cur && (
        <>
          <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label="Choose the be verb">
            {options.map((b) => (
              <span key={b} className={wrong === b ? 'shake inline-block' : 'inline-block'}>
                <Tile size="sm" role={be === b ? 'be' : undefined} onClick={() => choose(b)}>{b}</Tile>
              </span>
            ))}
          </div>
          <div className={`hero-sentence flex min-h-[3rem] flex-wrap items-center gap-2 rounded-2xl px-2 py-1 ${be ? 'glow-sweep' : ''}`} aria-live="polite">
            <span className="role-subject">{cur.s}</span>
            {be ? <span className="role-be">{be}</span> : <span className="slot">am / is / are</span>}
            <span className={be ? 'role-verb' : 'text-muted'}>{cur.verb}</span>
          </div>
          {wrong && <p className="mt-2 text-sm font-bold text-bad" role="status">Not “{cur.s} {wrong} {cur.verb}”. {whyBe(cur.s)}</p>}
          {be && <p className="mt-2 text-sm font-bold text-good" role="status">✓ {whyBe(cur.s)}</p>}
        </>
      )}
    </div>
  );
}

/** Flip card: full form ↔ everyday spoken form. */
export function FlipCard({ full, short }: { full: string; short: string }) {
  const [flipped, setFlipped] = useState(false);
  return (
    <button className="h-28 w-full [perspective:800px]" onClick={() => { playSfx('snap'); setFlipped((f) => !f); }}
      aria-label={flipped ? `${short} — spoken form of ${full}. Tap to see the full form.` : `${full}. Tap to see the spoken form.`}>
      <motion.div className="relative h-full w-full [transform-style:preserve-3d]" animate={{ rotateY: flipped ? 180 : 0 }} transition={{ type: 'spring', stiffness: 260, damping: 24 }}>
        <div className="card absolute inset-0 grid place-items-center [backface-visibility:hidden]">
          <span className="text-xs font-extrabold uppercase tracking-wider text-muted">full</span>
          <span className="font-display text-2xl">{full}</span>
        </div>
        <div className="absolute inset-0 grid place-items-center rounded-card bg-navy text-white [backface-visibility:hidden] [transform:rotateY(180deg)]" style={{ background: '#14184A' }}>
          <span className="text-xs font-extrabold uppercase tracking-wider text-[#FFC83D]">spoken</span>
          <span className="font-display text-3xl">{short}</span>
        </div>
      </motion.div>
    </button>
  );
}

/** Nested periods around now: tap a ring to focus it. */
export function PeriodRings({ rings, now }: { rings: string[]; now: string }) {
  const [focus, setFocus] = useState<number | null>(null);
  const draw = (i: number): JSX.Element => (
    <button key={rings[i]} onClick={(e) => { e.stopPropagation(); playSfx('snap'); setFocus(i); }}
      className="w-full rounded-[28px] border-2 p-3 pt-1 text-left transition-colors" aria-pressed={focus === i}
      style={{ borderColor: focus === i ? 'var(--gold)' : 'var(--primary)', background: focus === i ? 'color-mix(in srgb, var(--gold) 25%, var(--surface))' : `color-mix(in srgb, var(--primary) ${6 + i * 5}%, var(--surface))` }}>
      <span className="text-sm font-extrabold">{rings[i]}</span>
      <span className="mt-1 block">
        {i < rings.length - 1 ? draw(i + 1) : <span className="mx-auto mt-1 block w-fit rounded-full bg-gold px-3 py-1 text-xs font-extrabold text-[#14184A]">● {now}</span>}
      </span>
    </button>
  );
  return <div data-testid="period-rings">{draw(0)}</div>;
}

/** One-tap check between steps: instant feedback, never blocks. */
export function MicroCheck({ question, options, answer, explain, onDone }: {
  question: React.ReactNode; options: string[]; answer: string; explain?: string; onDone?: (correct: boolean) => void;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const done = picked !== null;
  return (
    <div className="card border-2 !border-gold p-4" data-testid="micro-check">
      <p className="eyebrow mb-1 !text-[color:var(--ink)]">Quick check</p>
      <p className="mb-3 text-[1.05rem] font-bold">{question}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const state = !done ? undefined : o === answer ? 'good' : o === picked ? 'bad' : undefined;
          return (
            <button key={o} disabled={done} data-testid={`micro-${o === answer ? 'right' : 'wrong'}`}
              className={`tile ${state === 'bad' ? 'shake' : ''}`}
              style={state === 'good' ? { background: 'var(--good-bg)', borderColor: 'var(--good)', color: 'var(--good)', opacity: 1 } : state === 'bad' ? { background: 'var(--bad-bg)', borderColor: 'var(--bad)', color: 'var(--bad)', opacity: 1 } : undefined}
              onClick={() => { setPicked(o); playSfx(o === answer ? 'correct' : 'wrong'); onDone?.(o === answer); }}>
              {state === 'good' && '✓ '}{state === 'bad' && '✕ '}{o}
            </button>
          );
        })}
      </div>
      {done && <p className={`mt-2 text-sm font-bold ${picked === answer ? 'text-good' : 'text-bad'}`} role="status">{picked === answer ? 'Yes! ' : 'Not quite. '}{explain}</p>}
    </div>
  );
}
