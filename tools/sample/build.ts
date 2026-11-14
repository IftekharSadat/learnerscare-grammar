/**
 * Builds the rights-cleared SAMPLE UNIT (unit-900) — original LearnersCare wording only, no textbook text,
 * no narration audio. It exists so the engine can be distributed and demonstrated without third-party content.
 *   npx tsx tools/sample/build.ts [outDir=content-sample]
 * Every sentence here is original sample content and waits for the owner's editorial approval (docs/BLOCKERS.md).
 */
import { mkdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Exercise, Item, Line, Role, Step, Unit } from '../../src/engine/types';
import type { Conversation, Turn } from '../../src/speech/schema';

const out = process.argv[2] ?? 'content-sample';
const dir = join(out, 'units', 'unit-900');
mkdirSync(dir, { recursive: true });

/** "{s:He}{b:’s} {v:washing} the car." → coloured runs */
function line(text: string, name = 'line'): Line {
  const runs: { t: string; role?: Role }[] = [];
  const map: Record<string, Role> = { s: 'subject', b: 'be', v: 'verb', q: 'qword' };
  let plain = '';
  for (const m of text.matchAll(/\{([sbvq]):([^}]*)\}|([^{]+)/g)) {
    if (m[1]) { runs.push({ t: m[2], role: map[m[1]] }); plain += m[2]; } else { runs.push({ t: m[3] }); plain += m[3]; }
  }
  return runs.some((r) => r.role) ? { name, text: plain, runs } : { name, text: plain };
}
let blockId = 100;
const block = (name: string, lines: string[], box?: number[]) => ({ id: ++blockId, name, lines: lines.map((l) => line(l)), cueMs: null, exitMs: null, ...(box ? { box } : {}) });
let slide = 0;
const step = (type: Step['type'], eyebrow: string, title: string, subtitle: string, blocks: ReturnType<typeof block>[]): Step => ({
  id: `sample-s${String(++slide).padStart(2, '0')}`, deck: 'explain', slide, type, eyebrow, title, subtitle, origin: 'learnerscare', voiceOver: '', blocks, audio: null,
});

