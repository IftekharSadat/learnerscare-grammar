/** Conversation pipeline library: draft from a unit, validate, coverage, review file. Used by the CLI and the tests. */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { analyse, evaluateUtterance, hasAnalyser, speechTokens } from '../../src/speech/evaluate';
import { Conversation, type Scene, type Turn } from '../../src/speech/schema';
import type { Unit } from '../../src/engine/types';

const norm = (s: string) => s.replace(/[‘’ʼ`´]/g, "'").replace(/[“”"]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
const words = (s: string) => s.split(/\s+/).filter(Boolean).length;

/** Example sentences printed in the book's explanation sections, one entry per sentence. */
export function bookExampleSentences(unit: Unit): { section: string; sentence: string; line: string }[] {
  const out: { section: string; sentence: string; line: string }[] = [];
  for (const sec of unit.sections) {
    for (const b of sec.book.filter((x) => x.kind === 'example')) {
      const text = b.text.replace(/\([^)]*\)/g, ' ').replace(/\b[ab]:\s*/g, ' ').replace(/[‘’](?=\s|$)|(?<=^|\s)[‘’]/g, ' ').replace(/[‘“”]/g, ' ').replace(/\s+or\s+/g, ' | ');
      for (const part of text.split('|')) {
        for (const sentence of part.split(/(?<=[.?!])\s+/).map((x) => x.replace(/[’']$/g, '').trim()).filter((x) => x.length > 1)) out.push({ section: sec.key, sentence, line: b.text });
      }
    }
  }
  return out;
}

export interface Validation {
  errors: string[];
  warnings: string[];
  unapproved: Turn[];
  coverage: { section: string; sentence: string; turn: string | null; excluded?: string }[];
  sectionCounts: Record<string, number>;
  typeCounts: Record<string, number>;
}

export function validateConversation(unit: Unit, raw: unknown, unitDir?: string): Validation {
  const v: Validation = { errors: [], warnings: [], unapproved: [], coverage: [], sectionCounts: {}, typeCounts: {} };
  const parsed = Conversation.safeParse(raw);
  if (!parsed.success) {
    v.errors.push(...parsed.error.issues.slice(0, 20).map((i) => `schema: ${i.path.join('.')} ${i.message}`));
    return v;
  }
  const conv = parsed.data;
  const turns = conv.scenes.flatMap((s) => s.turns);
  const structure = conv.scope.structureId;
  if (structure !== 'none' && !hasAnalyser(structure)) v.warnings.push(`scope.structureId "${structure}" has no registered analyser: open turns use exact / near matching`);
  const evalOpts = { structure };
  const ids = new Set<string>();
  const bookText = norm([
    ...unit.sections.flatMap((s) => s.book.map((b) => b.text)),
    ...unit.exercises.flatMap((e) => e.items.flatMap((i) => [i.prompt, ...(i.answerSentences ?? []), ...i.acceptedAnswers])),
  ].join(' '));
  const itemIds = new Set(unit.exercises.flatMap((e) => e.items.map((i) => i.id)));

  for (const scene of conv.scenes) {
    if (!conv.partners.some((p) => p.id === scene.partnerId)) v.errors.push(`${scene.id}: unknown partner ${scene.partnerId}`);
    scene.turns.forEach((t, i) => {
      if (ids.has(t.id)) v.errors.push(`${t.id}: duplicate id`);
      ids.add(t.id);
      const want = scene.turns[i + 1]?.id ?? 'sceneEnd';
      if (t.next.pass !== want && !scene.turns.some((x) => x.id === t.next.pass) && t.next.pass !== 'sceneEnd') v.errors.push(`${t.id}: next.pass → unknown turn ${t.next.pass}`);
      if (t.next.fail !== 'retry' && !scene.turns.some((x) => x.id === t.next.fail)) v.errors.push(`${t.id}: next.fail → unknown turn ${t.next.fail}`);
    });
    // every scene must be able to end
    const reach = new Set<string>();
    for (let cur: string | undefined = scene.turns[0]?.id, n = 0; cur && cur !== 'sceneEnd' && n < 500; n++) { reach.add(cur); cur = scene.turns.find((t) => t.id === cur)?.next.pass; }
    for (const t of scene.turns) if (!reach.has(t.id)) v.errors.push(`${t.id}: unreachable in scene ${scene.id}`);
  }

  for (const t of turns) {
    v.typeCounts[t.type] = (v.typeCounts[t.type] ?? 0) + 1;
    for (const k of t.sectionRef.length === 1 ? [t.sectionRef] : []) v.sectionCounts[k] = (v.sectionCounts[k] ?? 0) + 1;
    if (t.status !== 'approved') v.unapproved.push(t);
    if (t.origin !== 'book' && t.status === 'approved') v.warnings.push(`${t.id}: non-book turn marked approved (make sure a person reviewed it)`);
    if (t.origin === 'book') {
      if (!bookText.includes(norm(t.target.canonical).replace(/[.?!]$/, ''))) v.errors.push(`${t.id}: marked origin "book" but “${t.target.canonical}” is not printed in the unit`);
    }
    if (t.mirrors && !itemIds.has(t.mirrors)) v.errors.push(`${t.id}: mirrors unknown item ${t.mirrors}`);
    if (t.prompt.picture && unitDir && !existsSync(join(unitDir, t.prompt.picture))) v.errors.push(`${t.id}: picture ${t.prompt.picture} not found`);
    if (t.partner) {
      if (words(t.partner.text) > 14) v.errors.push(`${t.id}: partner line has ${words(t.partner.text)} words (max 14)`);
      if (t.partner.audio) {
        const perChar = t.partner.audio.durationMs / Math.max(1, t.partner.text.length);
        if (unitDir && !existsSync(join(unitDir, t.partner.audio.src))) v.errors.push(`${t.id}: partner audio ${t.partner.audio.src} not found`);
        if (perChar < 30 || perChar > 220) v.errors.push(`${t.id}: partner audio duration ${t.partner.audio.durationMs} ms is implausible for ${t.partner.text.length} characters`);
      } else v.warnings.push(`${t.id}: no pre-generated partner audio (the browser voice is used at runtime)`);
    } else if (t.type === 'listenRepeat') v.errors.push(`${t.id}: listenRepeat needs a partner line`);
    if (t.type === 'listenRepeat' && t.partner && norm(t.partner.text) !== norm(t.target.canonical)) v.errors.push(`${t.id}: listenRepeat partner line must be the target sentence`);
    for (const f of t.pronunciationFocus) if (!conv.pronunciationFocus.some((x) => x.id === f)) v.errors.push(`${t.id}: unknown pronunciationFocus ${f}`);

    // the canonical sentence and every accepted utterance pass their own gate
    for (const s of [t.target.canonical, ...t.target.acceptedUtterances]) {
      const e = evaluateUtterance(t, s, {}, evalOpts);
      if (e.gate !== 'pass') v.errors.push(`${t.id}: “${s}” does not pass its own gate (${e.feedbackKey})`);
    }
    for (const w of t.wrongExamples ?? []) {
      const e = evaluateUtterance(t, w.say, {}, evalOpts);
      if (e.gate === 'pass') v.errors.push(`${t.id}: wrong example “${w.say}” PASSES the gate`);
      else if (e.feedbackKey !== w.feedbackKey) v.errors.push(`${t.id}: wrong example “${w.say}” gives ${e.feedbackKey}, expected ${w.feedbackKey}`);
    }
    // grammar scope: new sentences may only use the unit's structure
    if (!t.target.allowOutOfScope && structure === 'presentContinuous') {
      for (const s of [t.target.canonical, ...t.target.acceptedUtterances]) {
        const toks = speechTokens(s);
        const a = analyse(toks);
        if (!a.clause || a.issues.length) v.errors.push(`${t.id}: “${s}” is outside the unit's grammar scope (${a.issues.join(', ') || 'no am/is/are + -ing clause'})`);
        const bad = conv.scope.forbiddenWords.filter((w) => toks.includes(w));
        if (bad.length) v.errors.push(`${t.id}: “${s}” uses structures not taught yet (${bad.join(', ')})`);
      }
    }
  }

  // coverage
  const letters = unit.sections.filter((s) => s.key.length === 1).map((s) => s.key);
  for (const k of letters) if ((v.sectionCounts[k] ?? 0) < 2) v.errors.push(`section ${k} is covered by ${v.sectionCounts[k] ?? 0} turn(s); need ≥ 2`);
  const mirror: Record<string, string> = { pictureVerb: 'describe', buildQuestion: 'askQuestion', positiveNegative: 'decide' };
  for (const e of unit.exercises) {
    const need = mirror[e.type];
    if (need && !(v.typeCounts[need] > 0)) v.errors.push(`exercise ${e.id} (${e.type}) has no ${need} turn`);
  }
  const spoken = turns.filter((t) => t.type === 'readAloud' || t.type === 'listenRepeat');
  const excluded = conv.coverage.excluded;
  for (const ex of bookExampleSentences(unit)) {
    const skip = excluded.find((x) => norm(x.text).includes(norm(ex.sentence)) || norm(ex.line) === norm(x.text));
    if (skip) { v.coverage.push({ section: ex.section, sentence: ex.sentence, turn: null, excluded: skip.reason }); continue; }
    const key = norm(ex.sentence);
    const hit = spoken.find((t) => [t.target.canonical, ...t.target.acceptedUtterances, t.partner?.text ?? ''].some((s) => norm(s).includes(key)));
    v.coverage.push({ section: ex.section, sentence: ex.sentence, turn: hit?.id ?? null });
    if (!hit) v.errors.push(`book example not spoken anywhere: “${ex.sentence}” (section ${ex.section})`);
  }
  return v;
}

