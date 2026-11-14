"""Normalise raw deck data into the Unit schema.

Everything here is driven by the LearnersCare deck conventions (shape/group names such as
"Official answer", "Why", "Clue and reason", "Sentence tiles", eyebrow text "EXERCISE 1.3 · QUESTION 4").
Nothing is hard-coded per unit, so later units go through the same code.
"""
from __future__ import annotations

import re

from pptx_raw import by_name, find, text_of, texts

BLANK = "______"
HEADER_NAMES = ("Eyebrow", "Title", "Subtitle", "Kicker")
MEDIA_PREFIXES = ("Illustration", "Scene illustration", "Icon ")


def norm_space(s: str) -> str:
    return re.sub(r"\s+", " ", s).strip()


def split_variants(text: str) -> list:
    return [norm_space(v) for v in re.split(r"\s+/\s+", text) if v.strip()]


def is_media(name: str) -> bool:
    return name.startswith(MEDIA_PREFIXES)


# ---------------------------------------------------------------------------------------------
# Blocks (generic, used by every step)
# ---------------------------------------------------------------------------------------------

def _line(node, group=None):
    paras = node.get("paragraphs", [])
    out = []
    for p in paras:
        ln = {"name": node["name"], "text": p["text"]}
        if p.get("runs"):
            ln["runs"] = p["runs"]
        if group:
            ln["group"] = group
        out.append(ln)
    return out


def make_blocks(slide, deck, ctx):
    cue_in, cue_out = {}, {}
    for c in slide["cues"]:
        (cue_out if c["effect"] == "exit" else cue_in).setdefault(c["targetShapeId"], c["tMs"])
    blocks = []
    for sh in slide["shapes"]:
        if sh["name"] in HEADER_NAMES or sh["kind"] == "pic":
            continue
        block = {"id": sh["id"], "name": sh["name"], "lines": [], "cueMs": cue_in.get(sh["id"]),
                 "exitMs": cue_out.get(sh["id"])}
        if sh["box"]:
            x, y, w, h = sh["box"]
            block["box"] = [round(x / deck["width"], 4), round(y / deck["height"], 4),
                            round(w / deck["width"], 4), round(h / deck["height"], 4)]

        def walk(node, group, top):
            if is_media(node["name"]) and node["kind"] == "group":
                block.setdefault("media", []).append(ctx.media(slide, node))
                return
            if node.get("paragraphs"):
                block["lines"].extend(_line(node, None if top else group))
            for ch in node.get("children", []):
                walk(ch, node["name"] if not top else None, False)

        walk(sh, None, True)
        if block["lines"] or block.get("media") or block["cueMs"] is not None:
            blocks.append(block)
    return blocks


def header(slide):
    return {k.lower(): text_of(slide["shapes"], k) for k in ("Eyebrow", "Title", "Subtitle")}


STEP_RULES = [
    ("summary", lambda n: "Formula centre" in n),
    ("overview", lambda n: "Part A" in n),
    ("situation", lambda n: any(x.startswith("Illustration") for x in n) and "Progress bar" in n),
    ("title", lambda n: any(x.startswith("Pill") for x in n)),
    ("form", lambda n: "Block 1" in n),
    ("contractions", lambda n: "Pair 1" in n),
    ("build", lambda n: "Sentence 1" in n),
    ("periods", lambda n: any(x.startswith("Ring ") for x in n)),
    ("changeVerbs", lambda n: "Verbs 1" in n),
    ("timeline", lambda n: "Progress bar" in n or any(x.startswith("Bar ") for x in n)),
    ("compare", lambda n: "Stage 1" in n),
    ("practice", lambda n: "Question 1" in n and "Pause tag" in n),
    ("practiceAnswers", lambda n: "Answer 1" in n),
    ("speaking", lambda n: "Prompt 1" in n),
]


def step_type(slide) -> str:
    names = set()

    def collect(nodes):
        for n in nodes:
            names.add(n["name"])
            collect(n.get("children", []))

    collect(slide["shapes"])
    for typ, rule in STEP_RULES:
        if rule(names):
            return typ
    return "example"


