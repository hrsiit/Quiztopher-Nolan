#!/usr/bin/env python3
"""Cuts the approved sticker sheets into one image per sticker design.

    python3 tools/cut_stickers.py            -> assets/stickers/<id>.webp
    python3 tools/cut_stickers.py --sheet X  -> also writes a contact sheet to X for checking the cuts

The sheets are ../Stickers/10.png, 11.png, 41.png and 50.png (transparent PNGs, 736 x 1308).
Each design lists the box it sits in on its sheet. Inside the box only the sticker itself is kept:
bits of neighbouring stickers that poke into the box are dropped. Where two stickers touch, the box
edge is the cut line. Names, sheets and copies per sheet live in src/data/stickers.js.
"""
import pathlib
import sys
from collections import deque

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = pathlib.Path(__file__).resolve().parent.parent
SHEETS = ROOT.parent / "Stickers"
OUT = ROOT / "assets" / "stickers"
MAX_SIDE = 360

# id: (sheet file, x0, y0, x1, y1). Ids are sheet.number in reading order; duplicates use the first copy.
CUTS = {
    "1-01": ("10.png", 10, 21, 335, 130),     # pink hearts (also 1-03)
    "1-02": ("10.png", 335, 18, 712, 188),    # Spotify code
    "1-04": ("10.png", 279, 194, 736, 418),   # graduation loading (also 1-09)
    "1-05": ("10.png", 4, 330, 281, 546),     # pink bow (also 1-10)
    "1-06": ("10.png", 241, 455, 719, 626),   # Python heartbeat
    "1-07": ("10.png", 0, 565, 310, 836),     # pink Wi-Fi (touches the bow below)
    "1-08": ("10.png", 391, 631, 736, 736),   # </code>
    "1-11": ("10.png", 256, 1000, 712, 1221), # code and coffee
    "1-12": ("10.png", 4, 1129, 297, 1280),   # programming languages
    "2-01": ("11.png", 0, 0, 345, 508),       # Java logo (touches tech girl era below)
    "2-02": ("11.png", 445, 18, 717, 292),    # <c-de/> duck
    "2-03": ("11.png", 356, 342, 715, 607),   # Docker
    "2-05": ("11.png", 447, 640, 725, 965),   # Java file
    "2-06": ("11.png", 34, 787, 451, 1043),   # Code girlie (touches the error box below)
    "2-07": ("11.png", 449, 968, 715, 1308),  # Programmer loading
    "2-08": ("11.png", 34, 1043, 451, 1308),  # error box
    "3-01": ("41.png", 39, 51, 260, 344),     # powered by caffeine and code
    "3-02": ("41.png", 266, 56, 487, 355),    # hello world
    "3-03": ("41.png", 495, 67, 712, 342),    # not a bug, a feature
    "3-04": ("41.png", 26, 435, 273, 605),    # Ctrl Alt Delete
    "3-05": ("41.png", 270, 371, 499, 674),   # copy-paste from Stack Overflow
    "3-06": ("41.png", 513, 371, 706, 669),   # eat sleep code repeat
    "3-07": ("41.png", 40, 670, 250, 989),    # in Linux we trust (white)
    "3-08": ("41.png", 272, 685, 490, 1000),  # the cloud (white)
    "3-09": ("41.png", 513, 687, 706, 942),   # repeat
    "3-10": ("41.png", 40, 998, 250, 1285),   # in Linux we trust (green)
    "3-11": ("41.png", 266, 997, 483, 1281),  # the cloud (green)
    "3-12": ("41.png", 493, 968, 712, 1280),  # I just fixed the code
    "4-01": ("50.png", 33, 38, 227, 175),     # warning: tired college student
    "4-02": ("50.png", 248, 59, 490, 163),    # certified yapper
    "4-03": ("50.png", 492, 28, 728, 169),    # I'm okay
    "4-04": ("50.png", 27, 184, 315, 321),    # full-stack developer
    "4-05": ("50.png", 317, 179, 516, 378),   # never give up
    "4-06": ("50.png", 527, 179, 717, 371),   # let me think
    "4-07": ("50.png", 11, 378, 301, 536),    # trust yourself
    "4-08": ("50.png", 311, 403, 496, 564),   # study mode on
    "4-09": ("50.png", 512, 419, 726, 623),   # brain tabs
    "4-10": ("50.png", 53, 544, 253, 784),    # make yourself a priority
    "4-11": ("50.png", 293, 590, 500, 742),   # trust the process
    "4-12": ("50.png", 522, 647, 715, 840),   # I bee-leaf in you
    "4-13": ("50.png", 27, 795, 270, 1004),   # Coding girlie (touches focus mode below)
    "4-14": ("50.png", 258, 792, 522, 943),   # main character energy
    "4-15": ("50.png", 571, 900, 705, 1029),  # VS Code
    "4-16": ("50.png", 27, 1004, 270, 1138),  # focus mode
    "4-17": ("50.png", 306, 981, 649, 1272),  # tech girl era (also 2-04)
    "4-18": ("50.png", 27, 1138, 270, 1206),  # nap-a-holic
    "4-19": ("50.png", 34, 1221, 344, 1292),  # "Hello, world!"
}