export function coverageMarkdown(unit: Unit, conv: Conversation, v: Validation): string {
  const L = [`# Conversation coverage — Unit ${unit.number} (${unit.title})`, '',
    'Generated by `npm run conversation`. Every example sentence printed in the book\'s explanation must be spoken at least once',
    'in a `readAloud` or `listenRepeat` turn (as the learner\'s line or as the partner line the learner answers).', '',
    `**Result:** ${v.errors.length ? `❌ ${v.errors.length} error(s)` : '✅ all checks pass'} · ${conv.scenes.length} scenes · ${conv.scenes.flatMap((s) => s.turns).length} turns · ${v.unapproved.length} awaiting approval`, '',
    '## Book example → speaking turn', '', '| § | Book example sentence | Turn | Note |', '|---|---|---|---|',
    ...v.coverage.map((c) => `| ${c.section} | ${c.sentence} | ${c.turn ?? '—'} | ${c.excluded ? `not an example sentence: ${c.excluded}` : c.turn ? '' : '**MISSING**'} |`),
    '', '## Turns per explanation section (need ≥ 2)', '', '| Section | turns |', '|---|---|', ...Object.entries(v.sectionCounts).sort().map(([k, n]) => `| ${k} | ${n} |`),
    '', '## Turns per type', '', '| Type | turns | mirrors |', '|---|---|---|',
    ...Object.entries(v.typeCounts).map(([k, n]) => `| ${k} | ${n} | ${({ describe: 'Exercise type pictureVerb (1.1)', askQuestion: 'buildQuestion (1.3)', decide: 'positiveNegative (1.4)' } as Record<string, string>)[k] ?? ''} |`),
    ...(v.errors.length ? ['', '## Errors', '', ...v.errors.map((e) => `- ${e}`)] : [])];
  return L.join('\n') + '\n';
}

