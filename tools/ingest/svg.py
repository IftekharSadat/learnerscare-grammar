"""DrawingML group -> clean SVG.

The LearnersCare decks build their illustrations from preset shapes (rect, roundRect, ellipse and a
few arrows/stars). We convert those directly, which gives crisp, small, deterministic SVG files.
Unknown geometry is reported (never silently dropped) so the ingest report can flag it.
"""
from __future__ import annotations

import math

from lxml import etree

from pptx_raw import A, NS, P

EMU = 9525.0  # EMU per px


def _f(v: float) -> str:
    s = "%.2f" % v
    return s.rstrip("0").rstrip(".") if "." in s else s


def _colour(el):
    """(hex, alpha) from a solidFill-like element, or None."""
    if el is None:
        return None
    c = el.find("a:srgbClr", NS)
    if c is None:
        return None
    alpha = c.find("a:alpha", NS)
    return "#" + c.get("val").upper(), (int(alpha.get("val")) / 100000.0 if alpha is not None else 1.0)


def _adj(sp, name="adj", default=16667):
    for gd in sp.iterfind(".//a:prstGeom/a:avLst/a:gd", NS):
        if gd.get("name") == name:
            return int(gd.get("fmla").split()[-1])
    return default


def _poly(points):
    return "M" + " L".join("%s %s" % (_f(x), _f(y)) for x, y in points) + " Z"


def _geometry(sp, w, h, warnings):
    geom = sp.find("p:spPr/a:prstGeom", NS)
    prst = geom.get("prst") if geom is not None else "rect"
    if prst == "rect":
        return '<rect width="%s" height="%s"' % (_f(w), _f(h))
    if prst == "roundRect":
        r = min(w, h) * min(_adj(sp), 50000) / 100000.0
        return '<rect width="%s" height="%s" rx="%s"' % (_f(w), _f(h), _f(r))
    if prst == "ellipse":
        return '<ellipse cx="%s" cy="%s" rx="%s" ry="%s"' % (_f(w / 2), _f(h / 2), _f(w / 2), _f(h / 2))
    if prst == "triangle":
        a = _adj(sp, "adj", 50000) / 100000.0
        return '<path d="%s"' % _poly([(w * a, 0), (w, h), (0, h)])
    if prst == "trapezoid":
        a = min(w, h) * _adj(sp, "adj", 25000) / 100000.0
        return '<path d="%s"' % _poly([(a, 0), (w - a, 0), (w, h), (0, h)])
    if prst in ("rightArrow", "leftArrow", "upArrow", "downArrow"):
        a1 = _adj(sp, "adj1", 50000) / 100000.0
        a2 = _adj(sp, "adj2", 50000) / 100000.0
        if prst in ("rightArrow", "leftArrow"):
            head = min(w, h * a2)
            t = h * (1 - a1) / 2
            pts = [(0, t), (w - head, t), (w - head, 0), (w, h / 2), (w - head, h), (w - head, h - t), (0, h - t)]
            if prst == "leftArrow":
                pts = [(w - x, y) for x, y in pts]
        else:
            head = min(h, w * a2)
            t = w * (1 - a1) / 2
            pts = [(t, h), (t, head), (0, head), (w / 2, 0), (w, head), (w - t, head), (w - t, h)]
            if prst == "downArrow":
                pts = [(x, h - y) for x, y in pts]
        return '<path d="%s"' % _poly(pts)
    if prst == "star5":
        pts = []
        for i in range(10):
            ang = -math.pi / 2 + i * math.pi / 5
            rad = 0.5 if i % 2 == 0 else 0.5 * 0.382
            pts.append((w / 2 + w * rad * math.cos(ang) * 1.05, h * 0.553 + h * rad * math.sin(ang) * 1.1))
        return '<path d="%s"' % _poly(pts)
    warnings.append("unsupported geometry '%s' drawn as rect" % prst)
    return '<rect width="%s" height="%s"' % (_f(w), _f(h))


def _xf(el, tag):
    x = el.find("p:%s/a:xfrm" % tag, NS)
    if x is None:
        return None
    off, ext = x.find("a:off", NS), x.find("a:ext", NS)
    d = {"x": int(off.get("x")), "y": int(off.get("y")), "w": int(ext.get("cx")), "h": int(ext.get("cy")),
         "rot": int(x.get("rot", "0")) / 60000.0, "flipH": x.get("flipH") == "1", "flipV": x.get("flipV") == "1"}
    cho, che = x.find("a:chOff", NS), x.find("a:chExt", NS)
    if cho is not None and che is not None:
        d.update(cx=int(cho.get("x")), cy=int(cho.get("y")), cw=int(che.get("cx")), ch=int(che.get("cy")))
    return d


