/** Profile: XP, streak, badges, weak sections, review-later list, Fix-it session, export / import. */
import { useMemo, useRef, useState } from 'react';
import { BADGES } from '@/engine/badges';
import { findItem, getConversation } from '@/engine/content';
import { turnToItem } from '@/exercises/conversation';
import type { Exercise } from '@/engine/types';
import { exportProgress, importProgress } from '@/engine/progress';
import { dueCards, mastered } from '@/engine/srs';
import { useStore } from '@/engine/store';
import type { Unit } from '@/engine/types';
import { navigate } from '@/router';
import { Icon, Pip } from '@/ui/basics';
import { ItemStage } from './ItemStage';

export function ProfileScreen({ unit }: { unit: Unit }) {
  const progress = useStore((s) => s.progress);
  const settings = useStore((s) => s.settings);
  const setName = useStore((s) => s.setName);
  const replaceAll = useStore((s) => s.replaceAll);
  const file = useRef<HTMLInputElement>(null);
  const cards = Object.values(progress.mistakes);
  const weak = useMemo(() => {
    const count: Record<string, number> = {};
    for (const c of cards) if (!mastered(c) && c.section) count[c.section] = (count[c.section] ?? 0) + c.lapses;
    return unit.sections.filter((s) => s.key.length === 1).map((s) => ({ s, n: count[s.key] ?? 0 })).sort((a, b) => b.n - a.n);
  }, [cards, unit]);
  const max = Math.max(1, ...weak.map((w) => w.n));
  const doExport = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([exportProgress({ progress, settings })], { type: 'application/json' }));
    a.download = 'learnerscare-progress.json';
    a.click();
  };
  const doImport = async (f: File | undefined) => {
    if (!f) return;
    try { replaceAll(importProgress(await f.text())); useStore.getState().say('Progress imported', '✅'); }
    catch (e) { useStore.getState().say((e as Error).message, '⚠️'); }
  };
  return (
    <div className="mx-auto w-full max-w-col px-4 pb-16">
      <header className="flex items-center gap-3 py-4">
        <button className="btn btn-quiet !min-h-[44px] !px-3" onClick={() => navigate(`u/${unit.id}`)} aria-label="Back to the map"><Icon name="back" /></button>
        <h1 className="text-2xl">Profile</h1>
      </header>
      <div className="card flex items-center gap-4 p-4">
        <Pip mood="happy" size={64} />
        <label className="flex-1">
          <span className="block text-xs font-extrabold uppercase tracking-wider text-muted">Your name</span>
          <input className="w-full rounded-xl border-2 border-line bg-surface px-3 py-2 text-lg font-bold outline-none focus:border-primary" value={progress.learnerName} onChange={(e) => setName(e.target.value)} placeholder="Type your name" data-testid="profile-name" />
        </label>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {[{ k: 'XP', v: progress.xp }, { k: 'Day streak', v: progress.streak.count }, { k: 'Streak freezes', v: progress.streak.freezes }].map((x) => (
          <div key={x.k} className="card p-3 text-center"><p className="font-display text-2xl">{x.v}</p><p className="text-xs font-extrabold uppercase tracking-wider text-muted">{x.k}</p></div>
        ))}
      </div>
      <h2 className="mb-2 mt-6 text-xl">Badges</h2>
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {BADGES.map((b) => {
          const has = progress.badges.includes(b.id);
          return (
            <li key={b.id} className="card flex items-center gap-3 p-3" style={{ opacity: has ? 1 : 0.55 }} data-earned={has ? '1' : '0'}>
              <span className="text-2xl" aria-hidden="true">{has ? b.emoji : '🔒'}</span>
              <span><span className="block font-extrabold">{b.name}{has ? '' : ' (not yet)'}</span><span className="text-sm font-semibold text-muted">{b.skill}</span></span>
            </li>
          );
        })}
      </ul>
      <h2 className="mb-2 mt-6 text-xl">Sections to strengthen</h2>
      <div className="card flex flex-col gap-3 p-4" data-testid="weak-sections">
        {cards.length === 0 && <p className="font-semibold text-muted">No mistakes saved yet. Wrong answers will appear here and come back in Fix-it sessions.</p>}
        {weak.map(({ s, n }) => (
          <button key={s.key} className="flex items-center gap-3 text-left" onClick={() => navigate(`u/${unit.id}/n/sec-${s.key}`)}>
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary font-display text-primary-ink">{s.key}</span>
            <span className="flex-1">
              <span className="block text-sm font-extrabold">{s.title}</span>
              <span className="mt-1 block h-2 overflow-hidden rounded-full bg-line"><span className="block h-full rounded-full" style={{ width: `${(n / max) * 100}%`, background: n ? 'var(--coral)' : 'var(--good)' }} /></span>
            </span>
            <span className="w-16 text-right text-sm font-bold text-muted">{n ? `${n} miss${n > 1 ? 'es' : ''}` : 'solid'}</span>
          </button>
        ))}
        <button className="btn btn-primary" onClick={() => navigate(`fixit/${unit.id}`)} disabled={!cards.length} data-testid="start-fixit">
          Fix-it session ({dueCards(cards, Date.now(), 99).length} due)
        </button>
      </div>
      {progress.reviewLater.length > 0 && (
        <>
          <h2 className="mb-2 mt-6 text-xl">Review later</h2>
          <ul className="card flex flex-col gap-1 p-3" data-testid="review-later">
            {progress.reviewLater.map((k) => {
              const hit = findItem(unit, k.split(':')[1]);
              return <li key={k} className="text-sm font-semibold"><b>{k.split(':')[1]}</b> — {hit?.item.prompt}</li>;
            })}
            <button className="btn btn-ghost mt-2" onClick={() => navigate(`fixit/${unit.id}?later=1`)}>Do these now</button>
          </ul>
        </>
      )}
      <h2 className="mb-2 mt-6 text-xl">Your data</h2>
      <div className="card flex flex-col gap-2 p-4">
        <p className="text-sm font-semibold text-muted">Progress is stored only on this device. No account, no tracking.</p>
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-ghost flex-1" onClick={doExport} data-testid="export">Export progress</button>
          <button className="btn btn-ghost flex-1" onClick={() => file.current?.click()}>Import progress</button>
          <input ref={file} type="file" accept="application/json" className="hidden" onChange={(e) => void doImport(e.target.files?.[0])} data-testid="import-file" />
        </div>
      </div>
    </div>
  );
}

