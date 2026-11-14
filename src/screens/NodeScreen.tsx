/** Plays one journey node as a list of stages (steps, book panel, items, board, rapid review, completion). */
import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { narration } from '@/engine/audio';
import { asset, findExercise, findItem, findStep } from '@/engine/content';
import { BADGE_FOR_EXERCISE, BADGES } from '@/engine/badges';
import { t } from '@/engine/i18n';
import { comboMultiplier, nodeStars } from '@/engine/scoring';
import { playSfx } from '@/engine/sfx';
import { unitProgress, useStore } from '@/engine/store';
import type { Exercise, Item, JourneyNode, Section, Step, Unit } from '@/engine/types';
import { pluginFor } from '@/exercises';
import { MatchBoard } from '@/exercises/matching';
import { mistakeToItem } from '@/exercises/spotMistake';
import { navigate } from '@/router';
import { microCheckFor, StepScene } from '@/scenes/StepScene';
import { Confetti, Icon, OriginTag, Pip, PipSays, Rich, Stars } from '@/ui/basics';
import { AudioBar, useNarration } from '@/ui/narration';
import { ItemStage, type ItemOutcome } from './ItemStage';
import { Certificate } from './Certificate';

type Stage =
  | { kind: 'step'; step: Step; chooser?: boolean }
  | { kind: 'book'; section: Section }
  | { kind: 'item'; exercise: Exercise; item: Item; plugin?: string; teacher?: boolean }
  | { kind: 'board'; exercise: Exercise }
  | { kind: 'rapid' }
  | { kind: 'gate' }
  | { kind: 'complete' };

function stagesFor(unit: Unit, node: JourneyNode, boardMode: boolean, talkPending: boolean): Stage[] {
  const steps = (node.steps ?? []).map((id) => findStep(unit, id)).filter(Boolean) as Step[];
  if (node.kind === 'explain') {
    const section = unit.sections.find((s) => s.key === node.sectionKey);
    return [...steps.map((step) => ({ kind: 'step' as const, step })), ...(section?.book.length ? [{ kind: 'book' as const, section }] : [])];
  }
  if (node.kind === 'checkpoint') {
    const ex = node.exerciseId ? findExercise(unit, node.exerciseId) : undefined;
    return [...(ex ? ex.items.map((item) => ({ kind: 'item' as const, exercise: ex, item })) : []), ...steps.map((step) => ({ kind: 'step' as const, step }))];
  }
  if (node.kind === 'exercise') {
    const ex = findExercise(unit, node.exerciseId!)!;
    const first = unit.exercises[0]?.id === ex.id;
    const out: Stage[] = [];
    if (first) out.push(...unit.practiceIntro.filter((s) => s.slide > 1).map((step) => ({ kind: 'step' as const, step })));
    if (ex.intro) out.push({ kind: 'step', step: ex.intro, chooser: ex.type === 'matching' });
    if (ex.type === 'matching' && boardMode) out.push({ kind: 'board', exercise: ex });
    out.push(...ex.items.map((item) => ({ kind: 'item' as const, exercise: ex, item })));
    if (ex.recap) out.push({ kind: 'step', step: ex.recap });
    return out;
  }
  if (node.kind === 'mistakeHunt') {
    const ex: Exercise = { id: 'Mistake Hunt', origin: 'learnerscare', type: 'spotMistake', sectionRef: null, title: 'Mistake Hunt', instructions: '', intro: null, recap: null, items: unit.commonMistakes.map(mistakeToItem) };
    return ex.items.map((item) => ({ kind: 'item' as const, exercise: ex, item, plugin: 'spotMistake', teacher: true }));
  }
  if (node.kind === 'rapidReview') return [{ kind: 'rapid' }];
  // unit completion, certificate and the next unit require the Talk level (Type mode always makes it passable)
  if (node.kind === 'complete' && talkPending) return [{ kind: 'gate' }];
  const tail = [unit.review.step, unit.takeaways.exercises].filter(Boolean) as Step[];
  return [...tail.map((step) => ({ kind: 'step' as const, step })), { kind: 'complete' }];
}

/* ---------------- stages ---------------- */

