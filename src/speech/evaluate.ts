/**
 * evaluateUtterance — the deterministic, free pass/fail gate for the Talk level. Pure function, no network.
 *
 * Two separate judgements:
 *   gate               did the learner say a right sentence of the target structure?  (pass | nearMiss | fail)
 *   pronunciationScore how clearly did a recogniser hear the target words?            (0..1, bonus only)
 * An accent can lower the bonus; only wrong structure or unintelligible speech fails the gate.
 */
import { canonical } from '@/engine/answer';
import { BE, personOf } from '@/engine/spelling';
import type { PatternKind, Turn } from './schema';

export type Gate = 'pass' | 'nearMiss' | 'fail';
export type FeedbackKey =
  | 'pass' | 'passVariant' | 'nearMiss' | 'silence' | 'partial' | 'offTopic' | 'missingBe' | 'wrongBe' | 'noIng' | 'wordOrder'
  | 'wrongNegative' | 'polarity' | 'wrongKind' | 'missingWord' | 'outOfScope';
export interface WordResult { word: string; status: 'clear' | 'almost' | 'missed'; heard?: string }
export interface AsrMeta { confidence?: number; alternatives?: string[] }
export interface Evaluation {
  gate: Gate;
  feedbackKey: FeedbackKey;
  grammarIssues: string[];
  alignment: WordResult[];
  pronunciationScore: number;
  /** what kind of present-continuous clause was heard (drives finale missions) */
  heardKind: PatternKind | null;
  matched?: string;
  heard: string;
}

const FILLERS = new Set(['um', 'uh', 'er', 'erm', 'hmm', 'ah', 'oh', 'well', 'so', 'okay', 'ok', 'yes', 'yeah', 'no', 'hi', 'hello', 'hey', 'please', 'like', 'right']);
/** recogniser spellings without apostrophes → the contraction they stand for */
const BARE: Record<string, string> = { im: "i'm", hes: "he's", shes: "she's", theyre: "they're", youre: "you're", isnt: "isn't", arent: "aren't", whats: "what's", wheres: "where's", hows: "how's", lets: "let's", dont: "don't", didnt: "didn't", doesnt: "doesn't" };
/** near-sound pairs a recogniser commonly confuses; only applied in front of a verb-ing / not */
const HOMOPHONES: Record<string, string> = { your: "you're", there: "they're", their: "they're", were: "we're", its: "it's", hes: "he's", weir: "we're" };
const ING_NOUNS = new Set(['thing', 'something', 'anything', 'nothing', 'everything', 'morning', 'evening', 'king', 'ring', 'spring', 'string', 'during', 'ceiling', 'wedding', 'meeting', 'feeling', 'interesting', 'boring', 'amazing', 'exciting']);
const QWORDS = new Set(['what', 'why', 'where', 'who', 'how', 'when', 'which']);
const BE_FORMS = new Set(['am', 'is', 'are']);

const isIng = (w: string, next?: string) => /^[a-z]{2,}ing$/.test(w) && !ING_NOUNS.has(w) && next !== '__never__';

