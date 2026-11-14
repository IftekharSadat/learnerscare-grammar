/**
 * Explanation scenes. Data-driven by Step.type; unknown types fall back to the generic block renderer,
 * so a new unit renders without code changes.
 */
import { useMemo, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import type { Block, Line, Step } from '@/engine/types';
import type { CueState } from '@/engine/cueScheduler';
import { Picture, Rich, RoleLegend, Tile } from '@/ui/basics';
import { FlipCard, FormLab, MicroCheck, PeriodRings, TimelineBar } from './widgets';

export interface SceneProps {
  unitId: string;
  step: Step;
  cue: CueState;
  revealAll: boolean;
  onMicro?: (correct: boolean) => void;
}

const SKIP_BLOCKS = /^(Pause tag|Plus \d|Legend)$/;
const strip = (s: string) => s.replace(/^[“"]|[”"]$/g, '');
const named = (step: Step, re: RegExp) => step.blocks.filter((b) => re.test(b.name));
const one = (step: Step, re: RegExp) => step.blocks.find((b) => re.test(b.name));
const hasRuns = (l: Line) => !!l.runs?.some((r) => r.role);

function useVis(_step: Step, cue: CueState, revealAll: boolean) {
  return (b: Block | undefined) => !!b && (revealAll || b.cueMs === null || cue.visible.has(b.id));
}

function Reveal({ show, active, children, className }: { show: boolean; active?: boolean; children: ReactNode; className?: string }) {
  return (
    <motion.div className={className} initial={false} aria-hidden={!show}
      animate={{ opacity: show ? 1 : 0, y: show ? 0 : 14, scale: active ? 1.015 : 1 }}
      transition={{ type: 'spring', stiffness: 260, damping: 26 }}
      style={{ visibility: show ? 'visible' : 'hidden', outline: active ? '3px solid var(--gold)' : '3px solid transparent', outlineOffset: 3, borderRadius: 22 }}>
      {children}
    </motion.div>
  );
}

/** How one line of deck text should look. */
function LineView({ line, big }: { line: Line; big?: boolean }) {
  const txt = line.text;
  if (/^[+→=]$/.test(txt)) return null;
  if (/^[✗✕]/.test(txt)) return <p className="flex gap-2 rounded-xl bg-bad-bg px-3 py-2 font-bold text-bad"><span aria-hidden="true">✕</span><span><span className="sr-only-live">Wrong: </span>{txt.replace(/^[✗✕]\s*/, '')}</span></p>;
  if (/^✓/.test(txt)) return <p className="flex gap-2 rounded-xl bg-good-bg px-3 py-2 font-bold text-good"><span aria-hidden="true">✓</span><span><span className="sr-only-live">Right: </span>{txt.replace(/^✓\s*/, '')}</span></p>;
  if (hasRuns(line) || /^[“"‘]/.test(txt)) return <p className={big ? 'hero-sentence' : 'font-display text-[1.2rem] leading-snug'}><Rich line={line} guess={!hasRuns(line)} /></p>;
  if (txt === txt.toUpperCase() && /[A-Z]/.test(txt) && txt.length < 48) return <p className="eyebrow">{txt}</p>;
  if (/^(Number|Badge)$/.test(line.name)) return <span className="grid h-8 w-8 place-items-center rounded-full bg-gold text-sm font-extrabold text-[#14184A]">{txt}</span>;
  return <p className="text-[1.02rem] font-semibold leading-snug">{txt}</p>;
}

function BlockCard({ unitId, block, big }: { unitId: string; block: Block; big?: boolean }) {
  const icons = block.media?.filter((m) => m.kind === 'icon') ?? [];
  const art = block.media?.filter((m) => m.kind === 'illustration') ?? [];
  if (!block.lines.length && !block.media?.length) return null;
  return (
    <div className="card h-full p-4">
      {art.map((m) => <Picture key={m.src} unitId={unitId} media={m} className="mb-3 w-full rounded-2xl" />)}
      <div className="flex gap-3">
        {icons[0] && <Picture unitId={unitId} media={icons[0]} className="h-12 w-12 shrink-0" />}
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          {block.lines.map((l, i) => <LineView key={i} line={l} big={big} />)}
        </div>
      </div>
    </div>
  );
}

/** Generic renderer: every animated block becomes a card that appears on its narration cue. */
function BlocksScene({ unitId, step, cue, revealAll, only, columns = true }: SceneProps & { only?: Block[]; columns?: boolean }) {
  const vis = useVis(step, cue, revealAll);
  const blocks = (only ?? step.blocks).filter((b) => !SKIP_BLOCKS.test(b.name) && (b.lines.length || b.media?.length));
  const narrow = (b: Block) => columns && blocks.length >= 3 && (b.box?.[2] ?? 1) < 0.48;
  return (
    <div className="flex flex-wrap gap-3">
      {blocks.map((b) => (
        <Reveal key={b.id} show={vis(b)} active={!revealAll && cue.current === b.id} className={narrow(b) ? 'w-full sm:w-[calc(50%-0.375rem)]' : 'w-full'}>
          <BlockCard unitId={unitId} block={b} />
        </Reveal>
      ))}
    </div>
  );
}

function barOf(lines: Line[]) {
  return { now: lines[0]?.text ?? 'NOW', left: lines[1]?.text ?? '', right: lines[2]?.text ?? '' };
}

/* ---------------- specialised scenes ---------------- */

function TitleScene(p: SceneProps) {
  const { step, unitId } = p;
  const vis = useVis(step, p.cue, p.revealAll);
  const art = one(step, /^Illustration/);
  const bubble = one(step, /^Speech bubble/);
  const pills = named(step, /^Pill/);
  const source = one(step, /^Source/);
  const badge = one(step, /^Unit badge/);
  return (
    <div className="grid items-center gap-5 md:grid-cols-2">
      <div>
        {badge && <p className="eyebrow">{badge.lines[0]?.text}</p>}
        <h2 className="mt-1 text-[2.6rem] leading-none md:text-[3.4rem]">{step.title}</h2>
        <p className="mt-3 text-lg font-semibold text-muted">{step.subtitle || one(step, /^Subtitle/)?.lines[0]?.text}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {pills.map((b, i) => (
            <Reveal key={b.id} show={vis(b)}><span className="chip !px-4 !py-2" style={{ background: ['var(--primary)', 'var(--gold)', 'var(--role-be)'][i % 3], color: i === 1 ? '#14184A' : '#fff' }}>{b.lines[0]?.text}</span></Reveal>
          ))}
        </div>
        {source && <p className="mt-4 text-sm font-semibold text-muted">{source.lines[0]?.text}</p>}
      </div>
      {art?.media?.[0] && (
        <Reveal show={vis(art)} className="relative">
          <Picture unitId={unitId} media={art.media[0]} className="mx-auto max-h-[46vh] w-auto rounded-[28px]" />
          {bubble && vis(bubble) && (
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="card absolute left-3 top-3 !rounded-2xl !rounded-bl-sm px-3 py-2 font-display text-lg">
              <Rich line={bubble.lines[0]} guess />
            </motion.div>
          )}
        </Reveal>
      )}
    </div>
  );
}

function OverviewScene(p: SceneProps) {
  const { step } = p;
  const vis = useVis(step, p.cue, p.revealAll);
  const parts = named(step, /^Part /);
  const centre = one(step, /^Formula centre/);
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {centre && (
        <Reveal show={vis(centre)} className="sm:col-span-2">
          <div className="rounded-card p-4 text-center text-white" style={{ background: '#14184A' }}>
            {centre.lines.map((l, i) => <p key={i} className={i === 0 ? 'text-xs font-extrabold tracking-widest text-[#FFC83D]' : 'font-display text-2xl'}>{l.text}</p>)}
          </div>
        </Reveal>
      )}
      {parts.map((b) => {
        const [letter, title, sub] = b.lines.map((l) => l.text);
        return (
          <Reveal key={b.id} show={vis(b)} active={!p.revealAll && p.cue.current === b.id}>
            <div className="card flex h-full items-center gap-3 p-4">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary font-display text-2xl text-primary-ink">{letter}</span>
              {b.media?.[0] && <Picture unitId={p.unitId} media={b.media[0]} className="h-12 w-12 shrink-0" />}
              <div><p className="font-display text-xl leading-tight">{title}</p><p className="text-sm font-semibold text-muted">{sub}</p></div>
            </div>
          </Reveal>
        );
      })}
    </div>
  );
}

function SituationScene(p: SceneProps) {
  const { step, unitId } = p;
  const vis = useVis(step, p.cue, p.revealAll);
  const art = one(step, /^Illustration/);
  const bar = one(step, /^Progress bar/);
  const tiles = step.blocks.find((b) => b.lines.length === 3 && b.lines.every((l) => l.text === l.text.toUpperCase()) && b !== bar);
  const rest = step.blocks.filter((b) => b !== art && b !== bar && b !== tiles && !SKIP_BLOCKS.test(b.name));
  return (
    <div className="grid items-start gap-4 md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      {art?.media?.[0] && <Reveal show={vis(art)}><Picture unitId={unitId} media={art.media[0]} className="mx-auto max-h-[40vh] w-auto rounded-[24px]" /></Reveal>}
      <div className="flex flex-col gap-3">
        {rest.map((b) => (
          <Reveal key={b.id} show={vis(b)} active={!p.revealAll && p.cue.current === b.id}><BlockCard unitId={unitId} block={b} big /></Reveal>
        ))}
        {tiles && (
          <Reveal show={vis(tiles)}>
            <div className="flex flex-wrap gap-2" aria-label={tiles.lines.map((l) => l.text).join(' ')}>
              {tiles.lines.map((l, i) => <span key={i} className="tile" data-role={['subject', 'be', 'verb'][i]}>{l.text}</span>)}
            </div>
            <div className="mt-2"><RoleLegend /></div>
          </Reveal>
        )}
        {bar && (
          <Reveal show={vis(bar)}>
            <div className="card p-4">
              <p className="eyebrow">Tap to reveal the timeline</p>
              <TimelineBar {...barOf(bar.lines)} interactive />
            </div>
          </Reveal>
        )}
      </div>
    </div>
  );
}

function FormScene(p: SceneProps) {
  const { step } = p;
  const vis = useVis(step, p.cue, p.revealAll);
  const blocks = named(step, /^Block \d/);
  const rows = named(step, /^Row \d/);
  const remember = one(step, /^Remember/);
  const data = useMemo(() => rows.map((r) => ({ subjects: r.lines[0].text.split(/\s*\/\s*/), be: r.lines[1].text, verb: r.lines[2].text, short: r.lines[3]?.text ?? '' })), [rows]);
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-2 sm:grid-cols-3">
        {blocks.map((b, i) => (
          <Reveal key={b.id} show={vis(b)} active={!p.revealAll && p.cue.current === b.id}>
            <div className="h-full rounded-card p-3 text-center" style={{ background: `var(--role-${['subject', 'be', 'verb'][i]})`, color: '#fff' }}>
              <p className="text-[0.7rem] font-extrabold tracking-widest opacity-90">{b.lines[0]?.text}</p>
              <p className="font-display text-xl">{b.lines[1]?.text}</p>
              <p className="text-sm font-semibold opacity-90">{b.lines[2]?.text}</p>
            </div>
          </Reveal>
        ))}
      </div>
      <div className="flex flex-col gap-2">
        {rows.map((r, i) => (
          <Reveal key={r.id} show={vis(r)} active={!p.revealAll && p.cue.current === r.id}>
            <div className="card flex flex-wrap items-center gap-2 p-3">
              <span className="tile" data-role="subject">{data[i].subjects.join(' / ')}</span>
              <span className="tile" data-role="be">{data[i].be}</span>
              <span className="tile" data-role="verb">{data[i].verb}</span>
              <span className="font-display text-lg text-muted">{data[i].short}</span>
            </div>
          </Reveal>
        ))}
      </div>
      {remember && <Reveal show={vis(remember)}><BlockCard unitId={p.unitId} block={remember} /></Reveal>}
      {p.revealAll && data.length > 0 && <FormLab rows={data} />}
    </div>
  );
}

function ContractionsScene(p: SceneProps) {
  const { step } = p;
  const vis = useVis(step, p.cue, p.revealAll);
  const pairs = named(step, /^Pair \d/);
  const rest = step.blocks.filter((b) => !/^Pair \d/.test(b.name));
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm font-bold text-muted">Tap a card to flip it.</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {pairs.map((b) => (
          <Reveal key={b.id} show={vis(b)} active={!p.revealAll && p.cue.current === b.id}>
            <FlipCard full={`${b.lines[0]?.text} ${b.lines[1]?.text}`} short={b.lines[2]?.text ?? ''} />
          </Reveal>
        ))}
      </div>
      <BlocksScene {...p} only={rest} />
    </div>
  );
}