def make_step(slide, deck, deck_key, ctx, typ=None, origin="learnerscare"):
    h = header(slide)
    step = {
        "id": "%s-s%02d" % (deck_key, slide["index"]),
        "deck": deck_key, "slide": slide["index"],
        "type": typ or step_type(slide),
        "eyebrow": h["eyebrow"], "title": h["title"], "subtitle": h["subtitle"],
        "origin": origin,
        "voiceOver": re.sub(r"\s*\[PAUSE[^\]]*\]\s*", " ", slide["notes"]["voiceOver"]).strip(),
        "blocks": make_blocks(slide, deck, ctx),
        "audio": ctx.slide_audio(deck_key, slide),
    }
    if slide["notes"]["deliveryNotes"]:
        step["deliveryNotes"] = slide["notes"]["deliveryNotes"]
    return step


# ---------------------------------------------------------------------------------------------
# Explanation deck
# ---------------------------------------------------------------------------------------------

def build_sections(deck, ctx, book):
    sections, order = {}, []
    last_letter = None
    for slide in deck["slides"]:
        step = make_step(slide, deck, "explain", ctx)
        m = re.search(r"SECTION\s+([A-Z])\b", step["eyebrow"])
        if m:
            key = last_letter = m.group(1)
        else:
            key = "intro" if last_letter is None else "wrap"
        if key not in sections:
            sections[key] = {"key": key, "title": "", "kind": "explanation" if len(key) == 1 else key, "steps": [], "book": []}
            order.append(key)
        sections[key]["steps"].append(step)
    # titles from the overview slide ("Part A" -> "Form" / "am / is / are + verb-ing")
    overview = next((s for s in deck["slides"] if step_type(s) == "overview"), None)
    for key in order:
        sec = sections[key]
        if len(key) == 1:
            part = by_name(overview["shapes"], "Part " + key) if overview else None
            labels = [t["text"] for t in texts(part)] if part else []
            labels = [l for l in labels if l != key]
            sec["title"] = labels[0] if labels else sec["steps"][0]["title"]
            sec["tagline"] = labels[1] if len(labels) > 1 else ""
            sec["book"] = [dict(e, origin="book") for e in book["sections"].get(key, [])]
        else:
            sec["title"] = {"intro": "Warm-up", "wrap": "Checkpoint"}[key]
    missing = [k for k in book["sections"] if k not in sections]
    for k in missing:
        ctx.warn("book section %s has no matching deck section" % k)
    return [sections[k] for k in order]


def guided_practice(deck, ctx):
    """Slides 'practice' + 'practiceAnswers' -> a LearnersCare gap-fill exercise."""
    q_slide = next((s for s in deck["slides"] if step_type(s) == "practice"), None)
    a_slide = next((s for s in deck["slides"] if step_type(s) == "practiceAnswers"), None)
    if not q_slide or not a_slide:
        return None
    items = []
    q_cues = {c["targetName"]: c["tMs"] for c in q_slide["cues"] if c["effect"] == "enter"}
    a_cues = {c["targetName"]: c["tMs"] for c in a_slide["cues"] if c["effect"] == "enter"}
    n = 1
    while by_name(q_slide["shapes"], "Question %d" % n):
        q = [t["text"] for t in texts(by_name(q_slide["shapes"], "Question %d" % n))]
        a = [t["text"] for t in texts(by_name(a_slide["shapes"], "Answer %d" % n))]
        prompt = norm_space(re.sub(r"_{3,}", BLANK, q[-1]))
        full = a[1]
        reason = a[2] if len(a) > 2 else ""
        m = re.match(r"^(.*?)\s*%s\s*\(([^)]*)\)(.*)$" % BLANK, prompt)
        pre, cue, post = m.group(1), m.group(2), m.group(3)
        subj = norm_space(re.sub(r"^.*[!?.]\s*", "", pre))  # drop lead-ins such as "Look!"
        frag = full[full.index(subj) + len(subj): len(full) - len(post) if post else None].strip() if subj in full else full
        be, _, ving = frag.partition(" ")
        nxt = "Answer %d" % (n + 1)
        items.append({
            "id": "GP.%d" % n, "number": n, "isExample": False, "origin": "learnerscare",
            "prompt": prompt, "cueWords": cue, "verb": cue,
            "acceptedAnswers": [frag], "officialAnswer": frag, "answerSentences": [full],
            "why": reason, "tiles": [{"t": subj, "role": "subject"}, {"t": be, "role": "be"}, {"t": ving, "role": "verb"}],
            "subjectInBlank": False, "hints": {"bn": ""},
            "audio": {
                "question": ctx.clip("explain", q_slide, "gp%d_q" % n, q_cues.get("Question %d" % n), q_cues.get("Question %d" % (n + 1), q_cues.get("Pause tag")), n),
                "answer": ctx.clip("explain", a_slide, "gp%d_a" % n, a_cues.get("Answer %d" % n), a_cues.get(nxt), n),
                "pauseMs": 0,
            },
        })
        n += 1
    return {"id": "GP", "origin": "learnerscare", "type": "gapFill", "sectionRef": None,
            "title": header(q_slide)["title"], "instructions": header(q_slide)["subtitle"],
            "intro": None, "recap": None, "items": items}


