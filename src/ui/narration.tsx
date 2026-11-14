import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { narration } from '@/engine/audio';
import { asset } from '@/engine/content';
import { CueScheduler, cueStateEnd, type CueState } from '@/engine/cueScheduler';
import { useStore } from '@/engine/store';
import { t } from '@/engine/i18n';
import type { Clip } from '@/engine/types';
import { Icon } from './basics';

export type NarrationStatus = 'idle' | 'playing' | 'paused' | 'ended' | 'blocked';

export interface NarrationApi {
  status: NarrationStatus;
  /** cue state for scenes; everything is visible when narration is idle / ended / skipped */
  cue: CueState;
  revealAll: boolean;
  caption: string;
  barRef: React.RefObject<HTMLDivElement>;
  hasAudio: boolean;
  toggle(): void;
  replay(): void;
  skip(): void;
}

/** Plays one clip and keeps cue state + captions in sync with the audio clock. */
export function useNarration(unitId: string, clip: Clip | null | undefined, opts: { autoplay?: boolean; label?: string; onEnd?: () => void } = {}): NarrationApi {
  const autoplaySetting = useStore((s) => s.settings.autoplay);
  const url = clip ? asset(unitId, clip.src) : null;
  const cues = useMemo(() => clip?.cues ?? [], [clip]);
  const [status, setStatus] = useState<NarrationStatus>('idle');
  const [cue, setCue] = useState<CueState>(() => cueStateEnd(cues));
  const [caption, setCaption] = useState('');
  const barRef = useRef<HTMLDivElement>(null);
  const onEnd = useRef(opts.onEnd);
  onEnd.current = opts.onEnd;
  const mine = useRef(false);

  useEffect(() => {
    mine.current = false;
    setStatus('idle');
    setCaption('');
    setCue(cueStateEnd(cues));
    if (!url || !clip) return;
    const sched = new CueScheduler(cues, () => narration.timeMs, (s) => mine.current && setCue(s));
    let capIndex = -1;
    let raf = 0;
    const frame = () => {
      if (mine.current && narration.state.src === url) {
        const tMs = narration.timeMs;
        sched.sync();
        const caps = clip.captions ?? [];
        let idx = -1;
        for (let i = 0; i < caps.length; i++) if (caps[i].tMs <= tMs) idx = i;
        if (idx !== capIndex) {
          capIndex = idx;
          setCaption(idx >= 0 ? caps[idx].text : '');
        }
        if (barRef.current) barRef.current.style.transform = `scaleX(${Math.min(1, tMs / clip.durationMs)})`;
      }
      raf = requestAnimationFrame(frame);
    };
    const unsub = narration.subscribe((s) => {
      if (s.src !== url) {
        if (mine.current) { mine.current = false; setStatus('idle'); setCue(cueStateEnd(cues)); }
        return;
      }
      if (s.blocked) { setStatus('blocked'); setCue(cueStateEnd(cues)); }
      else if (s.ended) { setStatus('ended'); setCue(cueStateEnd(cues)); setCaption(''); if (barRef.current) barRef.current.style.transform = 'scaleX(1)'; onEnd.current?.(); }
      else if (s.playing) { setStatus('playing'); sched.sync(); }
      else setStatus((prev) => (prev === 'playing' ? 'paused' : prev));
    });
    const start = () => {
      mine.current = true;
      void narration.play(url, opts.label);
      if (!narration.state.blocked) { setCue(sched.sync()); }
    };
    if ((opts.autoplay ?? true) && autoplaySetting) start();
    raf = requestAnimationFrame(frame);
    const onVisible = () => sched.sync();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelAnimationFrame(raf);
      unsub();
      document.removeEventListener('visibilitychange', onVisible);
      if (mine.current && narration.state.src === url) narration.stop();
      mine.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  const replay = useCallback(() => {
    if (!url) return;
    mine.current = true;
    narration.unlock();
    void narration.play(url, opts.label);
  }, [url, opts.label]);
  const toggle = useCallback(() => {
    if (!url) return;
    if (!mine.current || narration.state.src !== url || narration.state.ended || narration.state.blocked) return replay();
    narration.toggle();
  }, [url, replay]);
  const skip = useCallback(() => {
    if (mine.current && narration.state.src === url) narration.skip();
    else { setStatus('ended'); setCue(cueStateEnd(cues)); }
  }, [url, cues]);

  return { status, cue, revealAll: status === 'idle' || status === 'ended' || status === 'blocked', caption, barRef, hasAudio: !!url, toggle, replay, skip };
}

const SPEEDS = [0.75, 1, 1.25];

export function AudioBar({ nar, compact = false }: { nar: NarrationApi; compact?: boolean }) {
  const speed = useStore((s) => s.settings.speed);
  const captions = useStore((s) => s.settings.captions);
  const set = useStore((s) => s.set);
  if (!nar.hasAudio) return null;
  const playing = nar.status === 'playing';
  return (
    <div className="w-full">
      <div className="flex items-center gap-2 rounded-2xl bg-surface2 p-1.5" role="group" aria-label="Narration controls">
        <button className="btn btn-primary !min-h-[44px] !min-w-[44px] !rounded-xl !px-3" onClick={nar.toggle}
          aria-label={playing ? t('audio.pause') : t('audio.play')} data-testid="audio-toggle">
          <Icon name={playing ? 'pause' : 'play'} />
          {nar.status === 'blocked' && !compact && <span className="text-sm">{t('audio.tapToListen')}</span>}
        </button>
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-line" aria-hidden="true">
          <div ref={nar.barRef} className="h-full origin-left rounded-full bg-primary" style={{ transform: 'scaleX(0)' }} />
        </div>
        <button className="btn btn-quiet !min-h-[44px] !min-w-[44px] !px-2" onClick={nar.replay} aria-label={t('audio.replay')}><Icon name="replay" /></button>
        <button className="btn btn-quiet !min-h-[44px] !min-w-[52px] !px-2 text-sm" aria-label={`${t('audio.speed')}: ${speed}×`}
          onClick={() => set('speed', SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length])}>{speed}×</button>
        <button className="btn btn-quiet !min-h-[44px] !min-w-[44px] !px-2" aria-pressed={captions} aria-label={t('audio.captions')}
          onClick={() => set('captions', !captions)} style={{ opacity: captions ? 1 : 0.55 }}><Icon name="cc" /></button>
        {(playing || nar.status === 'paused') && (
          <button className="btn btn-quiet !min-h-[44px] !min-w-[44px] !px-2" onClick={nar.skip} aria-label={t('audio.skip')} data-testid="audio-skip"><Icon name="skip" /></button>
        )}
      </div>
      {captions && (
        <p className="mt-1.5 min-h-[2.6em] px-1 text-center text-[0.92rem] font-semibold leading-snug text-muted" aria-live="off" data-testid="caption">
          {nar.caption}
        </p>
      )}
    </div>
  );
}