function BuildScene(p: SceneProps) {
  const { step } = p;
  const vis = useVis(step, p.cue, p.revealAll);
  const rows = named(step, /^Sentence \d/);
  const mistake = one(step, /^Common mistake/);
  return (
    <div className="flex flex-col gap-3">
      {rows.map((b) => {
        const parts = b.lines.filter((l) => l.text !== '+');
        return (
          <Reveal key={b.id} show={vis(b)} active={!p.revealAll && p.cue.current === b.id}>
            <div className="card flex flex-wrap items-center gap-2 p-3">
              {b.media?.[0] && <Picture unitId={p.unitId} media={b.media[0]} className="h-11 w-11" />}
              <span className="tile" data-role="subject">{parts[0]?.text}</span><span className="font-extrabold text-muted" aria-hidden="true">+</span>
              <span className="tile" data-role="be">{parts[1]?.text}</span><span className="font-extrabold text-muted" aria-hidden="true">+</span>
              <span className="tile" data-role="verb">{parts[2]?.text}</span>
              <span className="hero-sentence ml-auto"><Rich text={parts[3]?.text} guess /></span>
            </div>
          </Reveal>
        );
      })}
      {mistake && <Reveal show={vis(mistake)}><BlockCard unitId={p.unitId} block={mistake} /></Reveal>}
    </div>
  );
}

