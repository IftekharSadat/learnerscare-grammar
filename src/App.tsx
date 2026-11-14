import { lazy, Suspense, useEffect, useState } from 'react';
import { AnimatePresence, motion, MotionConfig } from 'framer-motion';
import { narration } from './engine/audio';
import { loadManifest, loadUnit } from './engine/content';
import { unlockSfx } from './engine/sfx';
import { useStore } from './engine/store';
import type { Manifest, Unit } from './engine/types';
import { navigate, useRoute } from './router';
import { MapScreen } from './screens/MapScreen';
import { Pip } from './ui/basics';
import { SettingsSheet } from './ui/Settings';

const NodeScreen = lazy(() => import('./screens/NodeScreen').then((m) => ({ default: m.NodeScreen })));
const ProfileScreen = lazy(() => import('./screens/Profile').then((m) => ({ default: m.ProfileScreen })));
const TalkScreen = lazy(() => import('./screens/TalkScreen').then((m) => ({ default: m.TalkScreen })));
const SpeechLab = lazy(() => import('./screens/SpeechLab').then((m) => ({ default: m.SpeechLab })));
const labEnabled = import.meta.env.DEV || (import.meta.env as Record<string, string | undefined>).VITE_SPEECH_LAB === 'true';
const FixItScreen = lazy(() => import('./screens/Profile').then((m) => ({ default: m.FixItScreen })));

function Splash({ text }: { text: string }) {
  return (
    <div className="grid min-h-[100dvh] place-items-center p-6 text-center" role="status">
      <div><Pip mood="think" size={84} /><p className="mt-3 font-extrabold">{text}</p></div>
    </div>
  );
}

export default function App() {
  const route = useRoute();
  const hydrated = useStore((s) => s.hydrated);
  const hydrate = useStore((s) => s.hydrate);
  const toast = useStore((s) => s.toast);
  const motionPref = useStore((s) => s.settings.reducedMotion);
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [unit, setUnit] = useState<Unit | null>(null);
  const [error, setError] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => { void hydrate(); }, [hydrate]);
  useEffect(() => { loadManifest().then(setManifest).catch((e: Error) => setError(e.message)); }, []);
  useEffect(() => {
    const unlock = () => { narration.unlock(); unlockSfx(); };
    window.addEventListener('pointerdown', unlock, { capture: true });
    window.addEventListener('keydown', unlock, { capture: true });
    const open = () => setSettingsOpen(true);
    window.addEventListener('open-settings', open);
    return () => { window.removeEventListener('pointerdown', unlock, { capture: true }); window.removeEventListener('keydown', unlock, { capture: true }); window.removeEventListener('open-settings', open); };
  }, []);

  const unitId = route.unitId ?? manifest?.units[0]?.id;
  useEffect(() => {
    if (!unitId) return;
    let live = true;
    setUnit((u) => (u?.id === unitId ? u : null));
    loadUnit(unitId).then((u) => live && setUnit(u)).catch((e: Error) => live && setError(e.message));
    return () => { live = false; };
  }, [unitId]);
  useEffect(() => { if (route.name !== 'node') narration.stop(); }, [route.name]);
  useEffect(() => { if (unit) document.title = `Unit ${unit.number} · ${unit.title} — LearnersCare`; }, [unit]);

  if (error) return <div className="grid min-h-[100dvh] place-items-center p-6 text-center"><div><p className="font-display text-2xl">Something went wrong</p><p className="mt-2 font-semibold text-muted">{error}</p><button className="btn btn-primary mt-4" onClick={() => location.reload()}>Try again</button></div></div>;
  if (!hydrated || !manifest || !unit) return <Splash text="Loading your unit…" />;

  return (
    <MotionConfig reducedMotion={motionPref === 'on' ? 'always' : motionPref === 'off' ? 'never' : 'user'}>
      <a href="#main" className="sr-only-live focus:not-sr-only" onClick={(e) => { e.preventDefault(); document.getElementById('main')?.focus(); }}>Skip to content</a>
      <Suspense fallback={<Splash text="Loading…" />}>
        {route.name === 'lab' && labEnabled ? <SpeechLab unit={unit} />
          : route.name === 'node' && route.nodeId === 'talk' && unit.journey.some((n) => n.kind === 'talk') ? <TalkScreen key={unit.id} unit={unit} />
          : route.name === 'node' && route.nodeId ? <NodeScreen key={unit.id + route.nodeId} unit={unit} nodeId={route.nodeId} />
          : route.name === 'profile' ? <ProfileScreen unit={unit} />
          : route.name === 'fixit' ? <FixItScreen unit={unit} later={route.query.get('later') === '1'} />
          : <main id="main" tabIndex={-1} className="outline-none"><MapScreen unit={unit} manifest={manifest} /></main>}
      </Suspense>
      <SettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 top-3 z-50 flex justify-center px-4">
        <AnimatePresence>
          {toast && (
            <motion.div key={toast.id} initial={{ y: -30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -30, opacity: 0 }}
              className="flex items-center gap-2 rounded-full px-4 py-2 font-extrabold text-white shadow-pop" style={{ background: '#14184A' }} data-testid="toast">
              {toast.emoji && <span aria-hidden="true">{toast.emoji}</span>}{toast.text}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </MotionConfig>
  );
}

export { navigate };