# ---------------------------------------------------------------------------------------------
# Exercise deck
# ---------------------------------------------------------------------------------------------

EYEBROW = re.compile(r"EXERCISE\s+([\d.]+)\s*·\s*(.+)$")


def classify(slide):
    eb = text_of(slide["shapes"], "Eyebrow")
    m = EYEBROW.search(eb)
    if m:
        ex, rest = m.group(1), m.group(2).strip()
        mq = re.match(r"QUESTION\s+(\d+)", rest)
        if mq:
            return ("question", ex, int(mq.group(1)))
        if rest.startswith("EXAMPLE"):
            return ("example", ex, None)
        if rest.startswith("RECAP"):
            return ("recap", ex, None)
        ms = re.match(r"SECTION\s+([A-Z])", rest)
        return ("intro", ex, ms.group(1) if ms else None)
    key = eb.upper()
    for token, kind in (("COMMON MISTAKES", "mistakes"), ("RAPID REVIEW", "rapid"), ("KEY TAKEAWAYS", "takeaways"),
                        ("REVIEW", "review"), ("LESSON MAP", "map"), ("HOW TO USE", "loop"), ("QUICK REMINDER", "reminder")):
        if token in key:
            return (kind, None, None)
    return ("other", None, None)


def exercise_type(intro_slide, question_slides) -> str:
    names = set()
    for s in [intro_slide] + question_slides[:1]:
        def collect(nodes):
            for n in nodes:
                names.add(n["name"])
                collect(n.get("children", []))
        collect(s["shapes"])
    if "Scene illustration" in names or "Verb bank" in names:
        return "pictureVerb"
    if "Left column" in names or "Options a-h" in names or any(n.startswith("Options") for n in names):
        return "matching"
    if "Sentence tiles" in names or "Situation and cue" in names:
        return "buildQuestion"
    if "Clue and reason" in names:
        return "positiveNegative"
    return "gapFill"


def role_tiles(group, role_names=None):
    """'Tile X' shapes (optionally followed by 'role X' shapes) -> [{t, role}]"""
    tiles = []
    if not group:
        return tiles
    roles = {n["name"][5:]: n["text"] for n in texts(group) if n["name"].startswith("role ")}
    for n in texts(group):
        if n["name"].startswith("Tile "):
            tiles.append({"t": n["text"], "role": roles.get(n["name"][5:], "")})
    return tiles


ROLE_MAP = {"question word": "qword", "be": "be", "subject": "subject", "verb + -ing": "verb", "rest of sentence": "rest"}


def complete(prompt: str, fragment: str) -> str:
    """Fill the blank of a prompt with an answer fragment and drop the bracketed cue."""
    s = re.sub(r"\s*\([^)]*/[^)]*\)|\s*\((?:[a-z]+)\)", "", prompt) if BLANK in prompt else prompt
    if fragment[:1] in "’'":
        s = re.sub(r"\s*%s" % BLANK, fragment, s)
    else:
        s = s.replace(BLANK, fragment)
    s = norm_space(s)
    return s[:1].upper() + s[1:]


