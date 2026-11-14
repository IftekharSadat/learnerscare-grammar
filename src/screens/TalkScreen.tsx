/**
 * Talk level: speak with a partner. Half-duplex (the mic never opens while the partner speaks), deterministic gate
 * (evaluateUtterance), word-level feedback, hint ladder, Type-mode fallback, resume after reload.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { asset, getConversation, talkWithheld } from '@/engine/content';
import { BADGES } from '@/engine/badges';
import { playSfx } from '@/engine/sfx';
import { useStore, unitProgress } from '@/engine/store';
import type { Unit } from '@/engine/types';
import { navigate } from '@/router';
import { createBrain } from '@/speech/brain';
import { align, evaluateUtterance, FEEDBACK_COPY, speechTokens, type Evaluation, type WordResult } from '@/speech/evaluate';
import { currentScene, currentTurn, initialState, MAX_HINT, reduce, sceneStars, summarise, type TalkMode, type TalkState } from '@/speech/machine';
import { MicMeter, type Calibration } from '@/speech/mic';
import { createRecognizer, ERROR_COPY, type SpeechRecognizer } from '@/speech/recognizer';
import type { Conversation } from '@/speech/schema';
import { partnerVoice } from '@/speech/voice';
import { Confetti, Icon, OriginTag, Picture, Pip, Rich, Sheet, Stars } from '@/ui/basics';
import { Partner } from '@/ui/partners';

declare global { interface Window { __talkLatency?: number[] } }
type MicState = 'partner' | 'ready' | 'listening' | 'thinking';
const STATE_LABEL: Record<MicState, string> = { partner: 'Listen…', ready: 'Your turn', listening: 'Listening…', thinking: 'Thinking…' };
const env = import.meta.env as Record<string, string | undefined>;

/* ------------------------------------------------------------------ pre-flight */

