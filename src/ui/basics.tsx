import { useEffect, useRef, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Line, Media, Run, Role } from '@/engine/types';
import { asset } from '@/engine/content';
import { playSfx } from '@/engine/sfx';

/* ---------- icons (inline, original) ---------- */
const PATHS: Record<string, string> = {
  play: 'M8 5v14l11-7z',
  pause: 'M6 5h4v14H6zM14 5h4v14h-4z',
  replay: 'M12 5V2L7 6l5 4V7a5 5 0 1 1-5 5H5a7 7 0 1 0 7-7z',
  skip: 'M5 5l9 7-9 7zM16 5h3v14h-3z',
  back: 'M15 5l-7 7 7 7',
  close: 'M6 6l12 12M18 6L6 18',
  gear: 'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-8 9a8 8 0 0 1 16 0z',
  check: 'M5 12.500l4.5 4.500L19 7.5',
  cross: 'M6 6l12 12M18 6L6 18',
  bulb: 'M9 18h6v2H9zM12 3a6 6 0 0 0-3.5 10.900V16h7v-2.100A6 6 0 0 0 12 3z',
  cc: 'M3 6h18v12H3zM10.5 10.5a2 2 0 1 0 0 3M17 10.5a2 2 0 1 0 0 3',
  lock: 'M7 10V8a5 5 0 0 1 10 0v2h1v10H6V10zm2 0h6V8a3 3 0 0 0-6 0z',
  star: 'M12 2.500l2.9 6.2 6.6.800-4.9 4.6 1.3 6.600L12 17.400l-5.9 3.3 1.3-6.600L2.5 9.500l6.6-.800z',
  flame: 'M12 2s5 4 5 9a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3 1-6 1-8z',
  bolt: 'M13 2L4 14h6l-1 8 9-12h-6z',
  book: 'M4 4h7a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H4zM20 4h-3a3 3 0 0 0-3 3',
  search: 'M10 4a6 6 0 1 0 3.9 10.600L19 19.7 20.4 18.300l-5.1-5.100A6 6 0 0 0 10 4z',
  trophy: 'M7 4h10v3a5 5 0 0 1-10 0zM4 5h3v2a3 3 0 0 1-3-2zm16 0h-3v2a3 3 0 0 0 3-2zM10 13h4v4h3v3H7v-3h3z',
  spark: 'M12 2l2 7 7 3-7 3-2 7-2-7-7-3 7-3z',
  flag: 'M5 3v18M5 4h12l-2 4 2 4H5',
  download: 'M12 3v11m0 0l-4-4m4 4l4-4M4 19h16',
  pencil: 'M4 20l1-5L16 4l4 4L9 19z',
  image: 'M3 5h18v14H3zM7 15l4-4 3 3 2-2 3 3',
  link: 'M9 15l6-6M8 8H7a4 4 0 0 0 0 8h1M16 8h1a4 4 0 0 1 0 8h-1',
  question: 'M9 9a3 3 0 1 1 4.5 2.600c-.900.6-1.5 1.2-1.5 2.400M12 18h.01',
  plusminus: 'M5 8h6M8 5v6M13 17h6M5 19L19 5',
  keyboard: 'M3 6h18v12H3zM6 9h2M10 9h2M14 9h2M6 12h2M10 12h2M14 12h2M8 15h8',
  mic: 'M12 3a3 3 0 0 1 3 3v5a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3zM6 11a6 6 0 0 0 12 0M12 17v4M8 21h8',
  tiles: 'M3 5h8v6H3zM13 5h8v6h-8zM3 13h8v6H3zM13 13h8v6h-8z',
};
const STROKED = new Set(['mic', 'cc', 'gear', 'back', 'close', 'check', 'cross', 'book', 'flag', 'download', 'image', 'link', 'question', 'plusminus', 'keyboard']);