def audio_split(ctx, slide, slug, sil):
    """Split a question slide at its verified pause -> question + answer clips."""
    answer_cue = next((c["tMs"] for c in slide["cues"] if c["targetName"].startswith("Official answer") and c["effect"] == "enter"), None)
    pauses = slide["notes"]["pauseSeconds"]
    if not pauses:
        ctx.warn("slide %d: no [PAUSE] marker; audio kept whole" % slide["index"])
        return {"question": None, "answer": ctx.clip("exercises", slide, slug + "_a", None, None, 1), "pauseMs": 0}
    want = pauses[0] * 1000
    cands = [s for s in sil if s[1] - s[0] >= 0.6 * want]
    if answer_cue is None:
        ctx.warn("slide %d: no answer cue in the deck; cut on the measured pause only" % slide["index"])
        pause = max(cands, key=lambda s: s[1] - s[0]) if cands else None
        if pause is None:
            return {"question": None, "answer": ctx.clip("exercises", slide, slug + "_a", None, None, 1), "pauseMs": 0}
        answer_cue = pause[1]
    else:
        pause = min(cands, key=lambda s: abs(s[1] - answer_cue)) if cands else None
    if pause is None:
        ctx.problem("slide %d: [PAUSE %gs] not found in audio (silencedetect); cut at answer cue instead" % (slide["index"], pauses[0]))
        pause = (answer_cue - 200, answer_cue)
    drift = answer_cue - pause[1]
    ctx.pause_rows.append({"slide": slide["index"], "scripted": pauses[0], "silence": [pause[0], pause[1]],
                           "measured": round((pause[1] - pause[0]) / 1000.0, 2), "answerCue": answer_cue, "cueMinusSpeech": drift})
    if abs(drift) > 300:
        ctx.problem("slide %d: answer cue is %d ms away from the end of the pause" % (slide["index"], drift))
    if abs((pause[1] - pause[0]) - want) > 800:
        ctx.problem("slide %d: scripted pause %gs but measured %.2fs" % (slide["index"], pauses[0], (pause[1] - pause[0]) / 1000.0))
    a_start = max(pause[0], min(pause[1], answer_cue) - 180)
    vo = slide["notes"]["voiceOver"]
    q_text, _, a_text = re.split(r"(\[PAUSE[^\]]*\])", vo, maxsplit=1) if "[PAUSE" in vo else (vo, "", "")
    return {
        "question": ctx.clip("exercises", slide, slug + "_q", 0, pause[0] + 250, 0, text=q_text),
        "answer": ctx.clip("exercises", slide, slug + "_a", a_start, None, 1, text=a_text, with_cues=True),
        "pauseMs": pause[1] - pause[0],
    }


def picture_alt(slide):
    for s in re.split(r"(?<=[.!?])\s+", slide["notes"]["voiceOver"]):
        s = s.strip()
        if re.match(r"^(Picture \w+\.|Here is the example\.)$", s) or not s:
            continue
        s = re.sub(r"^In picture \w+,\s*", "", s)
        return s[:1].upper() + s[1:]
    return ""


def build_exercises(deck, ctx, change_verbs, period_words, config):
    groups, order = {}, []
    extras = {"briefing": [], "review": None, "takeaways": None, "mistakes": None, "rapid": None, "completion": None, "map": None}
    for slide in deck["slides"]:
        kind, ex, num = classify(slide)
        if ex:
            if ex not in groups:
                groups[ex] = {"intro": None, "examples": [], "questions": [], "recap": None, "section": None}
                order.append(ex)
            g = groups[ex]
            if kind == "intro":
                g["intro"], g["section"] = slide, num
            elif kind == "example":
                g["examples"].append(slide)
            elif kind == "question":
                g["questions"].append((num, slide))
            elif kind == "recap":
                g["recap"] = slide
        elif kind in ("map", "loop", "reminder") or (kind == "other" and slide["index"] == 1):
            extras["briefing"].append(slide)
            if kind == "map":
                extras["map"] = slide
        elif kind in ("review", "takeaways", "mistakes", "rapid"):
            extras[kind] = slide
        else:
            extras["completion"] = slide

    exercises = []
    for ex in order:
        g = groups[ex]
        intro = g["intro"]
        typ = exercise_type(intro, [s for _, s in g["questions"]])
        h = header(intro)
        exercise = {"id": ex, "origin": "book", "type": typ, "sectionRef": g["section"],
                    "title": h["title"], "instructions": h["subtitle"],
                    "intro": make_step(intro, deck, "exercises", ctx, "exerciseIntro"),
                    "recap": make_step(g["recap"], deck, "exercises", ctx, "exerciseRecap") if g["recap"] else None,
                    "items": []}
        if extras["map"]:
            tile = by_name(extras["map"]["shapes"], "Exercise " + ex)
            if tile:
                exercise["shortName"] = text_of([tile], "Name")
                exercise["task"] = text_of([tile], "Task")
        builder = {"pictureVerb": items_picture, "matching": items_matching, "buildQuestion": items_question,
                   "positiveNegative": items_posneg}.get(typ)
        if not builder:
            ctx.problem("exercise %s: unknown layout, no items extracted" % ex)
            exercises.append(exercise)
            continue
        builder(exercise, g, deck, ctx)
        for it in exercise["items"]:
            it.setdefault("origin", "book")
            it.setdefault("hints", {"bn": ""})
            it["mapsToSection"], it["mapReason"] = map_section(exercise, it, change_verbs, period_words, config)
        exercises.append(exercise)
    return exercises, extras


