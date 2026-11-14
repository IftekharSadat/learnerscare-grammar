/** UI strings. English only for now; add a locale by adding a dictionary with the same keys. */
const en = {
  'app.name': 'LearnersCare',
  'nav.back': 'Back',
  'nav.map': 'Unit map',
  'nav.profile': 'Profile',
  'nav.settings': 'Settings',
  'common.next': 'Next',
  'common.continue': 'Continue',
  'common.check': 'Check',
  'common.skip': 'Skip',
  'common.hint': 'Hint',
  'common.replay': 'Replay',
  'common.start': 'Start',
  'common.done': 'Done',
  'common.tryAgain': 'Try again',
  'common.close': 'Close',
  'audio.play': 'Play narration',
  'audio.pause': 'Pause narration',
  'audio.replay': 'Replay this step',
  'audio.skip': 'Skip narration',
  'audio.speed': 'Narration speed',
  'audio.captions': 'Captions',
  'audio.tapToListen': 'Tap to listen',
  'loop.read': 'Read',
  'loop.try': 'Try',
  'loop.check': 'Check',
  'loop.understand': 'Understand',
  'item.official': 'Official answer',
  'item.officialFrom': 'from the book’s key',
  'item.exampleFrom': 'From the book’s example',
  'item.why': 'Why',
  'item.whyFrom': 'LearnersCare explanation',
  'item.spelling': 'Spelling',
  'item.example': 'Worked example',
  'item.similar': 'Try a similar one',
  'item.extra': 'Extra practice',
  'item.revisit': 'Stuck? Revisit Section {section}',
  'item.reviewLater': 'Saved to “Review later”.',
  'item.showAnswer': 'Show the answer',
  'item.typeIt': 'Type it',
  'item.useTiles': 'Use tiles',
  'item.yourAnswer': 'Your answer',
  'feedback.correct': 'Correct!',
  'feedback.almost': 'Almost!',
  'feedback.notYet': 'Not yet',
  'map.next': 'Next: {title}',
  'map.recommended': 'Recommended next',
  'map.replay': 'Play again',
  'book.panel': 'In the book',
  'book.cite': 'Text from {book}, {edition} edition, Unit {n} (p. {pages})',
  'origin.learnerscare': 'LearnersCare explanation',
  'origin.teacher': 'Teacher’s illustration — not from the book',
  'origin.generated': 'Extra practice — generated from this unit’s sentences',
} as const;

export type StringKey = keyof typeof en;
const dictionaries: Record<string, Record<StringKey, string>> = { en };
let locale = 'en';

export function setLocale(l: string) {
  if (dictionaries[l]) locale = l;
}

export function t(key: StringKey, vars?: Record<string, string | number>): string {
  let s: string = dictionaries[locale][key] ?? en[key];
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v));
  return s;
}
