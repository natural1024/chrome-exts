#!/usr/bin/env python3
"""Generate My Zero Omega icons.

Draws a blue rounded square with a white "Z" glyph, at 16 / 32 / 48 / 128 px.
Uses only Python's standard library (struct + zlib) — no PIL required.

Run once:
    python3 tools/gen-icons.py
"""

import os
import struct
import zlib

# ---------------------------------------------------------------------------
# 5x7 bitmap for the letter "Z"
# ---------------------------------------------------------------------------
Z_GLYPH = (
    "11111",
    "00001",
    "00010",
    "00100",
    "01000",
    "10000",
    "11111",
)
GW, GH = 5, 7  # glyph dimensions

BG = (26, 115, 232)     # Google blue
FG = (255, 255, 255)    # white
SIZES = (16, 32, 48, 128)


def in_rounded_rect(x: int, y: int, w: int, h: int, r: int) -> bool:
    """True iff (x, y) is inside a rounded rectangle covering [0, w) x [0, h)."""
    # Middle horizontal strip
    if r <= x < w - r:
        return 0 <= y < h
    # Middle vertical strip
    if r <= y < h - r:
        return 0 <= x < w
    # In a corner region — check distance from the nearest corner center.
    cx = r if x < r else w - 1 - r
    cy = r if y < r else h - 1 - r
    dx = x - cx
    dy = y - cy
    return dx * dx + dy * dy <= r * r


def make_png(size: int, path: str) -> None:
    w = h = size
    scale = max(1, size // 8)          # 16→2, 32→4, 48→6, 128→16
    gw, gh = GW * scale, GH * scale
    ox = (w - gw) // 2                 # glyph origin
    oy = (h - gh) // 2
    corner = max(2, size // 6)         # icon corner radius

    scanlines = bytearray()
    for y in range(h):
        # Each PNG scanline is prefixed by a filter-type byte (0 = None).
        scanlines.append(0)
        for x in range(w):
            if in_rounded_rect(x, y, w, h, corner):
                r, g, b = BG
                gx = (x - ox) // scale
                gy = (y - oy) // scale
                if 0 <= gx < GW and 0 <= gy < GH and Z_GLYPH[gy][gx] == "1":
                    r, g, b = FG
                a = 255
            else:
                r, g, b, a = 0, 0, 0, 0
            scanlines.extend((r, g, b, a))

    write_png(path, w, h, bytes(scanlines))


def write_png(path: str, w: int, h: int, rgba_scanlines: bytes) -> None:
    def chunk(tag: bytes, data: bytes) -> bytes:
        return (
            struct.pack(">I", len(data))
            + tag
            + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    signature = b"\x89PNG\r\n\x1a\n"
    # IHDR: width, height, bit depth 8, color type 6 (RGBA), compression 0, filter 0, interlace 0
    ihdr = struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0)
    idat = zlib.compress(rgba_scanlines, 9)

    with open(path, "wb") as f:
        f.write(signature)
        f.write(chunk(b"IHDR", ihdr))
        f.write(chunk(b"IDAT", idat))
        f.write(chunk(b"IEND", b""))


def main() -> None:
    here = os.path.dirname(os.path.abspath(__file__))
    out_dir = os.path.abspath(os.path.join(here, "..", "icons"))
    os.makedirs(out_dir, exist_ok=True)
    for size in SIZES:
        path = os.path.join(out_dir, f"icon{size}.png")
        make_png(size, path)
        print(f"wrote {path}")


if __name__ == "__main__":
    main()
