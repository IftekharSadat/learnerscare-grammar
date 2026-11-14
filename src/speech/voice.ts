/**
 * PartnerVoice: speaks the partner's lines.
 *   1. pre-generated clip (made at build time by `npm run conversation`, cached by content hash) — zero runtime cost
 *   2. browser speechSynthesis — last-resort fallback, also used for slowed single words
 *   3. silent (captions only) when neither exists; resolves after a reading-time delay
 * While a line is playing the microphone must stay closed (half-duplex) — callers await speak().
 */
import { narration } from '@/engine/audio';

export interface VoiceStyle { rate: number; pitch: number }
export interface SpeakOptions { audioUrl?: string | null; style?: VoiceStyle; slow?: boolean; lang?: string }

declare global { interface Window { __voiceLog?: string[] } }

let current: SpeechSynthesisUtterance | null = null;
let cancelSilent: (() => void) | null = null;

function pickVoice(lang: string): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices();
  return voices.find((v) => v.lang === lang) ?? voices.find((v) => v.lang.startsWith(lang.slice(0, 2)));
}

export const partnerVoice = {
  mode(): 'file' | 'browser' | 'captions' {
    return typeof window !== 'undefined' && 'speechSynthesis' in window && window.speechSynthesis.getVoices().length > 0 ? 'browser' : 'captions';
  },
  speak(text: string, opts: SpeakOptions = {}): Promise<void> {
    partnerVoice.stop();
    (window.__voiceLog ??= []).push(text);
    if (opts.audioUrl && !opts.slow) return narration.play(opts.audioUrl, 'partner');
    const synth = typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;
    if (!synth || narration.muted || (window.__mockSpeech && !synth.getVoices().length)) {
      return new Promise((resolve) => {
        const id = setTimeout(resolve, window.__mockSpeech ? 60 : Math.min(4000, 500 + text.length * 45));
        cancelSilent = () => { clearTimeout(id); resolve(); };
      });
    }
    return new Promise((resolve) => {
      const u = new SpeechSynthesisUtterance(text);
      current = u;
      u.lang = opts.lang ?? 'en-GB';
      const v = pickVoice(u.lang);
      if (v) u.voice = v;
      u.rate = (opts.style?.rate ?? 1) * (opts.slow ? 0.65 : 1);
      u.pitch = opts.style?.pitch ?? 1;
      u.volume = narration.volume;
      const done = () => { if (current === u) current = null; resolve(); };
      u.onend = done;
      u.onerror = done;
      const guard = setTimeout(done, 1500 + text.length * 140); // some browsers never fire onend
      u.addEventListener('end', () => clearTimeout(guard));
      synth.speak(u);
    });
  },
  stop() {
    cancelSilent?.();
    cancelSilent = null;
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
    current = null;
  },
};
