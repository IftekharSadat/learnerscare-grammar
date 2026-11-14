#!/usr/bin/env python3
"""Audio sync audit: cue time vs. actual speech position, straight from the source decks.

For every slide with a scripted [PAUSE], the cue that reveals the answer must coincide with the moment speech
resumes after the pause (measured with ffmpeg silencedetect). Fails (exit 1) if any drift exceeds --limit ms.
Also reports, for explanation slides, how far each reveal cue is from the nearest speech onset (informational).

  python3 -I tools/ingest/sync_audit.py --unit 001
"""
import argparse, glob, os, statistics, sys, tempfile
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import audio, pptx_raw  # noqa: E402

ap = argparse.ArgumentParser()
ap.add_argument("--unit", required=True)
ap.add_argument("--source", default="source")
ap.add_argument("--limit", type=int, default=300)
args = ap.parse_args()
src = os.path.join(args.source, "unit-%03d" % int(args.unit))
decks = sorted(glob.glob(os.path.join(src, "*.pptx")))
work = tempfile.mkdtemp(prefix="audit-")
rows, info = [], []
for path in decks:
    deck = pptx_raw.read_deck(path)
    for s in deck["slides"]:
        if not s["audioPart"]:
            continue
        mp3 = os.path.join(work, "a.mp3")
        open(mp3, "wb").write(pptx_raw.read_part(path, s["audioPart"]))
        sil = audio.silences(mp3)
        pauses = s["notes"]["pauseSeconds"]
        enters = [c for c in s["cues"] if c["effect"] == "enter"]
        if pauses:
            longs = [x for x in sil if x[1] - x[0] >= 0.6 * min(pauses) * 1000]
            for c in enters:
                if not (c["targetName"].startswith("Official answer") or c["targetName"].startswith("Answer ")):
                    continue
                near = min(longs, key=lambda x: abs(x[1] - c["tMs"]), default=None)
                if near:
                    rows.append((os.path.basename(path)[:28], s["index"], c["targetName"], c["tMs"], near[1], c["tMs"] - near[1]))
        else:
            onsets = [0] + [e for _, e in sil]
            for c in enters:
                info.append(min(abs(c["tMs"] - o) for o in onsets))
print("| deck | slide | cue target | cue ms | speech resumes ms | drift ms |\n|---|---|---|---|---|---|")
for r in rows:
    print("| %s | %d | %s | %d | %d | %+d |" % r)
drifts = [abs(r[5]) for r in rows]
print("\n%d answer cues on %d slides checked · max |drift| %d ms · mean %.0f ms · limit %d ms" % (
    len(rows), len({(r[0], r[1]) for r in rows}), max(drifts), statistics.mean(drifts), args.limit))
if info:
    print("explanation decks: %d reveal cues, median distance to nearest speech onset %d ms (informational: reveals are placed on phrases, not only on sentence starts)" % (len(info), statistics.median(info)))
sys.exit(1 if max(drifts) > args.limit else 0)