const sections: Unit['sections'] = [
  { key: 'intro', title: 'Warm-up', kind: 'intro', book: [], steps: [
    step('overview', 'WHAT YOU WILL LEARN', 'Four parts, one tense', 'Form first, then three ways to use it.', [
      block('Part A', ['A', 'Form', 'am / is / are + verb-ing']), block('Part B', ['B', 'Happening now', 'in the middle of an action']),
      block('Part C', ['C', 'These days', 'today, this week, this month']), block('Part D', ['D', 'Changing', 'things that are becoming different']),
    ]),
  ] },
  { key: 'A', title: 'Form', tagline: 'am / is / are + verb-ing', kind: 'explanation', book: [], steps: [
    step('example', 'SECTION A · A SITUATION', 'In the kitchen', 'Mina started cooking a few minutes ago.', [
      block('Example', ['Mina is in the kitchen.', '{s:She}{b:’s} {v:making} soup.']),
      block('Note', ['She started, and she has not finished: the action is in progress now.']),
    ]),
    step('form', 'SECTION A · FORM', 'Three parts', 'Subject, the right form of be, and the verb with -ing.', [
      block('Block 1', ['SUBJECT', 'I, he, they…', 'who or what']), block('Block 2', ['BE VERB', 'am · is · are', 'matches the subject']), block('Block 3', ['MAIN VERB', 'read + ing', 'the action']),
      block('Row 1', ['I', 'am', 'reading', '= I’m reading']), block('Row 2', ['He / She / It', 'is', 'sleeping', '= He’s sleeping']), block('Row 3', ['We / You / They', 'are', 'playing', '= They’re playing']),
      block('Remember', ['REMEMBER', 'be changes with the subject.', 'The main verb always takes -ing.']),
    ]),
    step('contractions', 'SECTION A · SHORT FORMS', 'How we say it', 'In conversation we usually use the short form.', [
      block('Pair 1', ['I', 'am', 'I’m']), block('Pair 2', ['He', 'is', 'He’s']), block('Pair 3', ['She', 'is', 'She’s']), block('Pair 4', ['We', 'are', 'We’re']), block('Pair 5', ['They', 'are', 'They’re']),
      block('Callout', ['“He is sleeping” and “He’s sleeping” mean the same.']),
    ]),
  ] },
  { key: 'B', title: 'Happening now', tagline: 'in the middle of an action', kind: 'explanation', book: [], steps: [
    step('example', 'SECTION B · IN PROGRESS', 'In the middle of it', 'The action has started and is not finished.', [
      block('Example 1', ['“Please be quiet.”', '“{s:The baby} {b:is} {v:sleeping}.”']),
      block('Example 2', ['“Where is Omar?”', '“{s:He}{b:’s} {v:washing} the car.”']),
      block('Example 3', ['“{s:I}{b:’m} {v:writing} a long story these days.”', 'Not at this exact second, but the story is not finished.']),
    ]),
  ] },
  { key: 'C', title: 'These days', tagline: 'today, this week, this month', kind: 'explanation', book: [], steps: [
    step('periods', 'SECTION C · PERIODS AROUND NOW', 'A period around now', 'The action belongs to the present period.', [
      block('Ring this month', ['this month'], [0, 0, 0.5, 0.5]), block('Ring this week', ['this week'], [0, 0, 0.4, 0.4]), block('Ring today', ['today'], [0, 0, 0.3, 0.3]),
      block('NOW marker', ['NOW']),
      block('Example', ['“{s:We}{b:’re} {v:eating} at home this week.”']), block('Example 2', ['“{s:My brother} {b:isn’t} {v:working} this month.”']),
    ]),
  ] },
  { key: 'D', title: 'Changing', tagline: 'things that are becoming different', kind: 'explanation', book: [], steps: [
    step('changeVerbs', 'SECTION D · CHANGES', 'Verbs of change', 'Use the tense for a change that has started.', [
      block('Verbs 1', ['getting', 'becoming']), block('Verbs 2', ['improving', 'changing']), block('Verbs 3', ['rising', 'growing']),
      block('Example', ['“{s:The days} {b:are} {v:getting} shorter.”']), block('Example 2', ['“{s:Your handwriting} {b:is} {v:improving}.”']),
    ]),
  ] },
];

const audio = { question: null, answer: null, pauseMs: 0 };
const tiles = (s: string, b: string, v: string) => [{ t: s, role: 'subject' as const }, { t: b, role: 'be' as const }, { t: v, role: 'verb' as const }];
const base = (id: string, n: number, sec: string, isExample = false): Pick<Item, 'id' | 'number' | 'isExample' | 'origin' | 'hints' | 'audio' | 'mapsToSection'> =>
  ({ id, number: n, isExample, origin: 'learnerscare', hints: { bn: '' }, audio, mapsToSection: sec });