/** lower-case, strip punctuation, fix recogniser spellings, expand contractions, drop fillers and stutters */
export function speechTokens(text: string, opts: { keepFillers?: boolean } = {}): string[] {
  const rough = text.toLowerCase().replace(/[‘’ʼ`´]/g, "'").replace(/[^a-z0-9' ]+/g, ' ').split(/\s+/).filter(Boolean);
  const fixed: string[] = [];
  for (let i = 0; i < rough.length; i++) {
    let w = rough[i];
    const next = rough[i + 1] ?? '';
    if (BARE[w]) w = BARE[w];
    else if (HOMOPHONES[w] && (/ing$/.test(next) || next === 'not')) w = HOMOPHONES[w];
    fixed.push(w);
  }
  const expanded = canonical(fixed.join(' ')).replace(/\b(\w+)'s\b/g, (m, a: string) => (/^(let|that)$/.test(a) ? m : `${a} is`)).replace(/\bdon't\b/g, 'do not').replace(/\bdoesn't\b/g, 'does not').replace(/\bdidn't\b/g, 'did not').replace(/'/g, '').split(' ').filter(Boolean);
  const out: string[] = [];
  for (const w of expanded) {
    if (!opts.keepFillers && FILLERS.has(w) && out.length === 0) continue; // leading fillers / openers
    if (/^(um|uh|er|erm|hmm)$/.test(w)) continue;
    if (out[out.length - 1] === w && w !== 'very') continue; // stutter / false start: "i i am"
    out.push(w);
  }
  // false start: "she she is", "i am i am walking"
  for (let n = 3; n >= 1; n--) {
    for (let i = 0; i + 2 * n <= out.length; i++) {
      if (out.slice(i, i + n).join(' ') === out.slice(i + n, i + 2 * n).join(' ')) { out.splice(i, n); i = -1; }
    }
  }
  return out;
}

export interface Clause { kind: PatternKind; subject: string; be: string; verb: string; negative: boolean; agreement: boolean }

/** Find a present-continuous clause: [qword] be subject V-ing (question) or subject be (not) V-ing (statement). */
export function analyse(tokens: string[]): { clause: Clause | null; issues: FeedbackKey[] } {
  const issues: FeedbackKey[] = [];
  const ingAt = tokens.findIndex((w, i) => isIng(w, tokens[i + 1]) && i > 0);
  if (/\b(do|does|did) not \w+ing\b/.test(tokens.join(' '))) issues.push('wrongNegative');
  if (ingAt < 0) {
    if (tokens.some((w) => BE_FORMS.has(w))) issues.push('noIng');
    return { clause: null, issues };
  }
  const before = tokens.slice(0, ingAt);
  const beAt = before.map((w) => BE_FORMS.has(w)).lastIndexOf(true);
  if (beAt < 0) {
    if (tokens.slice(ingAt + 1).some((w) => BE_FORMS.has(w))) issues.push('wordOrder'); // "what cooking you are"
    else if (!issues.length) issues.push('missingBe');
    return { clause: null, issues };
  }
  const be = before[beAt];
  const between = before.slice(beAt + 1);
  const negative = between.includes('not');
  const subjAfter = between.filter((w) => w !== 'not');
  const startsQ = beAt === 0 || (beAt === 1 && QWORDS.has(before[0])) || (beAt <= 2 && QWORDS.has(before[0]) && subjAfter.length > 0);
  let subject: string;
  let kind: PatternKind;
  if (subjAfter.length > 0 && startsQ) {
    subject = subjAfter.join(' ');
    kind = 'question';
  } else if (subjAfter.length === 0 && beAt > 0) {
    const pre = before.slice(0, beAt);
    if (QWORDS.has(pre[0]) && pre.length === 1) { subject = pre[0]; kind = 'question'; } // "what is happening"
    else {
      if (QWORDS.has(pre[0])) issues.push('wordOrder'); // "why you are crying"
      subject = pre.slice(QWORDS.has(pre[0]) ? 1 : 0).join(' ');
      kind = negative ? 'negative' : 'statement';
    }
  } else {
    issues.push('wordOrder');
    subject = subjAfter.join(' ');
    kind = 'statement';
  }
  const head = subject.split(' ').filter((w) => !['the', 'my', 'your', 'our', 'their', 'a', 'some', 'of', 'mine'].includes(w));
  const person = subject && !QWORDS.has(subject) ? personOf(subject.split(' ').length > 1 ? subject : head[head.length - 1] ?? subject) : null;
  const agreement = !person || BE[person].full === be;
  if (!agreement) issues.push('wrongBe');
  return { clause: { kind, subject, be, verb: tokens[ingAt], negative, agreement }, issues };
}

/**
 * Grammar analysers are plug-ins, one per *structure* (not per unit). A unit names its analyser in
 * conversation.scope.structureId. Units whose structure has no analyser fall back to exact / near matching,
 * which is always safe (it can only be stricter).
 */
export interface StructureAnalyser {
  id: string;
  analyse(tokens: string[]): { clause: Clause | null; issues: FeedbackKey[] };
}
const analysers = new Map<string, StructureAnalyser>();
export function registerAnalyser(a: StructureAnalyser) { analysers.set(a.id, a); }
export const hasAnalyser = (id: string | undefined) => !!id && analysers.has(id);
export const analyserIds = () => [...analysers.keys()];
registerAnalyser({ id: 'presentContinuous', analyse });

function lev(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
const near = (a: string, b: string) => a === b || (a.length > 3 && b.length > 3 && lev(a, b) <= (a.length > 6 ? 2 : 1));

/** LCS word alignment of heard tokens against the target sentence's display words. */
export function align(target: string, heard: string[]): WordResult[] {
  const words = target.split(/\s+/).filter(Boolean);
  const perWord = words.map((w) => speechTokens(w, { keepFillers: true }));
  const flat = perWord.flat();
  const n = flat.length, m = heard.length;
  const dp = Array.from({ length: n + 1 }, () => Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = flat[i] === heard[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const hit: (string | null)[] = Array(n).fill(null);
  const used = new Set<number>();
  for (let i = 0, j = 0; i < n && j < m;) {
    if (flat[i] === heard[j]) { hit[i] = heard[j]; used.add(j); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  const spare = heard.filter((_, j) => !used.has(j));
  let k = 0;
  return words.map((word, wi) => {
    const toks = perWord[wi];
    const got = toks.map((_, t) => hit[k + t]);
    k += toks.length;
    if (!toks.length || got.every((g) => g !== null) || toks.every((t) => FILLERS.has(t))) return { word, status: 'clear' as const };
    const alt = spare.find((s) => toks.some((t) => near(t, s) && t !== s));
    if (alt || got.some((g) => g !== null)) return { word, status: 'almost' as const, heard: alt };
    return { word, status: 'missed' as const };
  });
}

function hasGroups(tokens: string[], groups: string[][] | undefined): boolean {
  const text = ` ${tokens.join(' ')} `;
  return (groups ?? []).every((g) => g.some((w) => text.includes(` ${speechTokens(w, { keepFillers: true }).join(' ')} `)));
}
const contains = (hay: string[], needle: string[]) => needle.length > 0 && ` ${hay.join(' ')} `.includes(` ${needle.join(' ')} `);

export interface EvalOptions {
  /** explorer: one near-miss is enough · classic: default · focus: exact structure words required */
  strictness?: 'explorer' | 'classic' | 'focus';
  forbiddenWords?: string[];
  /** clause analyser for open turns. 'none' = units whose structure has no analyser yet: exact / near matching only */
  structure?: string;
}

export function evaluateUtterance(turn: Turn, transcript: string, meta: AsrMeta = {}, opts: EvalOptions = {}): Evaluation {
  const strict = opts.strictness ?? 'classic';
  const repeat = turn.type === 'readAloud' || turn.type === 'listenRepeat';
  const candidates = [transcript, ...(meta.alternatives ?? [])].filter((t) => t && t.trim());
  let best: Evaluation | null = null;
  for (const cand of candidates.length ? candidates : ['']) {
    const e = evaluateOne(turn, cand, meta, strict, repeat, opts.forbiddenWords ?? [], opts.structure ?? 'presentContinuous');
    const rank = (x: Evaluation) => (x.gate === 'pass' ? 2 : x.gate === 'nearMiss' ? 1 : 0) * 10 + x.pronunciationScore;
    if (!best || rank(e) > rank(best)) best = e;
    if (best.gate === 'pass') break;
  }
  return best!;
}

function evaluateOne(turn: Turn, transcript: string, meta: AsrMeta, strict: string, repeat: boolean, forbiddenWords: string[], structure: string): Evaluation {
  const heard = speechTokens(transcript);
  const targets = [turn.target.canonical, ...turn.target.acceptedUtterances];
  const scored = targets.map((t) => ({ t, toks: speechTokens(t), al: align(t, heard) }));
  const ratio = (al: WordResult[]) => (al.length ? al.reduce((s, w) => s + (w.status === 'clear' ? 1 : w.status === 'almost' ? 0.5 : 0), 0) / al.length : 0);
  const top = scored.reduce((a, b) => (ratio(b.al) > ratio(a.al) ? b : a));
  const conf = meta.confidence ?? 0.9;
  const base = { alignment: top.al, heard: heard.join(' '), pronunciationScore: Math.round(ratio(top.al) * (0.6 + 0.4 * conf) * 100) / 100 };
  const { clause, issues } = (analysers.get(structure) ?? { analyse: () => ({ clause: null, issues: [] as FeedbackKey[] }) }).analyse(heard);
  const out = (gate: Gate, feedbackKey: FeedbackKey, extra: Partial<Evaluation> = {}): Evaluation => ({
    gate, feedbackKey, grammarIssues: gate === 'pass' ? [] : issues.map(String), heardKind: clause?.kind ?? null, ...base, ...extra,
  });
  if (!heard.length) return out('fail', 'silence');
  for (const p of turn.target.forbiddenPatterns ?? []) if (new RegExp(p, 'i').test(heard.join(' '))) return out('fail', 'outOfScope');

  // 1. an accepted utterance, said exactly (extra words around it are fine)
  const exact = scored.find((s) => contains(heard, s.toks));
  if (exact) return out('pass', 'pass', { matched: exact.t, alignment: exact.al, pronunciationScore: Math.round(ratio(exact.al) * (0.6 + 0.4 * conf) * 100) / 100 });

  const analyser = analysers.get(structure);
  if (!analyser) {
    // no clause analyser for this unit's structure: intelligibility thresholds against the accepted utterances only
    const r = ratio(top.al);
    const passAt = repeat ? (strict === 'explorer' ? 0.75 : strict === 'focus' ? 0.95 : 0.85) : 1.01;
    if (r >= passAt) return out('pass', 'pass', { matched: top.t });
    if (r >= (repeat ? 0.6 : 0.75)) return out('nearMiss', 'nearMiss');
    return out('fail', heard.length < top.toks.length * 0.6 && r >= 0.3 ? 'partial' : 'offTopic');
  }
  const targetClause = analyser.analyse(top.toks).clause;
  const wantKind: PatternKind | undefined = turn.target.pattern?.kind ?? targetClause?.kind;

  // 2. read / repeat a given sentence: intelligibility threshold + the structure words must be there
  if (repeat) {
    const r = ratio(top.al);
    const structure = top.toks.filter((w, i) => BE_FORMS.has(w) || w === 'not' || isIng(w, top.toks[i + 1]));
    const lost = structure.filter((w) => !heard.includes(w));
    if (targetClause) {
      if (lost.some((w) => BE_FORMS.has(w))) return out('fail', heard.some((w) => BE_FORMS.has(w)) ? 'wrongBe' : 'missingBe');
      if (lost.some((w) => /ing$/.test(w)) && !heard.some((w) => lost.some((l) => /ing$/.test(l) && near(l, w)))) return out('fail', 'noIng');
      if (lost.includes('not')) return out('fail', 'polarity');
      if (targetClause.kind === 'question' && (issues.includes('wordOrder') || (clause && clause.kind !== 'question' && top.toks.length <= 8))) return out('fail', 'wordOrder');
    }
    const passAt = strict === 'explorer' ? 0.75 : strict === 'focus' ? 0.95 : 0.85;
    if (r >= passAt) return out('pass', 'pass', { matched: top.t });
    if (r >= 0.6) return out('nearMiss', 'nearMiss');
    return out('fail', heard.length < top.toks.length * 0.6 && r >= 0.3 ? 'partial' : 'offTopic');
  }

  // 3. named grammar errors always fail, in every mode
  if (issues.includes('wrongNegative')) return out('fail', 'wrongNegative');
  if (issues.includes('wordOrder') && wantKind === 'question') return out('fail', 'wordOrder');
  const overlap = ratio(top.al);
  const onTopic = overlap >= 0.34 || !!clause || heard.some((w) => /ing$/.test(w) || BE_FORMS.has(w));
  if (!clause) {
    if (issues.includes('wordOrder')) return out('fail', 'wordOrder');
    if (issues.includes('missingBe')) {
      // "the weathers changing" is how a recogniser may write "the weather's changing": accept only as an exact accepted utterance
      const patched = heard.flatMap((w, i) => (/[a-z]{3,}s$/.test(w) && /ing$/.test(heard[i + 1] ?? '') ? [w.slice(0, -1), 'is'] : [w]));
      const hit = scored.find((x) => contains(patched, x.toks));
      if (hit) return out('pass', 'pass', { matched: hit.t, alignment: align(hit.t, patched) });
    }
    const stem = targetClause ? targetClause.verb.replace(/ing$/, '').slice(0, 4) : '';
    if (stem.length >= 3 && heard.some((w) => w.startsWith(stem) && !/ing$/.test(w)) && !issues.includes('missingBe')) return out('fail', 'noIng');
    if (!onTopic) return out('fail', 'offTopic');
    if (issues.includes('missingBe')) return out('fail', 'missingBe');
    if (issues.includes('noIng') || heard.length >= 2) return out('fail', overlap < 0.34 && !heard.some((w) => BE_FORMS.has(w)) && !targetClause ? 'offTopic' : 'noIng');
    return out('fail', 'partial');
  }
  if (!clause.agreement) return out('fail', 'wrongBe');
  if (forbiddenWords.some((w) => heard.includes(w))) return out('fail', 'outOfScope');

  // 4. a different but also correct sentence of the target pattern
  if (wantKind && wantKind !== 'any') {
    if (wantKind === 'negative' && clause.kind === 'statement') return out('fail', 'polarity');
    if (wantKind === 'statement' && clause.kind === 'negative' && (turn.type === 'decide' || turn.type === 'describe' || turn.type === 'askQuestion')) return out('fail', 'polarity');
    if (wantKind === 'question' && clause.kind !== 'question') return out('fail', 'wordOrder');
    if (wantKind !== 'question' && clause.kind === 'question') return out('fail', 'wrongKind');
  }
  if (!hasGroups(heard, turn.target.requiredTokens)) {
    // right structure, but a required word is missing or was heard as something close
    const closeEnough = top.al.filter((w) => w.status !== 'clear').length <= 1 && overlap >= 0.75;
    return closeEnough && strict !== 'focus' ? out('nearMiss', 'nearMiss') : out('fail', 'missingWord');
  }
  if (turn.target.pattern?.open) return out('pass', 'passVariant', { pronunciationScore: Math.round((0.6 + 0.4 * conf) * 100) / 100, alignment: [] });
  // closed turn: same structure, small lexical difference → near miss; otherwise it is another sentence
  if (overlap >= 0.75) return out('nearMiss', 'nearMiss');
  return out('fail', overlap >= 0.34 ? 'missingWord' : 'offTopic');
}

/** Learner-facing copy for each feedback key (warm, specific, never shaming). */
export const FEEDBACK_COPY: Record<FeedbackKey, string> = {
  pass: 'Yes! That is exactly right.',
  passVariant: 'Nice — your own sentence, and the grammar is right.',
  nearMiss: 'So close! One word was not clear. Try it once more.',
  silence: 'I did not hear anything. Tap the microphone and speak when you are ready.',
  partial: 'I heard the start. Try the whole sentence in one go.',
  offTopic: 'That was a different sentence. Look at the prompt and try again.',
  missingBe: 'The little word am / is / are is missing before the -ing verb.',
  wrongBe: 'Check am / is / are: it has to match the subject.',
  noIng: 'The main verb needs -ing: an action in progress.',
  wordOrder: 'In a question, am / is / are comes before the subject.',
  wrongNegative: 'For the negative, use be + not (I’m not, he isn’t) — not don’t.',
  polarity: 'Look at the clue again: should this be positive or negative?',
  wrongKind: 'Here we need a statement, not a question.',
  missingWord: 'Good structure! One key word from the prompt is missing.',
  outOfScope: 'Keep it in the present continuous: am / is / are + verb-ing.',
};