function StepStage({ unit, step, onNext, last, chooser, boardMode, setBoardMode }: {
  unit: Unit; step: Step; onNext: () => void; last: boolean; chooser?: boolean; boardMode: boolean; setBoardMode: (b: boolean) => void;
}) {
  const nar = useNarration(unit.id, step.audio, { label: `step:${step.id}` });
  const [micro, setMicro] = useState(false);
  const check = useMemo(() => microCheckFor(step, (c) => { setMicro(true); if (c) useStore.setState((s) => ({ progress: { ...s.progress, xp: s.progress.xp + 2 } })); }), [step]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT') return;
      if (e.key === ' ' && tag !== 'BUTTON') { e.preventDefault(); nar.toggle(); }
      if (e.key.toLowerCase() === 'r') nar.replay();
      if (e.key.toLowerCase() === 's') nar.skip();
      if ((e.key === 'Enter' && tag !== 'BUTTON') || e.key === 'ArrowRight') { e.preventDefault(); onNext(); }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  });
  const isTitle = step.type === 'title';
  return (
    <div className="flex flex-col gap-4" data-testid="step-stage" data-step={step.id}>
      {!isTitle && (
        <header>
          <p className="eyebrow">{step.eyebrow}</p>
          <h2 className="mt-1 text-[1.7rem] leading-tight sm:text-[2.1rem]">{step.title}</h2>
          {step.subtitle && <p className="mt-1 font-semibold text-muted">{step.subtitle}</p>}
          {step.type === 'mistakes' && <div className="mt-2"><OriginTag kind="teacher" /></div>}
        </header>
      )}
      <AudioBar nar={nar} />
      <StepScene unitId={unit.id} step={step} cue={nar.cue} revealAll={nar.revealAll} />
      {nar.revealAll && check}
      {chooser && (
        <div className="card p-4">
          <p className="eyebrow mb-2">How do you want to play?</p>
          <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Matching mode">
            {[{ v: false, title: 'One by one', sub: 'Each pair with narration and the reason' }, { v: true, title: 'All at once', sub: 'Connect all seven, then check together' }].map((o) => (
              <button key={String(o.v)} role="radio" aria-checked={boardMode === o.v} onClick={() => setBoardMode(o.v)} data-testid={o.v ? 'mode-board' : 'mode-single'}
                className="rounded-2xl border-2 p-3 text-left" style={{ borderColor: boardMode === o.v ? 'var(--primary)' : 'var(--line)', background: boardMode === o.v ? 'var(--surface-2)' : 'var(--surface)' }}>
                <span className="block font-extrabold">{o.title}</span><span className="text-sm font-semibold text-muted">{o.sub}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="sticky bottom-0 z-10 -mx-4 flex items-center gap-2 border-t border-line bg-bg/95 px-4 py-3 backdrop-blur">
        {check && !micro && nar.revealAll && <span className="text-sm font-bold text-muted">Try the quick check, or go on.</span>}
        <button className="btn btn-primary ml-auto min-w-[9rem] flex-1 sm:flex-none" onClick={onNext} data-testid="next-btn">{last ? t('common.done') : t('common.next')}</button>
      </div>
    </div>
  );
}

function BookStage({ unit, section, onNext }: { unit: Unit; section: Section; onNext: () => void }) {
  const src = unit.source;
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.key === 'Enter' && (e.target as HTMLElement)?.tagName !== 'BUTTON') || e.key === 'ArrowRight') { e.preventDefault(); onNext(); }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  });
  return (
    <div className="flex flex-col gap-4" data-testid="book-stage">
      <header>
        <p className="eyebrow">Section {section.key} · {t('book.panel')}</p>
        <h2 className="mt-1 text-[1.7rem] leading-tight">The page in the book’s own words</h2>
        <p className="mt-1 text-sm font-semibold text-muted">{t('book.cite', { book: `${src.author}, ${src.book}`, edition: src.edition, n: unit.number, pages: src.pages[0] ?? '' })}</p>
      </header>
      <div className="card flex flex-col gap-2 p-4" style={{ background: 'color-mix(in srgb, var(--gold) 9%, var(--surface))' }}>
        {section.book.map((b, i) =>
          b.kind === 'table' ? (
            <div key={i} className="flex flex-wrap gap-2">{(b.cells ?? [b.text]).map((c, k) => <span key={k} className="chip font-display !text-base">{c}</span>)}</div>
          ) : b.kind === 'rule' ? (
            <p key={i} className="mt-1 text-[1.02rem] font-bold leading-snug">{b.text}</p>
          ) : (
            <p key={i} className="rounded-xl bg-surface px-3 py-2 font-display text-[1.15rem] leading-snug"><Rich text={b.text} guess /></p>
          ),
        )}
      </div>
      <div className="sticky bottom-0 z-10 -mx-4 flex border-t border-line bg-bg/95 px-4 py-3 backdrop-blur">
        <button className="btn btn-primary ml-auto min-w-[9rem] flex-1 sm:flex-none" onClick={onNext} data-testid="next-btn">{t('common.done')}</button>
      </div>
    </div>
  );
}

