/** gapFill + pictureVerb: choose the verb, then assemble [subject][am/is/are][verb-ing] (or type it). */
import { checkText } from '@/engine/answer';
import { BE, ingForm, ingMisspellings, joinBe, personOf, whyBe } from '@/engine/spelling';
import type { Exercise, Item } from '@/engine/types';
import { Picture, Tile } from '@/ui/basics';
import type { ExercisePlugin, PluginRenderProps } from './types';
import { shuffled } from './types';

export interface GapValue {
  bank: string | null;
  subject: string | null;
  be: string | null;
  verb: string | null;
  typed: string;
}

const BLANK = '______';
const tile = (item: Item, role: string) => item.tiles?.find((t) => t.role === role)?.t ?? '';
export const subjectFixed = (item: Item) => item.subjectInBlank === false || !!item.cueWords?.includes('/');
export const baseVerb = (item: Item): string => item.verb ?? item.cueWords?.replace(/[()]/g, '').split('/').pop()!.trim() ?? '';

export function beOptions(polarity: 'positive' | 'negative' | undefined, advanced: boolean): string[] {
  if (polarity === 'negative') return ['’m not', 'isn’t', 'aren’t', ...(advanced ? ['don’t', 'doesn’t'] : [])];
  return ['am', 'is', 'are'];
}

export function verbOptions(item: Item, base: string, advanced: boolean): string[] {
  const right = base === baseVerb(item) ? tile(item, 'verb').toLowerCase() : ingForm(base);
  const wrong = ingMisspellings(base).filter((w) => w !== right).slice(0, advanced ? 3 : 2);
  return shuffled([right, ...wrong, ...(advanced ? [base] : [])], item.id + base);
}

export function compose(item: Item, v: GapValue): string {
  const subject = v.subject ?? tile(item, 'subject');
  if (!v.be || !v.verb) return '';
  return `${joinBe(subject, v.be)} ${v.verb}`;
}

export function FormBuilder({ item, exercise, value, onChange, locked, advanced, polarity }: {
  item: Item; exercise: Exercise; value: GapValue; onChange: (v: GapValue) => void; locked: boolean; advanced: boolean; polarity?: 'positive' | 'negative';
}) {
  const fixed = subjectFixed(item);
  const subject = fixed ? tile(item, 'subject') : value.subject;
  const picture = exercise.type === 'pictureVerb';
  const base = picture ? value.bank : baseVerb(item);
  const subjects = ['He', 'She', 'They', 'It'];
  const correctSubject = tile(item, 'subject');
  if (!fixed && correctSubject && !subjects.some((s) => s.toLowerCase() === correctSubject.toLowerCase())) subjects[3] = correctSubject;
  const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label={label}>
      <span className="w-full text-xs font-extrabold uppercase tracking-wider text-muted sm:w-20">{label}</span>
      {children}
    </div>
  );
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-surface2 p-3" aria-label="Your answer" data-testid="builder-slots">
        {subject ? <span className="tile" data-role="subject">{subject}</span> : <span className="slot">subject</span>}
        {value.be ? <span className="tile" data-role={/not|n’t/.test(value.be) ? 'not' : 'be'}>{value.be}</span> : <span className="slot">{polarity === 'negative' ? 'be + not' : 'am / is / are'}</span>}
        {value.verb ? <span className="tile" data-role="verb">{value.verb}</span> : <span className="slot">verb-ing</span>}
      </div>
      {!locked && (
        <>
          {picture && exercise.verbBank && (
            <Row label="Verb">
              {exercise.verbBank.map((vb) => {
                const used = exercise.usedInExample?.includes(vb) && !item.isExample;
                return (
                  <Tile key={vb} size="sm" selected={value.bank === vb} disabled={used} label={used ? `${vb} (already used in the example)` : vb}
                    onClick={() => onChange({ ...value, bank: vb, verb: null })}>
                    <span className={used ? 'line-through' : ''}>{vb}</span>
                  </Tile>
                );
              })}
            </Row>
          )}
          {!fixed && (
            <Row label="Subject">
              {subjects.map((s) => <Tile key={s} size="sm" selected={value.subject === s} onClick={() => onChange({ ...value, subject: s })}>{s}</Tile>)}
            </Row>
          )}
          <Row label={polarity === 'negative' ? 'be + not' : 'be'}>
            {beOptions(polarity, advanced).map((b) => <Tile key={b} size="sm" selected={value.be === b} onClick={() => onChange({ ...value, be: b })}>{b}</Tile>)}
          </Row>
          {base && (
            <Row label="-ing form">
              {verbOptions(item, base, advanced).map((vb) => <Tile key={vb} size="sm" selected={value.verb === vb} onClick={() => onChange({ ...value, verb: vb })}>{vb}</Tile>)}
            </Row>
          )}
        </>
      )}
    </div>
  );
}