const gap = (n: number, sec: string, prompt: string, verb: string, subj: string, be: string, ving: string, why: string, spelling?: string, ex = false): Item => {
  const short = be === 'am' ? '’m' : be === 'is' ? '’s' : '’re';
  const accepted = [`${be} ${ving}`, `${short} ${ving}`];
  const fill = (a: string) => prompt.replace(/\s*______\s*\([^)]*\)/, a.startsWith('’') ? a : ` ${a}`);
  return { ...base(`9.1.${n}`, n, sec, ex), prompt, cueWords: verb, verb, acceptedAnswers: accepted, officialAnswer: accepted.join(' / '), answerSentences: accepted.map(fill), why, tiles: tiles(subj, be, ving), subjectInBlank: false, ...(spelling ? { spellingNote: spelling } : {}) };
};
const ex1: Exercise = { id: '9.1', origin: 'learnerscare', type: 'gapFill', sectionRef: 'A', title: 'Complete the sentence', shortName: 'Build the form', task: 'Choose be and the -ing form', instructions: 'Use am / is / are + verb-ing.', intro: null, recap: null, items: [
  gap(1, 'A', 'The cat ______ (sleep) on the sofa.', 'sleep', 'The cat', 'is', 'sleeping', 'One cat → is. Sleep just adds -ing.', undefined, true),
  gap(2, 'A', 'I ______ (read) a comic.', 'read', 'I', 'am', 'reading', 'I always goes with am.'),
  gap(3, 'A', 'They ______ (make) a kite.', 'make', 'They', 'are', 'making', 'They → are. Make drops the final e.', 'make → making (drop the final e)'),
  gap(4, 'B', 'My sister ______ (run) in the park.', 'run', 'My sister', 'is', 'running', 'One person → is. Run doubles the n.', 'run → running (double the last letter)'),
  gap(5, 'A', 'We ______ (wait) for the bus.', 'wait', 'We', 'are', 'waiting', 'We → are. Wait just adds -ing.'),
] };
const pairs: [string, string, string, string][] = [
  ['Turn the music down, please.', 'I’m doing my homework.', 'B', 'The second sentence gives the reason: an action in progress now.'],
  ['Wear your boots.', 'It’s beginning to snow.', 'D', 'A change is beginning, so boots are a good idea.'],
  ['Dad can’t come to the phone.', 'He’s cooking dinner.', 'B', 'He is in the middle of cooking right now.'],
  ['We need a bigger table.', 'Our family is growing.', 'D', 'Growing describes a change that is happening.'],
  ['I can’t meet you this week.', 'I’m working late every day.', 'C', 'This week is a period around now.'],
];
const keys = ['d', 'a', 'e', 'b', 'c'];
const ex2: Exercise = { id: '9.2', origin: 'learnerscare', type: 'matching', sectionRef: 'B', title: 'Which sentence follows?', shortName: 'Match the sentences', task: 'Link each sentence with the one that follows', instructions: 'Each ending is used once.', intro: null, recap: null,
  options: keys.map((k, i) => ({ key: k, text: pairs[i][1] })).sort((a, b) => a.key.localeCompare(b.key)),
  items: pairs.map((p, i) => ({ ...base(`9.2.${i + 1}`, i + 1, p[2], i === 0), prompt: p[0], acceptedAnswers: [keys[i]], officialAnswer: `${i + 1} → ${keys[i]}`, answerSentences: [p[1]], why: p[3] })) };
const q = (n: number, sec: string, prompt: string, cue: string, words: [string, Role][], why: string, ex = false): Item => {
  const answer = words.map((w) => w[0]).join(' ') + '?';
  return { ...base(`9.3.${n}`, n, sec, ex), prompt, cueWords: cue, acceptedAnswers: [answer], officialAnswer: answer, answerSentences: [answer], why, tiles: ex ? [] : words.map(([t, role]) => ({ t, role })), pattern: words[0][1] === 'qword' ? 'wh' : 'yesno' };
};
const ex3: Exercise = { id: '9.3', origin: 'learnerscare', type: 'buildQuestion', sectionRef: 'B', title: 'Ask the question', shortName: 'Build questions', task: 'Put be before the subject', instructions: 'Use the cue words.', intro: null, recap: null,
  patterns: [{ label: 'WITH A QUESTION WORD', slots: ['Question word', 'am / is / are', 'subject', 'verb + -ing'] }, { label: 'YES / NO QUESTION', slots: ['am / is / are', 'subject', 'verb + -ing'] }],
  items: [
    q(1, 'B', 'You look busy.', '(what / you / do?)', [['What', 'qword'], ['are', 'be'], ['you', 'subject'], ['doing', 'verb']], '', true),
    q(2, 'B', 'The children are very quiet.', '(what / they / watch?)', [['What', 'qword'], ['are', 'be'], ['they', 'subject'], ['watching', 'verb']], 'Question word, then are (for they), then the subject, then watch + ing.'),
    q(3, 'C', 'Sara has a new timetable.', '(she / study / today?)', [['Is', 'be'], ['she', 'subject'], ['studying', 'verb'], ['today', 'rest']], 'No question word: be comes first.'),
    q(4, 'B', 'I can hear the car.', '(why / he / leave?)', [['Why', 'qword'], ['is', 'be'], ['he', 'subject'], ['leaving', 'verb']], 'He → is. Leave drops the final e.'),
    q(5, 'D', 'The shop has new prices.', '(the prices / rise?)', [['Are', 'be'], ['the prices', 'subject'], ['rising', 'verb']], 'More than one price → are, and be comes first.'),
  ] };
