/** End-of-unit certificate: drawn on a canvas, exportable as a PNG (includes the learner's name). */
import { useEffect, useRef } from 'react';
import { useStore } from '@/engine/store';
import type { Unit } from '@/engine/types';
import { Icon } from '@/ui/basics';

export function Certificate({ unit, stars, maxStars }: { unit: Unit; stars: number; maxStars: number }) {
  const name = useStore((s) => s.progress.learnerName);
  const setName = useStore((s) => s.setName);
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    const g = c?.getContext('2d');
    if (!c || !g) return;
    const W = (c.width = 1200), H = (c.height = 800);
    g.fillStyle = '#14184A'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#F6F4FF';
    g.beginPath(); g.roundRect(36, 36, W - 72, H - 72, 36); g.fill();
    g.strokeStyle = '#FFC83D'; g.lineWidth = 6;
    g.beginPath(); g.roundRect(60, 60, W - 120, H - 120, 26); g.stroke();
    g.textAlign = 'center';
    g.fillStyle = '#6C4DF4'; g.font = '800 26px Nunito Variable, sans-serif';
    g.fillText('LEARNERSCARE  ·  CERTIFICATE OF COMPLETION', W / 2, 150);
    g.fillStyle = '#14184A'; g.font = '650 84px Fraunces, Georgia, serif';
    g.fillText(name.trim() || 'Your name', W / 2, 300);
    g.fillStyle = '#5B5F8C'; g.font = '600 30px Nunito Variable, sans-serif';
    g.fillText('has completed', W / 2, 365);
    // shrink long titles so they always fit inside the frame
    const heading = unit.number >= 900 ? unit.title : `Unit ${unit.number} · ${unit.title}`;
    let size = 54;
    g.fillStyle = '#14184A';
    do { g.font = `650 ${size}px Fraunces, Georgia, serif`; size -= 2; } while (g.measureText(heading).width > W - 220 && size > 24);
    g.fillText(heading, W / 2, 445);
    g.fillStyle = '#5B5F8C'; g.font = '600 28px Nunito Variable, sans-serif';
    g.fillText(`(${unit.subtitle})  —  ${stars} of ${maxStars} stars`, W / 2, 500);
    const tiles: [string, string][] = [['subject', '#D2392D'], ['am / is / are', '#0A7F74'], ['verb-ing', '#6C4DF4']];
    let x = W / 2 - 330;
    g.font = '800 30px Nunito Variable, sans-serif';
    for (const [label, col] of tiles) {
      g.fillStyle = col; g.beginPath(); g.roundRect(x, 560, 200, 64, 16); g.fill();
      g.fillStyle = '#fff'; g.fillText(label, x + 100, 602);
      x += 230;
    }
    g.fillStyle = '#5B5F8C'; g.font = '600 22px Nunito Variable, sans-serif';
    g.fillText(new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }), W / 2, 700);
  }, [name, unit, stars, maxStars]);
  const save = () => {
    const c = ref.current;
    if (!c) return;
    c.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `learnerscare-unit-${unit.number}-certificate.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }, 'image/png');
  };
  return (
    <div className="w-full max-w-md">
      <label className="mb-2 block text-left">
        <span className="mb-1 block text-xs font-extrabold uppercase tracking-wider text-muted">Name on the certificate</span>
        <input className="w-full rounded-2xl border-2 border-line bg-surface px-4 py-3 text-lg font-bold outline-none focus:border-primary" value={name} maxLength={40}
          onChange={(e) => setName(e.target.value)} placeholder="Type your name" data-testid="cert-name" />
      </label>
      <canvas ref={ref} className="w-full rounded-2xl shadow-card" role="img" aria-label={`Certificate for ${name || 'you'}: Unit ${unit.number}, ${unit.title}`} />
      <button className="btn btn-gold mt-3 w-full" onClick={save} data-testid="cert-save"><Icon name="download" size={18} />Save certificate image</button>
    </div>
  );
}
