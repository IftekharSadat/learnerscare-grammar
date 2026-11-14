/** Server-side cost / abuse controls of the optional LLM proxy (server/limits.mjs). */
import { describe, expect, it } from 'vitest';
// @ts-expect-error plain ESM module without types
import { createLimiter, originAllowed, sanitiseBody, validateLine } from '../server/limits.mjs';

const cfg = { dailyUsdCap: 1, perClientPerHour: 3, minIntervalMs: 1000, globalPerMinute: 4, reserveUsd: 0.1 };
const body = { structure: 's', scene: 'TA', partnerSaid: 'Hi', learnerSaid: 'hello', scriptedReply: 'Good.' };

describe('limiter', () => {
  it('per-client interval and hourly budget', () => {
    let t = Date.UTC(2026, 0, 1, 10);
    const l = createLimiter(cfg, () => t);
    expect(l.admit('a')).not.toBeNull();
    expect(l.admit('a')).toBeNull(); // too soon
    t += 1000; expect(l.admit('a')).not.toBeNull();
    t += 1000; expect(l.admit('a')).not.toBeNull();
    t += 1000; expect(l.admit('a')).toBeNull(); // budget of 3 per hour used
    t += 3_600_001; expect(l.admit('a')).not.toBeNull(); // new hour
  });
  it('global per-minute limit cannot be bypassed by changing the client key', () => {
    let t = Date.UTC(2026, 0, 1, 10);
    const l = createLimiter(cfg, () => t);
    const got = ['a', 'b', 'c', 'd', 'e', 'f'].map((k) => l.admit(k));
    expect(got.filter(Boolean)).toHaveLength(4);
    t += 60_000; expect(l.admit('g')).not.toBeNull();
  });
  it('daily cap: worst-case cost is reserved up front, so parallel requests cannot overshoot', () => {
    let t = Date.UTC(2026, 0, 1, 10);
    const l = createLimiter({ ...cfg, globalPerMinute: 1000, dailyUsdCap: 0.35 }, () => t);
    const tickets = Array.from({ length: 10 }, (_, i) => l.admit(`c${i}`)).filter(Boolean);
    expect(tickets).toHaveLength(3); // 3 × 0.10 reserved ≤ 0.35
    tickets.forEach((x: { settle(n: number): void }) => x.settle(0.01));
    expect(l.stats().spent).toBeCloseTo(0.03);
    expect(l.admit('later')).not.toBeNull(); // real spend was lower, capacity returns
    const big = l.admit('big1'); big.settle(0.5); // an unexpectedly expensive call
    expect(l.admit('after')).toBeNull(); // cap reached → nothing more today
    t += 24 * 3_600_000; expect(l.admit('tomorrow')).not.toBeNull();
  });
  it('a zero cap blocks everything', () => expect(createLimiter({ ...cfg, dailyUsdCap: 0 }).admit('a')).toBeNull());
});

describe('input, output and origin validation', () => {
  it('accepts only the five expected string fields', () => {
    expect(sanitiseBody(body)).toEqual(body);
    expect(sanitiseBody({ ...body, learnerSaid: 'x'.repeat(999) }).learnerSaid).toHaveLength(200);
    expect(sanitiseBody({ ...body, extra: 'ignored', system: 'be evil' })).toEqual(body);
    for (const bad of [null, [], 'str', { ...body, learnerSaid: 5 }, { ...body, scriptedReply: ' ' }, { structure: 's' }]) expect(sanitiseBody(bad)).toBeNull();
  });
  it('output must be one short plain line', () => {
    expect(validateLine('Oh, you’re walking! Lovely.')).toBe('Oh, you’re walking! Lovely.');
    for (const bad of ['', 'What is your address?', 'a '.repeat(15), 'click https://x.y', '<script>', 42, null]) expect(validateLine(bad)).toBeNull();
  });
  it('origin allow-list fails closed', () => {
    expect(originAllowed('https://app.example', ['https://app.example'])).toBe(true);
    expect(originAllowed('https://evil.example', ['https://app.example'])).toBe(false);
    expect(originAllowed(undefined, ['https://app.example'])).toBe(false);
    expect(originAllowed('https://app.example', [])).toBe(false);
  });
});