export function reviewMarkdown(unit: Unit, conv: Conversation, v: Validation): string {
  const L = [`# Conversation review — Unit ${unit.number} (${unit.title})`, '',
    'One document to approve or edit the Talk level. To approve a turn, set its `"status"` to `"approved"` in `conversation.json`',
    '(book sentences are already approved). Only approved turns ship in a normal build.', '',
    `Awaiting approval: **${v.unapproved.length}** of ${conv.scenes.flatMap((s) => s.turns).length} turns — ${v.unapproved.map((t) => t.id).join(', ') || 'none'}`, ''];
  for (const s of conv.scenes) {
    const partner = conv.partners.find((p) => p.id === s.partnerId);
    L.push(`## ${s.id} · ${s.title} (Section ${s.sectionRef}${s.finale ? ', finale' : ''})`, '', `*${s.situation}* — partner: **${partner?.name}** (${partner?.persona})`, '');
    if (s.missions) L.push(`Missions: ${s.missions.map((m) => `${m.label} [${m.requires}]`).join(' · ')}`, '');
    for (const t of s.turns) {
      L.push(`### ${t.id} · ${t.type} · ${t.origin} · ${t.status === 'approved' ? '✅ approved' : '📝 DRAFT'}${t.mirrors ? ` · mirrors ${t.mirrors}` : ''}`, '',
        `- **Partner says:** ${t.partner?.text ?? '—'}`,
        ...(t.prompt.context ? [`- **Context:** ${t.prompt.context} (clue: ${t.prompt.clue ?? '—'})`] : []),
        ...(t.prompt.cueWords ? [`- **Cue words:** ${t.prompt.cueWords}`] : []),
        ...(t.prompt.picture ? [`- **Picture:** ${t.prompt.picture} — ${t.prompt.pictureAlt ?? ''}`] : []),
        ...(t.prompt.responseIdeas ? [`- **Response ideas:** ${t.prompt.responseIdeas.join(' · ')}`] : []),
        `- **Learner target:** ${t.target.canonical}`,
        `- **Also accepted:** ${t.target.acceptedUtterances.join(' · ') || '—'}${t.target.pattern?.open ? ` · *plus any correct ${t.target.pattern.kind} of the pattern*` : ''}`,
        ...(t.target.requiredTokens ? [`- **Must include:** ${t.target.requiredTokens.map((g) => g.join(' / ')).join(' AND ')}`] : []),
        `- **Wrong examples → feedback:** ${(t.wrongExamples ?? []).map((w) => `“${w.say}” → ${w.feedbackKey}`).join(' · ') || '—'}`,
        `- **On pass:** ${t.feedback.onPass}${t.feedback.recast ? ` · partner recast: “${t.feedback.recast}”` : ''}`, '');
    }
  }
  return L.join('\n') + '\n';
}