function RapidStage({ unit, onFinish }: { unit: Unit; onFinish: (stars: number[], bestCombo: number) => void }) {
  const rapid = unit.review.rapid!;
  const plugin = pluginFor('rapidReview');
  const recordItem = useStore((s) => s.recordItem);
  const [index, setIndex] = useState(-1);
  const [value, setValue] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [streak, setStreak] = useState(0);
  const [best, setBest] = useState(0);
  const [stars, setStars] = useState<number[]>([]);
  const [left, setLeft] = useState(1);
  const started = useRef(0);
  const cur = index >= 0 ? rapid.items[index] : null;
  const ref = cur?.ref ? findItem(unit, cur.ref) : undefined;
  const clip = index < 0 ? rapid.intro : locked ? cur!.audio.answer : cur!.audio.question;
  const nar = useNarration(unit.id, clip, { label: index < 0 ? 'rapid-intro' : locked ? 'answer' : 'question' });
  const combo = comboMultiplier(streak);
  const LIMIT = 20000;
  useEffect(() => {
    if (index < 0 || locked) return;
    started.current = performance.now();
    setLeft(1);
    const id = setInterval(() => setLeft(Math.max(0, 1 - (performance.now() - started.current) / LIMIT)), 200);
    return () => clearInterval(id);
  }, [index, locked]);
  const answer = (v: string) => {
    if (locked || !ref) return;
    setValue(v);
    setLocked(true);
    const ok = plugin.check(ref.item, v, ref.exercise, 'tiles').correct;
    const fast = left > 0;
    const s = ok ? (fast ? 3 : 2) : 1;
    const nextStreak = ok ? streak + 1 : 0;
    if (ok && comboMultiplier(nextStreak) > combo) playSfx('combo'); else playSfx(ok ? 'correct' : 'wrong');
    setStreak(nextStreak);
    setBest((b) => Math.max(b, comboMultiplier(nextStreak)));
    setStars((x) => [...x, s]);
    recordItem(unit.id, `rapid:${cur!.id}`, { tries: ok ? 1 : 2, hints: 0, revealed: false, skipped: false, combo: ok ? combo : 1, scored: true, section: ref.item.mapsToSection });
  };
  const next = () => {
    narration.stop();
    if (index + 1 >= rapid.items.length) return onFinish(stars, best);
    setIndex(index + 1); setValue(null); setLocked(false);
  };
  if (index < 0) {
    return (
      <div className="flex flex-col items-center gap-4 text-center" data-testid="rapid-intro">
        <Pip mood="cheer" size={96} />
        <p className="eyebrow">Boss round</p>
        <h2 className="text-[2rem] leading-tight">{rapid.title}</h2>
        <p className="max-w-md font-semibold text-muted">{rapid.subtitle} One tap each. Answer inside the ring for a bonus — no lives, nothing to lose.</p>
        <AudioBar nar={nar} />
        <button className="btn btn-gold min-w-[12rem]" onClick={next} data-testid="rapid-start">Start the round</button>
      </div>
    );
  }
  const Render = plugin.Render;
  return (
    <div className="flex flex-col gap-4" data-testid="rapid-stage" data-item={cur!.ref ?? ''}>
      <div className="flex items-center justify-between">
        <span className="eyebrow">Rapid review · {index + 1} / {rapid.items.length}</span>
        <motion.span key={combo} initial={{ scale: 1.5 }} animate={{ scale: 1 }} className="chip !bg-gold !text-[#14184A]" data-testid="combo"><Icon name="bolt" size={16} />Combo ×{combo}</motion.span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-line" role="timer" aria-label="Bonus time">
        <div className="h-full rounded-full bg-gold transition-[width] duration-200" style={{ width: `${left * 100}%` }} />
      </div>
      <AudioBar nar={nar} compact />
      <div className="card p-4"><p className="hero-sentence">{cur!.prompt}</p></div>
      {ref && <Render unitId={unit.id} exercise={ref.exercise} item={ref.item} value={value} onChange={answer} locked={locked} result={null} inputMode="tiles" advanced={false} hintLevel={0} />}
      {locked && ref && (
        <div className="flex flex-col gap-3" aria-live="polite">
          {ref.item.why && <p className="card p-3 font-semibold"><span className="chip mr-2 !text-[0.68rem] uppercase">{t('item.why')}</span>{ref.item.why.split('\n')[0]}</p>}
          <button className="btn btn-primary" onClick={next} data-testid="next-btn">{index + 1 >= rapid.items.length ? 'Finish the round' : t('common.next')}</button>
        </div>
      )}
    </div>
  );
}