def _transform(xf):
    parts = ["translate(%s %s)" % (_f(xf["x"] / EMU), _f(xf["y"] / EMU))]
    w, h = xf["w"] / EMU, xf["h"] / EMU
    if xf["rot"]:
        parts.append("rotate(%s %s %s)" % (_f(xf["rot"]), _f(w / 2), _f(h / 2)))
    if xf["flipH"] or xf["flipV"]:
        parts.append("translate(%s %s) scale(%s %s)" % (
            _f(w if xf["flipH"] else 0), _f(h if xf["flipV"] else 0), -1 if xf["flipH"] else 1, -1 if xf["flipV"] else 1))
    return " ".join(parts)


def _render(el, out, warnings, depth):
    tag = etree.QName(el).localname
    pad = "  " * depth
    if tag == "grpSp":
        xf = _xf(el, "grpSpPr")
        t = ""
        if xf and "cw" in xf and xf["cw"] and xf["ch"]:
            sx, sy = xf["w"] / xf["cw"], xf["h"] / xf["ch"]
            t = _transform(xf)
            if abs(sx - 1) > 1e-6 or abs(sy - 1) > 1e-6:
                t += " scale(%s %s)" % (_f(sx) if abs(sx - 1) > 0.005 else "%.5f" % sx, _f(sy) if abs(sy - 1) > 0.005 else "%.5f" % sy)
            t += " translate(%s %s)" % (_f(-xf["cx"] / EMU), _f(-xf["cy"] / EMU))
        out.append('%s<g transform="%s">' % (pad, t) if t.strip() else "%s<g>" % pad)
        for ch in el:
            _render(ch, out, warnings, depth + 1)
        out.append("%s</g>" % pad)
        return
    if tag not in ("sp", "cxnSp"):
        if tag == "pic":
            warnings.append("embedded picture skipped")
        return
    xf = _xf(el, "spPr")
    if xf is None:
        return
    sppr = el.find("p:spPr", NS)
    w, h = xf["w"] / EMU, xf["h"] / EMU
    fill = _colour(sppr.find("a:solidFill", NS))
    if sppr.find("a:gradFill", NS) is not None:
        warnings.append("gradient fill approximated by first stop")
        fill = _colour(sppr.find("a:gradFill/a:gsLst/a:gs", NS))
    ln = sppr.find("a:ln", NS)
    stroke = None
    if ln is not None and ln.find("a:noFill", NS) is None:
        stroke = _colour(ln.find("a:solidFill", NS))
    attrs = []
    if fill and sppr.find("a:noFill", NS) is None:
        attrs.append('fill="%s"' % fill[0])
        if fill[1] < 1:
            attrs.append('fill-opacity="%s"' % _f(fill[1]))
    else:
        attrs.append('fill="none"')
    if stroke:
        attrs.append('stroke="%s" stroke-width="%s"' % (stroke[0], _f(int(ln.get("w", "9525")) / EMU)))
        if stroke[1] < 1:
            attrs.append('stroke-opacity="%s"' % _f(stroke[1]))
    if not (fill or stroke):
        return
    if el.find(".//a:r", NS) is not None and "".join(el.itertext()).strip():
        warnings.append("text inside illustration not rendered: %r" % "".join(t.text or "" for t in el.iter("{%s}t" % A)))
    out.append('%s%s %s transform="%s"/>' % (pad, _geometry(el, w, h, warnings), " ".join(attrs), _transform(xf)))


def group_to_svg(slide_root, shape_id: int, title: str = "", skip_first_background=False):
    """Render the group (or shape) with the given id. Returns (svg_text, warnings)."""
    target = None
    for el in slide_root.iter("{%s}grpSp" % P, "{%s}sp" % P):
        nv = el.find("./*/p:cNvPr", NS)
        if nv is not None and int(nv.get("id")) == shape_id:
            target = el
            break
    if target is None:
        raise KeyError(shape_id)
    tag = etree.QName(target).localname
    xf = _xf(target, "grpSpPr" if tag == "grpSp" else "spPr")
    warnings, body = [], []
    _render(target, body, warnings, 1)
    x, y, w, h = xf["x"] / EMU, xf["y"] / EMU, xf["w"] / EMU, xf["h"] / EMU
    head = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="%s %s %s %s" role="img"%s>' % (
        _f(x), _f(y), _f(w), _f(h), ' aria-label="%s"' % title.replace('"', "&quot;") if title else "")
    svg = "\n".join([head] + ["  <title>%s</title>" % title.replace("&", "&amp;").replace("<", "&lt;")] * bool(title) + body + ["</svg>"]) + "\n"
    return svg, sorted(set(warnings))
