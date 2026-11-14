/** Printed at every build: which Talk turns are still drafts (and therefore not shipped unless VITE_TALK_INCLUDE_DRAFTS=true). */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Conversation } from '../../src/speech/schema';

const manifest = JSON.parse(readFileSync('content/index.json', 'utf8')) as { units: { id: string; path: string }[] };
const drafts = process.env.VITE_TALK_INCLUDE_DRAFTS === 'true';
for (const u of manifest.units) {
  const file = join('content', u.path, 'conversation.json');
  if (!existsSync(file)) { console.log(`[talk] ${u.id}: no conversation.json — the unit has no Talk level`); continue; }
  const conv = JSON.parse(readFileSync(file, 'utf8')) as Conversation;
  const turns = conv.scenes.flatMap((s) => s.turns);
  const un = turns.filter((t) => t.status !== 'approved');
  console.log(`[talk] ${u.id}: ${turns.length - un.length}/${turns.length} turns approved.${un.length ? ` UNAPPROVED (${drafts ? 'INCLUDED in this review build, labelled as drafts' : 'NOT shipped in this build'}): ${un.map((t) => t.id).join(', ')}` : ''}`);
}
