/**
 * Progress persistence behind a small repository interface, so cloud sync / accounts can be added later
 * without touching the UI. Default: IndexedDB, with a localStorage fallback.
 */
import type { Card } from './srs';
import type { Streak } from './scoring';

export interface ItemProgress {
  stars: number;
  attempts: number;
  correct: boolean;
  skipped: boolean;
  lastAnswer?: string;
  at: number;
}
export interface NodeProgress {
  done: boolean;
  stars: number;
  bestCombo?: number;
  at: number;
}
export interface UnitProgress {
  nodes: Record<string, NodeProgress>;
  items: Record<string, ItemProgress>;
  cluesFound: number;
  completedAt?: number;
  /** Talk level snapshot (resume after reload) */
  talk?: { state: unknown; mode: 'speak' | 'type'; done: boolean; at: number; summary?: unknown };
}
export interface ProgressState {
  version: 1;
  learnerName: string;
  xp: number;
  streak: Streak;
  units: Record<string, UnitProgress>;
  mistakes: Record<string, Card & { section?: string; wrongAnswer?: string }>;
  reviewLater: string[];
  badges: string[];
  talkStreak?: Streak;
}
export interface Settings {
  mode: 'explorer' | 'classic' | 'focus';
  theme: 'light' | 'dark' | 'contrast';
  textScale: number;
  dyslexiaFont: boolean;
  reducedMotion: 'system' | 'on' | 'off';
  narrationVolume: number;
  effectsVolume: number;
  musicVolume: number;
  captions: boolean;
  speed: number;
  mascot: boolean;
  inputMode: 'tiles' | 'type';
  advanced: boolean;
  hintLanguage: 'off' | 'bn';
  autoplay: boolean;
}
export interface Persisted {
  progress: ProgressState;
  settings: Settings;
}

export const defaultProgress = (): ProgressState => ({
  version: 1, learnerName: '', xp: 0, streak: { count: 0, lastDay: null, freezes: 1, best: 0 },
  units: {}, mistakes: {}, reviewLater: [], badges: [],
});
export const defaultSettings = (): Settings => ({
  mode: 'classic', theme: 'light', textScale: 1, dyslexiaFont: false, reducedMotion: 'system',
  narrationVolume: 1, effectsVolume: 0.7, musicVolume: 0, captions: true, speed: 1, mascot: true,
  inputMode: 'tiles', advanced: false, hintLanguage: 'off', autoplay: true,
});

export interface ProgressRepository {
  load(): Promise<Persisted | null>;
  save(data: Persisted): Promise<void>;
  clear(): Promise<void>;
}

const KEY = 'learnerscare:v1';

export class LocalStorageRepository implements ProgressRepository {
  async load() {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? (JSON.parse(raw) as Persisted) : null;
    } catch {
      return null;
    }
  }
  async save(data: Persisted) {
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch {
      /* storage full or blocked: progress stays in memory */
    }
  }
  async clear() {
    localStorage.removeItem(KEY);
  }
}

export class IndexedDbRepository implements ProgressRepository {
  private db: Promise<IDBDatabase>;
  constructor(name = 'learnerscare') {
    this.db = new Promise((resolve, reject) => {
      const req = indexedDB.open(name, 1);
      req.onupgradeneeded = () => req.result.createObjectStore('kv');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  private async tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await this.db;
    return new Promise((resolve, reject) => {
      const req = fn(db.transaction('kv', mode).objectStore('kv'));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async load() {
    return ((await this.tx('readonly', (s) => s.get(KEY))) as Persisted | undefined) ?? null;
  }
  async save(data: Persisted) {
    await this.tx('readwrite', (s) => s.put(data, KEY));
  }
  async clear() {
    await this.tx('readwrite', (s) => s.delete(KEY));
  }
}

/** IndexedDB when available and working, otherwise localStorage. */
export async function openRepository(): Promise<ProgressRepository> {
  if (typeof indexedDB !== 'undefined') {
    try {
      const repo = new IndexedDbRepository();
      await repo.load();
      return repo;
    } catch {
      /* fall through */
    }
  }
  return new LocalStorageRepository();
}

export function exportProgress(data: Persisted): string {
  return JSON.stringify({ app: 'learnerscare', exportedAt: new Date().toISOString(), ...data }, null, 1);
}

export function importProgress(json: string): Persisted {
  const data = JSON.parse(json) as Partial<Persisted> & { app?: string };
  if (data.app !== 'learnerscare' || !data.progress || data.progress.version !== 1) throw new Error('This file is not a LearnersCare progress export.');
  return { progress: { ...defaultProgress(), ...data.progress }, settings: { ...defaultSettings(), ...(data.settings ?? {}) } };
}