function TimelineScene(p: SceneProps) {
  const { step } = p;
  const vis = useVis(step, p.cue, p.revealAll);
  const bar = one(step, /^Progress bar/);
  const withNested = step.blocks.filter((b) => b.lines.some((l) => l.group?.startsWith('Bar ')));
  const rest = step.blocks.filter((b) => b !== bar && !withNested.includes(b));
  return (
    <div className="flex flex-col gap-4">
      {bar && <Reveal show={vis(bar)}><div className="card p-4"><TimelineBar {...barOf(bar.lines)} /></div></Reveal>}
      <BlocksScene {...p} only={rest} />
      <div className="grid gap-3 md:grid-cols-2">
        {withNested.map((b, i) => {
          const own = b.lines.filter((l) => !l.group);
          const barLines = b.lines.filter((l) => l.group);
          return (
            <Reveal key={b.id} show={vis(b)} active={!p.revealAll && p.cue.current === b.id}>
              <div className="card flex h-full flex-col gap-2 p-4">
                {b.media?.[0] && <Picture unitId={p.unitId} media={b.media[0]} className="h-12 w-12" />}
                {own.map((l, k) => (k === 0 ? <p key={k} className="hero-sentence"><Rich line={l} guess /></p> : <p key={k} className="font-semibold text-muted">{l.text}</p>))}
                <TimelineBar {...barOf(barLines)} nowAt={i % 2 ? 0.62 : 0.45} />
              </div>
            </Reveal>
          );
        })}
      </div>
    </div>
  );
}

