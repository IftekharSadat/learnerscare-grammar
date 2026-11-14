/** Unit map: a winding path of stepping stones. Locks are only a "recommended path" — every node is tappable. */
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { downloadUnit, isUnitDownloaded, storageEstimate } from '@/engine/content';
import { t } from '@/engine/i18n';
import { dueCards } from '@/engine/srs';
import { unitProgress, useStore } from '@/engine/store';
import type { JourneyNode, Manifest, Unit } from '@/engine/types';
import { navigate } from '@/router';
import { Icon, Pip, PipSays, ProgressRing, Stars } from '@/ui/basics';

const NODE_ICON: Record<string, string> = {
  spark: 'spark', letter: 'book', flag: 'flag', pictureVerb: 'image', matching: 'link', buildQuestion: 'question', positiveNegative: 'plusminus',
  search: 'search', bolt: 'bolt', trophy: 'trophy', mic: 'mic',
};
const mb = (n: number) => `${(n / 1048576).toFixed(n > 10485760 ? 0 : 1)} MB`;

export function MapScreen({ unit, manifest }: { unit: Unit; manifest: Manifest }) {
  const progress = useStore((s) => s.progress);
  const settings = useStore((s) => s.settings);
  const up = unitProgress(progress, unit.id);
  const done = (n: JourneyNode) => !!up.nodes[n.id]?.done;
  const firstOpen = unit.journey.findIndex((n) => !done(n));
  const current = firstOpen === -1 ? unit.journey.length - 1 : firstOpen;
  const ratio = unit.journey.filter(done).length / unit.journey.length;
  const due = dueCards(Object.values(progress.mistakes).filter((c) => c.key.startsWith(unit.id)), Date.now(), 99).length;
  const [offline, setOffline] = useState<'unknown' | 'no' | 'yes' | 'loading'>('unknown');
  const [dl, setDl] = useState(0);
  const [usage, setUsage] = useState<string>('');
  useEffect(() => {
    void isUnitDownloaded(unit.id).then((y) => setOffline(y ? 'yes' : 'no')).catch(() => setOffline('no'));
    void storageEstimate().then((e) => e && setUsage(`${mb(e.usage)} used on this device`));
  }, [unit.id, offline]);
  const download = async () => {
    setOffline('loading');
    try { await downloadUnit(unit.id, (d, tot) => setDl(d / tot)); setOffline('yes'); useStore.getState().say('Unit saved for offline use', '📥'); }
    catch { setOffline('no'); useStore.getState().say('Download failed — check your connection', '⚠️'); }
  };
  const src = unit.source;
  return (
    <div className="mx-auto w-full max-w-stage px-4 pb-16">
      <header className="flex items-center gap-2 py-4">
        <Pip size={36} />
        <span className="hidden font-display text-xl min-[420px]:inline">LearnersCare</span>
        <span className="ml-auto flex items-center gap-1.5">
          <span className="chip" aria-label={`${progress.streak.count} day streak`}><Icon name="flame" size={16} className="text-[color:var(--coral)]" />{progress.streak.count}</span>
          <span className="chip" aria-label={`${progress.xp} XP`} data-testid="xp"><Icon name="star" size={16} className="text-[color:#B77F00]" />{progress.xp}</span>
          <button className="btn btn-quiet !min-h-[44px] !px-3" onClick={() => navigate('profile')} aria-label={t('nav.profile')} data-testid="open-profile"><Icon name="user" /></button>
          <button className="btn btn-quiet !min-h-[44px] !px-3" onClick={() => window.dispatchEvent(new Event('open-settings'))} aria-label={t('nav.settings')} data-testid="open-settings"><Icon name="gear" /></button>
        </span>
      </header>

      <section className="grid items-center gap-4 rounded-[28px] p-5 text-white md:grid-cols-[1fr_auto]" style={{ background: 'linear-gradient(135deg, #14184A 0%, #2B1F7A 60%, #6C4DF4 130%)' }}>
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#FFC83D]">{unit.number >= 900 ? 'Sample unit' : `Unit ${unit.number}`}</p>
          <h1 className="mt-1 text-[2.2rem] leading-none sm:text-[3rem]">{unit.title}</h1>
          <p className="mt-1 font-display text-xl text-[#C9CCF5]">{unit.subtitle}</p>
          <div className="mt-3 flex flex-wrap gap-2" aria-hidden="true">
            <span className="tile" data-role="subject">I</span><span className="tile" data-role="be">am</span><span className="tile" data-role="verb">doing</span>
          </div>
          <p className="mt-3 text-sm font-semibold text-[#C9CCF5]" data-testid="citation">
            {src.pages.length ? <>Based on {src.author}, <i>{src.book}</i>, {src.edition} edition ({src.publisher}), Unit {unit.number}, pp. {src.pages.join('–')}. Explanations marked “LearnersCare” are our own teaching material.</> : src.deckCredit}
          </p>
        </div>
        <div className="flex items-center gap-4 md:flex-col">
          <span className="rounded-full bg-white/10 p-2"><ProgressRing value={ratio} size={92} stroke={9} label="Unit progress"><span className="text-base text-white">{Math.round(ratio * 100)}%</span></ProgressRing></span>
          <button className="btn btn-gold" onClick={() => navigate(`u/${unit.id}/n/${unit.journey[current].id}`)} data-testid="continue">
            {ratio === 0 ? t('common.start') : ratio === 1 ? t('map.replay') : t('common.continue')}
          </button>
        </div>
      </section>

      {manifest.units.length > 1 && (
        <nav className="mt-3 flex gap-2 overflow-x-auto" aria-label="Units">
          {manifest.units.map((u) => (
            <button key={u.id} className={`chip shrink-0 !py-2 ${u.id === unit.id ? '!bg-primary !text-primary-ink' : ''}`} onClick={() => navigate(`u/${u.id}`)} data-testid={`unit-${u.id}`}>Unit {u.number} · {u.title}</button>
          ))}
        </nav>
      )}

      {due > 0 && (
        <button className="card mt-4 flex w-full items-center gap-3 p-4 text-left" onClick={() => navigate(`fixit/${unit.id}`)} data-testid="fixit-card">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-gold text-[#14184A]"><Icon name="replay" /></span>
          <span className="flex-1"><span className="block font-extrabold">Fix-it session · {due} to review</span><span className="text-sm font-semibold text-muted">Questions you missed come back until they stick.</span></span>
          <Icon name="back" className="rotate-180" />
        </button>
      )}

      <ol className="relative mx-auto mt-8 flex max-w-[640px] flex-col gap-3" aria-label="Unit path">
        {unit.journey.map((n, i) => {
          const isDone = done(n);
          const isCurrent = i === current && !isDone;
          const ahead = i > current;
          const offset = ['0%', '8%', '14%', '8%'][i % 4];
          return (
            <li key={n.id} className="relative" style={{ paddingLeft: `min(${offset}, 9rem)` }}>
              {i > 0 && <span className="absolute -top-3 h-3 w-1 rounded bg-line" style={{ left: `calc(min(${offset}, 9rem) + 2rem)` }} aria-hidden="true" />}
              <motion.button whileTap={{ scale: 0.98 }} onClick={() => navigate(`u/${unit.id}/n/${n.id}`)} data-testid={`node-${n.id}`} data-done={isDone ? '1' : '0'}
                aria-current={isCurrent ? 'step' : undefined}
                className={`flex w-full max-w-[500px] items-center gap-3 rounded-[24px] border-2 p-3 text-left shadow-card ${isCurrent ? 'bob' : ''}`}
                style={{ borderColor: isCurrent ? 'var(--gold)' : isDone ? 'var(--primary)' : 'var(--line)', background: ahead ? 'color-mix(in srgb, var(--surface) 55%, var(--bg))' : 'var(--surface)' }}>
                <span className="grid h-14 w-14 shrink-0 place-items-center rounded-[18px]" style={{ background: isDone ? 'var(--primary)' : isCurrent ? 'var(--gold)' : 'var(--surface-2)', color: isDone ? 'var(--primary-ink)' : isCurrent ? '#14184A' : 'var(--muted)' }}>
                  {n.sectionKey ? <span className="font-display text-2xl">{n.sectionKey}</span> : <Icon name={NODE_ICON[n.icon] ?? 'spark'} size={26} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-display text-[1.2rem] leading-tight">{n.title}</span>
                  <span className="block text-sm font-semibold leading-snug text-muted">{n.subtitle}</span>
                  {isCurrent && <span className="mt-1 inline-block rounded-full bg-gold px-2 text-[0.68rem] font-extrabold uppercase tracking-wide text-[#14184A]">{t('map.recommended')}</span>}
                </span>
                {isDone ? <Stars value={up.nodes[n.id].stars} size={16} /> : ahead ? <Icon name="lock" size={18} className="text-muted" /> : null}
                <span className="sr-only-live">{isDone ? 'Completed' : ahead ? 'Not started — you can still open it' : ''}</span>
              </motion.button>
            </li>
          );
        })}
      </ol>

      {settings.mascot && unit.journey[current] && ratio < 1 && (
        <div className="mx-auto mt-6 max-w-[640px]"><PipSays mood="happy">{ratio === 0 ? 'Hi! Let’s start with a real situation.' : `Next: ${unit.journey[current].title} — ${unit.journey[current].subtitle.toLowerCase()}`}</PipSays></div>
      )}

      <section className="mx-auto mt-8 max-w-[640px] rounded-card border border-line p-4" aria-label="Offline">
        <div className="flex flex-wrap items-center gap-3">
          <Icon name="download" />
          <div className="flex-1">
            <p className="font-extrabold">{offline === 'yes' ? 'This unit is saved for offline use' : 'Use this unit offline'}</p>
            <p className="text-sm font-semibold text-muted" data-testid="storage">{usage || 'Narration and pictures are stored on this device only.'}</p>
          </div>
          {offline !== 'yes' && (
            <button className="btn btn-ghost" onClick={download} disabled={offline === 'loading'} data-testid="download-unit">
              {offline === 'loading' ? `${Math.round(dl * 100)}%` : 'Download unit'}
            </button>
          )}
          {offline === 'yes' && <span className="chip" data-testid="offline-ready">✓ Ready offline</span>}
        </div>
      </section>
    </div>
  );
}
