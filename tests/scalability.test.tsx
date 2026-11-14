// @vitest-environment jsdom
/**
 * Scalability proof: a tiny synthetic "Unit 2" goes through the same ingest CLI and renders with the same
 * engine — no code changes. Everything is written to a temp folder and removed afterwards.
 * Also serves as the React Testing Library smoke test for the node player.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Manifest, Unit as UnitSchema } from '../src/engine/schema';
import type { Unit } from '../src/engine/types';

// needs the ingest toolchain (python3 + python-pptx + lxml, ffmpeg, LibreOffice, pdftotext); skipped where it is not installed
const TOOLCHAIN = spawnSync('python3', ['-c', 'import pptx, lxml']).status === 0 && ['soffice', 'ffmpeg', 'pdftotext'].every((b) => spawnSync('which', [b]).status === 0);
const dir = mkdtempSync(join(tmpdir(), 'lc-unit2-'));
let unit: Unit;

beforeAll(() => {
  if (!TOOLCHAIN) return;
  execFileSync('python3', ['-I', 'tools/ingest/make_synthetic.py', join(dir, 'src')], { stdio: 'pipe' });
  execFileSync('python3', ['-I', 'tools/ingest/ingest.py', '--unit', '002',
    '--explain', join(dir, 'src/explain.pptx'), '--exercises', join(dir, 'src/exercises.pptx'),
    '--book-explain', join(dir, 'src/book-explain.pdf'), '--book-exercises', join(dir, 'src/book-exercises.pdf'),
    '--out', join(dir, 'content/units')], { stdio: 'pipe' });
  unit = JSON.parse(readFileSync(join(dir, 'content/units/unit-002/unit.json'), 'utf8'));
  // jsdom stubs
  window.HTMLMediaElement.prototype.play = () => Promise.resolve();
  window.HTMLMediaElement.prototype.pause = () => {};
  window.scrollTo = () => {};
  Element.prototype.scrollIntoView = () => {};
  window.matchMedia ??= ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} })) as never;
  vi.stubGlobal('fetch', vi.fn());
}, 120_000);
afterAll(() => { cleanup(); rmSync(dir, { recursive: true, force: true }); });

describe.skipIf(!TOOLCHAIN)('synthetic Unit 2 (no code changes)', () => {
  it('validates against the same schema and updates a manifest', () => {
    expect(UnitSchema.safeParse(unit).success).toBe(true);
    const manifest = Manifest.parse(JSON.parse(readFileSync(join(dir, 'content/index.json'), 'utf8')));
    expect(manifest.units.map((u) => u.id)).toEqual(['unit-002']);
    expect(unit.title).toBe('Present simple');
    expect(unit.sections.map((s) => s.key)).toEqual(['intro', 'A', 'B']);
    expect(unit.exercises[0].type).toBe('buildQuestion');
    expect(unit.exercises[0].items.map((i) => [i.id, i.isExample])).toEqual([['2.1.1', true], ['2.1.2', false], ['2.1.3', false]]);
    expect(unit.exercises[0].items[1].audio.question?.durationMs).toBeGreaterThan(500);
    expect(unit.exercises[0].items[1].audio.pauseMs).toBeGreaterThan(1500);
    expect(unit.journey.map((n) => n.kind)).toEqual(['explain', 'explain', 'explain', 'exercise', 'complete']);
  });

  it('renders every node with the existing engine and plays the exercise', async () => {
    const { NodeScreen } = await import('../src/screens/NodeScreen');
    for (const node of unit.journey.filter((n) => n.kind === 'explain')) {
      const view = render(<NodeScreen unit={unit} nodeId={node.id} />);
      expect(screen.getByTestId('step-stage')).toBeTruthy();
      view.unmount();
    }
    render(<NodeScreen unit={unit} nodeId="sec-A" />);
    expect(screen.getByTestId('step-stage').textContent).toContain('Bakers make bread early in the morning');
    fireEvent.click(screen.getByTestId('next-btn'));
    expect(screen.getByTestId('book-stage').textContent).toContain('We use the present simple for things in general.');
    cleanup();

    render(<NodeScreen unit={unit} nodeId="ex-2.1" />);
    fireEvent.click(screen.getByTestId('next-btn')); // intro
    expect(screen.getByTestId('official-card').textContent).toContain('Where do you work?'); // worked example
    fireEvent.click(screen.getByTestId('next-btn'));
    for (const word of ['Where', 'does', 'she', 'live']) fireEvent.click(screen.getByRole('button', { name: word }));
    fireEvent.click(screen.getByTestId('check-btn'));
    expect(screen.getByTestId('feedback-right')).toBeTruthy();
    expect(screen.getByTestId('official-card').textContent).toContain('Where does she live?');
  });
});
