"""Book-page text extraction (pdftotext -layout) for the explanation page.

Produces, per lettered section, the printed lines in reading order so the app can show the book's
own wording ("In the book" panel) and the coverage report can prove nothing was dropped.
"""
from __future__ import annotations

import re
import subprocess

TERMINAL = (".", "?", "!", ":", ")", "’", "”", "…")


def pdf_text(path: str) -> str:
    return subprocess.run(["pdftotext", "-layout", path, "-"], check=True, capture_output=True, text=True).stdout


def norm(s: str) -> str:
    return re.sub(r"\s+", " ", s).strip()


def parse_explanation(text: str) -> dict:
    """Return {'title':..., 'subtitle':..., 'sections': {key: [ {text, kind} ]}, 'footer': [...] }"""
    lines = text.replace("\f", "\n").split("\n")
    title = subtitle = ""
    sections: dict = {}
    footer = []
    cur = None
    raw: list = []

    def flush():
        if cur is None:
            return
        entries, buf = [], None
        for ln in raw:
            stripped = ln.strip()
            if not stripped:
                if buf is not None:
                    entries.append(buf)
                    buf = None
                continue
            tabular = bool(re.search(r"\S {3,}\S", stripped))
            if buf is not None and not buf["tabular"] and not tabular and not buf["text"].endswith(TERMINAL):
                buf["text"] += " " + stripped
            else:
                if buf is not None:
                    entries.append(buf)
                buf = {"text": stripped, "tabular": tabular}
        if buf is not None:
            entries.append(buf)
        out = []
        for e in entries:
            if e["tabular"]:
                cells = [norm(c) for c in re.split(r" {3,}", e["text"]) if c.strip()]
                out.append({"text": " · ".join(cells), "kind": "table", "cells": cells})
            else:
                t = norm(e["text"])
                kind = "rule" if re.search(r"present continuous|We use|You can use|This means|Sometimes|Study this|= I started|For example|Some more examples", t) else "example"
                out.append({"text": t, "kind": kind})
        sections[cur] = out

    for ln in lines:
        m = re.match(r"^\s{0,10}([A-Z])\s{2,}(\S.*)$", ln)
        if re.match(r"^\s*Unit\s*$", ln):
            continue
        mt = re.match(r"^\s*(\d+)\s{3,}(.+?)\s*$", ln)
        if cur is None and mt and not title:
            full = norm(mt.group(2))
            ms = re.match(r"^(.*?)\s*\((.*)\)$", full)
            title, subtitle = (ms.group(1), ms.group(2)) if ms else (full, "")
            continue
        if "➜" in ln:
            flush()
            cur = None
            footer = [norm(x) for x in re.split(r" {3,}", ln.strip()) if "➜" in x]
            continue
        if m:
            flush()
            cur, raw = m.group(1), [m.group(2)]
            continue
        if cur is not None:
            raw.append(ln)
    flush()
    return {"title": title, "subtitle": subtitle, "sections": sections, "footer": footer}
