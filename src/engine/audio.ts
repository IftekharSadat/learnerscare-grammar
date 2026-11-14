/**
 * Audio manager.
 *  - Narration: one HTMLAudioElement (streams, keeps pitch at 0.75×/1.25×, cheap to seek). Never plays before a user gesture.
 *  - Effects + music: procedural Web Audio (see sfx.ts), separate gain channels.
 */
export interface NarrationState {
  src: string | null;
  playing: boolean;
  ended: boolean;
  /** true when a play was requested before the first user gesture (UI shows a "Tap to listen" button) */
  blocked: boolean;
}

type Listener = (s: NarrationState) => void;

declare global {
  interface Window {
    __audioLog?: { src: string; at: number; label?: string }[];
  }
}

class Narration {
  private el: HTMLAudioElement | null = null;
  private listeners = new Set<Listener>();
  private preloaded = new Map<string, HTMLAudioElement>();
  private endResolvers: (() => void)[] = [];
  state: NarrationState = { src: null, playing: false, ended: false, blocked: false };
  unlocked = false;
  volume = 1;
  rate = 1;
  muted = false;

  private ensure(): HTMLAudioElement {
    if (!this.el) {
      this.el = new Audio();
      this.el.preload = 'auto';
      (window as unknown as { __lastAudioEl?: HTMLAudioElement }).__lastAudioEl = this.el;
      this.el.addEventListener('ended', () => {
        this.set({ playing: false, ended: true });
        this.endResolvers.splice(0).forEach((r) => r());
      });
      this.el.addEventListener('pause', () => this.set({ playing: false }));
      this.el.addEventListener('playing', () => this.set({ playing: true, ended: false, blocked: false }));
    }
    return this.el;
  }

  private set(patch: Partial<NarrationState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l(this.state));
  }

  subscribe(l: Listener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  /** Call from the first pointer/key event. */
  unlock() {
    this.unlocked = true;
  }

  /** Start a clip from the beginning. Resolves when it ends, is stopped, or is replaced. */
  play(src: string, label?: string): Promise<void> {
    const el = this.ensure();
    this.endResolvers.splice(0).forEach((r) => r());
    (window.__audioLog ??= []).push({ src: src.replace(/^.*\/content\//, ''), at: Date.now(), label });
    if (!this.unlocked) {
      el.pause();
      this.set({ src, playing: false, ended: false, blocked: true });
      return Promise.resolve();
    }
    el.src = src;
    el.currentTime = 0;
    el.volume = this.muted ? 0 : this.volume;
    el.playbackRate = this.rate;
    this.set({ src, playing: false, ended: false, blocked: false });
    const done = new Promise<void>((resolve) => this.endResolvers.push(resolve));
    el.play().catch(() => {
      this.set({ playing: false, blocked: true });
      this.endResolvers.splice(0).forEach((r) => r());
    });
    return done;
  }

  resume() {
    if (!this.el || !this.state.src) return;
    if (this.state.blocked) {
      void this.play(this.state.src);
      return;
    }
    if (this.state.ended) this.el.currentTime = 0;
    this.el.play().catch(() => this.set({ blocked: true }));
  }

  pause() {
    this.el?.pause();
  }

  toggle() {
    if (this.state.playing) this.pause();
    else this.resume();
  }

  stop() {
    if (this.el) {
      this.el.pause();
      this.el.removeAttribute('src');
    }
    this.set({ src: null, playing: false, ended: false, blocked: false });
    this.endResolvers.splice(0).forEach((r) => r());
  }

  /** Jump to the end: marks the clip as finished without playing it. */
  skip() {
    this.el?.pause();
    this.set({ playing: false, ended: true, blocked: false });
    this.endResolvers.splice(0).forEach((r) => r());
  }

  seek(ms: number) {
    if (this.el) this.el.currentTime = Math.max(0, ms / 1000);
  }

  get timeMs(): number {
    return this.el ? this.el.currentTime * 1000 : 0;
  }

  setVolume(v: number) {
    this.volume = v;
    if (this.el) this.el.volume = this.muted ? 0 : v;
  }

  setRate(r: number) {
    this.rate = r;
    if (this.el) this.el.playbackRate = r;
  }

  /** Warm the HTTP cache for the next clip only. */
  preload(src: string | null | undefined) {
    if (!src || this.preloaded.has(src)) return;
    if (this.preloaded.size > 3) {
      const first = this.preloaded.keys().next().value as string;
      this.preloaded.delete(first);
    }
    const a = new Audio();
    a.preload = 'auto';
    a.src = src;
    this.preloaded.set(src, a);
  }

  get element(): HTMLAudioElement | null {
    return this.el;
  }
}

export const narration = new Narration();
