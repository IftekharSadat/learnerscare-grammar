import { useStore } from '@/engine/store';
import type { Settings } from '@/engine/progress';
import { Sheet } from './basics';

function Seg<T extends string | number | boolean>({ label, value, options, onChange, id }: { label: string; value: T; options: { v: T; l: string }[]; onChange: (v: T) => void; id: string }) {
  return (
    <div className="mb-4" role="radiogroup" aria-label={label}>
      <p className="mb-1 text-xs font-extrabold uppercase tracking-wider text-muted">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <button key={String(o.v)} role="radio" aria-checked={value === o.v} data-testid={`${id}-${o.v}`} onClick={() => onChange(o.v)}
            className="min-h-[44px] flex-1 rounded-xl border-2 px-3 text-sm font-extrabold"
            style={{ borderColor: value === o.v ? 'var(--primary)' : 'var(--line)', background: value === o.v ? 'var(--surface-2)' : 'transparent' }}>{o.l}</button>
        ))}
      </div>
    </div>
  );
}

function Slider({ label, value, onChange, id }: { label: string; value: number; onChange: (v: number) => void; id: string }) {
  return (
    <label className="mb-3 flex items-center gap-3">
      <span className="w-24 text-sm font-extrabold">{label}</span>
      <input type="range" min={0} max={1} step={0.05} value={value} onChange={(e) => onChange(Number(e.target.value))} className="h-11 flex-1 accent-[color:var(--primary)]" data-testid={id} aria-valuetext={`${Math.round(value * 100)}%`} />
      <span className="w-10 text-right text-sm font-bold text-muted">{Math.round(value * 100)}</span>
    </label>
  );
}

export function SettingsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const s = useStore((x) => x.settings);
  const set = useStore((x) => x.set);
  const preset = useStore((x) => x.applyPreset);
  const reset = useStore((x) => x.reset);
  const on = <K extends keyof Settings>(k: K) => (v: Settings[K]) => set(k, v);
  const yesNo = [{ v: true, l: 'On' }, { v: false, l: 'Off' }];
  return (
    <Sheet open={open} onClose={onClose} title="Settings">
      <Seg id="mode" label="Who is learning?" value={s.mode} onChange={preset}
        options={[{ v: 'explorer', l: 'Explorer' }, { v: 'classic', l: 'Classic' }, { v: 'focus', l: 'Focus' }]} />
      <p className="-mt-2 mb-4 text-sm font-semibold text-muted">
        {s.mode === 'explorer' ? 'Bigger type, more animation, Pip cheers you on.' : s.mode === 'focus' ? 'Quiet screen, typing by default, fewer celebrations.' : 'Balanced: tiles, narration and gentle rewards.'}
      </p>
      <Seg id="theme" label="Theme" value={s.theme} onChange={on('theme')} options={[{ v: 'light', l: 'Light' }, { v: 'dark', l: 'Dark' }, { v: 'contrast', l: 'High contrast' }]} />
      <Seg id="text" label="Text size" value={s.textScale} onChange={on('textScale')} options={[{ v: 0.9, l: 'Small' }, { v: 1, l: 'Medium' }, { v: 1.15, l: 'Large' }, { v: 1.3, l: 'Extra' }]} />
      <Seg id="font" label="Easy-read font (dyslexia-friendly)" value={s.dyslexiaFont} onChange={on('dyslexiaFont')} options={yesNo} />
      <Seg id="motion" label="Motion" value={s.reducedMotion} onChange={on('reducedMotion')} options={[{ v: 'system', l: 'Follow device' }, { v: 'off', l: 'Full' }, { v: 'on', l: 'Reduced' }]} />
      <p className="mb-1 text-xs font-extrabold uppercase tracking-wider text-muted">Sound</p>
      <Slider id="vol-narration" label="Narration" value={s.narrationVolume} onChange={on('narrationVolume')} />
      <Slider id="vol-effects" label="Effects" value={s.effectsVolume} onChange={on('effectsVolume')} />
      <Slider id="vol-music" label="Music" value={s.musicVolume} onChange={on('musicVolume')} />
      <Seg id="autoplay" label="Start narration automatically" value={s.autoplay} onChange={on('autoplay')} options={yesNo} />
      <Seg id="captions" label="Captions" value={s.captions} onChange={on('captions')} options={yesNo} />
      <Seg id="speed" label="Narration speed" value={s.speed} onChange={on('speed')} options={[{ v: 0.75, l: '0.75×' }, { v: 1, l: '1×' }, { v: 1.25, l: '1.25×' }]} />
      <Seg id="input" label="Answer with" value={s.inputMode} onChange={on('inputMode')} options={[{ v: 'tiles', l: 'Tiles' }, { v: 'type', l: 'Typing' }]} />
      <Seg id="advanced" label="Extra distractor tiles (advanced)" value={s.advanced} onChange={on('advanced')} options={yesNo} />
      <Seg id="mascot" label="Pip, your guide" value={s.mascot} onChange={on('mascot')} options={yesNo} />
      <Seg id="hintlang" label="Hint language" value={s.hintLanguage} onChange={on('hintLanguage')} options={[{ v: 'off', l: 'English only' }, { v: 'bn', l: 'বাংলা (coming soon)' }]} />
      {s.hintLanguage === 'bn' && <p className="-mt-2 mb-4 text-sm font-semibold text-muted">Bengali hints have not been added yet. Hints stay in English until they are.</p>}
      <div className="mt-2 border-t border-line pt-4">
        <p className="mb-2 text-sm font-semibold text-muted">No ads, no tracking. Progress stays on this device.</p>
        <button className="btn btn-ghost w-full !text-[color:var(--bad)]" data-testid="reset"
          onClick={() => { if (window.confirm('Erase all progress and settings on this device?')) void reset(); }}>Erase my progress</button>
      </div>
    </Sheet>
  );
}
