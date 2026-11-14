/** Speech Lab (dev / VITE_SPEECH_LAB=true): test the recogniser and the gate with real voices. Route: #/lab/speech */
import { useMemo, useRef, useState } from 'react';
import { getConversation } from '@/engine/content';
import type { Unit } from '@/engine/types';
import { evaluateUtterance, type Evaluation } from '@/speech/evaluate';
import { createRecognizer, ERROR_COPY } from '@/speech/recognizer';
import { partnerVoice } from '@/speech/voice';
import { navigate } from '@/router';

interface Row { at: string; turn: string; transcript: string; confidence?: number; alternatives?: string[]; latencyMs?: number; evalMs: number; e: Evaluation }

export function SpeechLab({ unit }: { unit: Unit }) {
  const conv = getConversation(unit.id);
  const turns = useMemo(() => conv?.scenes.flatMap((s) => s.turns) ?? [], [conv]);
  const recognizer = useMemo(() => createRecognizer(), []);
  const [turnId, setTurnId] = useState(turns[0]?.id ?? '');
  const [strictness, setStrictness] = useState<'explorer' | 'classic' | 'focus'>('classic');
  const [interim, setInterim] = useState('');
  const [status, setStatus] = useState('idle');
  const [manual, setManual] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const ended = useRef(0);
  const turn = turns.find((t) => t.id === turnId);
  if (!conv || !turn) return <p className="p-6 font-bold">This unit has no conversation.json.</p>;
  const run = (transcript: string, meta: { confidence?: number; alternatives?: string[]; latencyMs?: number }) => {
    const t0 = performance.now();
    const e = evaluateUtterance(turn, transcript, meta, { strictness, structure: conv.scope.structureId });
    setRows((r) => [{ at: new Date().toLocaleTimeString(), turn: turn.id, transcript, ...meta, evalMs: performance.now() - t0, e }, ...r].slice(0, 50));
  };
  const listen = () => {
    if (!recognizer) return;
    setStatus('listening'); setInterim('');
    recognizer.start({
      onInterim: setInterim,
      onSpeechEnd: () => { ended.current = performance.now(); setStatus('thinking'); },
      onFinal: (r) => { setStatus('idle'); setInterim(r.transcript); run(r.transcript, { confidence: r.confidence, alternatives: r.alternatives, latencyMs: r.latencyMs ?? (ended.current ? performance.now() - ended.current : undefined) }); },
      onError: (err, detail) => setStatus(`error: ${err} — ${ERROR_COPY[err]} ${detail ?? ''}`),
    }, { lang: conv.language });
  };
  const lat = rows.map((r) => (r.latencyMs ?? 0) + r.evalMs).sort((a, b) => a - b);
  const pct = (p: number) => (lat.length ? Math.round(lat[Math.min(lat.length - 1, Math.floor(p * lat.length))]) : 0);
  return (
    <div className="mx-auto max-w-stage p-4" data-testid="speech-lab">
      <div className="flex items-center gap-3"><button className="btn btn-quiet" onClick={() => navigate(`u/${unit.id}`)}>← Map</button><h1 className="text-2xl">Speech Lab</h1><span className="chip">dev only</span></div>
      <p className="mt-2 text-sm font-semibold text-muted">Recogniser: <b>{recognizer ? `${recognizer.label} (${recognizer.id}${recognizer.cloud ? ', audio may go to the browser vendor' : ', local'})` : 'none — type below'}</b> · partner voice: {partnerVoice.mode()} · end-of-speech → verdict p50 {pct(0.5)} ms / p95 {pct(0.95)} ms over {lat.length} run(s)</p>
      <div className="card mt-3 flex flex-col gap-3 p-4">
        <div className="flex flex-wrap gap-2">
          <select className="min-h-[44px] rounded-xl border-2 border-line bg-surface px-2 font-bold" value={turnId} onChange={(e) => setTurnId(e.target.value)} aria-label="Turn">
            {turns.map((t) => <option key={t.id} value={t.id}>{t.id} · {t.type} · {t.target.canonical}</option>)}
          </select>
          <select className="min-h-[44px] rounded-xl border-2 border-line bg-surface px-2 font-bold" value={strictness} onChange={(e) => setStrictness(e.target.value as typeof strictness)} aria-label="Strictness">
            {['explorer', 'classic', 'focus'].map((x) => <option key={x}>{x}</option>)}
          </select>
        </div>
        <p className="font-display text-xl">Target: {turn.target.canonical}</p>
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn btn-primary" onClick={listen} disabled={!recognizer || status === 'listening'} data-testid="lab-listen">{status === 'listening' ? 'Listening…' : 'Listen'}</button>
          <button className="btn btn-ghost" onClick={() => void partnerVoice.speak(turn.target.canonical)}>Hear the model</button>
          <span className="font-semibold" data-testid="lab-status">{status}</span>
        </div>
        <p className="font-semibold text-muted">Live transcript: {interim || '—'}</p>
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); run(manual, { confidence: 1 }); }}>
          <input className="min-w-0 flex-1 rounded-xl border-2 border-line bg-surface px-3 py-2 font-bold" value={manual} onChange={(e) => setManual(e.target.value)} placeholder="…or type a transcript to test the gate" data-testid="lab-input" />
          <button className="btn btn-quiet" data-testid="lab-run">Evaluate</button>
        </form>
      </div>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-left text-sm" data-testid="lab-table">
          <thead><tr className="text-muted">{['time', 'turn', 'transcript', 'conf', 'gate', 'key', 'clarity', 'alignment', 'ASR ms', 'eval ms'].map((h) => <th key={h} className="p-1">{h}</th>)}</tr></thead>
          <tbody>{rows.map((r, i) => (
            <tr key={i} className="border-t border-line align-top font-semibold">
              <td className="p-1">{r.at}</td><td className="p-1">{r.turn}</td><td className="p-1">{r.transcript}{r.alternatives?.length ? <span className="block text-xs text-muted">alt: {r.alternatives.join(' | ')}</span> : null}</td>
              <td className="p-1">{r.confidence?.toFixed(2) ?? '—'}</td><td className="p-1" style={{ color: r.e.gate === 'pass' ? 'var(--good)' : 'var(--bad)' }}>{r.e.gate}</td><td className="p-1">{r.e.feedbackKey}</td>
              <td className="p-1">{r.e.pronunciationScore}</td><td className="p-1">{r.e.alignment.map((w) => `${w.word}${w.status === 'clear' ? '' : w.status === 'almost' ? '~' : '✕'}`).join(' ')}</td>
              <td className="p-1">{r.latencyMs ? Math.round(r.latencyMs) : '—'}</td><td className="p-1">{r.evalMs.toFixed(1)}</td>
            </tr>))}</tbody>
        </table>
      </div>
    </div>
  );
}
