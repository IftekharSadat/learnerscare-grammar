/** Stars, XP, streaks. Pure functions. */

export interface AttemptSummary {
  tries: number; // number of checks until correct (1 = first try)
  hints: number; // highest hint level used (0..3)
  revealed: boolean;
  skipped: boolean;
}

/** first try = 3★, hint or second try = 2★, revealed / many tries = 1★, skipped = 0 (goes to "Review later"). */
export function starsFor(a: AttemptSummary): 0 | 1 | 2 | 3 {
  if (a.skipped) return 0;
  if (a.revealed || a.hints >= 3) return 1;
  if (a.tries <= 1 && a.hints === 0) return 3;
  if (a.tries <= 2) return 2;
  return 1;
}

export function xpFor(stars: number, combo = 1): number {
  return Math.round(stars * 5 * Math.min(Math.max(combo, 1), 5));
}

export function nodeStars(itemStars: number[]): 0 | 1 | 2 | 3 {
  if (!itemStars.length) return 3;
  const avg = itemStars.reduce((a, b) => a + b, 0) / itemStars.length;
  return avg >= 2.6 ? 3 : avg >= 1.8 ? 2 : avg > 0 ? 1 : 0;
}

export interface Streak {
  count: number;
  lastDay: string | null; // YYYY-MM-DD (local)
  freezes: number;
  best: number;
}

export const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function dayDiff(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
}

/** Forgiving streak: one missed day is covered by a "streak freeze"; a freeze is earned every 5 days (max 2). */
export function touchStreak(s: Streak, today: string): Streak & { usedFreeze?: boolean } {
  if (s.lastDay === today) return s;
  let count = 1;
  let freezes = s.freezes;
  let usedFreeze = false;
  if (s.lastDay) {
    const gap = dayDiff(s.lastDay, today);
    if (gap === 1) count = s.count + 1;
    else if (gap === 2 && freezes > 0) {
      count = s.count + 1;
      freezes -= 1;
      usedFreeze = true;
    }
  }
  if (count > 0 && count % 5 === 0) freezes = Math.min(2, freezes + 1);
  return { count, lastDay: today, freezes, best: Math.max(s.best, count), usedFreeze };
}

export function comboMultiplier(streakCorrect: number): number {
  return Math.min(5, 1 + Math.floor(streakCorrect / 2));
}