function PeriodsScene(p: SceneProps) {
  const { step } = p;
  const vis = useVis(step, p.cue, p.revealAll);
  const rings = named(step, /^Ring /);
  const now = one(step, /^NOW/);
  const rest = step.blocks.filter((b) => !/^Ring |^NOW/.test(b.name));
  const sorted = [...rings].sort((a, b) => (b.box?.[2] ?? 0) - (a.box?.[2] ?? 0));
  return (
    <div className="grid items-start gap-4 md:grid-cols-2">
      <Reveal show={rings.some((r) => vis(r))}>
        <PeriodRings rings={sorted.filter((r) => vis(r)).map((r) => r.lines[0].text)} now={now?.lines[0]?.text ?? 'NOW'} />
        <p className="mt-2 text-center text-sm font-bold text-muted">Tap a period</p>
      </Reveal>
      <BlocksScene {...p} only={rest} columns={false} />
    </div>
  );
}

function CompareScene(p: SceneProps) {
  const { step } = p;
  const vis = useVis(step, p.cue, p.revealAll);
  const stages = named(step, /^Stage \d/);
  const rest = step.blocks.filter((b) => !/^Stage \d/.test(b.name));
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 items-end gap-2">
        {stages.map((b, i) => (
          <Reveal key={b.id} show={vis(b)} active={!p.revealAll && p.cue.current === b.id}>
            <div className={`card flex h-40 flex-col items-center justify-end gap-2 p-3 ${i === 1 ? '!border-2 !border-gold' : ''}`}>
              <div className="flex h-20 items-end gap-1.5" aria-hidden="true">
                {[0, 1, 2].map((k) => (
                  <motion.span key={k} className="w-4 rounded-t-md" style={{ background: i === 1 ? 'var(--gold)' : 'var(--primary)' }}
                    initial={{ height: 12 }} animate={{ height: i === 0 ? 16 : i === 2 ? 64 : [18 + k * 8, 34 + k * 12, 18 + k * 8] }}
                    transition={i === 1 ? { duration: 2, repeat: Infinity } : { duration: 0.6 }} />
                ))}
              </div>
              <p className="text-center text-[0.68rem] font-extrabold tracking-wider">{b.lines[0]?.text}</p>
            </div>
          </Reveal>
        ))}
      </div>
      <BlocksScene {...p} only={rest} />
    </div>
  );
}

