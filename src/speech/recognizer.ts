/**
 * SpeechRecognizer adapters. The chain is: mock (tests / Speech Lab) → browser Web Speech API → on-device Whisper
 * (optional, behind config) → none (the UI then offers Type mode).
 */
export interface RecognitionResult { transcript: string; confidence?: number; alternatives?: string[]; latencyMs?: number }
export type RecognizerError = 'no-speech' | 'not-allowed' | 'audio-capture' | 'network' | 'aborted' | 'too-long' | 'unknown';
export interface RecognizerEvents {
  onInterim?(text: string): void;
  onFinal(result: RecognitionResult): void;
  onSpeechEnd?(): void;
  onError(error: RecognizerError, detail?: string): void;
}
export interface SpeechRecognizer {
  readonly id: 'mock' | 'web-speech' | 'whisper';
  readonly label: string;
  /** true when audio leaves the device (shown on the privacy screen before the first prompt) */
  readonly cloud: boolean;
  start(events: RecognizerEvents, opts?: { lang?: string; maxMs?: number }): void;
  stop(): void;
  abort(): void;
}

/* ---- browser Web Speech API (prefixed in Chromium and Safari) ---- */
interface SRAlternative { transcript: string; confidence: number }
interface SRResult { isFinal: boolean; length: number; [i: number]: SRAlternative }
interface SREvent { resultIndex: number; results: { length: number; [i: number]: SRResult } }
interface SRInstance {
  lang: string; continuous: boolean; interimResults: boolean; maxAlternatives: number; processLocally?: boolean;
  onresult: ((e: SREvent) => void) | null; onerror: ((e: { error: string; message?: string }) => void) | null;
  onend: (() => void) | null; onspeechend: (() => void) | null;
  start(): void; stop(): void; abort(): void;
}
type SRCtor = new () => SRInstance;
const srCtor = (): SRCtor | undefined => {
  if (typeof window === 'undefined') return undefined;
  const w = window as unknown as { SpeechRecognition?: SRCtor; webkitSpeechRecognition?: SRCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
};

export class WebSpeechRecognizer implements SpeechRecognizer {
  readonly id = 'web-speech' as const;
  readonly label = 'Browser speech recognition';
  readonly cloud = true; // Chromium and Safari may send audio to the browser vendor's servers
  private rec: SRInstance | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  static isSupported() { return !!srCtor(); }

  start(events: RecognizerEvents, opts: { lang?: string; maxMs?: number } = {}) {
    const Ctor = srCtor();
    if (!Ctor) return events.onError('unknown', 'unsupported');
    this.abort();
    const rec = new Ctor();
    this.rec = rec;
    rec.lang = opts.lang ?? 'en-GB';
    rec.continuous = false;
    rec.interimResults = true;
    rec.maxAlternatives = 3;
    let done = false;
    let speechEndAt = 0;
    const finish = (fn: () => void) => { if (!done) { done = true; if (this.timer) clearTimeout(this.timer); fn(); } };
    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) {
          const alts = Array.from({ length: r.length }, (_, k) => r[k]);
          finish(() => events.onFinal({ transcript: alts[0].transcript, confidence: alts[0].confidence || undefined, alternatives: alts.slice(1).map((a) => a.transcript), latencyMs: speechEndAt ? performance.now() - speechEndAt : undefined }));
          return;
        }
        interim += r[0].transcript;
      }
      if (interim) events.onInterim?.(interim);
    };
    rec.onspeechend = () => { speechEndAt = performance.now(); events.onSpeechEnd?.(); };
    rec.onerror = (e) => finish(() => events.onError((['no-speech', 'not-allowed', 'audio-capture', 'network', 'aborted'].includes(e.error) ? e.error : e.error === 'service-not-allowed' ? 'not-allowed' : 'unknown') as RecognizerError, e.message));
    rec.onend = () => finish(() => events.onError('no-speech'));
    this.timer = setTimeout(() => { try { rec.stop(); } catch { /* already stopped */ } }, opts.maxMs ?? 15000);
    try { rec.start(); } catch (err) { finish(() => events.onError('unknown', String(err))); }
  }
  stop() { try { this.rec?.stop(); } catch { /* noop */ } }
  abort() { if (this.timer) clearTimeout(this.timer); try { this.rec?.abort(); } catch { /* noop */ } this.rec = null; }
}

