"""Raw PPTX extraction: text runs, shape tree, notes, audio relationship, animation cue timeline.

Reads the package with zipfile + lxml only. Nothing inside the deck is executed.
"""
from __future__ import annotations

import posixpath
import re
import zipfile

from lxml import etree

P = "http://schemas.openxmlformats.org/presentationml/2006/main"
A = "http://schemas.openxmlformats.org/drawingml/2006/main"
R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
PR = "http://schemas.openxmlformats.org/package/2006/relationships"
NS = {"p": P, "a": A, "r": R}

# Run colours used by the LearnersCare decks to mark grammar roles (light + dark-card variants).
ROLE_COLOURS = {
    "E8473A": "subject", "FF8A7F": "subject",
    "0FA597": "be", "0A8A7E": "be", "3FD9C8": "be",
    "6C4DF4": "verb", "B0A2FF": "verb",
}

IGNORED_NAME_PREFIXES = ("Slide Number Placeholder", "Footer Placeholder", "Date Placeholder", "Narration audio")


def _q(ns: str, tag: str) -> str:
    return "{%s}%s" % (ns, tag)


def clean(text: str) -> str:
    return re.sub(r"[ \t ]+", " ", text).strip()


def _rels(z: zipfile.ZipFile, part: str) -> dict:
    rel_path = posixpath.join(posixpath.dirname(part), "_rels", posixpath.basename(part) + ".rels")
    out = {}
    if rel_path not in z.namelist():
        return out
    root = etree.fromstring(z.read(rel_path))
    for rel in root:
        target = rel.get("Target")
        if rel.get("TargetMode") != "External":
            target = posixpath.normpath(posixpath.join(posixpath.dirname(part), target))
        out[rel.get("Id")] = {"type": rel.get("Type").rsplit("/", 1)[-1], "target": target}
    return out


def _xfrm(el):
    x = el.find("p:spPr/a:xfrm", NS)
    if x is None:
        x = el.find("p:grpSpPr/a:xfrm", NS)
    if x is None:
        return None
    off, ext = x.find("a:off", NS), x.find("a:ext", NS)
    if off is None or ext is None:
        return None
    return [int(off.get("x")), int(off.get("y")), int(ext.get("cx")), int(ext.get("cy"))]


def _paragraphs(sp):
    """Return list of paragraphs; each is a list of runs {t, colour, bold}."""
    paras = []
    for p in sp.iterfind("p:txBody/a:p", NS):
        runs = []
        for node in p:
            tag = etree.QName(node).localname
            if tag == "r":
                rpr = node.find("a:rPr", NS)
                col = node.find("a:rPr/a:solidFill/a:srgbClr", NS)
                runs.append({
                    "t": node.findtext("a:t", default="", namespaces=NS),
                    "colour": col.get("val").upper() if col is not None else None,
                    "bold": rpr is not None and rpr.get("b") == "1",
                })
            elif tag == "br":
                runs.append({"t": "\n", "colour": None, "bold": False})
        if any(r["t"].strip() for r in runs):
            paras.append(runs)
    return paras


def _roles(runs):
    """Map coloured runs to grammar roles when a paragraph mixes >= 2 role colours."""
    cols = {ROLE_COLOURS[r["colour"]] for r in runs if r["colour"] in ROLE_COLOURS and r["t"].strip()}
    out = []
    for r in runs:
        role = ROLE_COLOURS.get(r["colour"]) if len(cols) >= 2 and r["t"].strip() else None
        seg = {"t": r["t"]}
        if role:
            seg["role"] = role
        if out and out[-1].get("role") == seg.get("role"):
            out[-1]["t"] += seg["t"]
        else:
            out.append(seg)
    return out if len(cols) >= 2 else None


def _shape(el, order):
    tag = etree.QName(el).localname
    if tag not in ("sp", "grpSp", "pic", "cxnSp"):
        return None
    nv = el.find("./*/p:cNvPr", NS)
    if nv is None:
        return None
    name = nv.get("name", "")
    node = {"id": int(nv.get("id")), "name": name, "kind": {"grpSp": "group", "pic": "pic"}.get(tag, "shape"),
            "box": _xfrm(el), "order": next(order)}
    if tag == "grpSp":
        node["children"] = [c for c in (_shape(ch, order) for ch in el) if c]
    elif tag == "sp":
        paras = _paragraphs(el)
        if paras:
            node["paragraphs"] = []
            for runs in paras:
                text = clean("".join(r["t"] for r in runs).replace("\n", " "))
                para = {"text": text}
                roles = _roles(runs)
                if roles:
                    para["runs"] = roles
                node["paragraphs"].append(para)
            node["text"] = " | ".join(p["text"] for p in node["paragraphs"])
    return node


