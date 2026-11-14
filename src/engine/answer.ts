/** Pure answer checking: normalisation, accepted-variant matching, equivalence, near-miss diagnosis. */
import type { Item } from './types';
import { BE, ingMisspellings, personOf, whyBe } from './spelling';

export type FeedbackCode =
  | 'correct' | 'equivalent' | 'empty' | 'missingBe' | 'wrongBe' | 'spelling' | 'wordOrder' | 'wrongNegative'
  | 'polarity' | 'noIng' | 'wrongVerb' | 'wrongOption' | 'other';

export interface CheckResult {
  correct: boolean;
  code: FeedbackCode;
  /** learner-facing, specific reason */
  message: string;
  /** which accepted variant matched (as printed) */
  matched?: string;
}

/** Lower-case, straighten apostrophes/quotes, collapse spaces, drop trailing punctuation. */
export function normalise(input: string): string {
  return input
    .normalize('NFKC')
    .replace(/[‘’ʼ`´]/g, "'")
    .replace(/[“”"]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s+([?.!,])/g, '$1')
    .replace(/\s*'\s*(m|s|re|t)\b/g, "'$1")
    .trim()
    .replace(/[.!?…]+$/g, '')
    .trim()
    .toLowerCase();
}

/** Expand contractions so that equivalent forms compare equal ("he's not" = "he isn't" = "he is not"). */
export function canonical(input: string): string {
  return normalise(input)
    .replace(/\bi'm\b/g, 'i am')
    .replace(/\b(\w+)'re\b/g, '$1 are')
    .replace(/\bisn't\b/g, 'is not')
    .replace(/\baren't\b/g, 'are not')
    .replace(/\b(what|where|who|how|why|when|that|there|here)'s\b/g, '$1 is')
    .replace(/\b(\w+)'s(?=\s+(?:not\s+)?\w+ing\b)/g, '$1 is')
    .replace(/^'s\b/, 'is')
    .replace(/^'m\b/, 'am')
    .replace(/^'re\b/, 'are')
    .replace(/\s+/g, ' ')
    .trim();
}

const BE_WORDS = /\b(am|is|are)\b/;
const tokens = (s: string) => canonical(s).split(' ').filter(Boolean);

function lev(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

function candidates(item: Item): string[] {
  return [...item.acceptedAnswers, ...(item.answerSentences ?? [])];
}

/** Check a typed (or assembled) answer for sentence-type items. */
export function checkText(item: Item, input: string): CheckResult {
  const n = normalise(input);
  if (!n) return { correct: false, code: 'empty', message: 'Write or build your answer first.' };
  const cands = candidates(item);
  // the learner may also include the subject that is printed before the blank
  const subject = item.tiles?.find((t) => t.role === 'subject')?.t;
  const withSubject = subject && item.subjectInBlank === false ? item.acceptedAnswers.map((a) => (/^[’']/.test(a) ? subject + a : `${subject} ${a}`)) : [];
  for (const c of [...cands, ...withSubject]) {
    if (normalise(c) === n) return { correct: true, code: 'correct', message: 'Correct!', matched: c };
  }
  const cn = canonical(input);
  for (const c of [...cands, ...withSubject]) {
    if (canonical(c) === cn)
      return { correct: true, code: 'equivalent', message: 'Correct — an equivalent form of the answer in the key.', matched: c };
  }
  return diagnose(item, input);
}

export function diagnose(item: Item, input: string): CheckResult {
  const got = tokens(input);
  const targets = candidates(item).map(tokens);
  const target = targets.reduce((best, t) => (lev(t.join(' '), got.join(' ')) < lev(best.join(' '), got.join(' ')) ? t : best), targets[0]);
  const fail = (code: FeedbackCode, message: string): CheckResult => ({ correct: false, code, message });
  const subject = item.tiles?.find((t) => t.role === 'subject')?.t ?? '';
  const verbTile = item.tiles?.find((t) => t.role === 'verb')?.t.toLowerCase();
  const expectedBe = target.find((t) => BE_WORDS.test(t));
  const gotBe = got.find((t) => BE_WORDS.test(t));
  const hasIng = got.some((t) => /ing$/.test(t));
  const sameBag = [...got].sort().join(' ') === [...target].sort().join(' ');

  if (sameBag) {
    const question = item.acceptedAnswers.some((a) => a.trim().endsWith('?'));
    return fail('wordOrder', question
      ? 'Right words, wrong order. In a question, be (am / is / are) goes before the subject.'
      : 'Right words, wrong order. Use subject + be + verb-ing.');
  }
  if (/\b(don't|doesn't|do not|does not|didn't)\b/.test(normalise(input)))
    return fail('wrongNegative', 'With the present continuous the negative is be + not (I’m not, he isn’t, they aren’t) — not don’t / doesn’t.');
  if (item.polarity) {
    const gotNeg = got.includes('not');
    if (item.polarity === 'negative' && !gotNeg)
      return fail('polarity', `This one is negative. Look again at the clue: “${item.clue ?? ''}”.`);
    if (item.polarity === 'positive' && gotNeg)
      return fail('polarity', `This one is positive. Look again at the clue: “${item.clue ?? ''}”.`);
  }
  if (expectedBe && !gotBe)
    return fail('missingBe', `The verb be is missing. Use ${subject ? subject + ' + ' : ''}${expectedBe} + verb-ing.`);
  if (expectedBe && gotBe && gotBe !== expectedBe) return fail('wrongBe', `${whyBe(subject || 'The subject')} Not “${gotBe}”.`);
  if (verbTile) {
    const gotVerb = got.find((t) => t !== verbTile && (lev(t, verbTile) <= 2 || (item.verb && ingMisspellings(item.verb).includes(t))));
    if (!got.includes(verbTile) && gotVerb)
      return fail('spelling', `Check the spelling of the -ing form: ${item.spellingNote || `it is “${verbTile}”`}.`);
    if (!got.includes(verbTile) && item.verb && got.includes(item.verb.toLowerCase()))
      return fail('noIng', `The main verb needs -ing: ${item.verb} → ${verbTile}.`);
    if (!got.includes(verbTile) && hasIng) return fail('wrongVerb', 'Check which verb you need here.');
    if (!got.includes(verbTile) && !hasIng) return fail('noIng', 'The main verb needs -ing.');
  }
  const p = subject ? personOf(subject) : undefined;
  if (p && gotBe && gotBe !== BE[p].full) return fail('wrongBe', whyBe(subject));
  return fail('other', 'Not quite. Compare your answer with the pattern and try again.');
}

/** Matching-type items: the answer is an option key. */
export function checkOption(item: Item, key: string | null): CheckResult {
  if (!key) return { correct: false, code: 'empty', message: 'Choose an ending first.' };
  const ok = item.acceptedAnswers.map((a) => a.toLowerCase()).includes(key.toLowerCase());
  return ok
    ? { correct: true, code: 'correct', message: 'Correct!', matched: key }
    : { correct: false, code: 'wrongOption', message: 'That sentence does not follow this one. Ask: what is happening now, or what is changing?' };
}
