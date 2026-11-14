/**
 * Dialogue state machine for the Talk level. Pure reducer: (state, event) → state.
 * Guarantees: a turn can always be left (pass, shadow pass after three tries, or "continue later"),
 * the level always terminates, and the snapshot is JSON-serialisable for resume.
 */
import type { Evaluation } from './evaluate';
import type { Conversation, Scene, Turn } from './schema';

export type TalkMode = 'speak' | 'type';
export interface TurnResult { passed: boolean; stars: number; clarity: number | null; tries: number; hints: number; mode: TalkMode; shadow: boolean; points: number; weakWords: string[]; firstTry: boolean }
export interface TalkState {
  sceneIndex: number;
  turnIndex: number;
  phase: 'intro' | 'turn' | 'verdict' | 'sceneDone' | 'done';
  tries: number;
  nearMisses: number;
  hintLevel: number;
  offerShadow: boolean;
  passedNow: boolean;
  combo: number;
  bestCombo: number;
  results: Record<string, TurnResult>;
  missions: Record<string, boolean>;
  lastKey: string | null;
  /** feedback keys of missed attempts (for the grammar feedback summary) */
  missed?: Record<string, number>;
}
export type TalkEvent =
  | { type: 'start' }
  | { type: 'heard'; evaluation: Evaluation; mode: TalkMode }
  | { type: 'hint' }
  | { type: 'shadowPass'; mode: TalkMode }
  | { type: 'retry' }
  | { type: 'next' }
  | { type: 'nextScene' };
export interface MachineOptions { strictness: 'explorer' | 'classic' | 'focus' }

export const MAX_HINT = 4;
export const TRIES_BEFORE_SHADOW = 3;

/** Only approved turns ship (drafts are included for review builds); scenes left without turns are dropped. */
export function playable(conv: Conversation, includeDrafts: boolean): Conversation {
  const scenes = conv.scenes
    .map((s) => ({ ...s, turns: s.turns.filter((t) => includeDrafts || t.status === 'approved') }))
    .filter((s) => s.turns.length > 0)
    .map((s) => ({ ...s, missions: s.missions?.filter((m) => s.turns.some((t) => (t.target.pattern?.kind ?? 'any') === m.requires || t.target.pattern?.kind === 'any')) }));
  return { ...conv, scenes };
}

export const initialState = (): TalkState => ({
  sceneIndex: 0, turnIndex: 0, phase: 'intro', tries: 0, nearMisses: 0, hintLevel: 0, offerShadow: false, passedNow: false,
  combo: 0, bestCombo: 0, results: {}, missions: {}, lastKey: null,
});

export const currentScene = (conv: Conversation, s: TalkState): Scene => conv.scenes[Math.min(s.sceneIndex, conv.scenes.length - 1)];
export const currentTurn = (conv: Conversation, s: TalkState): Turn => {
  const scene = currentScene(conv, s);
  return scene.turns[Math.min(s.turnIndex, scene.turns.length - 1)];
};

export function starsFor(r: { tries: number; hints: number; clarity: number | null; mode: TalkMode; shadow: boolean }): number {
  if (r.shadow) return 1;
  if (r.mode === 'type') return r.tries <= 1 && r.hints === 0 ? 2 : 1; // no clarity star in Type mode
  if (r.tries <= 1 && r.hints === 0 && (r.clarity ?? 0) >= 0.8) return 3;
  if (r.tries <= 2 && r.hints <= 1) return 2;
  return 1;
}