function Preflight({ recognizer, onReady }: { recognizer: SpeechRecognizer | null; onReady: (mode: TalkMode) => void }) {
  const [step, setStep] = useState<'consent' | 'privacy' | 'mic'>(env.VITE_TALK_AGE_GATE === 'true' ? 'consent' : 'privacy');
  const [level, setLevel] = useState(0);
  const [cal, setCal] = useState<Calibration | null>(null);
  const [busy, setBusy] = useState(false);
  const [denied, setDenied] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const meter = useRef<MicMeter | null>(null);
  useEffect(() => () => meter.current?.close(), []);
  const openMic = async () => {
    setBusy(true);
    try {
      meter.current = new MicMeter();
      await meter.current.open(setLevel);
      setStep('mic');
    } catch { setDenied(true); }
    setBusy(false);
  };
  const calibrate = async () => {
    if (!meter.current) return;
    setBusy(true); setCal(null);
    setCal(await meter.current.calibrate(window.__mockSpeech ? 400 : 5000));
    setBusy(false);
  };
  const go = (mode: TalkMode) => { meter.current?.close(); onReady(mode); };
  return (
    <div className="mx-auto flex max-w-col flex-col gap-4 py-4" data-testid="talk-preflight">
      <div className="flex items-center gap-3"><Pip mood="happy" size={56} /><div><p className="eyebrow">Talk · before we start</p><h2 className="text-[1.7rem] leading-tight">Get ready to speak</h2></div></div>
      {step === 'consent' && (
        <div className="card flex flex-col gap-3 p-4" data-testid="consent-gate">
          <p className="font-bold">This level uses the microphone. If you are under 16, ask a parent or teacher first.</p>
          <label className="flex min-h-[44px] items-center gap-3 font-semibold"><input type="checkbox" className="h-6 w-6" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />A parent or teacher says it is OK (or I am an adult).</label>
          <button className="btn btn-primary" disabled={!agreed} onClick={() => setStep('privacy')}>Continue</button>
          <button className="btn btn-ghost" onClick={() => go('type')}>Use Type mode instead</button>
        </div>
      )}
      {step === 'privacy' && (
        <>
          <div className="card flex flex-col gap-2 p-4 text-[0.98rem] font-semibold">
            <p className="font-extrabold">What happens to your voice</p>
            <p>• Your voice is turned into text to check the sentence, then thrown away. Nothing is recorded or saved.</p>
            {recognizer?.cloud && <p data-testid="cloud-notice">• On this browser, speech recognition is done by the browser maker’s online service, so your voice is sent to them while you speak.</p>}
            {recognizer && !recognizer.cloud && <p>• On this device the recognition runs locally.</p>}
            <p>• The microphone is only on while you see the “Listening” sign. You can type instead at any time.</p>
            <p className="text-sm text-muted">Recogniser: {recognizer ? recognizer.label : 'none available on this browser'}</p>
          </div>
          {denied && <p className="rounded-2xl bg-bad-bg px-4 py-3 font-bold text-bad" role="alert" data-testid="mic-denied">{ERROR_COPY['not-allowed']}</p>}
          {recognizer && MicMeter.isSupported() ? (
            <button className="btn btn-primary" onClick={openMic} disabled={busy} data-testid="allow-mic"><Icon name="mic" />Turn on the microphone</button>
          ) : (
            <p className="rounded-2xl bg-surface2 px-4 py-3 font-bold" data-testid="no-recognizer">Speaking is not available on this browser. You can complete the level in Type mode.</p>
          )}
          <button className="btn btn-ghost" onClick={() => go('type')} data-testid="use-type">Type mode (no microphone) — fewer points, still completes the unit</button>
        </>
      )}
      {step === 'mic' && (
        <div className="card flex flex-col gap-3 p-4" data-testid="mic-check">
          <p className="font-extrabold">Microphone check</p>
          <div className="h-5 overflow-hidden rounded-full bg-line" role="meter" aria-label="Microphone level" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(level * 100)}>
            <div className="h-full rounded-full transition-[width] duration-75" style={{ width: `${Math.round(level * 100)}%`, background: level > 0.85 ? 'var(--coral)' : 'var(--role-be)' }} />
          </div>
          <p className="font-semibold">Press the button and say: <span className="font-display text-xl">“I am ready.”</span></p>
          <button className="btn btn-gold" onClick={calibrate} disabled={busy} data-testid="calibrate">{busy ? 'Listening for 5 seconds…' : cal ? 'Check again' : 'Start the 5-second check'}</button>
          {cal && <p className="rounded-2xl px-4 py-3 font-bold" role="status" data-testid="calibration" data-verdict={cal.verdict} style={{ background: cal.verdict === 'good' ? 'var(--good-bg)' : 'var(--surface-2)', color: cal.verdict === 'good' ? 'var(--good)' : 'var(--ink)' }}>{cal.verdict === 'good' ? '✓ ' : ''}{cal.advice}</p>}
          <p className="text-sm font-semibold text-muted">Tip: headphones stop the partner’s voice from reaching the microphone.</p>
          <button className="btn btn-primary" onClick={() => go('speak')} data-testid="start-speaking">{cal?.verdict === 'good' ? 'Start talking' : 'Continue'}</button>
          <button className="btn btn-ghost" onClick={() => go('type')}>Type mode instead</button>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ small pieces */

function Words({ result, target, focus, onWord }: { result: WordResult[] | null; target: string; focus?: boolean; onWord?: (w: string) => void }) {
  const words = result && result.length ? result : target.split(' ').map((word) => ({ word, status: 'clear' as const }));
  return (
    <p className="hero-sentence flex flex-wrap gap-x-2 gap-y-1" data-testid="word-feedback">
      {words.map((w, i) => {
        const style = !result ? {} : w.status === 'clear' ? { color: 'var(--good)' } : w.status === 'almost' ? { color: '#9A6700', textDecoration: 'underline wavy', textUnderlineOffset: 6 } : { color: 'var(--bad)', textDecoration: 'underline dashed', textUnderlineOffset: 6 };
        const mark = !result ? '' : w.status === 'clear' ? '' : w.status === 'almost' ? '~' : '✕';
        return onWord ? (
          <button key={i} className="rounded-md px-0.5" style={style} data-status={w.status} onClick={() => onWord(w.word)} aria-label={`${w.word}: ${result ? w.status : 'tap to hear'}`}>
            {w.word}{mark && focus !== false && <sup className="ml-0.5 text-[0.6em] font-extrabold">{mark}</sup>}
          </button>
        ) : <span key={i} style={style}>{w.word}</span>;
      })}
    </p>
  );
}

function Missions({ scene, done }: { scene: Conversation['scenes'][number]; done: Record<string, boolean> }) {
  if (!scene.missions?.length) return null;
  return (
    <ul className="flex flex-col gap-1.5" data-testid="missions" aria-label="Missions">
      {scene.missions.map((m) => (
        <li key={m.id} className="flex items-center gap-2 rounded-xl px-3 py-1.5 text-sm font-extrabold" data-done={done[m.id] ? '1' : '0'}
          style={{ background: done[m.id] ? 'var(--good-bg)' : 'var(--surface-2)', color: done[m.id] ? 'var(--good)' : 'var(--ink)' }}>
          <span aria-hidden="true">{done[m.id] ? '✓' : '○'}</span>{m.label}<span className="sr-only-live">{done[m.id] ? ' done' : ' to do'}</span>
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------------ main screen */

export function TalkScreen({ unit }: { unit: Unit }) {
  const conv = getConversation(unit.id)!;
  const settings = useStore((s) => s.settings);
  const saved = unitProgress(useStore.getState().progress, unit.id).talk;
  const recognizer = useMemo(() => createRecognizer(), []);
  const brain = useMemo(() => createBrain(), []);
  const [mode, setMode] = useState<TalkMode | null>(saved && !saved.done ? saved.mode : null);
  const [s, setS] = useState<TalkState>(() => (saved && !saved.done ? { ...(saved.state as TalkState), phase: (saved.state as TalkState).phase === 'verdict' ? 'turn' : (saved.state as TalkState).phase } : initialState()));
  const [mic, setMic] = useState<MicState>('partner');
  const [interim, setInterim] = useState('');
  const [ev, setEv] = useState<Evaluation | null>(null);
  const [reply, setReply] = useState('');
  const [notice, setNotice] = useState('');
  const [typed, setTyped] = useState('');
  const [hideText, setHideText] = useState(false);
  const [why, setWhy] = useState(false);
  const [drill, setDrill] = useState<{ word: string; state: 'idle' | 'listening' | 'ok' | 'again' } | null>(null);
  const [drills, setDrills] = useState(0);
  const [gained, setGained] = useState(0);
  const sRef = useRef(s);
  sRef.current = s;
  const scene = currentScene(conv, s);
  const turn = currentTurn(conv, s);
  const partner = conv.partners.find((p) => p.id === scene.partnerId) ?? conv.partners[0];
  const strictness = settings.mode;
  const evalOpts = useMemo(() => ({ strictness, forbiddenWords: [] as string[], structure: conv.scope.structureId }), [strictness, conv]);
  const repeatTurn = turn.type === 'readAloud' || turn.type === 'listenRepeat';
  const showTarget = repeatTurn && !(turn.type === 'listenRepeat' && hideText) || s.hintLevel >= 3;

  const persist = useCallback((next: TalkState, m: TalkMode, done = false) => {
    useStore.getState().saveTalk(unit.id, { state: next, mode: m, done, at: Date.now(), summary: done ? summarise(conv, next) : undefined });
  }, [unit.id, conv]);
  const dispatch = useCallback((event: Parameters<typeof reduce>[2]) => {
    const next = reduce(conv, sRef.current, event, { strictness });
    sRef.current = next;
    setS(next);
    if (mode) persist(next, mode);
    return next;
  }, [conv, strictness, mode, persist]);

  const say = useCallback(async (text: string, slow = false) => {
    setMic('partner');
    await partnerVoice.speak(text, { audioUrl: !slow && turn.partner?.audio && text === turn.partner.text ? asset(unit.id, turn.partner.audio.src) : null, style: partner.voice, slow, lang: conv.language });
    setMic('ready');
  }, [turn, partner, unit.id, conv.language]);

  // partner opens every turn (half-duplex: the mic stays closed until the line has ended)
  const turnKey = `${s.sceneIndex}:${s.turnIndex}:${s.phase}`;
  useEffect(() => {
    if (!mode || s.phase !== 'turn') return;
    setEv(null); setInterim(''); setReply(''); setNotice(''); setTyped(''); setDrill(null);
    if (s.tries === 0 && s.hintLevel === 0 && turn.partner) void say(turn.partner.text);
    else setMic('ready');
    return () => { partnerVoice.stop(); recognizer?.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turnKey, mode]);
  useEffect(() => {
    const hide = () => { if (document.hidden) { recognizer?.abort(); partnerVoice.stop(); setMic((m) => (m === 'listening' || m === 'partner' ? 'ready' : m)); } };
    document.addEventListener('visibilitychange', hide);
    return () => { document.removeEventListener('visibilitychange', hide); recognizer?.abort(); partnerVoice.stop(); };
  }, [recognizer]);

  const judge = useCallback((transcript: string, meta: { confidence?: number; alternatives?: string[] }, m: TalkMode, t0: number) => {
    const e = evaluateUtterance(turn, transcript, meta, evalOpts);
    setEv(e);
    const before = sRef.current;
    const next = dispatch({ type: 'heard', evaluation: e, mode: m });
    (window.__talkLatency ??= []).push(performance.now() - t0);
    if (next.passedNow) {
      const r = next.results[turn.id];
      const bonus = turn.type === 'listenRepeat' && hideText && m === 'speak' ? 2 : 0;
      setGained(r.points + bonus);
      useStore.getState().addXp(r.points + bonus);
      playSfx(r.stars === 3 ? 'correct' : 'star');
      if (next.combo >= 3 && next.combo > before.combo) playSfx('combo');
      const st = useStore.getState();
      if (m === 'speak' && r.firstTry && Object.keys(before.results).length === 0) st.award('fearless-first-try');
      if (m === 'speak' && next.bestCombo >= 5) st.award('smooth-talker');
    } else playSfx(e.gate === 'nearMiss' ? 'almost' : 'wrong');
    setMic('ready');
    void brain.reply(conv, turn, e.heard, e).then((line) => {
      if (sRef.current !== next) return;
      // recast first: after a second miss on a closed turn the partner naturally says the right form
      const recast = !next.passedNow && next.tries >= 2 && !turn.target.pattern?.open && turn.type !== 'readAloud' && turn.type !== 'listenRepeat' ? turn.feedback.recast : undefined;
      setReply(next.passedNow ? (line.text === turn.feedback.onPass ? '' : line.text) : recast ?? '');
      if (recast && m === 'speak') void partnerVoice.speak(recast, { style: partner.voice, lang: conv.language });
      if (next.passedNow && m === 'speak' && line.text !== turn.feedback.onPass) void partnerVoice.speak(line.text, { style: partner.voice, lang: conv.language });
    });
  }, [turn, evalOpts, dispatch, hideText, brain, conv, partner]);

  const listen = useCallback(() => {
    if (!recognizer || mic !== 'ready' || s.phase !== 'turn') return;
    partnerVoice.stop();
    setInterim(''); setNotice(''); setMic('listening');
    playSfx('tap');
    let ended = performance.now();
    recognizer.start({
      onInterim: (t) => setInterim(t),
      onSpeechEnd: () => { ended = performance.now(); setMic('thinking'); },
      onFinal: (r) => { setInterim(r.transcript); setMic('thinking'); judge(r.transcript, r, 'speak', ended); },
      onError: (err) => {
        if (err === 'not-allowed' || err === 'audio-capture' || err === 'network') { setNotice(ERROR_COPY[err]); setMode('type'); setMic('ready'); return; }
        if (err === 'aborted') { setMic('ready'); return; }
        setNotice(ERROR_COPY[err]);
        judge('', {}, 'speak', performance.now());
      },
    }, { lang: conv.language, maxMs: 15000 });
  }, [recognizer, mic, s.phase, judge, conv.language]);

  const hint = () => {
    const next = dispatch({ type: 'hint' });
    playSfx('hint');
    setEv(null); setReply('');
    if (next.hintLevel === 1) void say(turn.type === 'listenRepeat' || !turn.partner ? turn.target.canonical : turn.partner.text, true);
    if (next.hintLevel >= 3) void say(turn.target.canonical, next.hintLevel === 4);
  };
  const shadow = async () => { await say(turn.target.canonical, true); };
  const shadowPass = () => {
    const next = dispatch({ type: 'shadowPass', mode: mode ?? 'type' });
    const r = next.results[turn.id];
    if (!r) return;
    setEv(null); setGained(r.points);
    useStore.getState().addXp(r.points);
    useStore.getState().addMistake(`${unit.id}:talk:${turn.id}`, turn.sectionRef.length === 1 ? turn.sectionRef : undefined, turn.target.canonical);
    playSfx('star');
  };
  const next = () => {
    partnerVoice.stop();
    const n = dispatch({ type: 'next' });
    if (n.phase === 'sceneDone') { playSfx('unlock'); useStore.getState().addXp(10); }
  };
  const nextScene = () => {
    const n = dispatch({ type: 'nextScene' });
    if (n.phase === 'done') finish(n);
  };
  const finish = (final: TalkState) => {
    const sum = summarise(conv, final);
    const st = useStore.getState();
    persist(final, mode ?? 'type', true);
    st.completeNode(unit.id, 'talk', sum.stars / Math.max(1, sum.turns) >= 2.5 ? 3 : sum.stars / Math.max(1, sum.turns) >= 1.7 ? 2 : 1, { bestCombo: sum.bestCombo });
    if ((sum.clarityAvg ?? 0) >= 0.85 && sum.typed === 0) st.award('clear-speaker');
    const asks = conv.scenes.flatMap((sc) => sc.turns).filter((t) => t.type === 'askQuestion');
    if (asks.length && asks.every((t) => final.results[t.id]?.firstTry)) st.award('question-master');
    for (const w of sum.weakWords.slice(0, 4)) {
      const t = conv.scenes.flatMap((sc) => sc.turns).find((x) => final.results[x.id]?.weakWords.some((y) => y.toLowerCase() === w));
      if (t) st.addMistake(`${unit.id}:talk:${t.id}`, t.sectionRef.length === 1 ? t.sectionRef : undefined, w);
    }
    playSfx('complete');
  };
  const later = () => { partnerVoice.stop(); recognizer?.abort(); if (mode) persist(sRef.current, mode); useStore.getState().say('Saved. Your streak is safe — come back any time.', '🔖'); navigate(`u/${unit.id}`); };

  const hearWord = (w: string) => { setDrill({ word: w.replace(/[.,?!]/g, ''), state: 'idle' }); void partnerVoice.speak(w.replace(/[.,?!]/g, ''), { style: partner.voice, slow: true, lang: conv.language }); };
  const tryWord = () => {
    if (!drill || !recognizer) return;
    setDrill({ ...drill, state: 'listening' });
    recognizer.start({
      onFinal: (r) => {
        const ok = [r.transcript, ...(r.alternatives ?? [])].some((t) => align(drill.word, speechTokens(t, { keepFillers: true })).every((x) => x.status === 'clear'));
        setDrill({ ...drill, state: ok ? 'ok' : 'again' });
        playSfx(ok ? 'correct' : 'almost');
        if (ok) { const n = drills + 1; setDrills(n); if (n >= 3) useStore.getState().award('word-detective'); }
      },
      onError: () => setDrill({ ...drill, state: 'again' }),
    }, { lang: conv.language, maxMs: 6000 });
  };

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (!mode || tag === 'INPUT') return;
      if (e.key === ' ' && tag !== 'BUTTON' && s.phase === 'turn' && mode === 'speak') { e.preventDefault(); if (mic === 'listening') recognizer?.stop(); else listen(); }
      if (e.key === 'Enter' && tag !== 'BUTTON') {
        e.preventDefault();
        if (s.phase === 'intro') dispatch({ type: 'start' });
        else if (s.phase === 'verdict') { if (s.passedNow) next(); else dispatch({ type: 'retry' }); }
        else if (s.phase === 'sceneDone') nextScene();
      }
      if (e.key.toLowerCase() === 'r' && turn.partner && s.phase === 'turn') void say(turn.partner.text);
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  });

  /* ---------- render ---------- */
  const allTurns = conv.scenes.flatMap((sc) => sc.turns);
  const doneCount = allTurns.filter((t) => s.results[t.id]?.passed).length;
  const header = (
    <header className="sticky top-0 z-20 -mx-4 flex items-center gap-3 bg-bg/95 px-4 py-3 backdrop-blur">
      <button className="btn btn-quiet !min-h-[44px] !px-3" onClick={later} aria-label="Save and go back to the map" data-testid="talk-later"><Icon name="back" /></button>
      <div className="flex-1">
        <p className="truncate text-sm font-extrabold">Talk · {scene.title}</p>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-line" role="progressbar" aria-label="Talk progress" aria-valuemin={0} aria-valuemax={allTurns.length} aria-valuenow={doneCount}>
          <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${(doneCount / allTurns.length) * 100}%` }} />
        </div>
      </div>
      {mode && <span className="chip" data-testid="talk-mode">{mode === 'speak' ? <><Icon name="mic" size={15} />Speak</> : <><Icon name="keyboard" size={15} />Type</>}</span>}
      <button className="btn btn-quiet !min-h-[44px] !px-3" onClick={() => window.dispatchEvent(new Event('open-settings'))} aria-label="Settings"><Icon name="gear" /></button>
    </header>
  );
  const shell = (body: React.ReactNode) => <div className="mx-auto flex min-h-[100dvh] w-full max-w-stage flex-col px-4" data-testid="talk-screen">{header}<main id="main" className="flex-1 pb-6 pt-2">{body}</main></div>;

  if (!mode) return shell(<Preflight recognizer={recognizer} onReady={(m) => { setMode(m); persist(sRef.current, m); }} />);

  if (s.phase === 'done') {
    const sum = summarise(conv, s);
    const earned = BADGES.filter((b) => ['clear-speaker', 'question-master', 'smooth-talker', 'word-detective', 'fearless-first-try'].includes(b.id) && useStore.getState().progress.badges.includes(b.id));
    return shell(
      <div className="mx-auto flex max-w-col flex-col items-center gap-4 py-4 text-center" data-testid="talk-done">
        {settings.mode !== 'focus' && <Confetti fire={1} count={110} />}
        <Partner look={partner.look} emotion="smile" size={110} name={partner.name} />
        <div><p className="eyebrow">Talk complete</p><h2 className="text-[2.2rem] leading-none">You spoke the whole unit!</h2></div>
        <div className="grid w-full grid-cols-3 gap-2" data-testid="speaking-summary">
          <div className="card p-3"><p className="font-display text-2xl">{sum.passed}/{sum.turns}</p><p className="text-xs font-extrabold uppercase tracking-wider text-muted">Turns passed</p></div>
          <div className="card p-3"><p className="font-display text-2xl">{sum.clarityAvg === null ? '—' : `${Math.round(sum.clarityAvg * 100)}%`}</p><p className="text-xs font-extrabold uppercase tracking-wider text-muted">Clarity</p></div>
          <div className="card p-3"><p className="font-display text-2xl">{sum.points}</p><p className="text-xs font-extrabold uppercase tracking-wider text-muted">Talk XP</p></div>
        </div>
        <p className="text-sm font-semibold text-muted">{sum.firstTry} first-try turns · best combo ×{sum.bestCombo}{sum.typed ? ` · ${sum.typed} typed (no clarity stars)` : ''}{sum.shadow ? ` · ${sum.shadow} with “say it with me”` : ''}</p>
        {sum.weakWords.length > 0 && (
          <div className="card w-full p-4 text-left" data-testid="words-to-practise">
            <p className="eyebrow mb-2">Words to practise — saved to your Fix-it list</p>
            <div className="flex flex-wrap gap-2">{sum.weakWords.map((w) => <button key={w} className="tile !min-h-[40px]" onClick={() => void partnerVoice.speak(w, { style: partner.voice, slow: true, lang: conv.language })}>{w}</button>)}</div>
          </div>
        )}
        {sum.issues.length > 0 && (
          <div className="card w-full p-4 text-left" data-testid="grammar-summary">
            <p className="eyebrow mb-2">Grammar notes from this session</p>
            <ul className="flex flex-col gap-1.5">{sum.issues.map((i) => <li key={i.key} className="text-sm font-semibold"><b>{i.count}×</b> {FEEDBACK_COPY[i.key as keyof typeof FEEDBACK_COPY] ?? i.key}</li>)}</ul>
          </div>
        )}
        {talkWithheld(unit.id).turns > 0 && (
          <p className="w-full rounded-2xl bg-surface2 px-4 py-3 text-left text-sm font-semibold" data-testid="talk-withheld">
            More Talk content is on its way: {talkWithheld(unit.id).turns} turn(s){talkWithheld(unit.id).scenes.length ? ` and the scene “${talkWithheld(unit.id).scenes.join('”, “')}”` : ''} are waiting for the author’s approval and are not part of this version.
          </p>
        )}
        {earned.length > 0 && <div className="flex flex-wrap justify-center gap-2">{earned.map((b) => <span key={b.id} className="chip !py-2"><span aria-hidden="true">{b.emoji}</span>{b.name}</span>)}</div>}
        {conv.nextUnitTeaser && <p className="font-bold">{conv.nextUnitTeaser}</p>}
        <button className="btn btn-primary w-full" onClick={() => navigate(`u/${unit.id}/n/complete`)} data-testid="talk-to-complete">Unit complete → your certificate</button>
        <button className="btn btn-ghost w-full" data-testid="talk-again" onClick={() => { const fresh = initialState(); sRef.current = fresh; setS(fresh); setEv(null); persist(fresh, mode ?? 'type'); }}>Practise Talk again from the first scene</button>
      </div>,
    );
  }

  if (s.phase === 'intro') {
    return shell(
      <div className="mx-auto flex max-w-col flex-col items-center gap-4 py-4 text-center" data-testid="scene-intro" data-scene={scene.id}>
        <Partner look={partner.look} emotion="smile" size={120} name={partner.name} />
        <div><p className="eyebrow">Scene {s.sceneIndex + 1} of {conv.scenes.length}{scene.finale ? ' · finale' : ` · Section ${scene.sectionRef}`}</p><h2 className="text-[2rem] leading-tight">{scene.title}</h2></div>
        <p className="font-semibold">{scene.situation}</p>
        <p className="text-sm font-semibold text-muted"><b>{partner.name}</b> — {partner.persona}</p>
        {scene.missions && <div className="w-full text-left"><p className="eyebrow mb-1">Your missions</p><Missions scene={scene} done={{}} /></div>}
        <button className="btn btn-primary w-full" onClick={() => dispatch({ type: 'start' })} data-testid="scene-start">Start the scene</button>
        <button className="btn btn-ghost w-full" onClick={later}>I can’t speak now — continue later</button>
      </div>,
    );
  }

  if (s.phase === 'sceneDone') {
    const stars = sceneStars(scene, s);
    const pts = scene.turns.reduce((n, t) => n + (s.results[t.id]?.points ?? 0), 0);
    return shell(
      <div className="mx-auto flex max-w-col flex-col items-center gap-4 py-6 text-center" data-testid="scene-done">
        {settings.mode !== 'focus' && <Confetti fire={s.sceneIndex + 1} count={50} />}
        <Partner look={partner.look} emotion="smile" size={100} name={partner.name} />
        <div><p className="eyebrow">Scene complete</p><h2 className="text-[2rem] leading-tight">{scene.title}</h2></div>
        <Stars value={stars} size={44} animate />
        <p className="chip !bg-gold !text-[#14184A]">+{pts} Talk XP · +10 scene bonus</p>
        {scene.missions && <div className="w-full text-left"><Missions scene={scene} done={s.missions} /></div>}
        <p className="font-bold">{scene.teaser}</p>
        <button className="btn btn-primary w-full" onClick={nextScene} data-testid="next-scene">{s.sceneIndex + 1 < conv.scenes.length ? 'Next scene' : 'See my speaking summary'}</button>
      </div>,
    );
  }

  const verdict = s.phase === 'verdict';
  const live = interim ? align(turn.target.canonical, speechTokens(interim, { keepFillers: true })) : null;
  const focusTips = ev && !s.passedNow ? [] : ev ? conv.pronunciationFocus.filter((f) => turn.pronunciationFocus.includes(f.id) && ev.alignment.some((w) => w.status !== 'clear' && new RegExp(f.pattern, 'i').test(w.word))).slice(0, 2) : [];
  const section = unit.sections.find((x) => x.key === turn.sectionRef);
  const failText = ev ? turn.feedback.onWrong?.[ev.feedbackKey] ?? FEEDBACK_COPY[ev.feedbackKey] : '';

  return shell(
    <div className="mx-auto flex max-w-[720px] flex-col gap-4" data-testid="talk-turn" data-turn={turn.id} data-phase={s.phase} data-mic={mic}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="eyebrow">{({ readAloud: 'Read it aloud', listenRepeat: 'Listen and repeat', describe: 'Describe', askQuestion: 'Ask a question', decide: 'Positive or negative?', respond: 'Answer in your own words', freeRolePlay: 'Free talk' } as Record<string, string>)[turn.type]}</span>
        <span className="flex items-center gap-2">
          {turn.status === 'draft' && <span className="chip !bg-gold !text-[0.68rem] uppercase !text-[#14184A]" data-testid="draft-tag" title="Draft — awaiting approval">Draft</span>}
          {turn.origin === 'book' ? <OriginTag kind="book" /> : <span className="chip !text-[0.7rem] uppercase tracking-wide">LearnersCare sentence</span>}
          {s.combo >= 2 && <span className="chip !bg-gold !text-[#14184A]" data-testid="talk-combo"><Icon name="bolt" size={15} />×{s.combo}</span>}
        </span>
      </div>
      {scene.missions && <Missions scene={scene} done={s.missions} />}

      {turn.partner && (
        <div className="flex items-end gap-3">
          <Partner look={partner.look} emotion={turn.partner.emotion ?? (verdict && !s.passedNow ? 'thinking' : 'smile')} speaking={mic === 'partner'} size={72} name={partner.name} />
          <div className="card flex-1 !rounded-2xl !rounded-bl-md p-3">
            <p className="text-xs font-extrabold uppercase tracking-wider text-muted">{partner.name}</p>
            <p className="font-display text-[1.25rem] leading-snug" data-testid="partner-line">{verdict && reply ? reply : turn.partner.text}</p>
          </div>
          <button className="btn btn-quiet !min-h-[44px] !px-3" onClick={() => void say(turn.partner!.text)} aria-label="Hear it again"><Icon name="replay" /></button>
        </div>
      )}

      {(turn.prompt.picture || turn.prompt.context || turn.prompt.text || turn.prompt.cueWords || (turn.prompt.responseIdeas && !verdict) || (!verdict && (showTarget || turn.type === 'listenRepeat' || s.hintLevel >= 2))) && (
      <div className="card flex flex-col gap-3 p-4">
        {turn.prompt.picture && <Picture unitId={unit.id} media={{ src: turn.prompt.picture, alt: turn.prompt.pictureAlt ?? '', kind: 'illustration' }} className="mx-auto max-h-[26vh] w-auto rounded-2xl" />}
        {turn.prompt.context && <p className="font-semibold"><span className="eyebrow mr-2">Situation</span>{turn.prompt.context}{turn.prompt.clue && <span className="ml-1 text-sm text-muted">(clue: <mark className="rounded bg-gold px-1 text-[#14184A]">{turn.prompt.clue}</mark>)</span>}</p>}
        {turn.prompt.text && <p className="font-bold">{turn.prompt.text}</p>}
        {turn.prompt.cueWords && <p><span className="eyebrow mr-2">Cue words</span><span className="chip font-display !text-base">{turn.prompt.cueWords}</span></p>}
        {turn.prompt.responseIdeas && !verdict && <div><p className="eyebrow mb-1">Ideas — or say your own sentence</p><div className="flex flex-wrap gap-1.5">{turn.prompt.responseIdeas.map((r) => <span key={r} className="chip font-display !text-[0.95rem]"><Rich text={r} guess /></span>)}</div></div>}
        {showTarget && !verdict && <div data-testid="target-text"><Words result={mic === 'listening' || mic === 'thinking' ? live : null} target={turn.target.canonical} focus={false} /></div>}
        {turn.type === 'listenRepeat' && !verdict && s.hintLevel < 3 && (
          <button className="btn btn-ghost !min-h-[44px] self-start text-sm" onClick={() => setHideText((h) => !h)} aria-pressed={hideText} data-testid="no-peek">{hideText ? 'Show the text' : 'Hide the text — no peeking (+2 XP)'}</button>
        )}
        {s.hintLevel === 2 && !verdict && <p className="font-bold" data-testid="talk-hint"><Icon name="bulb" className="mr-1 inline text-[color:#B77F00]" />{turn.hints[1]}</p>}
        {s.hintLevel >= 3 && !verdict && <p className="text-sm font-bold text-muted" data-testid="talk-hint">{s.hintLevel === 4 ? 'Say it together with your partner, then tap “I said it with you”.' : 'Here is the model. Listen, then try.'}</p>}
      </div>
      )}

      {!verdict && (
        <div className="flex flex-col items-center gap-2" aria-live="polite">
          <p className="text-sm font-extrabold uppercase tracking-widest" data-testid="mic-state" style={{ color: mic === 'listening' ? 'var(--coral)' : 'var(--muted)' }}>{mode === 'type' && mic !== 'partner' ? 'Your turn — type it' : STATE_LABEL[mic]}</p>
          {mode === 'speak' ? (
            <>
              <motion.button onClick={() => (mic === 'listening' ? recognizer?.stop() : listen())} disabled={mic === 'partner' || mic === 'thinking'} data-testid="mic-btn"
                aria-label={mic === 'listening' ? 'Stop listening' : 'Tap to talk'} aria-pressed={mic === 'listening'}
                className="grid h-24 w-24 place-items-center rounded-full text-white disabled:opacity-50" style={{ background: mic === 'listening' ? 'var(--coral)' : 'var(--primary)', boxShadow: '0 6px 0 rgba(20,24,74,.35)' }}
                animate={mic === 'listening' ? { scale: [1, 1.08, 1] } : mic === 'thinking' ? { rotate: [0, 6, -6, 0] } : { scale: 1 }} transition={{ duration: 0.9, repeat: mic === 'listening' || mic === 'thinking' ? Infinity : 0 }}>
                <Icon name="mic" size={40} />
              </motion.button>
              <p className="min-h-[1.5em] text-center font-semibold text-muted" data-testid="interim">{interim || (mic === 'ready' ? 'Tap the microphone (or press Space) and speak' : '')}</p>
            </>
          ) : (
            <form className="flex w-full gap-2" onSubmit={(e) => { e.preventDefault(); if (typed.trim()) judge(typed, { confidence: 1 }, 'type', performance.now()); }}>
              <input className="min-w-0 flex-1 rounded-2xl border-2 border-line bg-surface px-4 py-3 text-lg font-bold outline-none focus:border-primary" value={typed} onChange={(e) => setTyped(e.target.value)}
                placeholder="Type what you would say" aria-label="Type your sentence" autoCapitalize="off" autoCorrect="off" spellCheck={false} data-testid="talk-input" />
              <button className="btn btn-primary" disabled={!typed.trim() || mic === 'partner'} data-testid="talk-send">Send</button>
            </form>
          )}
          {notice && <p className="rounded-2xl bg-surface2 px-4 py-2 text-center font-bold" role="status" data-testid="talk-notice">{notice}</p>}
          <div className="flex flex-wrap justify-center gap-2">
            {s.hintLevel < MAX_HINT && <button className="btn btn-ghost !min-h-[44px] text-sm" onClick={hint} data-testid="talk-hint-btn"><Icon name="bulb" size={16} />Hint {s.hintLevel + 1}/4</button>}
            {(s.hintLevel >= MAX_HINT || s.offerShadow) && <><button className="btn btn-ghost !min-h-[44px] text-sm" onClick={shadow} data-testid="shadow-listen">Listen &amp; shadow</button><button className="btn btn-gold !min-h-[44px] text-sm" onClick={shadowPass} data-testid="shadow-pass">I said it with you</button></>}
            {mode === 'speak' ? <button className="btn btn-ghost !min-h-[44px] text-sm" onClick={() => { recognizer?.abort(); setMode('type'); setMic('ready'); }} data-testid="switch-type">Type instead</button>
              : recognizer && <button className="btn btn-ghost !min-h-[44px] text-sm" onClick={() => setMode('speak')} data-testid="switch-speak">Speak instead</button>}
            <button className="btn btn-ghost !min-h-[44px] text-sm" onClick={later}>Continue later</button>
          </div>
        </div>
      )}

      <AnimatePresence>
        {verdict && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-3" aria-live="polite" data-testid="talk-verdict" data-gate={s.passedNow ? 'pass' : ev?.gate ?? 'fail'} data-key={s.lastKey ?? ''}>
            {s.passedNow ? (
              <div className="flex items-center gap-3 rounded-2xl bg-good-bg px-4 py-3 text-good">
                <p className="flex-1 font-extrabold">✓ {s.lastKey === 'shadow' ? 'Said together — that counts. It will come back in your Fix-it list.' : ev?.feedbackKey === 'nearMiss' ? 'Good enough to understand — well done!' : turn.feedback.onPass}</p>
                <Stars value={s.results[turn.id]?.stars ?? 1} animate />
                <span className="chip !bg-gold !text-[#14184A]">+{gained} XP</span>
              </div>
            ) : (
              <div className="rounded-2xl px-4 py-3 font-bold" style={{ background: 'color-mix(in srgb, var(--gold) 22%, var(--surface))' }} data-testid="talk-feedback">
                <p>{ev?.gate === 'nearMiss' ? '〜 ' : ''}{failText}</p>
                {ev?.heard && <p className="mt-1 text-sm font-semibold text-muted">I heard: “{ev.heard}”</p>}
              </div>
            )}
            {(s.passedNow || repeatTurn || s.hintLevel >= 3) && s.lastKey !== 'shadow' && (ev?.matched || repeatTurn) && (
              <div className="card p-4">
                <p className="eyebrow mb-1">{mode === 'speak' ? 'How clear was each word? Tap a word to hear it slowly' : 'Tap a word to hear it'}</p>
                <Words result={mode === 'speak' ? ev?.alignment ?? null : null} target={ev?.matched ?? turn.target.canonical} onWord={hearWord} />
                {mode === 'speak' && <p className="mt-2 text-xs font-bold text-muted">green = clear · <span style={{ color: '#9A6700' }}>~ almost</span> · <span className="text-bad">✕ not heard</span></p>}
                {focusTips.map((f) => <p key={f.id} className="mt-2 rounded-xl bg-surface2 px-3 py-2 text-sm font-bold" data-testid="focus-tip"><span className="eyebrow mr-2">{f.label}</span>{f.tip}</p>)}
                {drill && (
                  <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border-2 border-gold p-2" data-testid="word-drill">
                    <span className="font-display text-xl">{drill.word}</span>
                    <button className="btn btn-quiet !min-h-[44px] !px-3" onClick={() => hearWord(drill.word)} aria-label="Hear the word slowly"><Icon name="replay" size={18} /></button>
                    {mode === 'speak' && recognizer && <button className="btn btn-gold !min-h-[44px] text-sm" onClick={tryWord} disabled={drill.state === 'listening'} data-testid="drill-try">{drill.state === 'listening' ? 'Listening…' : 'Try just this word'}</button>}
                    {drill.state === 'ok' && <span className="font-extrabold text-good">✓ clear!</span>}
                    {drill.state === 'again' && <span className="font-bold">Close — listen and try once more.</span>}
                  </div>
                )}
              </div>
            )}
            <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center gap-2 border-t border-line bg-bg/95 px-4 py-3 backdrop-blur">
              {section && <button className="btn btn-ghost !px-3" onClick={() => setWhy(true)} data-testid="talk-why">Why?</button>}
              {!s.passedNow && <button className="btn btn-ghost !px-3" onClick={hint} disabled={s.hintLevel >= MAX_HINT} data-testid="talk-hint-btn"><Icon name="bulb" size={16} />Hint</button>}
              {!s.passedNow && s.offerShadow && <button className="btn btn-gold !px-3" onClick={() => { dispatch({ type: 'retry' }); void shadow(); }} data-testid="offer-shadow">Listen &amp; shadow</button>}
              {s.passedNow
                ? <button className="btn btn-primary ml-auto min-w-[8rem] flex-1 sm:flex-none" onClick={next} data-testid="talk-next">Next</button>
                : <button className="btn btn-primary ml-auto min-w-[8rem] flex-1 sm:flex-none" onClick={() => dispatch({ type: 'retry' })} data-testid="talk-retry">Try again</button>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <Sheet open={why} onClose={() => setWhy(false)} title={section ? `Section ${section.key} · ${section.title}` : 'Why?'}>
        {section && (
          <div className="flex flex-col gap-2">
            {ev && !s.passedNow && <p className="rounded-xl bg-surface2 px-3 py-2 font-bold">{failText}</p>}
            {section.book.filter((b) => b.kind !== 'table').slice(0, 6).map((b, i) => <p key={i} className={b.kind === 'rule' ? 'font-bold' : 'rounded-xl bg-surface2 px-3 py-2 font-display text-lg'}>{b.kind === 'rule' ? b.text : <Rich text={b.text} guess />}</p>)}
            <button className="btn btn-primary mt-2" onClick={() => navigate(`u/${unit.id}/n/sec-${section.key}`)}>Open the explanation</button>
            {turn.mirrors && <button className="btn btn-ghost" onClick={() => navigate(`u/${unit.id}/n/ex-${turn.mirrors!.split('.').slice(0, 2).join('.')}`)}>Practise Exercise {turn.mirrors.split('.').slice(0, 2).join('.')} again</button>}
          </div>
        )}
      </Sheet>
    </div>,
  );
}