const pn = (n: number, sec: string, prompt: string, clue: string, pol: 'positive' | 'negative', subj: string, be: string, ving: string, extra: string[], why: string, ex = false): Item => {
  const frag = (b: string) => (b.startsWith('’') ? `${subj}${b} ${ving}` : `${subj} ${b} ${ving}`);
  const accepted = [frag(be), ...extra.map(frag)];
  const i = prompt.toLowerCase().indexOf(clue.toLowerCase());
  return { ...base(`9.4.${n}`, n, sec, ex), prompt, cueWords: prompt.match(/\(([^)]*)\)/)![1], acceptedAnswers: accepted, officialAnswer: accepted.join(' / '),
    answerSentences: accepted.map((a) => prompt.replace(/______\s*\([^)]*\)/, a)), polarity: pol, clue, clueSpans: [[i, i + clue.length]], why,
    structure: pol === 'negative' ? 'subject + be + not + verb-ing' : 'subject + be + verb-ing', tiles: tiles(subj, be, ving), subjectInBlank: true };
};
const ex4: Exercise = { id: '9.4', origin: 'learnerscare', type: 'positiveNegative', sectionRef: 'B', title: 'Positive or negative?', shortName: 'Read the clue', task: 'Decide, then build the form', instructions: 'Find the clue first.', intro: null, recap: null,
  method: ['Find the clue', 'Decide: positive or negative', 'Build the form'], items: [
    pn(1, 'B', 'You can close the window. ______ (I / feel) cold.', 'You can close the window', 'positive', 'I', '’m', 'feeling', ['am'], '', true),
    pn(2, 'B', 'You can have the remote. ______ (I / watch) this programme.', 'You can have the remote', 'negative', 'I', '’m not', 'watching', ['am not'], 'If someone else can have the remote, the speaker is not watching.'),
    pn(3, 'B', 'Lena is in the garden. ______ (She / plant) flowers.', 'in the garden', 'positive', 'She', '’s', 'planting', ['is'], 'She is in the garden doing it now.'),
    pn(4, 'C', 'The office is closed this week. ______ (They / work).', 'closed this week', 'negative', 'They', 'aren’t', 'working', ['’re not', 'are not'], 'A closed office means nobody is working this week.'),
    pn(5, 'D', 'Put on a coat. ______ (It / get) colder.', 'Put on a coat', 'positive', 'It', '’s', 'getting', ['is'], 'You need a coat because a change is happening.'),
  ] };

const unit: Unit = {
  schemaVersion: 1, id: 'unit-900', number: 900, title: 'Present continuous — sample unit', subtitle: 'I am doing',
  source: { book: 'Original LearnersCare sample content', author: 'LearnersCare', edition: '-', publisher: 'LearnersCare', pages: [],
    deckCredit: 'Original sample content written for the LearnersCare engine. Not taken from any textbook.', seeAlso: [] },
  journey: [
    { id: 'warmup', kind: 'explain', title: 'Warm-up', subtitle: 'What you will learn', icon: 'spark', steps: ['sample-s01'], teaser: 'Form' },
    ...(['A', 'B', 'C', 'D'] as const).map((k) => { const s = sections.find((x) => x.key === k)!; return { id: `sec-${k}`, kind: 'explain' as const, sectionKey: k, title: s.title, subtitle: s.tagline ?? '', icon: 'letter', steps: s.steps.map((x) => x.id) }; }),
    ...[ex1, ex2, ex3, ex4].map((e) => ({ id: `ex-${e.id}`, kind: 'exercise' as const, exerciseId: e.id, title: e.shortName!, subtitle: e.task!, icon: e.type === 'gapFill' ? 'pencil' : e.type })),
    { id: 'mistakes', kind: 'mistakeHunt', title: 'Mistake Hunt', subtitle: 'Tap and fix three typical errors', icon: 'search' },
    { id: 'complete', kind: 'complete', title: 'Unit complete', subtitle: 'Your certificate', icon: 'trophy' },
  ],
  sections, guidedPractice: null, practiceIntro: [], exercises: [ex1, ex2, ex3, ex4],
  commonMistakes: [
    { id: 'M1', label: 'MISSING BE', wrong: 'The cat sleeping on the sofa.', right: 'The cat is sleeping on the sofa.', origin: 'learnerscare', audio: null },
    { id: 'M2', label: 'QUESTION ORDER', wrong: 'What they are watching?', right: 'What are they watching?', origin: 'learnerscare', audio: null },
    { id: 'M3', label: 'NEGATIVE FORM', wrong: 'I don’t watching this programme.', right: 'I’m not watching this programme.', origin: 'learnerscare', audio: null },
  ],
  mistakesStep: null, review: { step: null, rapid: null }, takeaways: { exercises: null },
  completion: { id: 'sample-done', deck: 'exercises', slide: 99, type: 'completion', eyebrow: 'LEARNERSCARE', title: 'Well done!', subtitle: 'You have completed the sample unit.', origin: 'learnerscare', voiceOver: '', blocks: [], audio: null },
};
unit.journey.forEach((n, i) => { if (!n.teaser && unit.journey[i + 1]) n.teaser = unit.journey[i + 1].title; });