function ChangeVerbsScene(p: SceneProps) {
  const { step } = p;
  const vis = useVis(step, p.cue, p.revealAll);
  const groups = named(step, /^Verbs \d/);
  const rest = step.blocks.filter((b) => !/^Verbs \d/.test(b.name));
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2 md:grid-cols-3">
        {groups.map((b) => (
          <Reveal key={b.id} show={vis(b)} active={!p.revealAll && p.cue.current === b.id}>
            <div className="card flex h-full min-w-0 items-center gap-3 p-3">
              {b.media?.[0] && <Picture unitId={p.unitId} media={b.media[0]} className="h-10 w-10 shrink-0" />}
              <div className="flex min-w-0 flex-row flex-wrap gap-1.5 min-[400px]:flex-col">{b.lines.map((l) => <span key={l.text} className="tile !min-h-[36px] !py-1" data-role="verb">{l.text}</span>)}</div>
            </div>
          </Reveal>
        ))}
      </div>
      <BlocksScene {...p} only={rest} />
    </div>
  );
}

/* ---------------- micro-checks (generated from step data; one tap) ---------------- */

export function microCheckFor(step: Step, onDone?: (c: boolean) => void): ReactNode {
  if (step.type === 'form') {
    const rows = named(step, /^Row \d/);
    const row = rows[rows.length - 1];
    if (!row) return null;
    const subject = row.lines[0].text.split(/\s*\/\s*/).pop()!;
    return <MicroCheck question={<>Which form of <b>be</b> goes with “{subject}”?</>} options={[...new Set(rows.map((r) => r.lines[1].text))]} answer={row.lines[1].text}
      explain={`${subject} + ${row.lines[1].text} + ${row.lines[2].text}.`} onDone={onDone} />;
  }
  if (step.type === 'contractions') {
    const pairs = named(step, /^Pair \d/);
    const pick = pairs[2] ?? pairs[0];
    if (!pick) return null;
    return <MicroCheck question={<>How do we usually <b>say</b> “{pick.lines[0].text} {pick.lines[1].text}”?</>} options={pairs.slice(0, 4).map((x) => x.lines[2].text)} answer={pick.lines[2].text}
      explain="Same meaning — the short form is very common in conversation." onDone={onDone} />;
  }
  if (step.type === 'build') {
    const mistake = one(step, /^Common mistake/);
    const wrong = mistake?.lines[0]?.text.match(/“([^”]+)”/)?.[1];
    const rows = named(step, /^Sentence \d/);
    const right = rows.map((r) => r.lines[r.lines.length - 1].text.replace(/\.$/, '')).find((s) => wrong && s.split(' ')[0] === wrong.split(' ')[0]);
    if (!wrong || !right) return null;
    return <MicroCheck question="Which one is correct?" options={[wrong, right]} answer={right} explain="Match the helping verb to the subject every time." onDone={onDone} />;
  }
  // any step with a colour-coded sentence: find the be-verb or the -ing verb
  const line = step.blocks.flatMap((b) => b.lines).find((l) => l.runs?.some((r) => r.role === 'be') && l.runs?.some((r) => r.role === 'verb'));
  if (!line?.runs) return null;
  const wantBe = step.slide % 2 === 0;
  const target = line.runs.find((r) => r.role === (wantBe ? 'be' : 'verb'))!.t.trim();
  const words = strip(line.text).replace(/[.?!]/g, '').replace(/([a-z])([’'](?:s|m|re))\b/gi, '$1 $2').split(/\s+/).filter(Boolean);
  const options = [...new Set(words)].filter((w) => w.length > 1 || w === 'I').slice(0, 6);
  if (!options.includes(target)) return null;
  return <MicroCheck question={<>In “{strip(line.text)}” — tap the {wantBe ? <b>be-verb</b> : <b>verb with -ing</b>}.</>} options={options} answer={target}
    explain={wantBe ? 'am / is / are is the helping verb.' : 'The main verb takes -ing.'} onDone={onDone} />;
}

/* ---------------- dispatcher ---------------- */

export function StepScene(p: SceneProps) {
  switch (p.step.type) {
    case 'title': return <TitleScene {...p} />;
    case 'overview':
    case 'summary': return <OverviewScene {...p} />;
    case 'situation': return <SituationScene {...p} />;
    case 'form': return <FormScene {...p} />;
    case 'contractions': return <ContractionsScene {...p} />;
    case 'build': return <BuildScene {...p} />;
    case 'timeline': return <TimelineScene {...p} />;
    case 'periods': return <PeriodsScene {...p} />;
    case 'compare': return <CompareScene {...p} />;
    case 'changeVerbs': return <ChangeVerbsScene {...p} />;
    default: return <BlocksScene {...p} />;
  }
}

export { Tile };