function CompleteStage({ unit, onDone }: { unit: Unit; onDone: () => void }) {
  const nar = useNarration(unit.id, unit.completion?.audio, { label: 'completion' });
  const progress = useStore((s) => s.progress);
  const up = unitProgress(progress, unit.id);
  const scored = unit.exercises.flatMap((e) => e.items).filter((i) => !i.isExample);
  const answered = scored.filter((i) => up.items[i.id]?.correct).length;
  const totalStars = scored.reduce((n, i) => n + (up.items[i.id]?.stars ?? 0), 0);
  const badges = BADGES.filter((b) => progress.badges.includes(b.id));
  useEffect(() => { playSfx('complete'); }, []);
  return (
    <div className="flex flex-col items-center gap-5 text-center" data-testid="complete-stage">
      <Confetti fire={1} count={useStore.getState().settings.mode === 'focus' ? 30 : 120} />
      <Pip mood="cheer" size={110} />
      <div>
        <p className="eyebrow">{unit.completion?.eyebrow ?? 'LearnersCare'}</p>
        <h2 className="text-[2.6rem] leading-none">{unit.completion?.title ?? 'Well done!'}</h2>
        <p className="mt-2 font-semibold text-muted">{unit.completion?.subtitle}</p>
      </div>
      <AudioBar nar={nar} />
      <div className="grid w-full max-w-md grid-cols-3 gap-2">
        {[{ k: 'Questions', v: `${answered}/${scored.length}` }, { k: 'Stars', v: `${totalStars}/${scored.length * 3}` }, { k: 'XP', v: progress.xp }].map((x) => (
          <div key={x.k} className="card p-3"><p className="font-display text-2xl">{x.v}</p><p className="text-xs font-extrabold uppercase tracking-wider text-muted">{x.k}</p></div>
        ))}
      </div>
      {badges.length > 0 && (
        <div className="flex flex-wrap justify-center gap-2" aria-label="Badges">
          {badges.map((b) => <span key={b.id} className="chip !py-2" title={b.skill}><span aria-hidden="true">{b.emoji}</span>{b.name}</span>)}
        </div>
      )}
      <Certificate unit={unit} stars={totalStars} maxStars={scored.length * 3} />
      <button className="btn btn-primary min-w-[12rem]" onClick={onDone} data-testid="finish-unit">Back to the map</button>
    </div>
  );
}

/* ---------------- node player ---------------- */

