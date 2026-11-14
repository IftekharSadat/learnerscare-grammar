/**
 * DialogueBrain: decides what the partner says after a turn. It never decides pass/fail — that is evaluateUtterance.
 *   ScriptedBrain  default, offline, deterministic: the authored recast / feedback line.
 *   LLMBrain       optional (VITE_LLM_PROXY_URL): asks the server proxy for a natural reply on respond / freeRolePlay turns.
 *                  Any failure, timeout or invalid line falls back to the scripted line silently.
 */
import type { Evaluation } from './evaluate';
import { FEEDBACK_COPY } from './evaluate';
import type { Conversation, Turn } from './schema';

export interface BrainReply { text: string; source: 'scripted' | 'llm' }
export interface DialogueBrain { reply(conv: Conversation, turn: Turn, heard: string, evaluation: Evaluation): Promise<BrainReply> }

export const scriptedLine = (turn: Turn, e: Evaluation): string =>
  e.gate === 'pass' ? turn.feedback.recast ?? turn.feedback.onPass : turn.feedback.onWrong?.[e.feedbackKey] ?? (e.gate === 'nearMiss' ? turn.feedback.onNearMiss ?? FEEDBACK_COPY.nearMiss : FEEDBACK_COPY[e.feedbackKey]);

export class ScriptedBrain implements DialogueBrain {
  async reply(_conv: Conversation, turn: Turn, _heard: string, e: Evaluation): Promise<BrainReply> {
    return { text: scriptedLine(turn, e), source: 'scripted' };
  }
}

const BANNED = /\b(address|phone number|password|surname|last name|how old|your age|where do you live|email|school name|kill|sex|drug|gun|politic|religio)\w*/i;
/** Code-side validation of an LLM line before it is ever shown or spoken. */
export function validatePartnerLine(line: unknown, forbiddenWords: string[] = []): string | null {
  if (typeof line !== 'string') return null;
  const text = line.replace(/\s+/g, ' ').trim();
  const words = text.split(' ').filter(Boolean);
  if (!text || words.length > 14 || text.length > 110) return null;
  if (BANNED.test(text) || /https?:|[<>{}[\]]|@/.test(text)) return null;
  if (!/^[A-Za-z0-9 ,.'’?!-]+$/.test(text)) return null;
  const lower = words.map((w) => w.toLowerCase().replace(/[^a-z’']/g, ''));
  if (forbiddenWords.some((w) => lower.includes(w))) return null; // structures not taught yet
  return text;
}

export class LLMBrain implements DialogueBrain {
  private fallback = new ScriptedBrain();
  private used = 0;
  constructor(private url: string, private budget = 12, private timeoutMs = 2500) {}
  async reply(conv: Conversation, turn: Turn, heard: string, e: Evaluation): Promise<BrainReply> {
    if (e.gate !== 'pass' || !['respond', 'freeRolePlay'].includes(turn.type) || this.used >= this.budget) return this.fallback.reply(conv, turn, heard, e);
    this.used++;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      const res = await fetch(`${this.url.replace(/\/$/, '')}/partner-line`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, signal: ctrl.signal,
        // the transcript travels as quoted data, never as instructions; nothing identifying is sent
        body: JSON.stringify({ structure: conv.scope.structure, scene: turn.id.replace(/\d+$/, ''), partnerSaid: turn.partner?.text ?? '', learnerSaid: heard.slice(0, 200), scriptedReply: turn.feedback.recast ?? turn.feedback.onPass }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const line = validatePartnerLine(((await res.json()) as { line?: unknown }).line, conv.scope.forbiddenWords);
      if (line) return { text: line, source: 'llm' };
    } catch { /* fall through to the scripted line */ } finally { clearTimeout(timer); }
    return this.fallback.reply(conv, turn, heard, e);
  }
}

export function createBrain(): DialogueBrain {
  const url = (import.meta.env as Record<string, string | undefined>).VITE_LLM_PROXY_URL;
  return url ? new LLMBrain(url) : new ScriptedBrain();
}
