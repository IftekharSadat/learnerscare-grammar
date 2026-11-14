#!/usr/bin/env python3
"""LearnersCare unit ingest.

  python3 -I tools/ingest/ingest.py --unit 001 --explain <pptx> --exercises <pptx> \
      --book-explain <pdf> --book-exercises <pdf> [--out content/units] [--config tools/ingest/config/unit-001.json]

Reads the two narrated decks and the two book pages (as data only) and writes
content/units/unit-NNN/{unit.json,audio/*.mp3,media/*.svg,ingest-report.md} and updates content/index.json.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)  # -I does not add the script directory

import audio  # noqa: E402
import book  # noqa: E402
import normalize as nz  # noqa: E402
import pptx_raw  # noqa: E402
import svg  # noqa: E402


class Ctx:
    def __init__(self, out_dir, decks, work):
        self.out, self.decks, self.work = out_dir, decks, work
        self.warnings, self.problems, self.pause_rows = [], [], []
        self.media_rows, self.audio_rows, self.jobs = [], [], []
        self._sil, self._wav, self._media = {}, {}, {}

    def warn(self, msg):
        self.warnings.append(msg)

    def problem(self, msg):
        self.problems.append(msg)

    # ---- media ---------------------------------------------------------------------------------
    def media(self, slide, node, alt=None, slug=None):
        name = node["name"]
        deck_key = next(k for k, d in self.decks.items() if slide in d["slides"])
        if name.startswith("Icon "):
            kind = "icon"
            icon = re.sub(r"\s+\d+$", "", name[5:]).strip().lower().replace(" ", "-")
            slug = "icon-" + icon
            alt = ""
        else:
            kind = "illustration"
            m = re.match(r"Illustration \((.*)\)", name)
            alt = alt if alt is not None else (m.group(1) if m else "")
            alt = alt[:1].upper() + alt[1:]
            slug = slug or "%s-s%02d-%d" % (deck_key, slide["index"], node["id"])
        rel = "media/%s.svg" % slug
        if rel not in self._media:
            text, warns = svg.group_to_svg(slide["xml"], node["id"], alt)
            for w in warns:
                self.warn("%s (slide %d, %s): %s" % (rel, slide["index"], name, w))
            path = os.path.join(self.out, rel)
            os.makedirs(os.path.dirname(path), exist_ok=True)
            with open(path, "w", encoding="utf-8") as f:
                f.write(text)
            self._media[rel] = True
            self.media_rows.append((rel, deck_key, slide["index"], name, len(text), alt))
        return {"src": rel, "alt": alt, "kind": kind}

    # ---- audio ---------------------------------------------------------------------------------
    def _src(self, deck_key, slide):
        part = slide["audioPart"]
        if not part:
            return None
        path = os.path.join(self.work, "%s_%s" % (deck_key, os.path.basename(part)))
        if not os.path.exists(path):
            with open(path, "wb") as f:
                f.write(pptx_raw.read_part(self.decks[deck_key]["path"], part))
        return path

    def silences(self, deck_key, slide):
        key = (deck_key, slide["index"])
        if key not in self._sil:
            src = self._src(deck_key, slide)
            self._sil[key] = audio.silences(src) if src else []
        return self._sil[key]

    def _master(self, deck_key, slide):
        key = (deck_key, slide["index"])
        if key not in self._wav:
            src = self._src(deck_key, slide)
            wav = src[:-4] + ".wav"
            audio.normalise_to_wav(src, wav)
            self._wav[key] = (wav, audio.duration_ms(wav))
        return self._wav[key]

    def clip(self, deck_key, slide, slug, start, end, idx, text=None, with_cues=False):
        if not slide["audioPart"]:
            return None
        wav, total = self._master(deck_key, slide)
        start = 0 if start is None else max(0, int(start))
        end = total if end is None else min(total, int(end))
        rel = "audio/%s.mp3" % slug
        out = {"src": rel, "durationMs": end - start}
        self.jobs.append((out, wav, os.path.join(self.out, rel), start, end, None))
        if text is not None:
            out["captions"] = audio.captions(text, end - start, self.silences(deck_key, slide), start)
        if with_cues:
            out["cues"] = [{"tMs": max(0, c["tMs"] - start), "targetShapeId": c["targetShapeId"], "targetName": c["targetName"],
                            "effect": c["effect"]} for c in slide["cues"] if c["tMs"] >= start - 400]
        self.audio_rows.append((rel, deck_key, slide["index"], start, end))
        return out

    def slide_audio(self, deck_key, slide):
        if not slide["audioPart"]:
            return None
        wav, total = self._master(deck_key, slide)
        sil = self.silences(deck_key, slide)
        rel = "audio/%s_s%02d.mp3" % (deck_key, slide["index"])
        remove = None
        pauses = slide["notes"]["pauseSeconds"]
        if pauses:
            cand = [s for s in sil if s[1] - s[0] >= 0.6 * pauses[0] * 1000]
            if cand:
                s = max(cand, key=lambda x: x[1] - x[0])
                remove = (s[0] + 350, s[1] - 250)
                self.pause_rows.append({"slide": slide["index"], "scripted": pauses[0], "silence": [s[0], s[1]],
                                        "measured": round((s[1] - s[0]) / 1000.0, 2), "answerCue": None, "cueMinusSpeech": None})
            else:
                self.problem("%s slide %d: [PAUSE %gs] not found in audio; kept whole" % (deck_key, slide["index"], pauses[0]))

        def remap(t):
            if not remove or t <= remove[0]:
                return t
            return max(remove[0], t - (remove[1] - remove[0]))

        dur = total - ((remove[1] - remove[0]) if remove else 0)
        out = {"src": rel, "durationMs": dur,
               "cues": [{"tMs": remap(c["tMs"]), "targetShapeId": c["targetShapeId"], "targetName": c["targetName"], "effect": c["effect"]}
                        for c in slide["cues"]],
               "captions": audio.captions(slide["notes"]["voiceOver"], dur, [(remap(a), remap(b)) for a, b in sil if remap(b) - remap(a) > 200])}
        self.jobs.append((out, wav, os.path.join(self.out, rel), 0, total, remove))
        self.audio_rows.append((rel, deck_key, slide["index"], 0, total))
        return out

    def run_audio(self):
        def job(out, wav, path, start, end, remove):
            out["durationMs"] = audio.cut(wav, path, start, end, remove)
        audio.run_jobs([(job, j) for j in self.jobs])


def journey(sections, exercises, gp, mistakes, rapid):
    nodes = []
    sec = {s["key"]: s for s in sections}
    lettered = [s for s in sections if len(s["key"]) == 1]
    warm = [st["id"] for st in sec.get("intro", {"steps": []})["steps"]]
    moved = None
    if lettered and lettered[0]["steps"] and lettered[0]["steps"][0]["type"] == "situation":
        moved = lettered[0]["steps"][0]["id"]
        warm.append(moved)
    if warm:
        nodes.append({"id": "warmup", "kind": "explain", "title": "Warm-up", "subtitle": "A real situation", "steps": warm, "icon": "spark"})
    for s in lettered:
        nodes.append({"id": "sec-" + s["key"], "kind": "explain", "sectionKey": s["key"], "title": s["title"],
                      "subtitle": s.get("tagline", ""), "steps": [st["id"] for st in s["steps"] if st["id"] != moved], "icon": "letter"})
    wrap = sec.get("wrap")
    if wrap:
        nodes.append({"id": "checkpoint", "kind": "checkpoint", "title": "Checkpoint", "subtitle": gp["title"] if gp else "",
                      "exerciseId": gp["id"] if gp else None,
                      "steps": [st["id"] for st in wrap["steps"] if st["type"] not in ("practice", "practiceAnswers")], "icon": "flag"})
    for ex in exercises:
        nodes.append({"id": "ex-" + ex["id"], "kind": "exercise", "exerciseId": ex["id"], "title": ex.get("shortName") or ex["title"],
                      "subtitle": ex.get("task") or ex["instructions"], "icon": ex["type"]})
    if mistakes:
        nodes.append({"id": "mistakes", "kind": "mistakeHunt", "title": "Mistake Hunt", "subtitle": "Tap and fix four typical errors", "icon": "search"})
    if rapid:
        nodes.append({"id": "rapid", "kind": "rapidReview", "title": "Rapid Review", "subtitle": rapid["subtitle"], "icon": "bolt"})
    nodes.append({"id": "complete", "kind": "complete", "title": "Unit complete", "subtitle": "Your certificate", "icon": "trophy"})
    for a, b in zip(nodes, nodes[1:]):
        a["teaser"] = b["title"]
    return nodes


def report(path, unit, ctx, args):
    L = []
    w = L.append
    w("# Ingest report — %s (%s)\n" % (unit["id"], unit["title"]))
    w("Generated by `tools/ingest/ingest.py`. Re-run with `npm run ingest`.\n")
    scored = sum(1 for e in unit["exercises"] for i in e["items"] if not i["isExample"])
    examples = sum(1 for e in unit["exercises"] for i in e["items"] if i["isExample"])
    w("## Totals\n")
    w("- Explanation steps: %d in %d sections" % (sum(len(s["steps"]) for s in unit["sections"]), len(unit["sections"])))
    w("- Book exercises: %d · scored questions: **%d** · worked examples: **%d**" % (len(unit["exercises"]), scored, examples))
    for e in unit["exercises"]:
        w("  - %s `%s` (deck section %s): %d questions + %d example(s)" % (e["id"], e["type"], e["sectionRef"],
          sum(not i["isExample"] for i in e["items"]), sum(i["isExample"] for i in e["items"])))
    w("- Audio clips: %d · media files: %d" % (len(ctx.audio_rows), len(ctx.media_rows)))
    w("\n## Problems (need a decision)\n")
    w("\n".join("- ⚠️ " + p for p in ctx.problems) or "None.")
    w("\n## Warnings\n")
    w("\n".join("- " + p for p in ctx.warnings) or "None.")
    w("\n## Pause cross-check (`[PAUSE n s]` vs `silencedetect` vs answer cue)\n")
    w("| slide | scripted s | silence start ms | silence end ms | measured s | answer cue ms | cue − speech ms |")
    w("|---|---|---|---|---|---|---|")
    for r in ctx.pause_rows:
        w("| %d | %g | %d | %d | %.2f | %s | %s |" % (r["slide"], r["scripted"], r["silence"][0], r["silence"][1], r["measured"],
          r["answerCue"] if r["answerCue"] is not None else "—", r["cueMinusSpeech"] if r["cueMinusSpeech"] is not None else "— (pause removed)"))
    drifts = [abs(r["cueMinusSpeech"]) for r in ctx.pause_rows if r["cueMinusSpeech"] is not None]
    if drifts:
        w("\nMax |cue − speech| = **%d ms** over %d cut points (limit 300 ms)." % (max(drifts), len(drifts)))
    w("\n## Item → section mapping (please review)\n")
    w("| item | answer | maps to | reason |")
    w("|---|---|---|---|")
    for e in unit["exercises"]:
        for i in e["items"]:
            w("| %s%s | %s | %s | %s |" % (i["id"], " (example)" if i["isExample"] else "", i["officialAnswer"], i["mapsToSection"], i["mapReason"]))
    w("\n## Accepted answers\n")
    w("| item | official answer (as printed) | accepted |")
    w("|---|---|---|")
    for e in unit["exercises"]:
        for i in e["items"]:
            w("| %s | %s | %s |" % (i["id"], i["officialAnswer"], " · ".join(i["acceptedAnswers"])))
    w("\n## Media\n")
    w("| file | deck | slide | source shape | bytes | alt |")
    w("|---|---|---|---|---|---|")
    for r in ctx.media_rows:
        w("| %s | %s | %d | %s | %d | %s |" % r)
    w("\n## Audio clips\n")
    w("| file | deck | slide | start ms | end ms |")
    w("|---|---|---|---|---|")
    for r in sorted(ctx.audio_rows):
        w("| %s | %s | %d | %d | %d |" % r)
    w("\n## Captions\n")
    w("Speech recognition (whisper) was not available at ingest time; captions use sentence-level proportional timing over the non-silent audio.")
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(L) + "\n")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--unit", required=True)
    ap.add_argument("--explain", required=True)
    ap.add_argument("--exercises", required=True)
    ap.add_argument("--book-explain", required=True)
    ap.add_argument("--book-exercises", required=True)
    ap.add_argument("--out", default="content/units")
    ap.add_argument("--config", default=None)
    ap.add_argument("--manifest", default=None)
    args = ap.parse_args()

    unit_id = "unit-%03d" % int(args.unit)
    out = os.path.join(args.out, unit_id)
    cfg_path = args.config or os.path.join(HERE, "config", unit_id + ".json")
    config = json.load(open(cfg_path, encoding="utf-8")) if os.path.exists(cfg_path) else {}
    # the Talk level's hand-reviewed files live next to unit.json and must survive a re-ingest
    keep = {}
    if os.path.isdir(out):
        for name in os.listdir(out):
            if name.startswith("conversation") or name == "talk":
                keep[name] = os.path.join(tempfile.mkdtemp(prefix="keep-"), name)
                shutil.move(os.path.join(out, name), keep[name])
        shutil.rmtree(out)
    os.makedirs(out)
    for name, path in keep.items():
        shutil.move(path, os.path.join(out, name))
    work = tempfile.mkdtemp(prefix="ingest-")
    try:
        explain = pptx_raw.read_deck(args.explain)
        exdeck = pptx_raw.read_deck(args.exercises)
        ctx = Ctx(out, {"explain": explain, "exercises": exdeck}, work)
        bk = book.parse_explanation(book.pdf_text(args.book_explain))
        ex_text = book.pdf_text(args.book_exercises)
        page_nums = [int(m) for m in re.findall(r"(?m)^\s*(\d+)\s*$|^(\d+)\s{5,}\S", "")] or []
        m1 = re.search(r"(?m)^(\d+)\s{5,}\S.*➜", book.pdf_text(args.book_explain))
        m2 = re.search(r"(?m)^\s{20,}(\d+)\s*$", ex_text)
        pages = [int(m.group(1)) for m in (m1, m2) if m]

        sections = nz.build_sections(explain, ctx, bk)
        gp = nz.guided_practice(explain, ctx)
        change_verbs, period_words = [], []
        for s in sections:
            for st in s["steps"]:
                if st["type"] == "changeVerbs":
                    change_verbs += [l["text"] for b in st["blocks"] if b["name"].startswith("Verbs") for l in b["lines"]]
                if st["type"] == "periods":
                    period_words += [l["text"] for b in st["blocks"] if b["name"].startswith("Ring ") for l in b["lines"]]
        exercises, extras = nz.build_exercises(exdeck, ctx, change_verbs, period_words, config)
        mistakes, mistakes_step = nz.common_mistakes(extras["mistakes"], exdeck, ctx)
        rapid = nz.rapid_review(extras["rapid"], exdeck, ctx, exercises)
        title_slide = explain["slides"][0]
        src_line = pptx_raw.text_of(title_slide["shapes"], "Source")
        unit = {
            "schemaVersion": 1,
            "id": unit_id, "number": int(args.unit),
            "title": bk["title"] or pptx_raw.text_of(title_slide["shapes"], "Unit badge"),
            "subtitle": bk["subtitle"] or pptx_raw.text_of(title_slide["shapes"], "Title"),
            "source": dict({"book": "English Grammar in Use", "author": "Raymond Murphy", "edition": "5th",
                            "publisher": "Cambridge University Press"}, **config.get("source", {}), pages=pages, deckCredit=src_line,
                           seeAlso=bk["footer"]),
            "journey": [],
            "sections": sections,
            "guidedPractice": gp,
            "practiceIntro": [nz.make_step(s, exdeck, "exercises", ctx, "briefing") for s in extras["briefing"]],
            "exercises": exercises,
            "commonMistakes": mistakes,
            "mistakesStep": mistakes_step,
            "review": {"step": nz.make_step(extras["review"], exdeck, "exercises", ctx, "review") if extras["review"] else None, "rapid": rapid},
            "takeaways": {"exercises": nz.make_step(extras["takeaways"], exdeck, "exercises", ctx, "takeaways") if extras["takeaways"] else None},
            "completion": nz.make_step(extras["completion"], exdeck, "exercises", ctx, "completion") if extras["completion"] else None,
        }
        unit["journey"] = journey(sections, exercises, gp, mistakes, rapid)
        ctx.run_audio()
        with open(os.path.join(out, "unit.json"), "w", encoding="utf-8") as f:
            json.dump(unit, f, ensure_ascii=False, indent=1)
            f.write("\n")
        # file list (for "download for offline") + sizes
        files = []
        for root, _, names in os.walk(out):
            for n in sorted(names):
                if n in ("ingest-report.md", "files.json", "conversation-review.md", "audio-commands.log"):
                    continue
                p = os.path.join(root, n)
                files.append({"path": os.path.relpath(p, out).replace(os.sep, "/"), "bytes": os.path.getsize(p)})
        files.sort(key=lambda x: x["path"])
        with open(os.path.join(out, "files.json"), "w", encoding="utf-8") as f:
            json.dump({"files": files, "totalBytes": sum(x["bytes"] for x in files)}, f, indent=1)
            f.write("\n")
        report(os.path.join(out, "ingest-report.md"), unit, ctx, args)
        with open(os.path.join(out, "audio-commands.log"), "w", encoding="utf-8") as f:
            f.write("\n".join(re.sub(re.escape(work), "$WORK", c) for c in sorted(audio.COMMAND_LOG)) + "\n")
        # manifest
        man_path = args.manifest or os.path.join(os.path.dirname(os.path.abspath(args.out)), "index.json")
        manifest = json.load(open(man_path, encoding="utf-8")) if os.path.exists(man_path) else {"units": []}
        scored = sum(1 for e in exercises for i in e["items"] if not i["isExample"])
        entry = {"id": unit_id, "number": unit["number"], "title": unit["title"], "subtitle": unit["subtitle"],
                 "path": "units/%s" % unit_id, "questions": scored, "nodes": len(unit["journey"])}
        manifest["units"] = sorted([u for u in manifest["units"] if u["id"] != unit_id] + [entry], key=lambda u: u["number"])
        with open(man_path, "w", encoding="utf-8") as f:
            json.dump(manifest, f, ensure_ascii=False, indent=1)
            f.write("\n")
        digest = hashlib.sha256(open(os.path.join(out, "unit.json"), "rb").read()).hexdigest()[:12]
        print("ingested %s: %d sections, %d exercises, %d scored + %d examples, %d clips, %d media, unit.json sha %s" % (
            unit_id, len(sections), len(exercises), scored, sum(1 for e in exercises for i in e["items"] if i["isExample"]),
            len(ctx.audio_rows), len(ctx.media_rows), digest))
        print("problems: %d, warnings: %d (see %s)" % (len(ctx.problems), len(ctx.warnings), os.path.join(out, "ingest-report.md")))
    finally:
        shutil.rmtree(work, ignore_errors=True)


if __name__ == "__main__":
    main()
