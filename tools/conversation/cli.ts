/**
 * npm run conversation -- --unit 001 [--content content] [--draft] [--approve-all]
 *
 * 1. If the unit has no conversation.json (or --draft), writes a template draft from unit.json.
 * 2. Runs the blocking validators, writes conversation-review.md (in the unit folder) and the coverage doc.
 * 3. Generates partner audio when a provider is configured (PARTNER_TTS_CMD), cached by content hash.
 * 4. Prints the turns that still wait for approval. Exit code 1 on validation errors.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Unit } from '../../src/engine/types';
import type { Conversation } from '../../src/speech/schema';
import { coverageMarkdown, draftConversation, reviewMarkdown, validateConversation } from './lib';

const args = process.argv.slice(2);
const opt = (name: string, def?: string) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : def; };
const flag = (name: string) => args.includes(`--${name}`);
const unitId = `unit-${String(Number(opt('unit', '1'))).padStart(3, '0')}`;
const content = opt('content', 'content')!;
const dir = join(content, 'units', unitId);
const unit = JSON.parse(readFileSync(join(dir, 'unit.json'), 'utf8')) as Unit;
const file = join(dir, 'conversation.json');

if (!existsSync(file) || flag('draft')) {
  writeFileSync(file, JSON.stringify(draftConversation(unit), null, 1) + '\n');
  console.log(`drafted ${file} from templates — review it before approving`);
}
const conv = JSON.parse(readFileSync(file, 'utf8')) as Conversation;
if (flag('approve-all')) { // for automated tests only
  for (const s of conv.scenes) for (const t of s.turns) t.status = 'approved';
  writeFileSync(file, JSON.stringify(conv, null, 1) + '\n');
}

// partner audio (optional provider): PARTNER_TTS_CMD='mytts --voice {voice} --text {text} --out {out}'
const provider = process.env.PARTNER_TTS_CMD;
let generated = 0;
if (provider) {
  mkdirSync(join(dir, 'talk'), { recursive: true });
  for (const s of conv.scenes) for (const t of s.turns) {
    if (!t.partner) continue;
    const hash = createHash('sha256').update(`${s.partnerId}|${t.partner.text}`).digest('hex').slice(0, 16);
    const rel = `talk/${hash}.mp3`;
    const out = join(dir, rel);
    if (!existsSync(out)) {
      const tmp = join(dir, 'talk', `${hash}.raw`);
      // No shell: the command template comes only from the operator's environment (PARTNER_TTS_CMD), it is split into
      // argv once, and the line text / voice / path are passed as single arguments, so content can never inject commands.
      const [bin, ...argv] = provider.trim().split(/\s+/).map((a) => a.replace('{voice}', s.partnerId).replace('{text}', t.partner!.text).replace('{out}', tmp));
      execFileSync(bin, argv, { stdio: 'inherit', shell: false });
      // match the unit narration: trim silence, loudness-normalise, 128 kbps mono
      execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', tmp, '-af', 'silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse,loudnorm=I=-16:TP=-1.5:LRA=11',
        '-ar', '44100', '-ac', '1', '-c:a', 'libmp3lame', '-b:a', '128k', '-map_metadata', '-1', out]);
      generated++;
    }
    const durationMs = Math.round(Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', out], { encoding: 'utf8' })) * 1000);
    t.partner.audio = { src: rel, durationMs, hash };
  }
  writeFileSync(file, JSON.stringify(conv, null, 1) + '\n');
}

const v = validateConversation(unit, conv, dir);
writeFileSync(join(dir, 'conversation-review.md'), reviewMarkdown(unit, conv, v));
const coveragePath = content === 'content' && unitId === 'unit-001' ? 'docs/conversation-coverage.md' : join(dir, 'conversation-coverage.md');
writeFileSync(coveragePath, coverageMarkdown(unit, conv, v));

// keep files.json (offline download list) in sync
const filesPath = join(dir, 'files.json');
if (existsSync(filesPath)) {
  const list = JSON.parse(readFileSync(filesPath, 'utf8')) as { files: { path: string; bytes: number }[]; totalBytes: number };
  const extra = ['conversation.json', ...conv.scenes.flatMap((s) => s.turns.map((t) => t.partner?.audio?.src).filter((x): x is string => !!x))];
  list.files = [...list.files.filter((f) => f.path !== 'conversation.json' && !f.path.startsWith('talk/')), ...[...new Set(extra)].map((p) => ({ path: p, bytes: statSync(join(dir, p)).size }))].sort((a, b) => a.path.localeCompare(b.path));
  list.totalBytes = list.files.reduce((n, f) => n + f.bytes, 0);
  writeFileSync(filesPath, JSON.stringify(list, null, 1) + '\n');
}

const total = conv.scenes.flatMap((s) => s.turns).length;
console.log(`${unitId}: ${conv.scenes.length} scenes, ${total} turns · ${v.errors.length} error(s), ${v.warnings.filter((w) => !w.includes('partner audio')).length} warning(s)`);
console.log(provider ? `partner audio: ${generated} new clip(s) generated` : 'partner audio: no provider configured (PARTNER_TTS_CMD) — the browser voice is used at runtime');
if (v.unapproved.length) console.log(`UNAPPROVED (not shipped in a normal build): ${v.unapproved.map((t) => t.id).join(', ')}`);
for (const e of v.errors) console.error('  ✗', e);
console.log(`review: ${join(dir, 'conversation-review.md')} · coverage: ${coveragePath}`);
process.exit(v.errors.length ? 1 : 0);
