/**
 * Cue scheduler: keeps on-screen elements in sync with narration.
 *
 * State is always *derived from the audio clock* (never from timers), so it survives pause, seek,
 * speed changes and background tabs: whenever `sync()` runs it recomputes what should be visible at the
 * current time and only notifies when that changes.
 */
import type { Cue } from './types';

export interface CueState {
  /** index of the last cue whose time has passed (-1 = none) */
  index: number;
  /** shape ids that have entered and not exited */
  visible: Set<number>;
  /** the most recently entered shape (for "now speaking" highlight) */
  current: number | null;
}

export function cueStateAt(cues: Cue[], tMs: number): CueState {
  const visible = new Set<number>();
  let index = -1;
  let current: number | null = null;
  for (let i = 0; i < cues.length; i++) {
    const c = cues[i];
    if (c.tMs > tMs) break;
    index = i;
    if (c.effect === 'exit') visible.delete(c.targetShapeId);
    else {
      visible.add(c.targetShapeId);
      current = c.targetShapeId;
    }
  }
  return { index, visible, current };
}

/** Everything visible (used when narration is skipped or finished). */
export function cueStateEnd(cues: Cue[]): CueState {
  return cueStateAt(cues, Number.POSITIVE_INFINITY);
}

export class CueScheduler {
  private last = -2;
  private raf: number | null = null;
  constructor(
    private cues: Cue[],
    private clock: () => number,
    private onChange: (state: CueState) => void,
    private frame: { request: (cb: () => void) => number; cancel: (id: number) => void } = {
      request: (cb) => requestAnimationFrame(cb),
      cancel: (id) => cancelAnimationFrame(id),
    },
  ) {
    this.cues = [...cues].sort((a, b) => a.tMs - b.tMs);
  }

  /** Recompute from the clock; call on timeupdate / seek / ratechange / visibilitychange as well as every frame. */
  sync = (): CueState => {
    const state = cueStateAt(this.cues, this.clock());
    if (state.index !== this.last) {
      this.last = state.index;
      this.onChange(state);
    }
    return state;
  };

  start() {
    const tick = () => {
      this.sync();
      this.raf = this.frame.request(tick);
    };
    this.stop();
    tick();
  }

  stop() {
    if (this.raf !== null) this.frame.cancel(this.raf);
    this.raf = null;
  }

  /** Reveal everything (skip narration). */
  finish() {
    this.stop();
    const state = cueStateEnd(this.cues);
    this.last = state.index;
    this.onChange(state);
  }
}
