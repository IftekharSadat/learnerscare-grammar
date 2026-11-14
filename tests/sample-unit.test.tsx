// @vitest-environment jsdom
/**
 * The rights-cleared sample unit (unit-900): schema, conversation validators, the gate, and a render / play smoke test.
 * This is the test that runs in the distributable package, where the Unit 1 book content is not included.
 */
import { existsSync, readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { checkOption, checkText } from '../src/engine/answer';
import { Unit as UnitSchema } from '../src/engine/schema';
import type { Unit } from '../src/engine/types';
import { evaluateUtterance } from '../src/speech/evaluate';
import { currentTurn, initialState, playable, reduce, summarise } from '../src/speech/machine';
import { Conversation } from '../src/speech/schema';
import { validateConversation } from '../tools/conversation/lib';

const root = ['content-sample', 'content'].find((d) => existsSync(`${d}/units/unit-900/unit.json`));
const dir = `${root}/units/unit-900`;

describe.skipIf(!root)('sample unit (original content)', () => {
  let unit: Unit;
  let conv: Conversation;
  beforeAll(() => {
    unit = JSON.parse(readFileSync(`${dir}/unit.json`, 'utf8'));
    conv = JSON.parse(readFileSync(`${dir}/conversation.json`, 'utf8'));
    window.HTMLMediaElement.prototype.play = () => Promise.resolve();
    window.HTMLMediaElement.prototype.pause = () => {};
    window.scrollTo = () => {};
    Element.prototype.scrollIntoView = () => {};
    window.matchMedia ??= ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} })) as never;
    vi.stubGlobal('fetch', vi.fn());
  });

  it('is valid, fully original, and contains no narration or book text', () => {
    expect(UnitSchema.safeParse(unit).success).toBe(true);
    expect(unit.sections.every((s) => s.book.length === 0)).toBe(true);
    const items = unit.exercises.flatMap((e) => e.items);
    expect(items.every((i) => i.origin === 'learnerscare')).toBe(true);
    expect(JSON.stringify(unit)).not.toMatch(/"src":\s*"audio\//);
    expect(items.filter((i) => !i.isExample)).toHaveLength(16);
    expect(unit.exercises.map((e) => e.type)).toEqual(['gapFill', 'matching', 'buildQuestion', 'positiveNegative']);
  });

  it('every accepted answer of every exercise item is accepted; typical errors get named feedback', () => {
    for (const e of unit.exercises) for (const i of e.items) for (const a of i.acceptedAnswers) expect((e.type === 'matching' ? checkOption(i, a) : checkText(i, a)).correct, `${i.id} ${a}`).toBe(true);
    const item = (id: string) => unit.exercises.flatMap((e) => e.items).find((i) => i.id === id)!;
    expect(checkText(item('9.1.3'), 'is making').code).toBe('wrongBe');
    expect(checkText(item('9.1.4'), 'is runing').code).toBe('spelling');
    expect(checkText(item('9.3.2'), 'What they are watching?').code).toBe('wordOrder');
    expect(checkText(item('9.4.2'), "I'm watching").code).toBe('polarity');
  });

  it('conversation passes the blocking validators; all turns wait for approval', () => {
    const v = validateConversation(unit, conv, dir);
    expect(v.errors).toEqual([]);
    expect(Conversation.safeParse(conv).success).toBe(true);
    expect(v.unapproved).toHaveLength(conv.scenes.flatMap((s) => s.turns).length);
    expect(playable(conv, false).scenes).toHaveLength(0); // nothing ships until a person approves it
  });

  it('Talk plays to the end (review build) and rejects wrong grammar', () => {
    const p = playable(conv, true);
    let s = initialState();
    for (let g = 0; g < 200 && s.phase !== 'done'; g++) {
      if (s.phase === 'intro') s = reduce(p, s, { type: 'start' });
      else if (s.phase === 'turn') {
        const t = currentTurn(p, s);
        for (const w of t.wrongExamples ?? []) expect(evaluateUtterance(t, w.say).gate, `${t.id}: ${w.say}`).not.toBe('pass');
        s = reduce(p, s, { type: 'heard', evaluation: evaluateUtterance(t, t.target.canonical, { confidence: 0.9 }), mode: 'speak' });
      } else if (s.phase === 'verdict') s = reduce(p, s, { type: 'next' });
      else s = reduce(p, s, { type: 'nextScene' });
    }
    expect(s.phase).toBe('done');
    expect(summarise(p, s).passed).toBe(10);
  });

  it('renders every explanation node and plays an exercise and the Mistake Hunt', async () => {
    const { NodeScreen } = await import('../src/screens/NodeScreen');
    for (const node of unit.journey.filter((n) => n.kind === 'explain')) {
      const view = render(<NodeScreen unit={unit} nodeId={node.id} />);
      expect(screen.getByTestId('step-stage').textContent!.length).toBeGreaterThan(20);
      view.unmount();
    }
    render(<NodeScreen unit={unit} nodeId="ex-9.1" />);
    expect(screen.getByTestId('official-card').textContent).toContain('is sleeping'); // worked example
    fireEvent.click(screen.getByTestId('next-btn'));
    fireEvent.click(screen.getByRole('button', { name: 'is' }));
    fireEvent.click(screen.getByRole('button', { name: 'reading' }));
    fireEvent.click(screen.getByTestId('check-btn'));
    expect(screen.getByTestId('feedback-wrong').getAttribute('data-code')).toBe('wrongBe');
    fireEvent.click(screen.getByRole('button', { name: 'am' }));
    fireEvent.click(screen.getByRole('button', { name: 'reading' }));
    fireEvent.click(screen.getByTestId('check-btn'));
    expect(screen.getByTestId('feedback-right')).toBeTruthy();
    cleanup();
    render(<NodeScreen unit={unit} nodeId="mistakes" />);
    fireEvent.click(screen.getByTestId('mistake-sentence').querySelector('[data-bad="1"]')!);
    fireEvent.click(screen.getByTestId('fix-right'));
    fireEvent.click(screen.getByTestId('check-btn'));
    expect(screen.getByTestId('feedback-right')).toBeTruthy();
  });
});
