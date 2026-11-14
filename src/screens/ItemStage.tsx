/**
 * The per-question loop: Read → Try → Check → Understand.
 * Hosts any exercise plugin; the plugin only renders the interaction and checks the answer.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { CheckResult } from '@/engine/answer';
import { narration } from '@/engine/audio';
import { asset } from '@/engine/content';
import { t } from '@/engine/i18n';
import { starsFor } from '@/engine/scoring';
import { playSfx } from '@/engine/sfx';
import { useStore } from '@/engine/store';
import type { Exercise, Item, Unit } from '@/engine/types';
import { similarItem } from '@/engine/variants';
import { pluginFor } from '@/exercises';
import { Icon, OriginTag, Pip, Rich, Sheet, Stars } from '@/ui/basics';
import { AudioBar, useNarration } from '@/ui/narration';
import { navigate } from '@/router';

export interface ItemOutcome { item: Item; stars: number; skipped: boolean }

interface Props {
  unit: Unit;
  exercise: Exercise;
  item: Item;
  /** plugin type override (mistake hunt, extra practice) */
  pluginType?: string;
  used?: string[];
  nextClip?: string | null;
  labels?: { official?: string; officialFrom?: string; origin?: 'teacher' | 'generated' };
  record?: boolean;
  onDone: (o: ItemOutcome) => void;
  nextLabel?: string;
}

const LOOP = ['loop.read', 'loop.try', 'loop.check', 'loop.understand'] as const;