function record(conv: Conversation, s: TalkState, e: Evaluation | null, mode: TalkMode, shadow: boolean): TalkState {
  const turn = currentTurn(conv, s);
  const scene = currentScene(conv, s);
  const tries = s.tries + 1;
  const clarity = mode === 'speak' && e && !shadow ? e.pronunciationScore : null;
  const firstTry = !shadow && tries === 1 && s.hintLevel === 0;
  const combo = firstTry ? s.combo + 1 : 0;
  const stars = starsFor({ tries, hints: s.hintLevel, clarity, mode, shadow });
  const mult = 1 + Math.min(4, Math.max(0, combo - 1)) * 0.25;
  const raw = turn.points.base + (clarity !== null && clarity >= 0.8 ? turn.points.bonusClear : 0) + (s.hintLevel === 0 && !shadow ? turn.points.bonusNoHint : 0);
  const points = Math.round((shadow ? turn.points.base * 0.3 : mode === 'type' ? raw * 0.7 : raw) * (shadow ? 1 : mult));
  const prev = s.results[turn.id];
  const weakWords = e ? e.alignment.filter((w) => w.status !== 'clear').map((w) => w.word.replace(/[.,?!]/g, '')) : shadow ? turn.target.canonical.split(' ').filter((w) => /ing\b|[’']/.test(w)).map((w) => w.replace(/[.,?!]/g, '')) : [];
  const missions = { ...s.missions };
  if (scene.missions && e?.heardKind) {
    const open = scene.missions.find((m) => !missions[m.id] && (m.requires === e.heardKind || m.requires === 'any'));
    if (open) missions[open.id] = true;
  }
  return {
    ...s, phase: 'verdict', passedNow: true, tries, offerShadow: false, combo, bestCombo: Math.max(s.bestCombo, combo), missions, lastKey: shadow ? 'shadow' : e?.feedbackKey ?? null,
    results: { ...s.results, [turn.id]: { passed: true, stars: Math.max(stars, prev?.stars ?? 0), clarity, tries, hints: s.hintLevel, mode, shadow, points: Math.max(points, prev?.points ?? 0), weakWords, firstTry } },
  };
}

export function reduce(conv: Conversation, s: TalkState, ev: TalkEvent, opts: MachineOptions = { strictness: 'classic' }): TalkState {
  switch (ev.type) {
    case 'start':
      return s.phase === 'intro' ? { ...s, phase: 'turn' } : s;
    case 'hint':
      return s.phase === 'turn' || (s.phase === 'verdict' && !s.passedNow) ? { ...s, phase: 'turn', hintLevel: Math.min(MAX_HINT, s.hintLevel + 1) } : s;
    case 'heard': {
      if (s.phase !== 'turn') return s;
      const e = ev.evaluation;
      const nearOk = e.gate === 'nearMiss' && (opts.strictness === 'explorer' || (opts.strictness === 'classic' && s.nearMisses >= 1));
      if (e.gate === 'pass' || nearOk) return record(conv, s, e, ev.mode, false);
      const tries = s.tries + 1;
      return { ...s, phase: 'verdict', passedNow: false, tries, nearMisses: s.nearMisses + (e.gate === 'nearMiss' ? 1 : 0), combo: 0, lastKey: e.feedbackKey, offerShadow: tries >= TRIES_BEFORE_SHADOW,
        missed: { ...(s.missed ?? {}), [e.feedbackKey]: ((s.missed ?? {})[e.feedbackKey] ?? 0) + 1 } };
    }
    case 'retry':
      return s.phase === 'verdict' && !s.passedNow ? { ...s, phase: 'turn' } : s;
    case 'shadowPass':
      return s.offerShadow || s.hintLevel >= MAX_HINT ? record(conv, { ...s, phase: 'turn' }, null, ev.mode, true) : s;
    case 'next': {
      if (s.phase !== 'verdict' || !s.passedNow) return s;
      const scene = currentScene(conv, s);
      const base = { ...s, tries: 0, nearMisses: 0, hintLevel: 0, offerShadow: false, passedNow: false, lastKey: null };
      if (s.turnIndex + 1 < scene.turns.length) return { ...base, turnIndex: s.turnIndex + 1, phase: 'turn' };
      return { ...base, phase: 'sceneDone' };
    }
    case 'nextScene':
      if (s.phase !== 'sceneDone') return s;
      if (s.sceneIndex + 1 < conv.scenes.length) return { ...s, sceneIndex: s.sceneIndex + 1, turnIndex: 0, phase: 'intro', missions: {} };
      return { ...s, phase: 'done' };
  }
}

export function sceneStars(scene: Scene, s: TalkState): number {
  const rs = scene.turns.map((t) => s.results[t.id]?.stars ?? 0);
  const avg = rs.reduce((a, b) => a + b, 0) / Math.max(1, rs.length);
  return avg >= 2.5 ? 3 : avg >= 1.7 ? 2 : avg > 0 ? 1 : 0;
}

export interface TalkSummary { turns: number; passed: number; firstTry: number; clarityAvg: number | null; points: number; stars: number; weakWords: string[]; bestCombo: number; typed: number; shadow: number; issues: { key: string; count: number }[] }
export function summarise(conv: Conversation, s: TalkState): TalkSummary {
  const turns = conv.scenes.flatMap((sc) => sc.turns);
  const rs = turns.map((t) => s.results[t.id]).filter(Boolean);
  const clar = rs.map((r) => r.clarity).filter((c): c is number => c !== null);
  const counts: Record<string, number> = {};
  for (const r of rs) for (const w of r.weakWords) counts[w.toLowerCase()] = (counts[w.toLowerCase()] ?? 0) + 1;
  return {
    turns: turns.length, passed: rs.filter((r) => r.passed).length, firstTry: rs.filter((r) => r.firstTry).length,
    clarityAvg: clar.length ? Math.round((clar.reduce((a, b) => a + b, 0) / clar.length) * 100) / 100 : null,
    points: rs.reduce((a, r) => a + r.points, 0), stars: rs.reduce((a, r) => a + r.stars, 0),
    weakWords: Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([w]) => w), bestCombo: s.bestCombo,
    typed: rs.filter((r) => r.mode === 'type').length, shadow: rs.filter((r) => r.shadow).length,
    issues: Object.entries(s.missed ?? {}).filter(([k]) => !['silence', 'offTopic', 'partial'].includes(k)).map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count).slice(0, 4),
  };
}

export const isComplete = (conv: Conversation, s: TalkState) => s.phase === 'done' || conv.scenes.every((sc) => sc.turns.every((t) => s.results[t.id]?.passed));
