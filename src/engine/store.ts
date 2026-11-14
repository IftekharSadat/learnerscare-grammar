/** App state: settings + progress (Zustand), persisted through a ProgressRepository. */
import { create } from 'zustand';
import { narration } from './audio';
import { setMusicVolume, setSfxVolume } from './sfx';
import {
  defaultProgress, defaultSettings, openRepository, type Persisted, type ProgressRepository, type ProgressState,
  type Settings, type UnitProgress,
} from './progress';
import { dayKey, touchStreak, xpFor, type AttemptSummary, starsFor } from './scoring';
import { newCard, review } from './srs';

interface Store {
  hydrated: boolean;
  settings: Settings;
  progress: ProgressState;
  toast: { id: number; text: string; emoji?: string } | null;
  hydrate(repo?: ProgressRepository): Promise<void>;
  set<K extends keyof Settings>(key: K, value: Settings[K]): void;
  applyPreset(mode: Settings['mode']): void;
  setName(name: string): void;
  recordItem(unitId: string, itemId: string, a: AttemptSummary & { answer?: string; section?: string; combo?: number; scored?: boolean }): number;
  recordClue(unitId: string): void;
  completeNode(unitId: string, nodeId: string, stars: number, extra?: { bestCombo?: number; last?: boolean }): void;
  award(badge: string): void;
  reviewMistake(key: string, correct: boolean): void;
  addXp(n: number): void;
  saveTalk(unitId: string, talk: NonNullable<UnitProgress['talk']>): void;
  addMistake(key: string, section?: string, note?: string): void;
  replaceAll(data: Persisted): void;
  reset(): Promise<void>;
  say(text: string, emoji?: string): void;
}

let repo: ProgressRepository | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

const unitOf = (p: ProgressState, id: string): UnitProgress => p.units[id] ?? { nodes: {}, items: {}, cluesFound: 0 };