export function ItemStage({ unit, exercise, item, pluginType, used, nextClip, labels, record = true, onDone, nextLabel }: Props) {
  const plugin = useMemo(() => pluginFor(pluginType ?? exercise.type), [pluginType, exercise.type]);
  const settings = useStore((s) => s.settings);
  const recordItem = useStore((s) => s.recordItem);
  const recordClue = useStore((s) => s.recordClue);
  const set = useStore((s) => s.set);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [value, setValue] = useState<any>(() => plugin.initial(item, exercise));
  const [done, setDone] = useState(item.isExample);
  const [result, setResult] = useState<CheckResult | null>(null);
  const [tries, setTries] = useState(0);
  const [hintLevel, setHintLevel] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [shake, setShake] = useState(0);
  const [gained, setGained] = useState(0);
  const [extra, setExtra] = useState<Item | null>(null);
  const [extraSeed, setExtraSeed] = useState(0);
  const [revisit, setRevisit] = useState(false);
  const understandRef = useRef<HTMLDivElement>(null);
  const inputMode = item.isExample ? 'tiles' : settings.inputMode;
  const canType = ['gapFill', 'pictureVerb', 'buildQuestion', 'positiveNegative'].includes(plugin.type);

  const clip = done ? item.audio.answer : item.audio.question;
  const nar = useNarration(unit.id, clip, { label: done ? 'answer' : 'question' });
  useEffect(() => { narration.preload(item.audio.answer ? asset(unit.id, item.audio.answer.src) : null); }, [item, unit.id]);
  useEffect(() => { if (done) narration.preload(nextClip); }, [done, nextClip]);

  const stars = starsFor({ tries: tries + (plugin.extraTries?.(value) ?? 0), hints: hintLevel, revealed, skipped: false });
  const section = unit.sections.find((s) => s.key === item.mapsToSection);
  const similar = useMemo(() => (item.origin === 'book' && !item.isExample ? similarItem(exercise, item, extraSeed) : null), [exercise, item, extraSeed]);

  const finish = (opts: { revealed?: boolean; triesNow: number; hints?: number }) => {
    setDone(true);
    const summary = { tries: opts.triesNow + (plugin.extraTries?.(value) ?? 0), hints: opts.hints ?? hintLevel, revealed: !!opts.revealed, skipped: false };
    if (record && !item.isExample) {
      setGained(recordItem(unit.id, item.id, { ...summary, answer: plugin.serialize(value, item, inputMode), section: item.mapsToSection, scored: item.origin !== 'generated' }));
    }
    setTimeout(() => understandRef.current?.scrollIntoView({ behavior: document.documentElement.dataset.motion === 'reduce' ? 'auto' : 'smooth', block: 'nearest' }), 250);
  };

  const check = () => {
    if (done || !plugin.ready(item, value, inputMode)) return;
    const r = plugin.check(item, value, exercise, inputMode);
    setResult(r);
    if (r.correct) {
      playSfx('correct');
      finish({ triesNow: tries + 1 });
      setTries(tries + 1);
    } else {
      playSfx(r.code === 'spelling' || r.code === 'wordOrder' ? 'almost' : 'wrong');
      setTries(tries + 1);
      setShake((n) => n + 1);
    }
  };
  const hint = () => {
    const level = Math.min(3, hintLevel + 1);
    playSfx('hint');
    setHintLevel(level);
    if (level === 3) {
      setValue(plugin.revealAnswer(item, exercise));
      setRevealed(true);
      setResult(null);
      finish({ revealed: true, triesNow: tries, hints: 3 });
    }
  };
  const skip = () => {
    narration.stop();
    if (record) recordItem(unit.id, item.id, { tries: 0, hints: 0, revealed: false, skipped: true, section: item.mapsToSection });
    useStore.getState().say(t('item.reviewLater'), '🔖');
    onDone({ item, stars: 0, skipped: true });
  };
  const next = () => { narration.stop(); onDone({ item, stars: item.isExample ? 3 : stars, skipped: false }); };

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.tagName === 'INPUT';
      const el = e.target as HTMLElement | null;
      const radio = el?.getAttribute?.('role') === 'radio' && el.getAttribute('aria-checked') === 'true';
      if (e.key === 'Enter' && (typing || radio || el?.tagName !== 'BUTTON')) { e.preventDefault(); if (done) next(); else check(); }
      if (typing) return;
      if (e.key.toLowerCase() === 'h' && !done) hint();
      if (e.key === ' ' && (e.target as HTMLElement)?.tagName !== 'BUTTON') { e.preventDefault(); nar.toggle(); }
      if (e.key.toLowerCase() === 'r') nar.replay();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  });

  const loopIndex = done ? 3 : nar.status === 'playing' ? 0 : 1;
  const ready = plugin.ready(item, value, inputMode);
  const mood = done ? (revealed ? 'idle' : 'happy') : result && !result.correct ? 'oops' : 'think';
  const Render = plugin.Render;
  const officialLabel = labels?.official ?? (item.origin !== 'book' ? (item.isExample ? 'Worked example' : 'Answer') : item.isExample ? t('item.exampleFrom') : `${t('item.official')} · ${labels?.officialFrom ?? t('item.officialFrom')}`);

  if (extra) {
    return (
      <div>
        <button className="btn btn-quiet mb-3 !min-h-[44px] text-sm" onClick={() => setExtra(null)}><Icon name="back" size={18} /> Back to question {item.number}</button>
        <ItemStage key={extra.id} unit={unit} exercise={exercise} item={extra} pluginType={exercise.type === 'buildQuestion' ? 'buildQuestion' : 'gapFill'}
          labels={{ official: 'Answer (computed)', origin: 'generated' }} onDone={() => setExtra(null)} nextLabel="Back to the lesson" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4" data-testid="item-stage" data-item={item.id} data-done={done ? '1' : '0'}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="eyebrow">{labels?.origin === 'generated' ? t('item.extra') : `${exercise.id} · ${item.isExample ? t('item.example') : `Question ${item.number}`}`}</span>
          {labels?.origin && <OriginTag kind={labels.origin} />}
        </div>
        {!item.isExample && (
          <ol className="flex gap-1 text-[0.68rem] font-extrabold uppercase tracking-wide" aria-label="Read, try, check, understand">
            {LOOP.map((k, i) => (
              <li key={k} className="rounded-full px-2 py-1" aria-current={i === loopIndex ? 'step' : undefined}
                style={{ background: i === loopIndex ? 'var(--primary)' : 'var(--surface-2)', color: i === loopIndex ? 'var(--primary-ink)' : 'var(--muted)' }}>{t(k)}</li>
            ))}
          </ol>
        )}
      </div>

      <AudioBar nar={nar} />

      <div key={shake} className={shake ? 'shake' : ''}>
        <Render unitId={unit.id} exercise={exercise} item={item} value={value} onChange={setValue} locked={done} result={result}
          inputMode={inputMode} advanced={settings.advanced} hintLevel={hintLevel} used={used} onEvent={(e) => e === 'clue' && record && recordClue(unit.id)} />
      </div>

      <div aria-live="polite" role="status" className="min-h-[1.5rem]">
        {!done && result && !result.correct && (
          <motion.p initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex gap-2 rounded-2xl bg-bad-bg px-4 py-3 font-bold text-bad" data-testid="feedback-wrong" data-code={result.code}>
            <span aria-hidden="true">✕</span><span>{result.message}</span>
          </motion.p>
        )}
        {!done && hintLevel > 0 && hintLevel < 3 && (
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-2 flex gap-2 rounded-2xl border-2 border-gold px-4 py-3 font-bold" data-testid="hint">
            <Icon name="bulb" className="shrink-0 text-[color:#B77F00]" /><span>{plugin.hint(item, hintLevel as 1 | 2, exercise)}{settings.hintLanguage === 'bn' && item.hints.bn && <span lang="bn" className="mt-1 block font-semibold">{item.hints.bn}</span>}</span>
          </motion.p>
        )}
      </div>

      {!done && (
        <div className="sticky bottom-0 z-10 -mx-4 flex items-center gap-1.5 border-t border-line bg-bg/95 px-4 py-2.5 backdrop-blur sm:gap-2">
          {settings.mascot && <span className="hidden sm:block"><Pip mood={mood} size={44} /></span>}
          <button className="btn btn-ghost !px-3" onClick={hint} data-testid="hint-btn" aria-label={hintLevel === 2 ? t('item.showAnswer') : `${t('common.hint')} ${hintLevel + 1} of 3`}>
            <Icon name="bulb" size={18} /><span className={hintLevel === 2 ? '' : 'hidden min-[380px]:inline'}>{hintLevel === 2 ? 'Answer' : t('common.hint')}</span>
          </button>
          {canType && (
            <button className="btn btn-ghost !px-3" onClick={() => set('inputMode', inputMode === 'tiles' ? 'type' : 'tiles')} data-testid="mode-toggle"
              aria-label={inputMode === 'tiles' ? t('item.typeIt') : t('item.useTiles')}>
              <Icon name={inputMode === 'tiles' ? 'keyboard' : 'tiles'} size={18} /><span className="hidden sm:inline">{inputMode === 'tiles' ? t('item.typeIt') : t('item.useTiles')}</span>
            </button>
          )}
          <button className="btn btn-ghost !px-3" onClick={skip} data-testid="skip-btn">{t('common.skip')}</button>
          <button className="btn btn-primary ml-auto min-w-[6rem] flex-1 sm:min-w-[9rem] sm:flex-none" onClick={check} disabled={!ready} data-testid="check-btn">{t('common.check')}</button>
        </div>
      )}

      <AnimatePresence>
        {done && (
          <motion.div ref={understandRef} initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 26 }} className="flex flex-col gap-3" data-testid="understand">
            {!item.isExample && (
              <div className="flex items-center gap-3 rounded-2xl px-4 py-3" style={{ background: revealed ? 'var(--surface-2)' : 'var(--good-bg)', color: revealed ? 'var(--ink)' : 'var(--good)' }}>
                {settings.mascot && <Pip mood={revealed ? 'idle' : stars === 3 ? 'cheer' : 'happy'} size={44} />}
                <p className="flex-1 font-extrabold" data-testid="feedback-right">
                  {revealed ? 'Here is the answer — read why, then try a similar one.' : `✓ ${result?.code === 'equivalent' ? result.message : stars === 3 ? 'Correct — first try!' : 'Correct!'}`}
                </p>
                <Stars value={stars} animate />
                {gained > 0 && <span className="chip !bg-gold !text-[#14184A]">+{gained} XP</span>}
              </div>
            )}
            <div className="rounded-card p-4 text-white" style={{ background: '#14184A' }} data-testid="official-card">
              <span className="inline-block rounded-full bg-[#FFC83D] px-3 py-0.5 text-[0.68rem] font-extrabold uppercase tracking-widest text-[#14184A]">{officialLabel}</span>
              <p className="mt-2 font-display text-[1.35rem] leading-snug">{item.officialAnswer}</p>
              {exercise.type === 'matching' && item.answerSentences?.[0] && <p className="mt-1 font-display text-lg text-[#C9CCF5]">{item.prompt} → <Rich text={item.answerSentences[0]} /></p>}
            </div>
            {item.why && (
              <div className="card p-4" data-testid="why-card">
                <span className="chip !text-[0.68rem] uppercase tracking-widest">{t('item.why')} · {t('item.whyFrom')}</span>
                {item.why.split('\n').map((line, i) => <p key={i} className="mt-2 text-[1.05rem] font-semibold leading-snug">{line}</p>)}
                {item.tiles && item.tiles.length > 0 && plugin.type !== 'buildQuestion' && (
                  <div className="mt-3 flex flex-wrap gap-2">{item.tiles.map((x, i) => <span key={i} className="tile" data-role={/not|n’t/.test(x.t) ? 'not' : x.role || undefined}>{x.t}</span>)}</div>
                )}
              </div>
            )}
            {item.spellingNote && (
              <p className="rounded-2xl px-4 py-3 font-bold" style={{ background: 'color-mix(in srgb, var(--gold) 28%, var(--surface))' }} data-testid="spelling-note">
                <span className="eyebrow mr-2 !text-[color:var(--ink)]">{t('item.spelling')}</span>{item.spellingNote}
              </p>
            )}
            <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center gap-2 border-t border-line bg-bg/95 px-4 py-3 backdrop-blur">
              {similar && <button className="btn btn-ghost" data-testid="similar-btn" onClick={() => { narration.stop(); setExtra(similar); setExtraSeed((s) => s + 1); }}>{t('item.similar')}</button>}
              {section && item.origin === 'book' && (
                <button className="btn btn-ghost" data-testid="revisit-btn" onClick={() => setRevisit(true)}>{t('item.revisit', { section: section.key })}</button>
              )}
              <button className="btn btn-primary ml-auto min-w-[8rem] flex-1 sm:flex-none" onClick={next} data-testid="next-btn" autoFocus={false}>{nextLabel ?? t('common.next')}</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <Sheet open={revisit} onClose={() => setRevisit(false)} title={section ? `Section ${section.key} · ${section.title}` : ''}>
        {section && (
          <div className="flex flex-col gap-2">
            <OriginTag kind="book" />
            {section.book.map((b, i) => (
              <p key={i} className={b.kind === 'rule' ? 'font-bold' : 'rounded-xl bg-surface2 px-3 py-2 font-display text-lg'}>{b.kind === 'rule' ? b.text : <Rich text={b.text} guess />}</p>
            ))}
            <button className="btn btn-primary mt-2" onClick={() => navigate(`u/${unit.id}/n/sec-${section.key}`)}>Open the full explanation</button>
          </div>
        )}
      </Sheet>
    </div>
  );
}