/* ---- mock: transcripts are injected (Playwright, Speech Lab "type what the recogniser heard") ---- */
declare global {
  interface Window { __mockSpeech?: { queue: (string | RecognitionResult | { error: RecognizerError })[]; latencies: number[]; delayMs?: number } }
}
export class MockRecognizer implements SpeechRecognizer {
  readonly id = 'mock' as const;
  readonly label = 'Mock recogniser (testing)';
  readonly cloud = false;
  private timers: ReturnType<typeof setTimeout>[] = [];
  static isActive() { return typeof window !== 'undefined' && !!window.__mockSpeech; }
  start(events: RecognizerEvents) {
    const mock = window.__mockSpeech!;
    const next = mock.queue.shift();
    const delay = mock.delayMs ?? 120;
    if (next === undefined) { this.timers.push(setTimeout(() => events.onError('no-speech'), delay)); return; }
    if (typeof next === 'object' && 'error' in next) { this.timers.push(setTimeout(() => events.onError(next.error), delay)); return; }
    const result: RecognitionResult = typeof next === 'string' ? { transcript: next, confidence: 0.92 } : next;
    const words = result.transcript.split(' ');
    words.forEach((_, i) => this.timers.push(setTimeout(() => events.onInterim?.(words.slice(0, i + 1).join(' ')), (delay * (i + 1)) / (words.length + 1))));
    const ended = performance.now() + delay;
    this.timers.push(setTimeout(() => { events.onSpeechEnd?.(); const t = performance.now(); events.onFinal({ ...result, latencyMs: t - ended }); mock.latencies.push(performance.now() - ended); }, delay));
  }
  stop() { /* results arrive on their own */ }
  abort() { this.timers.forEach(clearTimeout); this.timers = []; }
}

/* ---- on-device Whisper (optional adapter; see docs/DECISIONS.md — not verified in the build environment) ---- */
export interface WhisperConfig { moduleUrl: string; model: string }
export class WhisperRecognizer implements SpeechRecognizer {
  readonly id = 'whisper' as const;
  readonly label = 'On-device speech recognition';
  readonly cloud = false;
  private media: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private static pipe: Promise<any> | null = null;
  constructor(private cfg: WhisperConfig) {}
  static config(): WhisperConfig | null {
    const env = import.meta.env as Record<string, string | undefined>;
    return env.VITE_WHISPER_MODULE_URL && env.VITE_WHISPER_MODEL ? { moduleUrl: env.VITE_WHISPER_MODULE_URL, model: env.VITE_WHISPER_MODEL } : null;
  }
  /** Lazy, one-time model download (tens of MB); the browser caches it for offline use. */
  static load(cfg: WhisperConfig, onProgress?: (p: number) => void) {
    WhisperRecognizer.pipe ??= import(/* @vite-ignore */ cfg.moduleUrl).then((m) =>
      m.pipeline('automatic-speech-recognition', cfg.model, { progress_callback: (p: { progress?: number }) => onProgress?.((p.progress ?? 0) / 100) }));
    return WhisperRecognizer.pipe;
  }
  async start(events: RecognizerEvents, opts: { maxMs?: number } = {}) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      this.chunks = [];
      this.media = new MediaRecorder(stream);
      this.media.ondataavailable = (e) => this.chunks.push(e.data);
      this.media.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        events.onSpeechEnd?.();
        const t0 = performance.now();
        try {
          const ctx = new AudioContext({ sampleRate: 16000 });
          const audio = await ctx.decodeAudioData(await new Blob(this.chunks).arrayBuffer());
          void ctx.close();
          const pipe = await WhisperRecognizer.load(this.cfg);
          const out = await pipe(audio.getChannelData(0));
          events.onFinal({ transcript: String(out.text ?? '').trim(), latencyMs: performance.now() - t0 }); // audio is discarded here
        } catch (err) { events.onError('unknown', String(err)); }
      };
      this.media.start();
      setTimeout(() => this.stop(), opts.maxMs ?? 12000);
    } catch { events.onError('not-allowed'); }
  }
  stop() { if (this.media?.state === 'recording') this.media.stop(); }
  abort() { this.media?.stream.getTracks().forEach((t) => t.stop()); this.media = null; }
}

/** Auto-select the best available recogniser; null → Type mode. */
export function createRecognizer(): SpeechRecognizer | null {
  if (MockRecognizer.isActive()) return new MockRecognizer();
  if (WebSpeechRecognizer.isSupported()) return new WebSpeechRecognizer();
  const cfg = WhisperRecognizer.config();
  if (cfg && typeof MediaRecorder !== 'undefined') return new WhisperRecognizer(cfg);
  return null;
}

export const ERROR_COPY: Record<RecognizerError, string> = {
  'no-speech': 'I did not hear anything. Move a little closer to the microphone and try again.',
  'not-allowed': 'The microphone is switched off for this page. You can allow it in the browser, or continue in Type mode.',
  'audio-capture': 'No microphone was found. Plug one in, or continue in Type mode.',
  network: 'Speech recognition needs a connection on this browser. You can continue in Type mode.',
  aborted: 'Listening was interrupted. Tap the microphone to try again.',
  'too-long': 'That was a long one! Try just the sentence on the screen.',
  unknown: 'Something went wrong with listening. Try again, or switch to Type mode.',
};
