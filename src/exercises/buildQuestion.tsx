/** buildQuestion: build the question from tiles in order; the frame teaches the two patterns. */
import { checkText } from '@/engine/answer';
import { BE, personOf } from '@/engine/spelling';
import type { Item, Tile as TileT } from '@/engine/types';
import { ROLE_LABEL, Tile } from '@/ui/basics';
import { TypeBox } from './gapFill';
import type { ExercisePlugin, PluginRenderProps } from './types';
import { shuffled } from './types';

export interface BuildValue {
  order: number[];
  typed: string;
}

export function pool(item: Item, advanced: boolean): TileT[] {
  const tiles = item.tiles ?? [];
  if (!advanced || !tiles.length) return tiles;
  const subject = tiles.find((t) => t.role === 'subject')?.t ?? '';
  const be = tiles.find((t) => t.role === 'be')?.t ?? '';
  const right = BE[personOf(subject)].full;
  const wrongBe = ['is', 'are', 'am'].find((b) => b !== right) ?? 'is';
  const base = item.cueWords?.replace(/[()?]/g, '').split('/').map((s) => s.trim()).find((w) => tiles.find((t) => t.role === 'verb')?.t.toLowerCase().startsWith(w.slice(0, 2).toLowerCase()) && !tiles.some((t) => t.t.toLowerCase() === w.toLowerCase()));
  return [...tiles, { t: /^[A-Z]/.test(be) ? wrongBe[0].toUpperCase() + wrongBe.slice(1) : wrongBe, role: '' }, ...(base ? [{ t: base, role: '' as const }] : [])];
}

const composed = (item: Item, v: BuildValue, advanced: boolean) => {
  const p = pool(item, advanced);
  return v.order.length ? v.order.map((i) => p[i].t).join(' ') + '?' : '';
};

function Render({ exercise, item, value, onChange, locked, inputMode, advanced }: PluginRenderProps<BuildValue>) {
  const tiles = pool(item, advanced);
  const bank = shuffled(tiles.map((_, i) => i), item.id);
  const place = (i: number) => onChange({ ...value, order: [...value.order, i] });
  const remove = (i: number) => onChange({ ...value, order: value.order.filter((x) => x !== i) });
  const patterns = exercise.patterns ?? [];
  return (
    <div className="flex flex-col gap-4">
      <div className="card p-4">
        <p className="hero-sentence">{item.prompt}</p>
        {item.cueWords && <p className="mt-2"><span className="eyebrow mr-2">Cue words</span><span className="chip font-display !text-base">{item.cueWords}</span></p>}
      </div>
      {patterns.length > 0 && !locked && (
        <div className="grid gap-2 sm:grid-cols-2" aria-label="The two question patterns">
          {patterns.map((p) => (
            <div key={p.label} className="rounded-2xl border border-line p-2">
              <p className="mb-1 text-[0.65rem] font-extrabold uppercase tracking-wider text-muted">{p.label}</p>
              <div className="flex flex-wrap gap-1">
                {p.slots.map((s, i) => <span key={i} className="rounded-lg px-2 py-0.5 text-xs font-extrabold text-white" style={{ background: /question/i.test(s) ? '#B77F00' : /am|is|are/.test(s) ? 'var(--role-be)' : /subject/.test(s) ? 'var(--role-subject)' : 'var(--role-verb)' }}>{s}</span>)}
              </div>
            </div>
          ))}
        </div>
      )}
      {item.isExample || !tiles.length ? (
        <p className="hero-sentence rounded-2xl bg-good-bg px-3 py-2 text-good">{item.acceptedAnswers[0]}</p>
      ) : inputMode === 'type' ? (
        <TypeBox value={value.typed} onChange={(typed) => onChange({ ...value, typed })} locked={locked} placeholder="Type the question" />
      ) : (
        <>
          <div className="flex min-h-[64px] flex-wrap items-end gap-2 rounded-2xl bg-surface2 p-3" aria-label="Your question" data-testid="build-row"
            onDragOver={(e) => e.preventDefault()} onDrop={(e) => { const i = Number(e.dataTransfer.getData('text/plain')); if (!Number.isNaN(i) && !value.order.includes(i)) place(i); }}>
            {value.order.map((i) => (
              <span key={i} className="flex flex-col items-center gap-0.5">
                <Tile role={locked ? tiles[i].role || undefined : undefined} disabled={locked} onClick={() => remove(i)} label={`${tiles[i].t} — tap to remove`}>{tiles[i].t}</Tile>
                {locked && tiles[i].role && <span className="text-[0.65rem] font-extrabold uppercase tracking-wide text-muted">{ROLE_LABEL[tiles[i].role]}</span>}
              </span>
            ))}
            {Array.from({ length: Math.max(0, (item.tiles?.length ?? 0) - value.order.length) }).map((_, k) => <span key={`s${k}`} className="slot" aria-hidden="true">{k === 0 ? 'next word' : ''}</span>)}
            <span className="hero-sentence pb-1">?</span>
          </div>
          {!locked && (
            <div className="flex flex-wrap gap-2" role="group" aria-label="Word tiles">
              {bank.map((i) => (
                <span key={i} draggable={!value.order.includes(i)} onDragStart={(e) => e.dataTransfer.setData('text/plain', String(i))}>
                  <Tile disabled={value.order.includes(i)} onClick={() => place(i)}>{tiles[i].t}</Tile>
                </span>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export const buildQuestion: ExercisePlugin<BuildValue> = {
  type: 'buildQuestion',
  label: 'Write questions',
  icon: 'question',
  initial: () => ({ order: [], typed: '' }),
  Render,
  check: (item, v, _ex, mode) => checkText(item, mode === 'type' ? v.typed : composed(item, v, v.order.some((i) => i >= (item.tiles?.length ?? 0)) || true)),
  ready: (item, v, mode) => (mode === 'type' ? v.typed.trim().length > 0 : v.order.length >= (item.tiles?.length ?? 1)),
  hint(item, level) {
    const tiles = item.tiles ?? [];
    if (level === 1) return item.pattern === 'wh' ? 'There is a question word in the cue. It goes first.' : 'No question word in the cue: it is a yes / no question, so be comes first.';
    if (level === 2) return `Pattern: ${tiles.map((t) => ROLE_LABEL[t.role] ?? t.role).join(' + ')}. In a question, be goes before the subject.`;
    return `The answer: ${item.acceptedAnswers[0]}`;
  },
  revealAnswer: (item) => ({ order: (item.tiles ?? []).map((_, i) => i), typed: item.acceptedAnswers[0] }),
  serialize: (v, item, mode) => (mode === 'type' ? v.typed : composed(item, v, true)),
};