def map_section(exercise, item, change_verbs, period_words, config):
    override = config.get("mapsToSection", {}).get(item["id"])
    if override:
        return override, "config override"
    answer_text = " ".join(item.get("answerSentences") or item["acceptedAnswers"]).lower()
    words = set(re.findall(r"[a-z]+", answer_text))
    hit = sorted(words & set(change_verbs))
    if hit:
        return "D", "change verb '%s' (listed in section D)" % hit[0]
    blob = (item.get("prompt", "") + " " + answer_text + " " + item.get("why", "")).lower()
    for w in period_words:
        if re.search(r"\b%s\b" % re.escape(w), blob):
            return "C", "period phrase '%s' (section C)" % w
    if "period around now" in blob:
        return "C", "WHY text names a period around now"
    default = config.get("defaultSection", {}).get(exercise["id"])
    if default:
        return default, "exercise default (config)"
    if exercise["type"] == "pictureVerb":
        return "A", "form practice on an action happening now"
    return "B", "action in progress now / around now"


def base_item(ex_id, number, is_example):
    return {"id": "%s.%d" % (ex_id, number), "number": number, "isExample": is_example}


def items_picture(exercise, g, deck, ctx):
    intro = g["intro"]
    bank = [t["text"] for t in texts(by_name(intro["shapes"], "Verb bank") or {"children": []})]
    exercise["verbBank"] = bank
    note = text_of(intro["shapes"], "Note")
    if note:
        exercise["bankNote"] = note
    slides = [(None, s, True) for s in g["examples"]] + [(n, s, False) for n, s in g["questions"]]
    used = []
    for num, slide, is_ex in slides:
        q = by_name(slide["shapes"], "Question")
        number = int(text_of([q], "Number"))
        sentence = norm_space(re.sub(r"_{3,}", BLANK, text_of([q], "Sentence")))
        variants = split_variants(text_of([by_name(slide["shapes"], "Official answer")], "Answer text"))
        tiles = [dict(t, role=r) for t, r in zip(role_tiles(by_name(slide["shapes"], "Breakdown tiles")), ("subject", "be", "verb"))]
        verb = text_of([by_name(slide["shapes"], "Verb hint")], "Verb chip")
        pic = by_name(slide["shapes"], "Scene illustration")
        item = base_item(exercise["id"], number, is_ex)
        if is_ex:
            # the book prints the example already completed; rebuild the blank from the printed answer
            used.append(verb)
            prompt = sentence.replace(variants[0], BLANK, 1) if variants[0] in sentence else sentence
        else:
            prompt = sentence
        subj = tiles[0]["t"] if tiles else ""
        item.update({
            "prompt": prompt, "verb": verb, "cueWords": verb,
            "acceptedAnswers": variants, "officialAnswer": " / ".join(variants),
            "answerSentences": [complete(prompt, v) for v in variants],
            "why": text_of([by_name(slide["shapes"], "Why")], "Text"),
            "spellingNote": re.sub(r"^Spelling:\s*", "", text_of([by_name(slide["shapes"], "Spelling note")], "Spelling chip")),
            "tiles": tiles,
            "subjectInBlank": not prompt.startswith(subj + " "),
            "picture": dict(ctx.media(slide, pic, alt=picture_alt(slide), slug="pic-%s-%d" % (exercise["id"].replace(".", "-"), number))) if pic else None,
        })
        if is_ex:
            item["audio"] = {"question": None, "answer": ctx.clip("exercises", slide, "ex%s_%02d_a" % (exercise["id"].replace(".", ""), number), None, None, 1, with_cues=True), "pauseMs": 0}
        else:
            item["audio"] = audio_split(ctx, slide, "ex%s_%02d" % (exercise["id"].replace(".", ""), number), ctx.silences("exercises", slide))
        item["slide"] = slide["index"]
        exercise["items"].append(item)
    exercise["usedInExample"] = used


