/** Conversation ("Talk") content schema. Exported to schema/conversation.schema.json by `npm run schema`. */
import { z } from 'zod';

export const TurnType = z.enum(['readAloud', 'listenRepeat', 'describe', 'askQuestion', 'decide', 'respond', 'freeRolePlay']);
export const PatternKind = z.enum(['statement', 'question', 'negative', 'any']);
export const TalkClip = z.object({ src: z.string(), durationMs: z.number(), hash: z.string().optional() });

export const Turn = z.object({
  id: z.string(),
  type: TurnType,
  sectionRef: z.string(),
  origin: z.enum(['book', 'learnerscare', 'generated']),
  status: z.enum(['draft', 'approved']),
  /** exercise item this turn mirrors ("Why?" links there) */
  mirrors: z.string().optional(),
  partner: z.object({ text: z.string(), audio: TalkClip.nullable().optional(), emotion: z.enum(['smile', 'surprised', 'thinking']).optional() }).optional(),
  prompt: z.object({
    text: z.string().optional(),
    picture: z.string().optional(),
    pictureAlt: z.string().optional(),
    cueWords: z.string().optional(),
    context: z.string().optional(),
    clue: z.string().optional(),
    responseIdeas: z.array(z.string()).optional(),
  }),
  target: z.object({
    canonical: z.string().min(1),
    acceptedUtterances: z.array(z.string()),
    /** open pattern: any correct sentence of this kind passes (respond / freeRolePlay / describe) */
    pattern: z.object({ kind: PatternKind, open: z.boolean().optional() }).optional(),
    /** each entry is an any-of group: at least one word of every group must be said */
    requiredTokens: z.array(z.array(z.string())).optional(),
    forbiddenPatterns: z.array(z.string()).optional(),
    allowOutOfScope: z.boolean().optional(),
  }),
  pronunciationFocus: z.array(z.string()),
  hints: z.array(z.string()),
  feedback: z.object({ onPass: z.string(), recast: z.string().optional(), onNearMiss: z.string().optional(), onWrong: z.record(z.string(), z.string()).optional() }),
  wrongExamples: z.array(z.object({ say: z.string(), feedbackKey: z.string() })).optional(),
  points: z.object({ base: z.number(), bonusClear: z.number(), bonusNoHint: z.number() }),
  next: z.object({ pass: z.string(), fail: z.string() }),
});

export const Scene = z.object({
  id: z.string(),
  title: z.string(),
  sectionRef: z.string(),
  partnerId: z.string(),
  situation: z.string(),
  teaser: z.string(),
  finale: z.boolean().optional(),
  missions: z.array(z.object({ id: z.string(), label: z.string(), requires: PatternKind })).optional(),
  turns: z.array(Turn).min(1),
});

export const Conversation = z.object({
  schemaVersion: z.literal(1),
  unitId: z.string(),
  title: z.string(),
  language: z.string(),
  partners: z.array(z.object({ id: z.string(), name: z.string(), persona: z.string(), look: z.string(), voice: z.object({ rate: z.number(), pitch: z.number() }) })),
  pronunciationFocus: z.array(z.object({ id: z.string(), label: z.string(), tip: z.string(), pattern: z.string() })),
  scope: z.object({ structure: z.string(), /** which clause analyser the gate uses for open turns: 'presentContinuous' | 'none' */ structureId: z.string(), forbiddenWords: z.array(z.string()), periodWords: z.array(z.string()), changeVerbs: z.array(z.string()) }),
  coverage: z.object({ excluded: z.array(z.object({ text: z.string(), reason: z.string() })) }),
  nextUnitTeaser: z.string().optional(),
  scenes: z.array(Scene).min(1),
});

export type Conversation = z.infer<typeof Conversation>;
export type Scene = z.infer<typeof Scene>;
export type Turn = z.infer<typeof Turn>;
export type TurnType = z.infer<typeof TurnType>;
export type PatternKind = z.infer<typeof PatternKind>;
