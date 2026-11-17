/** Unit content schema (Zod). `npm run schema` exports it to schema/unit.schema.json. Not imported by the app bundle. */
import { z } from 'zod';

export const Origin = z.enum(['book', 'learnerscare', 'generated']);
const Role = z.enum(['subject', 'be', 'verb', 'qword', 'rest', 'not', '']);

export const Cue = z.object({
  tMs: z.number().int().nonnegative(),
  targetShapeId: z.number().int(),
  targetName: z.string(),
  effect: z.string(),
});
export const Caption = z.object({ tMs: z.number(), endMs: z.number(), text: z.string() });
export const Clip = z.object({
  src: z.string().regex(/^audio\/.+\.(mp3|opus)$/),
  durationMs: z.number().int().positive(),
  cues: z.array(Cue).optional(),
  captions: z.array(Caption).optional(),
});
export const Run = z.object({ t: z.string(), role: Role.optional() });
export const Line = z.object({ name: z.string(), text: z.string(), runs: z.array(Run).optional(), group: z.string().optional() });
export const Media = z.object({ src: z.string().regex(/^media\/.+\.(svg|png)$/), alt: z.string(), kind: z.enum(['illustration', 'icon']) });
export const Block = z.object({
  id: z.number().int(),
  name: z.string(),
  lines: z.array(Line),
  cueMs: z.number().nullable(),
  exitMs: z.number().nullable(),
  box: z.array(z.number()).length(4).optional(),
  media: z.array(Media).optional(),
});
export const StepType = z.enum([
  'situation', 'form', 'contractions', 'build', 'example', 'compare', 'timeline', 'periods', 'changeVerbs', 'summary',
  'title', 'overview', 'practice', 'practiceAnswers', 'speaking',
  'briefing', 'exerciseIntro', 'exerciseRecap', 'mistakes', 'review', 'takeaways', 'completion',
]);
export const Step = z.object({
  id: z.string(),
  deck: z.enum(['explain', 'exercises']),
  slide: z.number().int(),
  type: StepType,
  eyebrow: z.string(),
  title: z.string(),
  subtitle: z.string(),
  origin: Origin,
  voiceOver: z.string(),
  deliveryNotes: z.string().optional(),
  blocks: z.array(Block),
  audio: Clip.nullable(),
});
export const BookLine = z.object({
  text: z.string().min(1),
  kind: z.enum(['rule', 'example', 'table']),
  cells: z.array(z.string()).optional(),
  origin: z.literal('book'),
});
export const Section = z.object({
  key: z.string(),
  title: z.string(),
  tagline: z.string().optional(),
  kind: z.string(),
  steps: z.array(Step),
  book: z.array(BookLine),
});
export const Tile = z.object({ t: z.string(), role: Role });
export const ItemAudio = z.object({ question: Clip.nullable(), answer: Clip.nullable(), pauseMs: z.number() });
export const Item = z.object({
  id: z.string(),
  number: z.number().int(),
  isExample: z.boolean(),
  origin: Origin,
  prompt: z.string().min(1),
  cueWords: z.string().optional(),
  verb: z.string().optional(),
  acceptedAnswers: z.array(z.string().min(1)).min(1),
  officialAnswer: z.string().min(1),
  answerSentences: z.array(z.string()).optional(),
  why: z.string(),
  clue: z.string().optional(),
  clueSpans: z.array(z.tuple([z.number(), z.number()])).optional(),
  polarity: z.enum(['positive', 'negative']).optional(),
  structure: z.string().optional(),
  pattern: z.enum(['wh', 'yesno']).optional(),
  spellingNote: z.string().optional(),
  tiles: z.array(Tile).optional(),
  subjectInBlank: z.boolean().optional(),
  picture: Media.nullable().optional(),
  hints: z.object({ bn: z.string() }),
  audio: ItemAudio,
  mapsToSection: z.string().optional(),
  mapReason: z.string().optional(),
  slide: z.number().optional(),
});
export const ExerciseType = z.string();
export const Exercise = z.object({
  id: z.string(),
  origin: Origin,
  type: ExerciseType,
  sectionRef: z.string().nullable(),
  title: z.string(),
  shortName: z.string().optional(),
  task: z.string().optional(),
  instructions: z.string(),
  intro: Step.nullable(),
  recap: Step.nullable(),
  items: z.array(Item),
  verbBank: z.array(z.string()).optional(),
  bankNote: z.string().optional(),
  usedInExample: z.array(z.string()).optional(),
  options: z.array(z.object({ key: z.string(), text: z.string() })).optional(),
  patterns: z.array(z.object({ label: z.string(), slots: z.array(z.string()) })).optional(),
  method: z.array(z.string()).optional(),
});
export const Mistake = z.object({
  id: z.string(), label: z.string(), wrong: z.string(), right: z.string(), origin: z.literal('learnerscare'), audio: Clip.nullable(),
});
export const RapidItem = z.object({
  id: z.string(), ref: z.string().nullable(), prompt: z.string(), answer: z.string(), origin: Origin, audio: ItemAudio,
});
export const JourneyNode = z.object({
  id: z.string(),
  kind: z.enum(['explain', 'checkpoint', 'exercise', 'mistakeHunt', 'rapidReview', 'talk', 'complete']),
  title: z.string(),
  subtitle: z.string(),
  icon: z.string(),
  teaser: z.string().optional(),
  sectionKey: z.string().optional(),
  exerciseId: z.string().nullable().optional(),
  steps: z.array(z.string()).optional(),
});
export const Unit = z.object({
  schemaVersion: z.literal(1),
  id: z.string().regex(/^unit-\d{3}$/),
  number: z.number().int().positive(),
  title: z.string().min(1),
  subtitle: z.string(),
  source: z.object({
    book: z.string(), author: z.string(), edition: z.string(), publisher: z.string(),
    pages: z.array(z.number()), deckCredit: z.string(), seeAlso: z.array(z.string()),
  }),
  journey: z.array(JourneyNode).min(1),
  sections: z.array(Section),
  guidedPractice: Exercise.nullable(),
  practiceIntro: z.array(Step),
  exercises: z.array(Exercise),
  commonMistakes: z.array(Mistake),
  mistakesStep: Step.nullable(),
  review: z.object({
    step: Step.nullable(),
    rapid: z.object({ title: z.string(), subtitle: z.string(), intro: Clip.nullable(), items: z.array(RapidItem) }).nullable(),
  }),
  takeaways: z.object({ exercises: Step.nullable() }),
  completion: Step.nullable(),
});
export const Manifest = z.object({
  units: z.array(z.object({
    id: z.string(), number: z.number(), title: z.string(), subtitle: z.string(), path: z.string(),
    questions: z.number(), nodes: z.number(),
  })),
  /** optional link back to the operator's own website, shown in the app header */
  site: z.object({ label: z.string().min(1).max(40), url: z.string().url() }).optional(),
});