def items_matching(exercise, g, deck, ctx):
    intro = g["intro"]
    left = by_name(intro["shapes"], "Left column")
    right = by_name(intro["shapes"], "Right column")

    def pairs(group):
        t = [x["text"] for x in texts(group)]
        return list(zip(t[0::2], t[1::2]))

    lefts = pairs(left)
    exercise["options"] = [{"key": k, "text": v} for k, v in pairs(right)]
    opt = {o["key"]: o["text"] for o in exercise["options"]}
    answers = {}
    if g["recap"]:
        n = 1
        while by_name(g["recap"]["shapes"], "Pair %d" % n):
            t = [x["text"] for x in texts(by_name(g["recap"]["shapes"], "Pair %d" % n))]
            answers[int(t[0])] = t[3]
            n += 1
    by_num = dict(g["questions"])
    for num_s, text in lefts:
        number = int(num_s)
        slide = by_num.get(number)
        item = base_item(exercise["id"], number, slide is None)
        if slide is not None:
            key_text = text_of([by_name(slide["shapes"], "Official answer")], "Key text")
            key = key_text.split("→")[-1].strip()
            if answers.get(number) and answers[number] != key:
                ctx.problem("exercise %s item %d: question slide says %s, recap says %s" % (exercise["id"], number, key, answers[number]))
            item.update({"prompt": text, "acceptedAnswers": [key], "officialAnswer": re.sub(r"\s+", " ", key_text),
                         "answerSentences": [opt[key]], "why": text_of([by_name(slide["shapes"], "Why")], "Text").replace(" | ", "\n"),
                         "audio": audio_split(ctx, slide, "ex%s_%02d" % (exercise["id"].replace(".", ""), number), ctx.silences("exercises", slide)),
                         "slide": slide["index"]})
        else:
            key = answers.get(number)
            if not key:
                ctx.problem("exercise %s item %d: no answer found for the printed example" % (exercise["id"], number))
                continue
            item.update({"prompt": text, "acceptedAnswers": [key], "officialAnswer": "%d → %s" % (number, key),
                         "answerSentences": [opt[key]], "why": "", "audio": {"question": None, "answer": None, "pauseMs": 0},
                         "slide": intro["index"]})
        exercise["items"].append(item)


def items_question(exercise, g, deck, ctx):
    intro = g["intro"]
    patterns = []
    for name in ("Pattern A", "Pattern B"):
        grp = by_name(intro["shapes"], name)
        if grp:
            t = texts(grp)
            patterns.append({"label": t[0]["text"], "slots": [x["text"] for x in t[1:]]})
    exercise["patterns"] = patterns
    example = text_of([by_name(intro["shapes"], "Book example") or {}], "Example") if by_name(intro["shapes"], "Book example") else ""
    if example:
        m = re.match(r"^.*?\s{2,}(.+?)\s*→\s*(.+?)\s*(\([^)]*\))\s*$", example.replace(" ", " "))
        raw = by_name(intro["shapes"], "Book example")
        raw_text = texts(raw)[0]["text"]
        m = re.match(r"^EXAMPLE IN THE BOOK\s+(.+?)\s*→\s*(.+?)\s*(\([^)]*\))\s*$", raw_text)
        if m:
            item = base_item(exercise["id"], 1, True)
            ans = norm_space(m.group(2))
            item.update({"prompt": norm_space(m.group(1)), "cueWords": m.group(3), "acceptedAnswers": [ans], "officialAnswer": ans,
                         "answerSentences": [ans], "why": "", "tiles": [], "audio": {"question": None, "answer": None, "pauseMs": 0},
                         "slide": intro["index"]})
            exercise["items"].append(item)
        else:
            ctx.problem("exercise %s: could not parse the book example %r" % (exercise["id"], raw_text))
    for number, slide in g["questions"]:
        sc = by_name(slide["shapes"], "Situation and cue")
        variants = split_variants(text_of([by_name(slide["shapes"], "Official answer")], "Answer text"))
        tiles = [{"t": t["t"], "role": ROLE_MAP.get(t["role"], t["role"])} for t in role_tiles(by_name(slide["shapes"], "Sentence tiles"))]
        item = base_item(exercise["id"], number, False)
        item.update({"prompt": text_of([sc], "Situation"), "cueWords": text_of([sc], "Cue chip"),
                     "acceptedAnswers": variants, "officialAnswer": " / ".join(variants), "answerSentences": variants,
                     "why": text_of([by_name(slide["shapes"], "Why")], "Text"), "tiles": tiles,
                     "pattern": "wh" if tiles and tiles[0]["role"] == "qword" else "yesno",
                     "audio": audio_split(ctx, slide, "ex%s_%02d" % (exercise["id"].replace(".", ""), number), ctx.silences("exercises", slide)),
                     "slide": slide["index"]})
        exercise["items"].append(item)