def components(mask):
    """Connected areas of a boolean mask: a label image and each label's pixel count."""
    h, w = mask.shape
    lab = np.zeros((h, w), np.int32)
    sizes = [0]
    for y0, x0 in zip(*np.nonzero(mask)):
        if lab[y0, x0]:
            continue
        n = len(sizes)
        lab[y0, x0] = n
        q, cnt = deque([(y0, x0)]), 0
        while q:
            y, x = q.popleft()
            cnt += 1
            for yy, xx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
                if 0 <= yy < h and 0 <= xx < w and mask[yy, xx] and not lab[yy, xx]:
                    lab[yy, xx] = n
                    q.append((yy, xx))
        sizes.append(cnt)
    return lab, sizes


def cut(sheet, box):
    im = sheet.crop(box)
    a = np.array(im.getchannel("A"))
    lab, sizes = components(a > 40)
    big = max(sizes)
    keep = np.isin(lab, [i for i, s in enumerate(sizes) if i and s >= 0.08 * big])
    # Grow the kept area a little so the soft, half-transparent edge comes along.
    grown = Image.fromarray((keep * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(5))
    alpha = (a.astype(np.uint16) * (np.array(grown) > 0)).astype(np.uint8)
    im.putalpha(Image.fromarray(alpha))
    bbox = im.getchannel("A").point(lambda v: 255 if v > 8 else 0).getbbox()
    im = im.crop(bbox)
    if max(im.size) > MAX_SIDE:
        k = MAX_SIDE / max(im.size)
        im = im.resize((round(im.width * k), round(im.height * k)), Image.LANCZOS)
    return im


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    sheets = {}
    made = {}
    for sid, (file, *box) in CUTS.items():
        sheet = sheets.get(file) or sheets.setdefault(file, Image.open(SHEETS / file).convert("RGBA"))
        im = cut(sheet, box)
        im.save(OUT / (sid + ".webp"), "WEBP", quality=82, method=6, alpha_quality=90)
        made[sid] = im
    total = sum((OUT / (s + ".webp")).stat().st_size for s in CUTS)
    print("wrote %d stickers to %s, %.0f KB" % (len(made), OUT, total / 1024))

    if "--sheet" in sys.argv:
        target = pathlib.Path(sys.argv[sys.argv.index("--sheet") + 1])
        cell, cols = 200, 8
        rows = -(-len(made) // cols)
        board = Image.new("RGBA", (cols * cell, rows * (cell + 18)), (233, 236, 242, 255))
        d = ImageDraw.Draw(board)
        for i, (sid, im) in enumerate(made.items()):
            x, y = (i % cols) * cell, (i // cols) * (cell + 18)
            th = im.copy()
            th.thumbnail((cell - 16, cell - 16))
            d.rectangle([x + 4, y + 4, x + cell - 4, y + cell - 4], outline=(200, 0, 200, 255))
            board.alpha_composite(th, (x + (cell - th.width) // 2, y + (cell - th.height) // 2))
            d.text((x + 6, y + cell), sid + "  %dx%d" % im.size, fill=(20, 20, 20, 255))
        board.save(target)
        print("wrote", target)


if __name__ == "__main__":
    main()