export function applySettings(s: Settings) {
  if (typeof document !== 'undefined') {
    const r = document.documentElement;
    r.dataset.theme = s.theme;
    r.dataset.font = s.dyslexiaFont ? 'easy' : 'default';
    r.dataset.mode = s.mode;
    r.style.setProperty('--scale', String(s.textScale * (s.mode === 'explorer' ? 1.08 : 1)));
    const reduce = s.reducedMotion === 'on' || (s.reducedMotion === 'system' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
    r.dataset.motion = reduce ? 'reduce' : 'full';
  }
  narration.setVolume(s.narrationVolume);
  narration.setRate(s.speed);
  setSfxVolume(s.effectsVolume);
  setMusicVolume(s.musicVolume);
}

export const useStore = create<Store>((set, get) => {
  const persist = () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => void repo?.save({ progress: get().progress, settings: get().settings }), 250);
  };
  const patchProgress = (fn: (p: ProgressState) => ProgressState) => {
    set((s) => ({ progress: fn(s.progress) }));
    persist();
  };
  return {
    hydrated: false,
    settings: defaultSettings(),
    progress: defaultProgress(),
    toast: null,
    async hydrate(r) {
      repo = r ?? (await openRepository());
      const data = await repo.load().catch(() => null);
      const settings = { ...defaultSettings(), ...(data?.settings ?? {}) };
      applySettings(settings);
      set({ hydrated: true, settings, progress: { ...defaultProgress(), ...(data?.progress ?? {}) } });
    },
    set(key, value) {
      const settings = { ...get().settings, [key]: value };
      applySettings(settings);
      set({ settings });
      persist();
    },
    applyPreset(mode) {
      const base = get().settings;
      const preset: Partial<Settings> =
        mode === 'explorer' ? { mascot: true, textScale: Math.max(base.textScale, 1.1), inputMode: 'tiles', advanced: false }
        : mode === 'focus' ? { mascot: false, inputMode: 'type', advanced: true }
        : { mascot: true, inputMode: 'tiles', advanced: false };
      const settings = { ...base, ...preset, mode };
      applySettings(settings);
      set({ settings });
      persist();
    },
    setName(name) {
      patchProgress((p) => ({ ...p, learnerName: name.slice(0, 40) }));
    },
    recordItem(unitId, itemId, a) {
      const stars = starsFor(a);
      const gained = a.scored === false ? Math.round(xpFor(stars) / 3) : xpFor(stars, a.combo ?? 1);
      patchProgress((p) => {
        const u = unitOf(p, unitId);
        const prev = u.items[itemId];
        const key = `${unitId}:${itemId}`;
        const mistakes = { ...p.mistakes };
        const wrong = a.tries > 1 || a.revealed;
        if (wrong && a.scored !== false && !mistakes[key]) mistakes[key] = { ...newCard(key, Date.now()), section: a.section, wrongAnswer: a.answer };
        const reviewLater = a.skipped ? [...new Set([...p.reviewLater, key])] : p.reviewLater.filter((k) => k !== key);
        const streak = touchStreak(p.streak, dayKey(new Date()));
        const badges = streak.count >= 3 && !p.badges.includes('streak-3') ? [...p.badges, 'streak-3'] : p.badges;
        return {
          ...p, xp: p.xp + gained, mistakes, reviewLater, streak, badges,
          units: {
            ...p.units,
            [unitId]: {
              ...u,
              items: {
                ...u.items,
                [itemId]: { stars: Math.max(prev?.stars ?? 0, stars), attempts: (prev?.attempts ?? 0) + 1, correct: !a.skipped, skipped: a.skipped, lastAnswer: a.answer, at: Date.now() },
              },
            },
          },
        };
      });
      return gained;
    },
    recordClue(unitId) {
      patchProgress((p) => {
        const u = unitOf(p, unitId);
        const cluesFound = u.cluesFound + 1;
        const badges = cluesFound >= 10 && !p.badges.includes('clue-detective') ? [...p.badges, 'clue-detective'] : p.badges;
        if (badges !== p.badges) get().say('Badge earned: Clue Detective', '🕵️');
        return { ...p, xp: p.xp + 2, badges, units: { ...p.units, [unitId]: { ...u, cluesFound } } };
      });
    },
    completeNode(unitId, nodeId, stars, extra) {
      patchProgress((p) => {
        const u = unitOf(p, unitId);
        const prev = u.nodes[nodeId];
        return {
          ...p,
          xp: p.xp + (prev?.done ? 0 : 10),
          units: {
            ...p.units,
            [unitId]: {
              ...u,
              completedAt: extra?.last ? (u.completedAt ?? Date.now()) : u.completedAt,
              nodes: { ...u.nodes, [nodeId]: { done: true, stars: Math.max(prev?.stars ?? 0, stars), bestCombo: Math.max(prev?.bestCombo ?? 0, extra?.bestCombo ?? 0), at: Date.now() } },
            },
          },
        };
      });
    },
    award(badge) {
      if (get().progress.badges.includes(badge)) return;
      patchProgress((p) => ({ ...p, badges: [...p.badges, badge] }));
    },
    reviewMistake(key, correct) {
      patchProgress((p) => {
        const card = p.mistakes[key];
        if (!card) return p;
        return { ...p, xp: p.xp + (correct ? 5 : 0), mistakes: { ...p.mistakes, [key]: { ...card, ...review(card, correct, Date.now()) } } };
      });
    },
    addXp(n) {
      patchProgress((p) => ({ ...p, xp: p.xp + Math.max(0, Math.round(n)) }));
    },
    saveTalk(unitId, talk) {
      patchProgress((p) => {
        const u = unitOf(p, unitId);
        const today = dayKey(new Date());
        return { ...p, streak: touchStreak(p.streak, today), talkStreak: touchStreak(p.talkStreak ?? { count: 0, lastDay: null, freezes: 1, best: 0 }, today), units: { ...p.units, [unitId]: { ...u, talk } } };
      });
    },
    addMistake(key, section, note) {
      patchProgress((p) => (p.mistakes[key] ? p : { ...p, mistakes: { ...p.mistakes, [key]: { ...newCard(key, Date.now()), section, wrongAnswer: note } } }));
    },
    replaceAll(data) {
      applySettings(data.settings);
      set({ progress: data.progress, settings: data.settings });
      persist();
    },
    async reset() {
      await repo?.clear();
      const settings = defaultSettings();
      applySettings(settings);
      set({ progress: defaultProgress(), settings });
    },
    say(text, emoji) {
      const id = Date.now();
      set({ toast: { id, text, emoji } });
      setTimeout(() => get().toast?.id === id && set({ toast: null }), 3200);
    },
  };
});

export const unitProgress = (p: ProgressState, unitId: string): UnitProgress => unitOf(p, unitId);
