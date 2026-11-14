/** Procedural sound theme (Web Audio synthesis — no samples). Effects and music have separate gain channels. */

export type Sfx = 'tap' | 'snap' | 'correct' | 'almost' | 'wrong' | 'hint' | 'combo' | 'star' | 'unlock' | 'complete';

let ctx: AudioContext | null = null;
let fxGain: GainNode | null = null;
let musicGain: GainNode | null = null;
let musicTimer: number | null = null;
let fxVolume = 0.7;
let musicVolume = 0;

function ac(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) {
    ctx = new Ctor();
    fxGain = ctx.createGain();
    fxGain.gain.value = fxVolume;
    fxGain.connect(ctx.destination);
    musicGain = ctx.createGain();
    musicGain.gain.value = musicVolume * 0.25;
    musicGain.connect(ctx.destination);
  }
  return ctx;
}

/** Must be called from a user gesture (iOS Safari). */
export function unlockSfx() {
  const c = ac();
  if (c && c.state === 'suspended') void c.resume();
}

function tone(freq: number, start: number, dur: number, type: OscillatorType = 'sine', peak = 0.25, slideTo?: number, out?: GainNode | null) {
  const c = ac();
  const dest = out ?? fxGain;
  if (!c || !dest) return;
  const t0 = c.currentTime + start;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(dest);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

const N = { C5: 523.25, D5: 587.33, E5: 659.25, G5: 783.99, A5: 880, C6: 1046.5, E6: 1318.5, G6: 1568, A4: 440, E4: 329.63, G4: 392 };

const RECIPES: Record<Sfx, () => void> = {
  tap: () => tone(620, 0, 0.05, 'triangle', 0.12),
  snap: () => { tone(420, 0, 0.06, 'triangle', 0.2, 760); tone(1200, 0.03, 0.04, 'sine', 0.08); },
  correct: () => { tone(N.E5, 0, 0.12, 'sine', 0.22); tone(N.G5, 0.09, 0.12, 'sine', 0.22); tone(N.C6, 0.18, 0.26, 'sine', 0.24); },
  almost: () => { tone(N.E5, 0, 0.12, 'sine', 0.18); tone(N.D5, 0.11, 0.2, 'sine', 0.16); },
  wrong: () => { tone(N.G4, 0, 0.14, 'sine', 0.16); tone(N.E4, 0.12, 0.24, 'sine', 0.14); },
  hint: () => { tone(N.A5, 0, 0.08, 'triangle', 0.12); tone(N.E6, 0.07, 0.16, 'triangle', 0.1); },
  combo: () => [N.C5, N.E5, N.G5, N.C6].forEach((f, i) => tone(f, i * 0.05, 0.1, 'triangle', 0.16)),
  star: () => { tone(N.C6, 0, 0.09, 'sine', 0.18); tone(N.G6, 0.07, 0.22, 'sine', 0.16); },
  unlock: () => { tone(N.G4, 0, 0.1, 'triangle', 0.16); tone(N.C5, 0.09, 0.1, 'triangle', 0.16); tone(N.G5, 0.18, 0.28, 'triangle', 0.18); },
  complete: () => [N.C5, N.E5, N.G5, N.C6, N.E6, N.G6].forEach((f, i) => tone(f, i * 0.09, 0.34, 'sine', 0.2)),
};

export function playSfx(name: Sfx) {
  if (fxVolume <= 0) return;
  try {
    RECIPES[name]();
  } catch {
    /* audio is never essential */
  }
}

export function setSfxVolume(v: number) {
  fxVolume = v;
  if (fxGain) fxGain.gain.value = v;
}

/** Gentle generative pentatonic loop. Default OFF. */
export function setMusicVolume(v: number) {
  musicVolume = v;
  const c = ac();
  if (musicGain) musicGain.gain.value = v * 0.25;
  if (v > 0 && musicTimer === null && c) {
    const scale = [261.63, 293.66, 329.63, 392, 440, 523.25];
    let step = 0;
    musicTimer = window.setInterval(() => {
      const f = scale[(step * 2 + (step % 3)) % scale.length];
      tone(f, 0, 1.6, 'sine', 0.5, undefined, musicGain);
      if (step % 4 === 0) tone(f / 2, 0, 2.4, 'triangle', 0.35, undefined, musicGain);
      step++;
    }, 900);
  } else if (v <= 0 && musicTimer !== null) {
    window.clearInterval(musicTimer);
    musicTimer = null;
  }
}
