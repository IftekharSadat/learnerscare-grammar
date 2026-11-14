/** Mistake bank scheduling: Leitner boxes with an SM-2-style ease factor ("SM-2-lite"). Pure functions. */

export interface Card {
  key: string; // unitId:itemId
  box: number; // 1..5
  ease: number; // 1.3..2.8
  due: number; // epoch ms
  reps: number;
  lapses: number;
}

export const BOX_DAYS = [0, 0, 1, 3, 7, 14];
const DAY = 86400000;

export function newCard(key: string, now: number): Card {
  return { key, box: 1, ease: 2.5, due: now, reps: 0, lapses: 1 };
}

export function review(card: Card, correct: boolean, now: number): Card {
  if (!correct) return { ...card, box: 1, ease: Math.max(1.3, card.ease - 0.2), due: now, reps: card.reps + 1, lapses: card.lapses + 1 };
  const box = Math.min(5, card.box + 1);
  const ease = Math.min(2.8, card.ease + 0.05);
  const days = Math.max(1, Math.round((BOX_DAYS[box] * ease) / 2.5));
  return { ...card, box, ease, due: now + days * DAY, reps: card.reps + 1 };
}

export function dueCards(cards: Card[], now: number, limit = 10): Card[] {
  return cards.filter((c) => c.due <= now).sort((a, b) => a.box - b.box || a.due - b.due).slice(0, limit);
}

export const mastered = (c: Card) => c.box >= 5;