export function NodeScreen({ unit, nodeId }: { unit: Unit; nodeId: string }) {
  const node = unit.journey.find((n) => n.id === nodeId) ?? unit.journey[0];
  const nodeIndex = unit.journey.indexOf(node);
  const nextNode = unit.journey[nodeIndex + 1];
  const settings = useStore((s) => s.settings);
  const completeNode = useStore((s) => s.completeNode);
  const award = useStore((s) => s.award);
  const say = useStore((s) => s.say);
  const [boardMode, setBoardMode] = useState(false);
  const talkPending = useStore((st) => unit.journey.some((n) => n.kind === 'talk') && !unitProgress(st.progress, unit.id).nodes.talk?.done);
  const stages = useMemo(() => stagesFor(unit, node, boardMode, talkPending), [unit, node, boardMode, talkPending]);
  const [index, setIndex] = useState(0);
  const [outcomes, setOutcomes] = useState<ItemOutcome[]>([]);
  const [finished, setFinished] = useState<{ stars: number; badge?: string } | null>(null);
  const [boardDone, setBoardDone] = useState(false);
  const stage = stages[Math.min(index, stages.length - 1)];

  useEffect(() => { setIndex(0); setOutcomes([]); setFinished(null); setBoardDone(false); }, [nodeId]);
  useEffect(() => {
    const nxt = stages[index + 1];
    const clip = nxt?.kind === 'step' ? nxt.step.audio : nxt?.kind === 'item' ? (nxt.item.audio.question ?? nxt.item.audio.answer) : null;
    narration.preload(clip ? asset(unit.id, clip.src) : null);
  }, [index, stages, unit.id]);

  const finishNode = (all: ItemOutcome[], extra?: { bestCombo?: number; starList?: number[] }) => {
    const stars = nodeStars(extra?.starList ?? all.filter((o) => !o.item.isExample && !o.skipped).map((o) => o.stars));
    completeNode(unit.id, node.id, stars, { bestCombo: extra?.bestCombo, last: node.kind === 'complete' });
    let badge: string | undefined;
    if ((node.kind === 'exercise' || node.kind === 'checkpoint') && stars >= 2) badge = BADGE_FOR_EXERCISE[findExercise(unit, node.exerciseId ?? '')?.type ?? ''];
    if (node.kind === 'mistakeHunt') badge = 'mistake-hunter';
    if (node.kind === 'rapidReview' && (extra?.bestCombo ?? 0) >= 3) badge = 'combo-keeper';
    if (node.kind === 'complete') badge = 'unit-complete';
    const isNew = badge && !useStore.getState().progress.badges.includes(badge);
    if (badge) award(badge);
    if (node.kind === 'complete') return navigate(`u/${unit.id}`);
    playSfx('unlock');
    setFinished({ stars, badge: isNew ? badge : undefined });
    if (isNew) say(`Badge earned: ${BADGES.find((b) => b.id === badge)?.name}`, BADGES.find((b) => b.id === badge)?.emoji);
  };
  const advance = (o?: ItemOutcome) => {
    const all = o ? [...outcomes, o] : outcomes;
    if (o) setOutcomes(all);
    if (index + 1 >= stages.length) finishNode(all);
    else { setIndex(index + 1); window.scrollTo(0, 0); }
  };

  const used = stage?.kind === 'item' && stage.exercise.type === 'matching'
    ? stage.exercise.items.slice(0, stage.exercise.items.indexOf(stage.item)).map((i) => i.acceptedAnswers[0]) : undefined;
  const nxt = stages[index + 1];
  const nextClip = nxt?.kind === 'item' && nxt.item.audio.question ? asset(unit.id, nxt.item.audio.question.src) : null;

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-stage flex-col px-4">
      <header className="sticky top-0 z-20 -mx-4 flex items-center gap-3 bg-bg/95 px-4 py-3 backdrop-blur">
        <button className="btn btn-quiet !min-h-[44px] !px-3" onClick={() => { narration.stop(); navigate(`u/${unit.id}`); }} aria-label={t('nav.map')} data-testid="to-map"><Icon name="back" /></button>
        <div className="flex-1">
          <p className="truncate text-sm font-extrabold">{node.title}</p>
          <div className="mt-1 flex gap-1" role="progressbar" aria-valuenow={index + 1} aria-valuemin={1} aria-valuemax={stages.length} aria-label="Progress in this part">
            {stages.map((_, i) => <span key={i} className="h-1.5 flex-1 rounded-full" style={{ background: i < index || finished ? 'var(--primary)' : i === index ? 'var(--gold)' : 'var(--line)' }} />)}
          </div>
        </div>
        <button className="btn btn-quiet !min-h-[44px] !px-3" onClick={() => window.dispatchEvent(new Event('open-settings'))} aria-label={t('nav.settings')}><Icon name="gear" /></button>
      </header>

      <main className="flex-1 pb-4 pt-2" id="main">
        {finished ? (
          <NodeDone unit={unit} node={node} next={nextNode} stars={finished.stars} badge={finished.badge} showStars={outcomes.some((o) => !o.item.isExample) || node.kind === 'rapidReview'} mascot={settings.mascot}
            onReplay={() => { setFinished(null); setIndex(0); setOutcomes([]); setBoardDone(false); }} />
        ) : stage.kind === 'step' ? (
          <StepStage key={stage.step.id} unit={unit} step={stage.step} onNext={() => advance()} last={index + 1 >= stages.length} chooser={stage.chooser} boardMode={boardMode} setBoardMode={setBoardMode} />
        ) : stage.kind === 'book' ? (
          <BookStage unit={unit} section={stage.section} onNext={() => advance()} />
        ) : stage.kind === 'board' ? (
          <div data-testid="board-stage">
            <p className="eyebrow">{stage.exercise.id} · all at once</p>
            <h2 className="mb-3 mt-1 text-[1.6rem] leading-tight">{stage.exercise.title}</h2>
            <MatchBoard exercise={stage.exercise} onFinish={(results) => {
              const rec = useStore.getState().recordItem;
              const outs = results.map((r) => { rec(unit.id, r.item.id, { tries: r.tries, hints: 0, revealed: false, skipped: false, answer: r.answer, section: r.item.mapsToSection }); return { item: r.item, stars: r.tries <= 1 ? 3 : r.tries === 2 ? 2 : 1, skipped: false }; });
              setOutcomes(outs); setBoardDone(true);
              const recapAt = stages.findIndex((s) => s.kind === 'step' && s.step.type === 'exerciseRecap');
              setIndex(recapAt > -1 ? recapAt : stages.length - 1);
            }} />
          </div>
        ) : stage.kind === 'item' ? (
          boardDone && stage.exercise.type === 'matching' ? null : (
            <>
              {stage.teacher && <div className="mb-3"><h2 className="text-[1.6rem] leading-tight">Mistake Hunt</h2><p className="text-sm font-semibold text-muted">Typical learner errors linked to what you practised.</p></div>}
              <ItemStage key={stage.item.id} unit={unit} exercise={stage.exercise} item={stage.item} pluginType={stage.plugin} used={used} nextClip={nextClip}
                labels={stage.teacher ? { official: 'Correct sentence', origin: 'teacher' } : undefined} onDone={advance} />
            </>
          )
        ) : stage.kind === 'gate' ? (
          <div className="mx-auto flex max-w-col flex-col items-center gap-4 py-8 text-center" data-testid="talk-gate">
            <Pip mood="think" size={96} />
            <p className="eyebrow">One step left</p>
            <h2 className="text-[2rem] leading-tight">Finish the Talk level first</h2>
            <p className="font-semibold text-muted">The certificate and the next unit unlock when you have spoken (or typed) your way through Talk. No microphone? Type mode counts too.</p>
            <button className="btn btn-primary w-full" onClick={() => navigate(`u/${unit.id}/n/talk`)} data-testid="gate-to-talk"><Icon name="mic" />Go to Talk</button>
            <button className="btn btn-ghost w-full" onClick={() => navigate(`u/${unit.id}`)}>Back to the map</button>
          </div>
        ) : stage.kind === 'rapid' ? (
          <RapidStage unit={unit} onFinish={(starList, bestCombo) => finishNode([], { starList, bestCombo })} />
        ) : (
          <CompleteStage unit={unit} onDone={() => finishNode(outcomes)} />
        )}
      </main>
    </div>
  );
}

