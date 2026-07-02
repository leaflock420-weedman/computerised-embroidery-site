#!/usr/bin/env python3
"""Strip studio backgrounds from blank mockup photos → transparent PNG."""
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
PHOTOS = ROOT / "assets" / "mockups" / "photos"


def remove_bg(path: Path, out: Path, tol: int = 42) -> None:
    img = Image.open(path).convert("RGBA")
    arr = np.array(img)
    h, w = arr.shape[:2]
    pts = [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1), (w // 2, 0), (w // 2, h - 1), (0, h // 2), (w - 1, h // 2)]
    samples = [arr[min(y, h - 1), min(x, w - 1), :3] for x, y in pts]
    bg = np.median(samples, axis=0)
    rgb = arr[:, :, :3].astype(np.float32)
    dist = np.sqrt(np.sum((rgb - bg) ** 2, axis=2))
    soft = 18
    new_a = np.where(dist <= tol, 0, np.where(dist <= tol + soft, (dist - tol) / soft * 255, 255))
    arr[:, :, 3] = np.minimum(arr[:, :, 3].astype(np.float32), new_a).astype(np.uint8)
    mask = arr[:, :, 3] > 10
    ys, xs = np.where(mask)
    if len(xs):
        pad = 12
        cropped = Image.fromarray(
            arr[max(0, ys.min() - pad) : min(h, ys.max() + pad), max(0, xs.min() - pad) : min(w, xs.max() + pad)]
        )
    else:
        cropped = Image.fromarray(arr)
    cropped.save(out, optimize=True)
    print(f"  {out.name} {cropped.size}")


def main():
    for jpg in sorted(PHOTOS.glob("*-black.jpg")):
        tol = 50 if "beanie" in jpg.name else 42
        remove_bg(jpg, jpg.with_suffix(".png"), tol=tol)


if __name__ == "__main__":
    main()