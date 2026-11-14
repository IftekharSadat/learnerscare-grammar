import { describe, expect, it } from 'vitest';
import { CueScheduler, cueStateAt } from '../src/engine/cueScheduler';
import { comboMultiplier, nodeStars, starsFor, touchStreak, xpFor } from '../src/engine/scoring';
import { dueCards, newCard, review } from '../src/engine/srs';
import { ingForm, ingMisspellings, personOf, spellingRule } from '../src/engine/spelling';
import { exportProgress, importProgress, defaultProgress, defaultSettings } from '../src/engine/progress';

const cues = [
  { tMs: 0, targetShapeId: 5, targetName: 'Pause tag', effect: 'enter' },
  { tMs: 14485, targetShapeId: 5, targetName: 'Pause tag', effect: 'exit' },
  { tMs: 14485, targetShapeId: 9, targetName: 'Official answer', effect: 'enter' },
  { tMs: 19855, targetShapeId: 10, targetName: 'Why', effect: 'enter' },
  { tMs: 27805, targetShapeId: 12, targetName: 'Spelling note', effect: 'enter' },
];

describe('cue scheduler', () => {
  it('derives visibility from time', () => {
    expect([...cueStateAt(cues, 100).visible]).toEqual([5]);
    expect([...cueStateAt(cues, 14485).visible]).toEqual([9]);
    expect([...cueStateAt(cues, 20000).visible]).toEqual([9, 10]);
    expect(cueStateAt(cues, 20000).current).toBe(10);
  });
  it('fires on the right frame, survives pause, seek back, and speed changes', () => {
    let t = 0;
    const seen: number[][] = [];
    const frames: (() => void)[] = [];
    const s = new CueScheduler(cues, () => t, (st) => seen.push([...st.visible]), { request: (cb) => frames.push(cb), cancel: () => {} });
    s.start();
    expect(seen).toEqual([[5]]);
    t = 14000; frames.pop()!();
    expect(seen.length).toBe(1); // nothing new yet
    t = 14490; frames.pop()!();
    expect(seen[seen.length - 1]).toEqual([9]);
    // paused: clock stands still, repeated sync does not re-fire
    frames.pop()!(); frames.pop()!();
    expect(seen.length).toBe(2);
    // jump forward (speed change / background tab): several cues at once
    t = 30000; s.sync();
    expect(seen[seen.length - 1]).toEqual([9, 10, 12]);
    // seek back: state is recomputed, later elements disappear again
    t = 15000; s.sync();
    expect(seen[seen.length - 1]).toEqual([9]);
    s.finish();
    expect(seen[seen.length - 1]).toEqual([9, 10, 12]);
  });
});

describe('scoring', () => {
  it('stars', () => {
    expect(starsFor({ tries: 1, hints: 0, revealed: false, skipped: false })).toBe(3);
    expect(starsFor({ tries: 1, hints: 1, revealed: false, skipped: false })).toBe(2);
    expect(starsFor({ tries: 2, hints: 0, revealed: false, skipped: false })).toBe(2);
    expect(starsFor({ tries: 1, hints: 3, revealed: true, skipped: false })).toBe(1);
    expect(starsFor({ tries: 4, hints: 0, revealed: false, skipped: false })).toBe(1);
    expect(starsFor({ tries: 0, hints: 0, revealed: false, skipped: true })).toBe(0);
  });
  it('xp, node stars, combo', () => {
    expect(xpFor(3)).toBe(15);
    expect(xpFor(3, 3)).toBe(45);
    expect(nodeStars([3, 3, 2])).toBe(3);
    expect(nodeStars([2, 2, 1])).toBe(1);
    expect(nodeStars([2, 2, 2])).toBe(2);
    expect(comboMultiplier(0)).toBe(1);
    expect(comboMultiplier(4)).toBe(3);
    expect(comboMultiplier(40)).toBe(5);
  });
  it('streak with forgiving freeze', () => {
    let s = touchStreak({ count: 0, lastDay: null, freezes: 1, best: 0 }, '2026-01-01');
    expect(s.count).toBe(1);
    s = touchStreak(s, '2026-01-01');
    expect(s.count).toBe(1);
    s = touchStreak(s, '2026-01-02');
    expect(s.count).toBe(2);
    s = touchStreak(s, '2026-01-04'); // missed one day: freeze covers it
    expect(s.count).toBe(3);
    expect(s.freezes).toBe(0);
    s = touchStreak(s, '2026-01-07'); // missed two days, no freeze left
    expect(s.count).toBe(1);
    expect(s.best).toBe(3);
  });
});

describe('srs', () => {
  it('moves up boxes when correct and resets on a lapse', () => {
    const now = 1_000_000;
    let c = newCard('unit-001:1.1.2', now);
    expect(dueCards([c], now)).toHaveLength(1);
    c = review(c, true, now);
    expect(c.box).toBe(2);
    expect(c.due).toBeGreaterThan(now);
    expect(dueCards([c], now)).toHaveLength(0);
    c = review(c, true, c.due);
    expect(c.box).toBe(3);
    const lapsed = review(c, false, c.due);
    expect(lapsed.box).toBe(1);
    expect(lapsed.ease).toBeLessThan(c.ease);
    expect(lapsed.lapses).toBe(2);
  });
});

describe('spelling', () => {
  it('ing forms from the unit', () => {
    const pairs = { tie: 'tying', hide: 'hiding', take: 'taking', wave: 'waving', scratch: 'scratching', cross: 'crossing', get: 'getting', begin: 'beginning', study: 'studying', cry: 'crying', lie: 'lying', sit: 'sitting', see: 'seeing' };
    for (const [b, i] of Object.entries(pairs)) expect(ingForm(b)).toBe(i);
  });
  it('misspellings never include the right form', () => {
    for (const b of ['tie', 'hide', 'take', 'wave', 'scratch', 'cross', 'get']) expect(ingMisspellings(b)).not.toContain(ingForm(b));
    expect(ingMisspellings('tie')).toContain('tieing');
    expect(ingMisspellings('hide')).toContain('hideing');
  });
  it('rules and persons', () => {
    expect(spellingRule('tie')).toMatch(/ie changes to y/);
    expect(spellingRule('hide')).toMatch(/drop the final e/);
    expect(personOf('I')).toBe('i');
    expect(personOf('The children')).toBe('pl');
    expect(personOf('Paul and Sarah')).toBe('pl');
    expect(personOf('The weather')).toBe('sg');
    expect(personOf('Tim')).toBe('sg');
    for (const pl of ['The days', 'the prices', 'My parents', 'Those dark clouds', 'Our neighbours']) expect(personOf(pl), pl).toBe('pl');
    for (const sg of ['Chris', 'The bus', 'The news', 'My class', 'The population of the world', 'The company', 'Your English', 'The weather', 'James']) expect(personOf(sg), sg).toBe('sg');
  });
});

describe('progress export / import', () => {
  it('round-trips and rejects foreign files', () => {
    const data = { progress: { ...defaultProgress(), xp: 42, learnerName: 'Amina' }, settings: defaultSettings() };
    const back = importProgress(exportProgress(data));
    expect(back.progress.xp).toBe(42);
    expect(back.progress.learnerName).toBe('Amina');
    expect(() => importProgress('{"foo":1}')).toThrow();
  });
});
