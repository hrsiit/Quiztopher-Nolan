#!/usr/bin/env python3
"""Builds Quiztopher Nolan into one self-contained HTML file that runs offline.

    python3 build.py                 -> dist/Quiztopher-Nolan.html
    python3 build.py --body OUT.html -> also writes the page body alone (for a hosted preview)
"""
import base64
import pathlib
import sys
from datetime import datetime

ROOT = pathlib.Path(__file__).resolve().parent
SRC = ROOT / "src"
FONTS = ROOT / "fonts"
STICKERS = ROOT / "assets" / "stickers"

LATIN = ("U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, "
         "U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD")

FACES = [
    ("Inter", "400 700", "Inter-latin.woff2", LATIN),
    ("Inter", "400 700", "Inter-rupee.woff2", "U+20B9"),
    ("Space Grotesk", "500 700", "SpaceGrotesk-latin.woff2", LATIN),
    ("Space Grotesk", "500 700", "SpaceGrotesk-rupee.woff2", "U+20B9"),
    ("JetBrains Mono", "500 700", "JetBrainsMono-latin.woff2", LATIN),
]

CSS = ["styles.css", "admin.css"]
JS = ["data/questions.js", "data/pictures.js", "data/strings.js", "data/stickers.js", "STICKER_ART", "engine.js", "kit.js", "app.js", "admin.js"]


def font_css():
    out = []
    for family, weight, file, rng in FACES:
        data = base64.b64encode((FONTS / file).read_bytes()).decode()
        out.append(
            '@font-face{font-family:"%s";font-style:normal;font-weight:%s;font-display:block;'
            'src:url(data:font/woff2;base64,%s) format("woff2");unicode-range:%s}' % (family, weight, data, rng))
    return "\n".join(out)


def sticker_art_js():
    """The cut stickers (made by tools/cut_stickers.py) as data URIs, keyed by design id."""
    files = sorted(STICKERS.glob("*.webp"))
    if not files:
        sys.exit("No stickers in assets/stickers. Run: python3 tools/cut_stickers.py")
    pairs = ('  "%s": "data:image/webp;base64,%s"' % (f.stem, base64.b64encode(f.read_bytes()).decode()) for f in files)
    return "window.QN_STICKER_ART = {\n" + ",\n".join(pairs) + "\n};"


def main():
    template = (SRC / "index.html").read_text(encoding="utf-8")
    css = "\n".join((SRC / f).read_text(encoding="utf-8") for f in CSS)
    js = "\n;\n".join(sticker_art_js() if f == "STICKER_ART" else (SRC / f).read_text(encoding="utf-8") for f in JS)
    # Nothing inside the inline script may close it early.
    js = js.replace("</script", "<\\/script")
    stamp = datetime.now().strftime("%Y-%m-%d %H:%M")
    filled = (template.replace("/*FONTS*/", font_css())
              .replace("/*CSS*/", css)
              .replace("/*JS*/", "// Quiztopher Nolan, built " + stamp + "\n" + js))
    head, body = filled.split("<!--BODY-->")
    head = head.replace("<!--HEAD-->", "").strip()
    body = body.strip()

    full = ('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
            '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
            '<meta name="color-scheme" content="dark light">\n' + head + "\n</head>\n<body>\n" + body + "\n</body>\n</html>\n")
    dist = ROOT / "dist"
    dist.mkdir(exist_ok=True)
    out = dist / "Quiztopher-Nolan.html"
    out.write_text(full, encoding="utf-8")
    print("wrote", out, "%.0f KB" % (out.stat().st_size / 1024))

    if "--body" in sys.argv:
        target = pathlib.Path(sys.argv[sys.argv.index("--body") + 1])
        target.write_text(head + "\n" + body + "\n", encoding="utf-8")
        print("wrote", target, "%.0f KB" % (target.stat().st_size / 1024))


if __name__ == "__main__":
    main()