def _cues(slide_root, names):
    cues, audio_shape = [], None
    main = slide_root.find(".//p:cTn[@nodeType='mainSeq']", NS)
    if main is None:
        return cues, audio_shape

    def delay_of(ctn):
        total = 0
        for cond in ctn.iterfind("p:stCondLst/p:cond", NS):
            d = cond.get("delay")
            if d and d.isdigit() and cond.get("evt") is None:
                total += int(d)
        return total

    def walk(ctn, t):
        t += delay_of(ctn)
        cls = ctn.get("presetClass")
        if cls:
            tgt = ctn.find(".//p:spTgt", NS)
            if tgt is not None:
                spid = int(tgt.get("spid"))
                if cls == "mediacall":
                    return spid
                dur = max([int(c.get("dur")) for c in ctn.iterfind(".//p:cTn[@dur]", NS) if c.get("dur", "").isdigit()] or [0])
                cues.append({"tMs": t, "targetShapeId": spid, "targetName": names.get(spid, ""),
                             "effect": {"entr": "enter", "exit": "exit", "emph": "emphasis"}.get(cls, cls),
                             "durMs": dur})
            return None
        media = None
        for child in ctn.iterfind("p:childTnLst/p:par/p:cTn", NS):
            media = walk(child, t) or media
        return media

    audio_shape = walk(main, 0)
    cues.sort(key=lambda c: (c["tMs"], 0 if c["effect"] == "exit" else 1))
    return cues, audio_shape


def split_notes(text: str) -> dict:
    """Split speaker notes into voiceOver / pauses / deliveryNotes."""
    text = text.replace("\r", "\n").replace("\x0b", "\n")
    delivery = ""
    m = re.search(r"^\s*DELIVERY NOTES\s*$", text, flags=re.M)
    if m:
        delivery = text[m.end():].strip()
        text = text[: m.start()]
    text = re.sub(r"^\s*VOICE-OVER\s*$", "", text, flags=re.M).strip()
    pauses = [float(x) for x in re.findall(r"\[PAUSE\s+([\d.]+)\s*s\]", text)]
    return {"voiceOver": re.sub(r"\s+", " ", text).strip(), "pauseSeconds": pauses, "deliveryNotes": delivery}


def read_deck(path: str) -> dict:
    with zipfile.ZipFile(path) as z:
        pres_part = "ppt/presentation.xml"
        pres = etree.fromstring(z.read(pres_part))
        rels = _rels(z, pres_part)
        size = pres.find("p:sldSz", NS)
        width, height = int(size.get("cx")), int(size.get("cy"))
        slides = []
        for idx, sld in enumerate(pres.iterfind("p:sldIdLst/p:sldId", NS), 1):
            part = rels[sld.get(_q(R, "id"))]["target"]
            root = etree.fromstring(z.read(part))
            srels = _rels(z, part)
            tree = root.find("p:cSld/p:spTree", NS)

            def order_gen():
                i = 0
                while True:
                    yield i
                    i += 1

            order = order_gen()
            shapes = [s for s in (_shape(ch, order) for ch in tree) if s]
            names = {}

            def collect(nodes):
                for n in nodes:
                    names[n["id"]] = n["name"]
                    collect(n.get("children", []))

            collect(shapes)
            cues, audio_shape = _cues(root, names)
            audio = next((r["target"] for r in srels.values() if r["type"] == "audio"), None) or next(
                (r["target"] for r in srels.values() if r["type"] in ("video", "media") and r["target"].lower().endswith((".mp3", ".m4a", ".wav"))), None)
            notes_part = next((r["target"] for r in srels.values() if r["type"] == "notesSlide"), None)
            notes_text = ""
            if notes_part:
                nroot = etree.fromstring(z.read(notes_part))
                for sp in nroot.iterfind(".//p:sp", NS):
                    ph = sp.find("p:nvSpPr/p:nvPr/p:ph", NS)
                    if ph is not None and ph.get("type") == "body":
                        notes_text = "\n".join(
                            "".join(t.text or "" for t in p.iter(_q(A, "t"))) for p in sp.iterfind("p:txBody/a:p", NS))
            shapes = [s for s in shapes if not s["name"].startswith(IGNORED_NAME_PREFIXES)]
            slides.append({"index": idx, "part": part, "shapes": shapes, "cues": cues, "audioPart": audio,
                           "notes": split_notes(notes_text), "xml": root})
        return {"path": path, "width": width, "height": height, "slides": slides}


def read_part(path: str, part: str) -> bytes:
    with zipfile.ZipFile(path) as z:
        return z.read(part)


# ---- helpers for walking the extracted tree -------------------------------------------------

def texts(node) -> list:
    """All text-bearing descendants (document order)."""
    out = []
    if node.get("text"):
        out.append(node)
    for c in node.get("children", []):
        out.extend(texts(c))
    return out


def find(nodes, pred):
    for n in nodes:
        if pred(n):
            return n
        hit = find(n.get("children", []), pred)
        if hit:
            return hit
    return None


def by_name(nodes, name, prefix=False):
    return find(nodes, lambda n: n["name"].startswith(name) if prefix else n["name"] == name)


def text_of(nodes, name, prefix=False, default=""):
    n = by_name(nodes, name, prefix)
    return n.get("text", default) if n else default