/** Fix-it: recycles missed questions (spaced repetition) and skipped ones. */
export function FixItScreen({ unit, later }: { unit: Unit; later: boolean }) {
  const progress = useStore((s) => s.progress);
  const reviewMistake = useStore((s) => s.reviewMistake);
  const [queue] = useState(() => {
    const keys = later ? progress.reviewLater : dueCards(Object.values(progress.mistakes).filter((c) => c.key.startsWith(unit.id)), Date.now(), 10).map((c) => c.key);
    const talkExercise: Exercise = { id: 'Talk', origin: 'learnerscare', type: 'conversation', sectionRef: null, title: 'Talk', instructions: '', intro: null, recap: null, items: [] };
    return keys.map((k) => {
      const [, a, b] = k.split(':');
      if (a === 'talk') {
        const turn = getConversation(unit.id)?.scenes.flatMap((sc) => sc.turns).find((t) => t.id === b);
        return { key: k, hit: turn ? { exercise: talkExercise, item: turnToItem(turn, unit.id) } : undefined, plugin: 'conversation' as string | undefined };
      }
      return { key: k, hit: findItem(unit, a), plugin: undefined as string | undefined };
    }).filter((x) => x.hit);
  });
  const [i, setI] = useState(0);
  const cur = queue[i];
  return (
    <div className="mx-auto w-full max-w-stage px-4 pb-10">
      <header className="flex items-center gap-3 py-4">
        <button className="btn btn-quiet !min-h-[44px] !px-3" onClick={() => navigate(`u/${unit.id}`)} aria-label="Back to the map"><Icon name="back" /></button>
        <h1 className="text-2xl">Fix-it session</h1>
        {cur && <span className="chip ml-auto">{i + 1} / {queue.length}</span>}
      </header>
      {!cur ? (
        <div className="flex flex-col items-center gap-3 py-10 text-center" data-testid="fixit-empty">
          <Pip mood="cheer" size={96} />
          <p className="font-display text-2xl">{queue.length ? 'Session done!' : 'Nothing to fix right now.'}</p>
          <p className="font-semibold text-muted">{queue.length ? 'These questions will come back later to make sure they stick.' : 'Missed questions return here after a day, three days, a week…'}</p>
          <button className="btn btn-primary" onClick={() => navigate(`u/${unit.id}`)}>Back to the map</button>
        </div>
      ) : (
        <ItemStage key={cur.key + i} unit={unit} exercise={cur.hit!.exercise} item={cur.hit!.item} pluginType={cur.plugin} record={!cur.plugin}
          labels={cur.plugin ? { official: 'Model sentence' } : undefined}
          onDone={(o) => { if (!later) reviewMistake(cur.key, o.stars === 3); setI(i + 1); }} />
      )}
    </div>
  );
}