function NodeDone({ unit, node, next, stars, badge, showStars, mascot, onReplay }: {
  unit: Unit; node: JourneyNode; next?: JourneyNode; stars: number; badge?: string; showStars: boolean; mascot: boolean; onReplay: () => void;
}) {
  const b = BADGES.find((x) => x.id === badge);
  const focus = useStore((s) => s.settings.mode === 'focus');
  return (
    <div className="mx-auto flex max-w-col flex-col items-center gap-5 py-6 text-center" data-testid="node-done">
      {!focus && <Confetti fire={1} count={showStars && stars === 3 ? 90 : 40} />}
      {mascot && <Pip mood="cheer" size={96} />}
      <div>
        <p className="eyebrow">Completed</p>
        <h2 className="text-[2rem] leading-tight">{node.title}</h2>
      </div>
      {showStars && <Stars value={stars} size={44} animate />}
      {b && (
        <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.5, type: 'spring' }} className="card flex items-center gap-3 px-4 py-3 text-left">
          <span className="text-3xl" aria-hidden="true">{b.emoji}</span>
          <div><p className="font-extrabold">New badge: {b.name}</p><p className="text-sm font-semibold text-muted">{b.skill}</p></div>
        </motion.div>
      )}
      {next && (
        <button className="card w-full p-4 text-left" onClick={() => navigate(`u/${unit.id}/n/${next.id}`)} data-testid="go-next-node">
          <p className="eyebrow">{t('map.next', { title: '' }).replace(':', '')} up</p>
          <p className="font-display text-2xl">{next.title} <span aria-hidden="true">→</span></p>
          <p className="font-semibold text-muted">{next.subtitle}</p>
        </button>
      )}
      {mascot && next && <PipSays mood="happy">Ready for “{next.title}”?</PipSays>}
      <div className="flex w-full flex-wrap gap-2">
        <button className="btn btn-ghost flex-1" onClick={onReplay}>{t('map.replay')}</button>
        <button className="btn btn-quiet flex-1" onClick={() => navigate(`u/${unit.id}`)} data-testid="done-to-map">{t('nav.map')}</button>
        {next && <button className="btn btn-primary flex-1" onClick={() => navigate(`u/${unit.id}/n/${next.id}`)} data-testid="next-node-btn">{t('common.continue')}</button>}
      </div>
    </div>
  );
}
