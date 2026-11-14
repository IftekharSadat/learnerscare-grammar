#!/usr/bin/env python3
"""Builds a tiny synthetic "Unit 2" (two decks + two PDFs) that follows the deck conventions.
Used only by tests/scalability.test.tsx to prove a new unit needs no code changes.
  python3 -I tools/ingest/make_synthetic.py <out-dir>
"""
import os, subprocess, sys
from pptx import Presentation
from pptx.util import Emu

out = sys.argv[1]
os.makedirs(out, exist_ok=True)

def tone(path, parts):
    """parts: list of (kind, seconds) with kind 'speech' (sine burst) or 'silence'."""
    filt, n = [], 0
    for kind, sec in parts:
        filt.append(("sine=frequency=220:duration=%s" if kind == "speech" else "anullsrc=r=44100:cl=mono,atrim=duration=%s") % sec + "[a%d]" % n)
        n += 1
    graph = ";".join(filt) + ";" + "".join("[a%d]" % i for i in range(n)) + "concat=n=%d:v=0:a=1[o]" % n
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-filter_complex", graph, "-map", "[o]", "-ar", "44100", "-ac", "1", path], check=True)

def box(shapes, name, text, x, y, w=4000000, h=400000):
    tb = shapes.add_textbox(Emu(x), Emu(y), Emu(w), Emu(h))
    tb.name = name
    tb.text_frame.text = text
    return tb

def group(slide, name, items):
    g = slide.shapes.add_group_shape()
    g.name = name
    for i, (n, t) in enumerate(items):
        box(g.shapes, n, t, 700000, 2000000 + i * 450000)
    return g

def slide(prs, eyebrow, title, subtitle, notes, audio, groups=()):
    s = prs.slides.add_slide(prs.slide_layouts[6])
    box(s.shapes, "Eyebrow", eyebrow, 600000, 300000)
    box(s.shapes, "Title", title, 600000, 700000)
    box(s.shapes, "Subtitle", subtitle, 600000, 1200000)
    for name, items in groups:
        group(s, name, items)
    s.notes_slide.notes_text_frame.text = notes
    mp3 = os.path.join(out, "tmp_%d.mp3" % len(prs.slides))
    tone(mp3, audio)
    mv = s.shapes.add_movie(mp3, Emu(0), Emu(0), Emu(100000), Emu(100000), mime_type="audio/mpeg")
    mv.name = "Narration audio (slide %d)" % len(prs.slides)
    # python-pptx stores movies with a video relationship; the ingest looks for an audio relationship
    for rel in s.part.rels.values():
        if rel.reltype.endswith("/video"):
            rel._reltype = rel.reltype.replace("/video", "/audio")
    return s

# ---- explanation deck -------------------------------------------------------------------------
prs = Presentation()
prs.slide_width, prs.slide_height = Emu(12192000), Emu(6858000)
slide(prs, "UNIT 2 · PRESENT SIMPLE", "I do", "Things in general.", "Welcome to unit two.", [("speech", 1.2)])
slide(prs, "SECTION A · GENERAL TRUTHS", "Things in general", "Bakers make bread.", "Section A. Bakers make bread early in the morning.",
      [("speech", 1.5)], [("Rule", [("r1", "We use the present simple for things in general.")]), ("Example", [("e1", "“Bakers make bread early in the morning.”")])])
slide(prs, "SECTION B · QUESTIONS", "do / does", "Do you work?", "Section B. We use do and does in questions.",
      [("speech", 1.5)], [("Example", [("e1", "“Where do you keep the keys?”")])])
prs.save(os.path.join(out, "explain.pptx"))

# ---- exercise deck ----------------------------------------------------------------------------
prs = Presentation()
prs.slide_width, prs.slide_height = Emu(12192000), Emu(6858000)
slide(prs, "EXERCISE 2.1 · SECTION B", "Write questions", "Use do or does.", "VOICE-OVER\nExercise two point one. Write questions.\n\nDELIVERY NOTES\nClear.",
      [("speech", 1.5)], [("Pattern A", [("Label", "WITH A QUESTION WORD"), ("Tile a", "Question word"), ("Tile b", "do / does"), ("Tile c", "subject"), ("Tile d", "verb")]),
                          ("Book example", [("Example", "EXAMPLE IN THE BOOK   I work in a bank.   →   Where do you work?   (where / you / work?)")])])
for n, (sit, cue, ans, tiles) in enumerate([
    ("Ann lives in a flat.", "(where / she / live?)", "Where does she live?", [("Where", "question word"), ("does", "be"), ("she", "subject"), ("live", "verb + -ing")]),
    ("They play tennis.", "(they / play / often?)", "Do they play often?", [("Do", "be"), ("they", "subject"), ("play", "verb + -ing"), ("often", "rest of sentence")]),
], 2):
    tl = []
    for t, r in tiles:
        tl += [("Tile " + t, t), ("role " + t, r)]
    slide(prs, "EXERCISE 2.1 · QUESTION %d" % n, "Write the question", "Use do or does.",
          "VOICE-OVER\nNumber %d. %s [PAUSE 2 s] The official answer: %s\n\nDELIVERY NOTES\nPause." % (n, sit, ans),
          [("speech", 1.2), ("silence", 2.0), ("speech", 1.4)],
          [("Situation and cue", [("Number", str(n)), ("Situation", sit), ("Cue label", "CUE WORDS"), ("Cue chip", cue)]),
           ("Official answer", [("Label pill", "OFFICIAL ANSWER"), ("Answer text", ans)]),
           ("Sentence tiles", tl), ("Why", [("Label", "WHY"), ("Text", "Question word, then do or does, then the subject.")])])
slide(prs, "LEARNERSCARE", "Well done!", "You have completed Unit 2.", "VOICE-OVER\nWell done!\n\nDELIVERY NOTES\nWarm.", [("speech", 1.0)])
prs.save(os.path.join(out, "exercises.pptx"))

for name, text in (("book-explain", " Unit\n 2         Present simple (I do)\n       A   We use the present simple for things in general.\n                    Bakers make bread early in the morning.\n\n       B   We use do/does in questions.\n                    Where do you keep the keys?\n\n4              Present continuous ➜ Unit 1\n"),
                   ("book-exercises", "Exercises\n2.1    Write questions.\n       1 I work in a bank.      (where / you / work?)\n")):
    txt = os.path.join(out, name + ".txt")
    open(txt, "w", encoding="utf-8").write(text)
    # a private profile per run: two soffice processes cannot share one (tests run in parallel)
    subprocess.run(["soffice", "-env:UserInstallation=file://" + os.path.abspath(os.path.join(out, "lo-profile")), "--headless", "--convert-to", "pdf", "--outdir", out, txt], check=True, capture_output=True)
import shutil
shutil.rmtree(os.path.join(out, "lo-profile"), ignore_errors=True)
for f in os.listdir(out):
    if f.startswith("tmp_") or f.endswith(".txt"):
        os.remove(os.path.join(out, f))
print("synthetic unit written to", out)