def clue_spans(prompt: str, clue: str, ctx, where):
    spans = []
    low = prompt.lower()
    for part in re.split(r"\s*…\s*|\s*\.\.\.\s*", clue):
        part = part.strip()
        if not part:
            continue
        i = low.find(part.lower())
        if i < 0:
            ctx.problem("%s: clue %r not found in the passage" % (where, part))
            continue
        spans.append([i, i + len(part)])
    return spans


def posneg_fields(group_texts):
    d = {}
    for n in group_texts:
        d.setdefault(n["name"], n["text"])
    return d


def items_posneg(exercise, g, deck, ctx):
    intro = g["intro"]
    method = by_name(intro["shapes"], "Method")
    exercise["method"] = [re.sub(r"^\d+\s+", "", t["text"]) for t in texts(method)] if method else []
    n = 1
    while by_name(intro["shapes"], "Example %d" % n):
        grp = by_name(intro["shapes"], "Example %d" % n)
        f = posneg_fields(texts(grp))
        tiles = [dict(t, role=r) for t, r in zip(role_tiles(grp), ("subject", "be", "verb"))]
        number = int(f["Number"])
        sentence = norm_space(f["Sentence"].replace(" | ", " "))
        answer = tiles[0]["t"] + ("" if tiles[1]["t"][:1] in "’'" else " ") + tiles[1]["t"] + " " + tiles[2]["t"]
        if answer not in sentence:
            ctx.problem("exercise %s example %d: answer %r not found in %r" % (exercise["id"], number, answer, sentence))
        prompt = sentence.replace(answer, BLANK, 1)
        clue = re.sub(r"^CLUE:\s*", "", f.get("Clue chip", ""))
        item = base_item(exercise["id"], number, True)
        item.update({"prompt": prompt, "cueWords": re.search(r"\(([^)]*)\)", prompt).group(1),
                     "acceptedAnswers": [answer], "officialAnswer": answer, "answerSentences": [complete(prompt, answer)],
                     "polarity": "negative" if "NEGATIVE" in f.get("Badge", "") else "positive",
                     "clue": clue, "clueSpans": clue_spans(prompt, clue, ctx, "%s example %d" % (exercise["id"], number)),
                     "why": "", "tiles": tiles, "audio": {"question": None, "answer": None, "pauseMs": 0}, "slide": intro["index"]})
        exercise["items"].append(item)
        n += 1
    for number, slide in g["questions"]:
        q = by_name(slide["shapes"], "Question")
        prompt = norm_space(re.sub(r"_{3,}", BLANK, text_of([q], "Sentence")))
        variants = split_variants(text_of([by_name(slide["shapes"], "Official answer")], "Answer text"))
        cr = posneg_fields(texts(by_name(slide["shapes"], "Clue and reason")))
        st = by_name(slide["shapes"], "Structure tiles")
        tiles = [dict(t, role=r) for t, r in zip(role_tiles(st), ("subject", "be", "verb"))]
        clue = re.sub(r"^CLUE:\s*", "", cr.get("Clue chip", ""))
        cue = re.search(r"%s\s*\(([^)]*)\)" % BLANK, prompt)
        item = base_item(exercise["id"], number, False)
        item.update({"prompt": prompt, "cueWords": cue.group(1) if cue else "",
                     "acceptedAnswers": variants, "officialAnswer": " / ".join(variants),
                     "answerSentences": [complete(prompt, v) for v in variants],
                     "polarity": "negative" if "NEGATIVE" in cr.get("Badge", "") else "positive",
                     "clue": clue, "clueSpans": clue_spans(prompt, clue, ctx, "%s item %d" % (exercise["id"], number)),
                     "why": cr.get("Reason", ""), "structure": text_of([st], "Structure label") if st else "",
                     "tiles": tiles, "subjectInBlank": bool(cue and "/" in cue.group(1)),
                     "audio": audio_split(ctx, slide, "ex%s_%02d" % (exercise["id"].replace(".", ""), number), ctx.silences("exercises", slide)),
                     "slide": slide["index"]})
        exercise["items"].append(item)


