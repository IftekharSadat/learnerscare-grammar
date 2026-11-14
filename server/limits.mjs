/**
 * Cost and abuse controls for the LLM proxy. Pure (no network), so it is unit-tested from the app's test suite.
 * All limits are enforced server-side; nothing the browser sends can raise them.
 */
export function createLimiter(cfg, now = () => Date.now()) {
  const { dailyUsdCap, perClientPerHour, minIntervalMs, globalPerMinute, reserveUsd } = cfg;
  const clients = new Map();
  let day = '';
  let spent = 0; // settled spend today
  let reserved = 0; // worst-case cost of requests still in flight
  let minuteStart = 0;
  let minuteCount = 0;
  const today = () => new Date(now()).toISOString().slice(0, 10);
  const roll = () => { const d = today(); if (d !== day) { day = d; spent = 0; reserved = 0; } };
  return {
    /** Returns a ticket when the request may call the model, otherwise null. Reserves worst-case cost up front,
     *  so parallel requests cannot overshoot the daily cap. */
    admit(clientKey) {
      roll();
      const t = now();
      if (spent + reserved + reserveUsd > dailyUsdCap) return null;
      if (t - minuteStart >= 60_000) { minuteStart = t; minuteCount = 0; }
      if (minuteCount >= globalPerMinute) return null;
      const c = clients.get(clientKey) ?? { count: 0, windowStart: t, last: -Infinity };
      if (t - c.windowStart > 3_600_000) { c.count = 0; c.windowStart = t; }
      if (t - c.last < minIntervalMs || c.count >= perClientPerHour) return null;
      c.count++; c.last = t;
      clients.set(clientKey, c);
      if (clients.size > 5000) clients.delete(clients.keys().next().value);
      minuteCount++;
      reserved += reserveUsd;
      let settled = false;
      return { settle(actualUsd) { if (settled) return; settled = true; reserved -= reserveUsd; spent += Math.max(0, actualUsd ?? reserveUsd); } };
    },
    stats() { roll(); return { day, spent, reserved }; },
  };
}

const BANNED = /\b(address|phone number|password|surname|last name|how old|your age|where do you live|email|school name|kill|sex|drug|gun|politic|religio)\w*/i;
/** Output validation: one short, plain line or nothing. */
export function validateLine(line) {
  if (typeof line !== 'string') return null;
  const text = line.replace(/\s+/g, ' ').trim().replace(/^["“]|["”]$/g, '');
  if (!text || text.split(' ').length > 14 || text.length > 110) return null;
  if (BANNED.test(text) || !/^[A-Za-z0-9 ,.'’?!-]+$/.test(text)) return null;
  return text;
}

/** Input validation: only the five expected string fields, each length-capped. Anything else is rejected. */
export function sanitiseBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const fields = { structure: 120, scene: 20, partnerSaid: 200, learnerSaid: 200, scriptedReply: 200 };
  const out = {};
  for (const [k, max] of Object.entries(fields)) {
    const v = body[k];
    if (typeof v !== 'string') return null;
    out[k] = v.replace(/[\u0000-\u001f]/g, ' ').slice(0, max);
  }
  if (!out.scriptedReply.trim()) return null;
  return out;
}

export function originAllowed(origin, allowed) {
  if (!allowed.length) return false; // fail closed: an origin list is mandatory
  return typeof origin === 'string' && allowed.includes(origin);
}