/* ---------------- Talk (all turns are drafts until the owner approves them) ---------------- */
let tn = 0;
const turn = (type: Turn['type'], sec: string, canonical: string, partner: string, extra: Partial<Turn> & { accepted?: string[]; wrong?: [string, string][] } = {}): Turn => {
  const { accepted = [], wrong = [], ...rest } = extra;
  return {
    id: `S${++tn}`, type, sectionRef: sec, origin: 'learnerscare', status: 'draft', partner: { text: partner, audio: null }, prompt: {},
    target: { canonical, acceptedUtterances: accepted }, pronunciationFocus: ['contractions', 'ing'],
    hints: ['Listen again, slowly.', `It starts with “${canonical.split(' ')[0]} …”`, `Model answer: ${canonical}`, 'Listen, then say it together with your partner.'],
    feedback: { onPass: 'Great!' }, wrongExamples: wrong.map(([say, feedbackKey]) => ({ say, feedbackKey })),
    points: { base: type === 'respond' ? 20 : 12, bonusClear: 5, bonusNoHint: 3 }, next: { pass: 'sceneEnd', fail: 'retry' }, ...rest,
  };
};
const link = (ts: Turn[]) => ts.map((t, i) => ({ ...t, next: { pass: ts[i + 1]?.id ?? 'sceneEnd', fail: 'retry' } }));
const conversation: Conversation = {
  schemaVersion: 1, unitId: 'unit-900', title: 'Talk', language: 'en-GB',
  partners: [{ id: 'maya', name: 'Maya', persona: 'A cheerful friend who always calls at the right moment.', look: 'teal', voice: { rate: 0.95, pitch: 1.15 } },
    { id: 'leo', name: 'Leo', persona: 'Your easy-going flatmate. Loves cooking, hates noise.', look: 'coral', voice: { rate: 0.95, pitch: 0.85 } }],
  pronunciationFocus: [
    { id: 'contractions', label: 'Short forms', tip: 'Say I’m, he’s, she’s, they’re as one smooth sound.', pattern: "[’'](m|s|re)$" },
    { id: 'ing', label: 'Clear -ing', tip: 'Finish the verb: let the “-ing” ring at the end.', pattern: 'ing[.,?!]*$' }],
  scope: { structure: 'present continuous (am / is / are + verb-ing)', structureId: 'presentContinuous', forbiddenWords: ['did', 'was', 'will', 'would', 'had', 'went', 'yesterday', 'tomorrow', 'do', 'does'],
    periodWords: ['today', 'this week', 'this month'], changeVerbs: ['getting', 'becoming', 'improving', 'changing', 'rising', 'growing'] },
  coverage: { excluded: [] },
  scenes: [
    { id: 'S-A', title: 'At home', sectionRef: 'A', partnerId: 'leo', situation: 'Leo is looking for everyone in the flat.', teaser: 'Next: Maya calls about your week 📞', turns: link([
      turn('listenRepeat', 'A', 'She’s making soup.', 'She’s making soup.', { accepted: ['She is making soup.'] }),
      turn('readAloud', 'A', 'The baby is sleeping.', 'Shh! Read this quietly.', { accepted: ['The baby’s sleeping.'] }),
      turn('readAloud', 'B', 'He’s washing the car.', 'Where is Omar?', { accepted: ['He is washing the car.'] }),
      turn('askQuestion', 'B', 'What are you cooking?', 'Something smells wonderful in here.', { prompt: { cueWords: '(what / you / cook?)' }, target: { canonical: 'What are you cooking?', acceptedUtterances: [], pattern: { kind: 'question', open: false }, requiredTokens: [['cooking']] }, wrong: [['What you are cooking', 'wordOrder'], ['What is you cooking', 'wrongBe']], feedback: { onPass: 'Great!', recast: 'What am I cooking? Rice and beans!' } }),
      turn('respond', 'B', 'I’m reading a comic.', 'I’m cooking. What are you doing right now?', { prompt: { responseIdeas: ['I’m reading a comic.', 'I’m doing my homework.'] }, accepted: ['I am reading a comic.', 'I’m doing my homework.'], target: { canonical: 'I’m reading a comic.', acceptedUtterances: ['I am reading a comic.', 'I’m doing my homework.'], pattern: { kind: 'statement', open: true } }, wrong: [['I reading a comic', 'missingBe'], ['I am read a comic', 'noIng']], feedback: { onPass: 'Great!', recast: 'That sounds relaxing.' } }),
    ]) },
    { id: 'S-C', title: 'This week', sectionRef: 'C', partnerId: 'maya', situation: 'Maya phones to ask about your week and the weather.', teaser: 'You did it. The certificate is waiting 🏆', turns: link([
      turn('listenRepeat', 'C', 'We’re eating at home this week.', 'We’re eating at home this week.', { accepted: ['We are eating at home this week.'] }),
      turn('readAloud', 'C', 'My brother isn’t working this month.', 'How is your brother? Read this.', { accepted: ['My brother is not working this month.'], pronunciationFocus: ['ing'] }),
      turn('decide', 'C', 'They aren’t working this week.', 'Is the office open?', { prompt: { context: 'The office is closed this week.', clue: 'closed this week', cueWords: '(they / work / this week)' }, target: { canonical: 'They aren’t working this week.', acceptedUtterances: ['They’re not working this week.', 'They are not working this week.'], pattern: { kind: 'negative', open: false }, requiredTokens: [['working']] }, wrong: [['They are working this week', 'polarity'], ['They don’t working this week', 'wrongNegative']], feedback: { onPass: 'Great!', recast: 'Right, they aren’t working this week.' } }),
      turn('readAloud', 'D', 'The days are getting shorter.', 'Look outside. It is dark already.', {}),
      turn('respond', 'D', 'Yes, it’s getting colder.', 'Is the weather changing where you are?', { prompt: { responseIdeas: ['Yes, it’s getting colder.', 'Yes, the sky is getting darker.'] }, target: { canonical: 'Yes, it’s getting colder.', acceptedUtterances: ['It is getting colder.', 'Yes, the sky is getting darker.'], pattern: { kind: 'statement', open: true }, requiredTokens: [['getting', 'becoming', 'improving', 'changing', 'rising', 'growing']] }, wrong: [['Yes it getting colder', 'missingBe']], feedback: { onPass: 'Great!', recast: 'Then take a coat with you!' } }),
    ]) },
  ],
};

writeFileSync(join(dir, 'unit.json'), JSON.stringify(unit, null, 1) + '\n');
writeFileSync(join(dir, 'conversation.json'), JSON.stringify(conversation, null, 1) + '\n');
const files = ['conversation.json', 'unit.json'].map((path) => ({ path, bytes: statSync(join(dir, path)).size }));
writeFileSync(join(dir, 'files.json'), JSON.stringify({ files, totalBytes: files.reduce((n, f) => n + f.bytes, 0) }, null, 1) + '\n');
writeFileSync(join(out, 'index.json'), JSON.stringify({ units: [{ id: 'unit-900', number: 900, title: unit.title, subtitle: unit.subtitle, path: 'units/unit-900', questions: [ex1, ex2, ex3, ex4].flatMap((e) => e.items).filter((i) => !i.isExample).length, nodes: unit.journey.length }] }, null, 1) + '\n');
console.log(`sample unit written to ${dir}`);
