/** Deterministic English morphology helpers used for distractors, feedback and generated extra practice. */

const VOWELS = 'aeiou';
const isVowel = (c: string) => VOWELS.includes(c);

/** Verb + -ing with the standard spelling rules (tie→tying, take→taking, sit→sitting, cross→crossing). */
export function ingForm(base: string): string {
  const v = base.toLowerCase();
  if (v.endsWith('ie')) return v.slice(0, -2) + 'ying';
  if (v.endsWith('e') && !/(ee|ye|oe)$/.test(v) && v !== 'be') return v.slice(0, -1) + 'ing';
  if (/^[^aeiou]*[aeiou][^aeiouwxy]$/.test(v)) return v + v[v.length - 1] + 'ing';
  if (/(begin|forget|prefer|admit|refer|occur|regret|permit|commit|upset)$/.test(v)) return v + v[v.length - 1] + 'ing';
  return v + 'ing';
}

/** Plausible wrong spellings of the -ing form (never shown as content, only as wrong options). */
export function ingMisspellings(base: string): string[] {
  const v = base.toLowerCase();
  const right = ingForm(v);
  const out = new Set<string>();
  out.add(v + 'ing');
  if (v.endsWith('e')) out.add(v.slice(0, -1) + 'ing');
  if (v.endsWith('ie')) out.add(v.slice(0, -2) + 'ing');
  const last = v[v.length - 1];
  if (!isVowel(last) && last !== 'y') out.add(v + last + 'ing');
  if (/(.)\1$/.test(v)) out.add(v.slice(0, -1) + 'ing');
  out.add(v + 'ng');
  out.delete(right);
  return [...out];
}

/** Recover the base verb from an -ing form when a list of candidate bases is known. */
export function baseOf(ing: string, candidates: string[]): string | undefined {
  return candidates.find((c) => ingForm(c) === ing.toLowerCase());
}

export function spellingRule(base: string): string {
  const v = base.toLowerCase();
  const right = ingForm(v);
  if (v.endsWith('ie')) return `${v} → ${right} (ie changes to y)`;
  if (right === v.slice(0, -1) + 'ing') return `${v} → ${right} (drop the final e)`;
  if (right === v + v[v.length - 1] + 'ing') return `${v} → ${right} (double the last letter)`;
  return `${v} → ${right} (just add -ing)`;
}

export type Person = 'i' | 'sg' | 'pl';

export function personOf(subject: string): Person {
  const s = subject.trim().toLowerCase().replace(/[’']s$/, '');
  if (s === 'i') return 'i';
  if (['we', 'you', 'they', 'these', 'those'].includes(s)) return 'pl';
  if (/\band\b/.test(s)) return 'pl';
  if (/^(the |some |my |your |our |their )?(children|people|men|women|friends|students)\b/.test(s)) return 'pl';
  // regular plural noun phrase: needs a determiner (so names such as "Chris" stay singular) and a head noun in -s
  const m = /^(the|my|your|our|their|his|her|these|those|some|two|three|four|five|many|all) (?:.* )?([a-z]+)$/.exec(s.replace(/ of .*$/, ''));
  if (m && /[^su]s$/.test(m[2]) && !/^(news|bus|class|glass|grass|dress|boss|business|maths|physics|series|always)$/.test(m[2])) return 'pl';
  return 'sg';
}

export const BE: Record<Person, { full: string; short: string; neg: string[] }> = {
  i: { full: 'am', short: '’m', neg: ['’m not', 'am not'] },
  sg: { full: 'is', short: '’s', neg: ['isn’t', '’s not', 'is not'] },
  pl: { full: 'are', short: '’re', neg: ['aren’t', '’re not', 'are not'] },
};

export function whyBe(subject: string): string {
  const p = personOf(subject);
  const s = subject.trim();
  if (p === 'i') return 'I always goes with am.';
  if (p === 'pl') return `${s} = more than one (or “you”) → are.`;
  return `${s} = one person or thing → is.`;
}

/** Join a subject and a be-form: "He" + "’s" → "He’s", "He" + "is" → "He is". */
export function joinBe(subject: string, be: string): string {
  return /^[’']/.test(be) ? subject + be : `${subject} ${be}`;
}