export function TypeBox({ value, onChange, locked, placeholder }: { value: string; onChange: (s: string) => void; locked: boolean; placeholder: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-extrabold uppercase tracking-wider text-muted">Your answer</span>
      <input className="w-full rounded-2xl border-2 border-line bg-surface px-4 py-3 text-lg font-bold outline-none focus:border-primary" data-testid="type-input"
        value={value} disabled={locked} placeholder={placeholder} autoCapitalize="off" autoCorrect="off" autoComplete="off" spellCheck={false}
        onChange={(e) => onChange(e.target.value)} enterKeyHint="done" />
    </label>
  );
}

export function PromptLine({ item, filled }: { item: Item; filled?: string }) {
  const [pre, post = ''] = item.prompt.split(BLANK);
  if (!item.prompt.includes(BLANK)) return <p className="hero-sentence">{item.prompt}</p>;
  return (
    <p className="hero-sentence">
      {pre}
      {filled ? <span className="rounded-lg bg-good-bg px-1 text-good">{filled}</span> : <span className="mx-1 inline-block min-w-[5rem] border-b-4 border-dashed border-muted align-baseline" aria-label="blank">&nbsp;</span>}
      {post}
    </p>
  );
}

function Render({ unitId, exercise, item, value, onChange, locked, inputMode, advanced }: PluginRenderProps<GapValue>) {
  const shownAnswer = locked ? (item.isExample ? item.acceptedAnswers[0] : compose(item, value) || value.typed || item.acceptedAnswers[0]) : undefined;
  return (
    <div className="grid items-start gap-4 md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      {item.picture && <Picture unitId={unitId} media={item.picture} className="mx-auto max-h-[27vh] w-auto rounded-[24px] md:max-h-[52vh]" />}
      <div className={`flex flex-col gap-4 ${item.picture ? '' : 'md:col-span-2'}`}>
        <div className="card p-4">
          {item.origin === 'generated' && <p className="eyebrow mb-1">{item.polarity === 'negative' ? 'Negative' : 'Positive'} · ({item.cueWords})</p>}
          <PromptLine item={item} filled={shownAnswer} />
        </div>
        {inputMode === 'type' && !item.isExample
          ? <TypeBox value={value.typed} onChange={(typed) => onChange({ ...value, typed })} locked={locked} placeholder="Type the missing words" />
          : <FormBuilder item={item} exercise={exercise} value={value} onChange={onChange} locked={locked} advanced={advanced} polarity={item.polarity} />}
      </div>
    </div>
  );
}

export const gapFill: ExercisePlugin<GapValue> = {
  type: 'gapFill',
  label: 'Complete the sentence',
  icon: 'pencil',
  initial: (item) => ({ bank: null, subject: subjectFixed(item) ? tile(item, 'subject') : null, be: null, verb: null, typed: '' }),
  Render,
  check: (item, v, _ex, mode) => checkText(item, mode === 'type' ? v.typed : compose(item, v)),
  ready: (_item, v, mode) => (mode === 'type' ? v.typed.trim().length > 0 : !!(v.be && v.verb && v.subject)),
  hint(item, level) {
    const subject = tile(item, 'subject');
    if (level === 1) return subjectFixed(item) ? `Look at the subject: “${subject}”. Which form of be does it need?` : 'Look at the picture: one person or more than one? That decides the subject and the be-verb.';
    if (level === 2) return `${whyBe(subject)} Pattern: ${subject} + ${BE[personOf(subject)].full}${item.polarity === 'negative' ? ' + not' : ''} + ${baseVerb(item)}-ing${item.spellingNote ? ` (spelling: ${item.spellingNote})` : ''}.`;
    return `The answer: ${item.acceptedAnswers[0]}`;
  },
  revealAnswer(item) {
    const be = tile(item, 'be');
    return { bank: baseVerb(item), subject: tile(item, 'subject'), be, verb: tile(item, 'verb'), typed: item.acceptedAnswers[0] };
  },
  serialize: (v, item, mode) => (mode === 'type' ? v.typed : compose(item, v)),
};

export const pictureVerb: ExercisePlugin<GapValue> = { ...gapFill, type: 'pictureVerb', label: 'Describe the picture', icon: 'image' };