# ---------------------------------------------------------------------------------------------
# Mistakes, rapid review
# ---------------------------------------------------------------------------------------------

def common_mistakes(slide, deck, ctx):
    if not slide:
        return [], None
    out = []
    cues = {c["targetName"]: c["tMs"] for c in slide["cues"] if c["effect"] == "enter"}
    wrongs = [s for s in slide["shapes"] if s["name"].startswith("Wrong ")]
    for i, w in enumerate(wrongs, 1):
        label = w["name"][6:]
        r = by_name(slide["shapes"], "Right " + label)
        start = cues.get(w["name"])
        nxt = cues.get(wrongs[i]["name"]) if i < len(wrongs) else None
        out.append({"id": "M%d" % i, "label": text_of([w], "Label") or label.upper(), "wrong": text_of([w], "Wrong"),
                    "right": text_of([r], "Right") if r else "", "origin": "learnerscare",
                    "audio": ctx.clip("exercises", slide, "mistake_%d" % i, start, nxt, i) if start is not None else None})
    step = make_step(slide, deck, "exercises", ctx, "mistakes")
    return out, step


def rapid_review(slide, deck, ctx, exercises):
    if not slide:
        return None
    cues = [(c["targetName"], c["tMs"]) for c in slide["cues"] if c["effect"] == "enter"]
    cue = dict(cues)
    sil = ctx.silences("exercises", slide)
    items, n = [], 1
    first = cue.get("Prompt 1", 0)
    while by_name(slide["shapes"], "Prompt %d" % n):
        prompt = text_of([by_name(slide["shapes"], "Prompt %d" % n)], "Prompt")
        answer = text_of([by_name(slide["shapes"], "Answer %d" % n)], "Answer")
        m = re.match(r"^([\d.]+)\s*·", prompt)
        ex_id = m.group(1) if m else None
        ref = None
        for ex in exercises:
            if ex["id"] != ex_id:
                continue
            for it in ex["items"]:
                pool = [a.lower() for a in it["acceptedAnswers"] + it.get("answerSentences", [])]
                if answer.lower() in pool and not it["isExample"]:
                    ref = it["id"]
        if not ref:
            ctx.problem("rapid review item %d (%r) could not be linked to an exercise item" % (n, prompt))
        p_cue, a_cue = cue["Prompt %d" % n], cue["Answer %d" % n]
        nxt = cue.get("Prompt %d" % (n + 1))
        pause = min((s for s in sil if s[1] - s[0] >= 1500), key=lambda s: abs(s[1] - a_cue), default=None)
        if pause is None or abs(pause[1] - a_cue) > 600:
            ctx.problem("rapid review item %d: pause not found near the answer cue" % n)
            pause = (a_cue - 200, a_cue)
        ctx.pause_rows.append({"slide": slide["index"], "scripted": (slide["notes"]["pauseSeconds"] or [0])[min(n - 1, len(slide["notes"]["pauseSeconds"]) - 1)] if slide["notes"]["pauseSeconds"] else 0,
                               "silence": [pause[0], pause[1]], "measured": round((pause[1] - pause[0]) / 1000.0, 2),
                               "answerCue": a_cue, "cueMinusSpeech": a_cue - pause[1]})
        items.append({"id": "R%d" % n, "ref": ref, "prompt": prompt, "answer": answer, "origin": "book",
                      "audio": {"question": ctx.clip("exercises", slide, "rapid_%d_q" % n, p_cue - 150 if n > 1 else p_cue - 150, pause[0] + 200, n),
                                "answer": ctx.clip("exercises", slide, "rapid_%d_a" % n, max(pause[0], pause[1] - 150), (nxt - 150) if nxt else None, n),
                                "pauseMs": pause[1] - pause[0]}})
        n += 1
    h = header(slide)
    return {"title": h["title"], "subtitle": h["subtitle"],
            "intro": ctx.clip("exercises", slide, "rapid_intro", 0, first - 150, 0), "items": items}
