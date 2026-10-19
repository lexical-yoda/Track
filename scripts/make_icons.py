#!/usr/bin/env python3
"""Generate the PWA icon PNGs from the same design as icon.svg.

The icon is the app's one primitive — a block of day cells, mostly kept, with a
single slip and a single planned exception. It is drawn here rather than
converted from the SVG so the repository needs no rasteriser: there is no
librsvg, ImageMagick or Inkscape dependency to install on a build machine, and
the only import is the standard library.

    python3 scripts/make_icons.py

Rewrites every PNG under frontend/public/icons/. Keep the colours in step with
`--ground`, `--kept`, `--kept-dim`, `--slipped` and `--allowed` in
frontend/src/styles/tokens.css.
"""

from __future__ import annotations

import struct
import sys
import zlib
from pathlib import Path

GROUND = (0x15, 0x11, 0x10)
KEPT = (0x4E, 0x8F, 0x74)
KEPT_DIM = (0x2A, 0x4D, 0x41)
SLIPPED = (0xA8, 0x40, 0x2F)
ALLOWED = (0xA8, 0x81, 0x2F)

# Row-major, matching icon.svg.
GRID = [
    [KEPT, KEPT, SLIPPED, KEPT],
    [KEPT, KEPT, KEPT, KEPT],
    [KEPT, ALLOWED, KEPT, KEPT],
    [KEPT, KEPT, KEPT, KEPT_DIM],
]

SUPERSAMPLE = 3  # Enough to keep the cell corners smooth at every output size.


def render(size: int, inset_fraction: float) -> bytes:
    """Draw the icon and return raw RGB rows.

    ``inset_fraction`` is how much of each edge to leave empty. A maskable icon
    needs its content inside the middle 80% so a launcher can crop it to any
    shape without clipping anything.
    """
    scale = size * SUPERSAMPLE
    inset = scale * inset_fraction
    span = scale - 2 * inset
    # Four cells with three gaps, where a gap is a quarter of a cell.
    cell = span / (4 + 3 * 0.25)
    gap = cell * 0.25
    radius = cell * 0.11

    # Pre-compute each cell's bounds so the pixel loop stays a lookup.
    boxes = []
    for row, colours in enumerate(GRID):
        for column, colour in enumerate(colours):
            x0 = inset + column * (cell + gap)
            y0 = inset + row * (cell + gap)
            boxes.append((x0, y0, x0 + cell, y0 + cell, colour))

    accumulator = bytearray(size * size * 3)
    samples = SUPERSAMPLE * SUPERSAMPLE

    for out_y in range(size):
        for out_x in range(size):
            totals = [0, 0, 0]
            for sub_y in range(SUPERSAMPLE):
                py = out_y * SUPERSAMPLE + sub_y + 0.5
                for sub_x in range(SUPERSAMPLE):
                    px = out_x * SUPERSAMPLE + sub_x + 0.5
                    colour = GROUND
                    for x0, y0, x1, y1, box_colour in boxes:
                        if x0 <= px <= x1 and y0 <= py <= y1 and _inside_round(
                            px, py, x0, y0, x1, y1, radius
                        ):
                            colour = box_colour
                            break
                    totals[0] += colour[0]
                    totals[1] += colour[1]
                    totals[2] += colour[2]
            offset = (out_y * size + out_x) * 3
            accumulator[offset] = totals[0] // samples
            accumulator[offset + 1] = totals[1] // samples
            accumulator[offset + 2] = totals[2] // samples

    # PNG wants each scanline prefixed with its filter type, 0 meaning none.
    rows = bytearray()
    for y in range(size):
        rows.append(0)
        start = y * size * 3
        rows += accumulator[start : start + size * 3]
    return bytes(rows)


def _inside_round(px: float, py: float, x0: float, y0: float, x1: float, y1: float, r: float) -> bool:
    """Whether a point falls inside a rounded rectangle."""
    if r <= 0:
        return True
    # Only the four corner squares need a distance test.
    cx = x0 + r if px < x0 + r else x1 - r if px > x1 - r else px
    cy = y0 + r if py < y0 + r else y1 - r if py > y1 - r else py
    if cx == px and cy == py:
        return True
    return (px - cx) ** 2 + (py - cy) ** 2 <= r * r


def write_png(path: Path, size: int, rows: bytes) -> None:
    def chunk(kind: bytes, payload: bytes) -> bytes:
        body = kind + payload
        return struct.pack(">I", len(payload)) + body + struct.pack(">I", zlib.crc32(body))

    header = struct.pack(">2I5B", size, size, 8, 2, 0, 0, 0)  # 8-bit, truecolour RGB
    png = (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", header)
        + chunk(b"IDAT", zlib.compress(rows, 9))
        + chunk(b"IEND", b"")
    )
    path.write_bytes(png)


def main() -> int:
    out = Path(__file__).resolve().parent.parent / "frontend" / "public" / "icons"
    out.mkdir(parents=True, exist_ok=True)

    targets = [
        ("icon-180.png", 180, 0.1875),
        ("icon-192.png", 192, 0.1875),
        ("icon-512.png", 512, 0.1875),
        # A maskable icon is cropped by the launcher, so its content sits well
        # inside the edge.
        ("icon-maskable-512.png", 512, 0.26),
    ]
    for name, size, inset in targets:
        write_png(out / name, size, render(size, inset))
        print(f"wrote {name} ({size}×{size})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
