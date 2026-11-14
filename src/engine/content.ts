/** Unit loader: static JSON + media, lazy per unit. */
import type { Manifest, Unit, Item, Exercise, Step } from './types';
import type { Conversation } from '@/speech/schema';
import { playable } from '@/speech/machine';

const BASE = `${import.meta.env.BASE_URL}content/`;
const cache = new Map<string, Promise<Unit>>();
let manifest: Promise<Manifest> | null = null;

export function loadManifest(): Promise<Manifest> {
  manifest ??= fetch(`${BASE}index.json`).then((r) => {
    if (!r.ok) throw new Error('Could not load the unit list.');
    return r.json();
  });
  return manifest;
}

export function unitBase(unitId: string): string {
  return `${BASE}units/${unitId}/`;
}

const conversations = new Map<string, Conversation>();
const withheld = new Map<string, { turns: number; scenes: string[] }>();
/** Talk content that exists but is not shipped in this build because it still waits for approval. */
export const talkWithheld = (unitId: string) => withheld.get(unitId) ?? { turns: 0, scenes: [] };
const env = import.meta.env as Record<string, string | boolean | undefined>;
/** Draft turns ship only in review builds (VITE_TALK_INCLUDE_DRAFTS=true) and in dev. */
export const includeDraftTurns = env.VITE_TALK_INCLUDE_DRAFTS === 'true' || env.DEV === true;

/** The unit's Talk level, already filtered to the turns that may ship. */
export const getConversation = (unitId: string): Conversation | undefined => conversations.get(unitId);

async function fetchConversation(unitId: string): Promise<Conversation | null> {
  try {
    const r = await fetch(`${unitBase(unitId)}conversation.json`);
    if (!r.ok || !(r.headers.get('content-type') ?? '').includes('json')) return null;
    const raw = (await r.json()) as Conversation;
    const conv = playable(raw, includeDraftTurns);
    const shipped = new Set(conv.scenes.map((s) => s.id));
    withheld.set(unitId, {
      turns: raw.scenes.flatMap((s) => s.turns).length - conv.scenes.flatMap((s) => s.turns).length,
      scenes: raw.scenes.filter((s) => !shipped.has(s.id)).map((s) => s.title),
    });
    return conv.scenes.length ? conv : null;
  } catch {
    return null;
  }
}

export function loadUnit(unitId: string): Promise<Unit> {
  if (!cache.has(unitId)) {
    cache.set(unitId, Promise.all([
      fetch(`${unitBase(unitId)}unit.json`).then((r) => {
        if (!r.ok) throw new Error(`Could not load ${unitId}.`);
        return r.json() as Promise<Unit>;
      }),
      fetchConversation(unitId),
    ]).then(([unit, conv]) => {
      if (!conv) return unit;
      conversations.set(unitId, conv);
      // the Talk level is a compulsory node before "Unit complete"
      const journey = [...unit.journey];
      const at = journey.findIndex((n) => n.kind === 'complete');
      const talk = { id: 'talk', kind: 'talk' as const, title: conv.title, subtitle: 'Speak with a partner — the last step', icon: 'mic', teaser: journey[at]?.title };
      if (at > 0) journey[at - 1] = { ...journey[at - 1], teaser: talk.title };
      journey.splice(at < 0 ? journey.length : at, 0, talk);
      return { ...unit, journey };
    }));
  }
  return cache.get(unitId)!;
}

export const asset = (unitId: string, src: string) => unitBase(unitId) + src;

export function allSteps(unit: Unit): Step[] {
  return unit.sections.flatMap((s) => s.steps);
}
export function findStep(unit: Unit, id: string): Step | undefined {
  return allSteps(unit).find((s) => s.id === id);
}
export function allExercises(unit: Unit): Exercise[] {
  return unit.guidedPractice ? [unit.guidedPractice, ...unit.exercises] : unit.exercises;
}
export function findExercise(unit: Unit, id: string): Exercise | undefined {
  return allExercises(unit).find((e) => e.id === id);
}
export function findItem(unit: Unit, itemId: string): { exercise: Exercise; item: Item } | undefined {
  for (const exercise of allExercises(unit)) {
    const item = exercise.items.find((i) => i.id === itemId);
    if (item) return { exercise, item };
  }
  return undefined;
}

/** Download every file of a unit into the offline cache. Returns bytes stored. */
export async function downloadUnit(unitId: string, onProgress?: (done: number, total: number) => void): Promise<number> {
  const base = unitBase(unitId);
  const list = (await (await fetch(`${base}files.json`)).json()) as { files: { path: string; bytes: number }[]; totalBytes: number };
  const cacheStore = await caches.open('unit-content');
  let done = 0;
  const queue = [...list.files, { path: 'files.json', bytes: 0 }];
  const worker = async () => {
    for (let f = queue.shift(); f; f = queue.shift()) {
      const url = base + f.path;
      if (!(await cacheStore.match(url))) await cacheStore.add(url);
      done += f.bytes;
      onProgress?.(done, list.totalBytes);
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  return list.totalBytes;
}

export async function isUnitDownloaded(unitId: string): Promise<boolean> {
  if (typeof caches === 'undefined') return false;
  const base = unitBase(unitId);
  const store = await caches.open('unit-content');
  const hit = await store.match(`${base}files.json`);
  if (!hit) return false;
  const list = (await hit.json()) as { files: { path: string }[] };
  const keys = new Set((await store.keys()).map((r) => new URL(r.url).pathname));
  return list.files.every((f) => keys.has(new URL(base + f.path, location.origin).pathname));
}

export async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
  if (!navigator.storage?.estimate) return null;
  const e = await navigator.storage.estimate();
  return { usage: e.usage ?? 0, quota: e.quota ?? 0 };
}