/** Template draft for a unit that has no conversation yet. Book sentences are approved; everything else is a draft. */
export function draftConversation(unit: Unit): Conversation {
  let n = 0;
  const mk = (type: Turn['type'], sectionRef: string, canonical: string, extra: Partial<Turn> = {}): Turn => ({
    id: `T${++n}`, type, sectionRef, origin: 'book', status: 'approved', prompt: {}, target: { canonical, acceptedUtterances: [], allowOutOfScope: true },
    pronunciationFocus: [], hints: ['Listen again, slowly.', `It starts with “${canonical.split(' ')[0]} …”`, `Model answer: ${canonical}`, 'Listen, then say it together with your partner.'],
    feedback: { onPass: 'Great!' }, points: { base: 10, bonusClear: 5, bonusNoHint: 3 }, next: { pass: 'sceneEnd', fail: 'retry' }, ...extra,
  });
  const scenes: Scene[] = [];
  const examples = bookExampleSentences(unit);
  for (const sec of unit.sections.filter((s) => s.key.length === 1)) {
    const turns: Turn[] = examples.filter((e) => e.section === sec.key).map((e, i) =>
      i % 2 === 0 ? mk('readAloud', sec.key, e.sentence, { partner: { text: 'Read this aloud.', audio: null } }) : mk('listenRepeat', sec.key, e.sentence, { partner: { text: e.sentence, audio: null } }));
    for (const ex of unit.exercises) {
      for (const item of ex.items.filter((i) => !i.isExample && i.mapsToSection === sec.key).slice(0, 2)) {
        const answers = item.answerSentences?.length ? item.answerSentences : item.acceptedAnswers;
        if (ex.type === 'buildQuestion') turns.push(mk('askQuestion', sec.key, answers[0], { mirrors: item.id, partner: { text: item.prompt, audio: null }, prompt: { cueWords: item.cueWords }, target: { canonical: answers[0], acceptedUtterances: answers.slice(1), allowOutOfScope: true } }));
        else if (ex.type === 'pictureVerb' && item.picture) turns.push(mk('describe', sec.key, answers[0], { mirrors: item.id, partner: { text: 'What is happening in the picture?', audio: null }, prompt: { picture: item.picture.src, pictureAlt: item.picture.alt }, target: { canonical: answers[0], acceptedUtterances: answers.slice(1), allowOutOfScope: true } }));
        else if (ex.type === 'positiveNegative') turns.push(mk('decide', sec.key, answers[0], { mirrors: item.id, partner: { text: 'Positive or negative? Say the whole sentence.', audio: null }, prompt: { context: item.prompt, clue: item.clue, cueWords: item.cueWords ? `(${item.cueWords})` : undefined }, target: { canonical: answers[0], acceptedUtterances: answers.slice(1), allowOutOfScope: true } }));
      }
    }
    if (!turns.length) continue;
    // a section needs at least two speaking turns: hear-and-repeat the first example as well as reading it
    if (turns.length < 2) turns.push(mk('listenRepeat', sec.key, turns[0].target.canonical, { partner: { text: turns[0].target.canonical, audio: null } }));
    turns.forEach((t, i) => { t.next = { pass: turns[i + 1]?.id ?? 'sceneEnd', fail: 'retry' }; });
    scenes.push({ id: `T-${sec.key}`, title: sec.title, sectionRef: sec.key, partnerId: 'maya', situation: `Practise Section ${sec.key} aloud: ${sec.title}.`, teaser: 'Next scene coming up.', turns });
  }
  return {
    schemaVersion: 1, unitId: unit.id, title: 'Talk', language: 'en-GB',
    partners: [{ id: 'maya', name: 'Maya', persona: 'A cheerful friend who always calls at the right moment.', look: 'teal', voice: { rate: 0.95, pitch: 1.15 } }],
    pronunciationFocus: [], scope: { structure: unit.title, structureId: 'none', forbiddenWords: [], periodWords: [], changeVerbs: [] },
    coverage: { excluded: [] }, scenes,
  };
}
