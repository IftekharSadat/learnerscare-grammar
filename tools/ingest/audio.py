"""Audio helpers: probing, silence detection, loudness-normalised cutting, caption timing.

All ffmpeg invocations live here so the whole audio build is re-runnable (`npm run ingest`).
"""
from __future__ import annotations

import json
import os
import re
import subprocess
from concurrent.futures import ThreadPoolExecutor

LOUDNORM = "loudnorm=I=-16:TP=-1.5:LRA=11"
FADE = 0.02  # 20 ms fades at every cut point
COMMAND_LOG: list = []


def run(cmd):
    COMMAND_LOG.append(" ".join(cmd))
    return subprocess.run(cmd, check=True, capture_output=True, text=True)


def duration_ms(path: str) -> int:
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "json", path],
                         check=True, capture_output=True, text=True).stdout
    return int(round(float(json.loads(out)["format"]["duration"]) * 1000))


def silences(path: str, noise_db=-35, min_s=0.35):
    """[(startMs, endMs)] of silent stretches."""
    err = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", path, "-af",
                          "silencedetect=noise=%ddB:d=%s" % (noise_db, min_s), "-f", "null", "-"],
                         capture_output=True, text=True).stderr
    starts = [float(x) for x in re.findall(r"silence_start: (-?[\d.]+)", err)]
    ends = [float(x) for x in re.findall(r"silence_end: ([\d.]+)", err)]
    total = duration_ms(path)
    out = []
    for i, s in enumerate(starts):
        e = ends[i] if i < len(ends) else total / 1000.0
        out.append((max(0, int(round(s * 1000))), int(round(e * 1000))))
    return out


def normalise_to_wav(src: str, wav: str):
    """Loudness-normalise a whole narration file once; clips are then cut from this master."""
    run(["ffmpeg", "-y", "-v", "error", "-i", src, "-af", LOUDNORM, "-ar", "44100", "-ac", "1",
         "-fflags", "+bitexact", "-flags:a", "+bitexact", "-c:a", "pcm_s16le", wav])


def cut(wav: str, out: str, start_ms: int | None = None, end_ms: int | None = None, remove: tuple | None = None):
    """Encode [start,end) of wav to MP3 128 kbps with 20 ms fades.

    remove=(a,b) additionally excises the stretch [a,b) (used to drop a silent 'pause the video' gap).
    """
    total = duration_ms(wav)
    start_ms = 0 if start_ms is None else max(0, start_ms)
    end_ms = total if end_ms is None else min(total, end_ms)

    def seg(a, b, label_in, label_out):
        d = (b - a) / 1000.0
        return "[%s]atrim=start=%.3f:end=%.3f,asetpts=PTS-STARTPTS,afade=t=in:d=%.3f,afade=t=out:st=%.3f:d=%.3f[%s]" % (
            label_in, a / 1000.0, b / 1000.0, FADE, max(0, d - FADE), FADE, label_out)

    if remove:
        a, b = remove
        graph = "[0:a]asplit=2[x][y];%s;%s;[p][q]concat=n=2:v=0:a=1[o]" % (seg(start_ms, a, "x", "p"), seg(b, end_ms, "y", "q"))
    else:
        graph = seg(start_ms, end_ms, "0:a", "o")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    run(["ffmpeg", "-y", "-v", "error", "-i", wav, "-filter_complex", graph, "-map", "[o]", "-ar", "44100", "-ac", "1",
         "-c:a", "libmp3lame", "-b:a", "128k", "-map_metadata", "-1", "-id3v2_version", "0", "-write_xing", "1",
         "-fflags", "+bitexact", "-flags:a", "+bitexact", out])
    return duration_ms(out)


def run_jobs(jobs, workers=4):
    """jobs: list of (callable, args). Executes in parallel, returns results in order."""
    with ThreadPoolExecutor(max_workers=workers) as ex:
        futures = [ex.submit(fn, *args) for fn, args in jobs]
        return [f.result() for f in futures]


# ---- captions ---------------------------------------------------------------------------------

def split_sentences(text: str):
    text = re.sub(r"\[PAUSE[^\]]*\]", " ", text)
    parts = re.findall(r"[^.!?]+(?:[.!?]+[”\"’']?|$)", text)
    out = []
    for p in parts:
        p = p.strip()
        if not p:
            continue
        # keep short fragments with the previous sentence ("Why?" stays separate, "1." merges)
        if out and len(p) < 4:
            out[-1] += " " + p
        else:
            out.append(p)
    return out


def captions(text: str, clip_ms: int, sil: list, offset_ms: int = 0):
    """Sentence-level captions with proportional timing over the *speech* time of the clip.

    Fallback used when no speech recogniser is available: characters are spread evenly across the
    non-silent audio, so pauses between sentences are respected.
    sil: silences in source-file time; offset_ms: where this clip starts in the source file.
    """
    sentences = split_sentences(text)
    if not sentences:
        return []
    speech, t = [], 0
    for s, e in sorted(sil):
        s, e = s - offset_ms, e - offset_ms
        if e <= 0 or s >= clip_ms:
            continue
        s, e = max(0, s), min(clip_ms, e)
        if s > t:
            speech.append((t, s))
        t = max(t, e)
    if t < clip_ms:
        speech.append((t, clip_ms))
    if not speech:
        speech = [(0, clip_ms)]
    total_speech = sum(b - a for a, b in speech)
    weights = [len(s) + 6 for s in sentences]
    total_w = float(sum(weights))

    def wall(speech_t):
        for a, b in speech:
            if speech_t <= b - a:
                return a + speech_t
            speech_t -= b - a
        return speech[-1][1]

    out, acc = [], 0.0
    for s, w in zip(sentences, weights):
        start = wall(acc / total_w * total_speech)
        acc += w
        end = wall(acc / total_w * total_speech)
        out.append({"tMs": int(start), "endMs": int(max(end, start + 300)), "text": s})
    return out