export function Icon({ name, size = 22, className }: { name: string; size?: number; className?: string }) {
  const d = PATHS[name] ?? PATHS.spark;
  const stroked = STROKED.has(name);
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className={className}
      fill={stroked ? 'none' : 'currentColor'} stroke={stroked ? 'currentColor' : 'none'} strokeWidth={stroked ? 2.4 : 0}
      strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

/* ---------- role-coloured text ---------- */
const BE_RE = /^(am|is|are|isn[’']t|aren[’']t|[’']m|[’']s|[’']re)$/i;

/** Fallback role detection for lines without deck colouring (pronoun/noun + be + verb-ing). */
export function guessRuns(text: string): Run[] {
  const parts = text.split(/(\s+|(?=[’'](?:m|s|re)\b))/).filter((p) => p !== '');
  const runs: Run[] = [];
  for (let i = 0; i < parts.length; i++) {
    const w = parts[i];
    const bare = w.replace(/[“”".,?!()]/g, '');
    const next = parts.slice(i + 1).find((p) => p.trim())?.replace(/[“”".,?!()]/g, '') ?? '';
    const next2 = parts.slice(i + 1).filter((p) => p.trim())[1]?.replace(/[“”".,?!()]/g, '') ?? '';
    const prevWords = runs.filter((r) => r.t.trim());
    const prev = prevWords[prevWords.length - 1];
    const prev2 = prevWords[prevWords.length - 2];
    const afterBe = prev?.role === 'be' || (/^not$/i.test(prev?.t.trim() ?? '') && prev2?.role === 'be');
    if (BE_RE.test(bare) && (/ing$/.test(next) || (/^not$/i.test(next) && /ing$/.test(next2)))) runs.push({ t: w, role: 'be' });
    else if (/^[a-z]{2,}ing$/i.test(bare) && afterBe) runs.push({ t: w, role: 'verb' });
    else runs.push({ t: w });
  }
  return runs;
}

export function Rich({ line, text, guess = false, className }: { line?: Line; text?: string; guess?: boolean; className?: string }) {
  const runs: Run[] = line?.runs ?? (guess ? guessRuns(line?.text ?? text ?? '') : [{ t: line?.text ?? text ?? '' }]);
  return (
    <span className={className}>
      {runs.map((r, i) => (r.role ? <span key={i} className={`role-${r.role}`}>{r.t}</span> : <span key={i}>{r.t}</span>))}
    </span>
  );
}

export const ROLE_LABEL: Record<string, string> = { subject: 'subject', be: 'be', verb: 'verb-ing', qword: 'question word', rest: 'rest', not: 'not' };

export function RoleLegend({ roles = ['subject', 'be', 'verb'] }: { roles?: Role[] }) {
  return (
    <div className="flex flex-wrap gap-2 text-xs font-bold text-muted" aria-label="Colour key">
      {roles.map((r) => (
        <span key={r} className="inline-flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded" style={{ background: `var(--role-${r})` }} aria-hidden="true" />
          {ROLE_LABEL[r]}
        </span>
      ))}
    </div>
  );
}

/* ---------- tiles ---------- */
export function Tile({ children, role, selected, disabled, onClick, label, layoutId, size }: {
  children: ReactNode; role?: string; selected?: boolean; disabled?: boolean; onClick?: () => void; label?: string; layoutId?: string; size?: 'sm';
}) {
  return (
    <motion.button
      type="button" layout={layoutId ? true : undefined} layoutId={layoutId}
      className={`tile ${size === 'sm' ? '!min-h-[40px] !px-3 !text-[0.95rem]' : ''}`}
      data-role={role} data-selected={selected ? 'true' : undefined} disabled={disabled} aria-pressed={selected} aria-label={label}
      onClick={() => { if (onClick) { playSfx('snap'); onClick(); } }}
      transition={{ type: 'spring', stiffness: 520, damping: 32 }}
    >
      {children}
    </motion.button>
  );
}

/* ---------- media ---------- */
export function Picture({ unitId, media, className }: { unitId: string; media: Media; className?: string }) {
  return (
    <img src={asset(unitId, media.src)} alt={media.alt} className={className} draggable={false}
      loading="lazy" decoding="async" role={media.alt ? undefined : 'presentation'} />
  );
}

/* ---------- stars / ring ---------- */
export function Stars({ value, size = 20, animate = false }: { value: number; size?: number; animate?: boolean }) {
  return (
    <span className="inline-flex gap-0.5" role="img" aria-label={`${value} of 3 stars`}>
      {[1, 2, 3].map((n) => (
        <motion.span key={n} initial={animate ? { scale: 0, rotate: -40 } : false} animate={{ scale: 1, rotate: 0 }}
          transition={{ delay: animate ? 0.15 * n : 0, type: 'spring', stiffness: 400, damping: 14 }}
          style={{ color: n <= value ? 'var(--gold)' : 'var(--line)' }}>
          <Icon name="star" size={size} />
        </motion.span>
      ))}
    </span>
  );
}

export function ProgressRing({ value, size = 56, stroke = 6, children, label = 'Progress' }: { value: number; size?: number; stroke?: number; children?: ReactNode; label?: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <span className="relative inline-grid place-items-center" style={{ width: size, height: size }}
      role="progressbar" aria-label={label} aria-valuenow={Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--primary)" strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(1, Math.max(0, value)))} style={{ transition: 'stroke-dashoffset 0.6s ease-out' }} />
      </svg>
      <span className="absolute text-xs font-extrabold">{children}</span>
    </span>
  );
}

/* ---------- mascot: Pip ---------- */
export type Mood = 'idle' | 'think' | 'happy' | 'oops' | 'cheer';
export function Pip({ mood = 'idle', size = 64 }: { mood?: Mood; size?: number }) {
  const eyeY = mood === 'think' ? 24 : 27;
  const mouth =
    mood === 'happy' || mood === 'cheer' ? 'M22 35 Q30 44 38 35' : mood === 'oops' ? 'M24 39 Q30 34 36 39' : mood === 'think' ? 'M25 37 H34' : 'M24 36 Q30 40 36 36';
  return (
    <motion.svg width={size} height={size} viewBox="0 0 60 60" aria-hidden="true"
      animate={mood === 'cheer' ? { y: [0, -8, 0], rotate: [0, -6, 6, 0] } : mood === 'oops' ? { rotate: [0, -8, 8, 0] } : { y: [0, -2, 0] }}
      transition={{ duration: mood === 'idle' || mood === 'think' ? 2.4 : 0.7, repeat: mood === 'idle' || mood === 'think' ? Infinity : 0 }}>
      <path d="M14 46 L10 57 L24 49 Z" fill="#FFC83D" />
      <rect x="5" y="6" width="50" height="43" rx="18" fill="#6C4DF4" />
      <rect x="5" y="6" width="50" height="20" rx="18" fill="#8E76FF" opacity="0.55" />
      <ellipse cx="22" cy={eyeY} rx="4.2" ry={mood === 'happy' || mood === 'cheer' ? 2.2 : 5} fill="#fff" />
      <ellipse cx="38" cy={eyeY} rx="4.2" ry={mood === 'happy' || mood === 'cheer' ? 2.2 : 5} fill="#fff" />
      {mood !== 'happy' && mood !== 'cheer' && (<><circle cx={mood === 'think' ? 23.5 : 22} cy={eyeY + 1} r="2" fill="#14184A" /><circle cx={mood === 'think' ? 39.5 : 38} cy={eyeY + 1} r="2" fill="#14184A" /></>)}
      <path d={mouth} stroke="#fff" strokeWidth="2.6" fill="none" strokeLinecap="round" />
      {mood === 'cheer' && <path d="M48 4l1.5 4 4 1.5-4 1.500L48 15l-1.5-4-4-1.5 4-1.500z" fill="#FFC83D" />}
    </motion.svg>
  );
}

export function PipSays({ mood, children, show = true }: { mood?: Mood; children: ReactNode; show?: boolean }) {
  if (!show) return null;
  return (
    <div className="flex items-end gap-2">
      <Pip mood={mood} size={52} />
      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="card !rounded-2xl !rounded-bl-md px-3 py-2 text-sm font-bold">
        {children}
      </motion.div>
    </div>
  );
}

/* ---------- confetti (canvas, capped) ---------- */
export function Confetti({ fire, count = 90 }: { fire: number; count?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!fire) return;
    const reduce = document.documentElement.dataset.motion === 'reduce';
    const canvas = ref.current;
    if (!canvas || reduce) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = (canvas.width = innerWidth * dpr);
    const h = (canvas.height = innerHeight * dpr);
    const colours = ['#6C4DF4', '#FFC83D', '#0FA597', '#E8473A', '#E9E5FF'];
    const n = Math.min(count, 140);
    const ps = Array.from({ length: n }, (_, i) => ({
      x: w / 2 + (Math.random() - 0.5) * w * 0.3, y: h * 0.35, vx: (Math.random() - 0.5) * 14 * dpr, vy: -(6 + Math.random() * 12) * dpr,
      r: (4 + Math.random() * 5) * dpr, c: colours[i % colours.length], a: Math.random() * 6, va: (Math.random() - 0.5) * 0.4,
    }));
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      ctx.clearRect(0, 0, w, h);
      const life = (t - t0) / 2600;
      for (const p of ps) {
        p.vy += 0.32 * dpr; p.x += p.vx; p.y += p.vy; p.vx *= 0.99; p.a += p.va;
        ctx.save(); ctx.globalAlpha = Math.max(0, 1 - life); ctx.translate(p.x, p.y); ctx.rotate(p.a);
        ctx.fillStyle = p.c; ctx.fillRect(-p.r, -p.r / 2, p.r * 2, p.r); ctx.restore();
      }
      if (life < 1) raf = requestAnimationFrame(tick);
      else ctx.clearRect(0, 0, w, h);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [fire, count]);
  return <canvas ref={ref} className="pointer-events-none fixed inset-0 z-50 h-full w-full" aria-hidden="true" />;
}

/* ---------- sheet (dialog) ---------- */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', key);
    return () => { window.removeEventListener('keydown', key); prev?.focus?.(); };
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-40 flex items-end justify-center bg-[rgba(13,16,51,0.55)] sm:items-center"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
          <motion.div ref={ref} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}
            className="max-h-[92dvh] w-full max-w-[560px] overflow-y-auto rounded-t-[28px] bg-surface p-5 pb-8 shadow-pop outline-none sm:rounded-[28px]"
            initial={{ y: 60 }} animate={{ y: 0 }} exit={{ y: 60 }} transition={{ type: 'spring', stiffness: 380, damping: 34 }}
            onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-xl">{title}</h2>
              <button className="btn btn-quiet !min-h-[44px] !px-3" onClick={onClose} aria-label="Close"><Icon name="close" /></button>
            </div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function OriginTag({ kind }: { kind: 'book' | 'learnerscare' | 'teacher' | 'generated' }) {
  const text = { book: 'From the book', learnerscare: 'LearnersCare explanation', teacher: 'Teacher’s illustration — not from the book', generated: 'Extra practice' }[kind];
  return <span className="chip !text-[0.7rem] uppercase tracking-wide">{text}</span>;
}
