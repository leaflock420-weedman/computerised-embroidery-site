#!/usr/bin/env python3
"""
Auto-digitize artwork → production embroidery files (DST, PES, JEF).
Ember-style backend: colour separation + fill stitches + machine export.
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

try:
    import pyembroidery as pe
except ImportError:
    print(json.dumps({"ok": False, "error": "pip install pyembroidery pillow numpy"}))
    sys.exit(1)

SCALE = 10
STITCH_SPACING = 3   # mm
COL_SPACING = 1.8    # mm
MAX_COLORS = 6
MAX_WIDTH_MM = 100


def remove_background(arr):
    h, w, _ = arr.shape
    corners = np.array([
        arr[0, 0, :3], arr[0, w - 1, :3],
        arr[h - 1, 0, :3], arr[h - 1, w - 1, :3],
    ], dtype=np.float32)
    bg = corners.mean(axis=0)
    rgb = arr[:, :, :3].astype(np.float32)
    dist = np.sum((rgb - bg) ** 2, axis=2)
    white = np.all(arr[:, :, :3] > 240, axis=2)
    transparent = (dist < 35 ** 2) | white
    out = arr.copy()
    out[transparent, 3] = 0
    return out


def quantize_palette(arr, max_colors):
    mask = arr[:, :, 3] > 128
    if not mask.any():
        return []
    pixels = arr[mask][:, :3]
    # K-means lite: sample then unique top colors
    uniq, counts = np.unique(pixels, axis=0, return_counts=True)
    order = np.argsort(-counts)
    palette = [tuple(map(int, uniq[i])) for i in order[:max_colors]]
    return palette


def assign_colors(arr, palette):
    h, w, _ = arr.shape
    labels = np.full((h, w), -1, dtype=np.int16)
    mask = arr[:, :, 3] > 128
    if not palette:
        return labels, {}
    pal = np.array(palette, dtype=np.float32)
    rgb = arr[:, :, :3].astype(np.float32)
    flat = rgb[mask]
    dists = ((flat[:, None, :] - pal[None, :, :]) ** 2).sum(axis=2)
    nearest = dists.argmin(axis=1)
    labels[mask] = nearest
    layers = {i: (labels == i) for i in range(len(palette))}
    return labels, layers


def generate_stitches(layer, color_idx):
    h, w = layer.shape
    row_step = max(1, int(STITCH_SPACING * SCALE / 10))
    col_step = max(1, int(COL_SPACING * SCALE / 10))
    stitches = []
    row_num = 0
    for y in range(0, h, row_step):
        row = layer[y]
        xs = np.where(row)[0]
        if xs.size == 0:
            row_num += 1
            continue
        segments = []
        start = xs[0]
        prev = xs[0]
        for x in xs[1:]:
            if x - prev > 1:
                segments.append((start, prev))
                start = x
            prev = x
        segments.append((start, prev))
        for x0, x1 in segments:
            if row_num % 2 == 0:
                pts = list(range(x0, x1 + 1, col_step))
                if pts[-1] != x1:
                    pts.append(x1)
            else:
                pts = list(range(x1, x0 - 1, -col_step))
                if pts[-1] != x0:
                    pts.append(x0)
            for x in pts:
                stitches.append((int(x), int(y), color_idx))
        row_num += 1
    return stitches


def build_pattern(stitch_list, palette):
    pattern = pe.EmbPattern()
    for i, rgb in enumerate(palette):
        pattern.add_thread(pe.EmbThread(rgb[0], rgb[1], rgb[2], f"Thread {i + 1}", ""))
    last_color = -1
    for x, y, ci in stitch_list:
        sx, sy = x * SCALE, y * SCALE
        if ci != last_color:
            pattern.add_stitch_absolute(pe.COLOR_CHANGE, sx, sy)
            last_color = ci
        pattern.add_stitch_absolute(pe.STITCH, sx, sy)
    if stitch_list:
        lx, ly = stitch_list[-1][0] * SCALE, stitch_list[-1][1] * SCALE
    else:
        lx = ly = 0
    pattern.add_stitch_absolute(pe.END, lx, ly)
    return pattern


def render_preview(layers, palette, out_path, scale=3):
    if not layers:
        return
    h, w = next(iter(layers.values())).shape
    canvas = np.zeros((h * scale, w * scale, 3), dtype=np.uint8)
    canvas[:] = (240, 240, 245)
    for ci, layer in layers.items():
        rgb = np.array(palette[ci], dtype=np.uint8)
        up = np.repeat(np.repeat(layer, scale, axis=0), scale, axis=1)
        canvas[up] = rgb
    Image.fromarray(canvas).save(out_path, "PNG")


def digitize(input_path, out_dir, job_id=None, max_colors=MAX_COLORS, width_mm=MAX_WIDTH_MM):
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    job_id = job_id or Path(input_path).stem

    img = Image.open(input_path).convert("RGBA")
    w, h = img.size
    target_w = max(40, int(width_mm * 4))
    if w > target_w:
        ratio = target_w / w
        img = img.resize((target_w, max(1, int(h * ratio))), Image.Resampling.LANCZOS)
    arr = remove_background(np.array(img))
    h, w = arr.shape[:2]

    palette = quantize_palette(arr, max_colors)
    if not palette:
        return {"ok": False, "error": "No artwork pixels found"}

    _, layers = assign_colors(arr, palette)
    all_stitches = []
    for ci in sorted(layers.keys()):
        all_stitches.extend(generate_stitches(layers[ci], ci))
    if not all_stitches:
        return {"ok": False, "error": "Could not generate stitches"}

    pattern = build_pattern(all_stitches, palette)
    dst_path = out_dir / f"{job_id}.dst"
    pes_path = out_dir / f"{job_id}.pes"
    jef_path = out_dir / f"{job_id}.jef"
    preview_path = out_dir / f"{job_id}-stitch-preview.png"
    meta_path = out_dir / f"{job_id}-production.json"

    pe.write_dst(pattern, str(dst_path))
    pe.write_pes(pattern, str(pes_path))
    pe.write_jef(pattern, str(jef_path))
    render_preview(layers, palette, str(preview_path))

    meta = {
        "ok": True,
        "jobId": job_id,
        "stitchCount": len(all_stitches),
        "colorCount": len(palette),
        "colors": [{"index": i + 1, "rgb": list(palette[i]),
                    "hex": "#%02x%02x%02x" % palette[i]} for i in range(len(palette))],
        "widthMm": round(w * SCALE / 100, 1),
        "heightMm": round(h * SCALE / 100, 1),
        "files": {
            "dst": f"/uploads/production/{dst_path.name}",
            "pes": f"/uploads/production/{pes_path.name}",
            "jef": f"/uploads/production/{jef_path.name}",
            "preview": f"/uploads/production/{preview_path.name}",
        },
    }
    meta_path.write_text(json.dumps(meta, indent=2), encoding="utf-8")
    return meta


def main():
    if len(sys.argv) < 3:
        print(json.dumps({"ok": False, "error": "Usage: auto-digitize.py <input> <out_dir> [job_id]"}))
        sys.exit(1)
    try:
        result = digitize(sys.argv[1], sys.argv[2], job_id=sys.argv[3] if len(sys.argv) > 3 else None)
        print(json.dumps(result))
        sys.exit(0 if result.get("ok") else 1)
    except Exception as e:
        print(json.dumps({"ok": False, "error": str(e)}))
        sys.exit(1)


if __name__ == "__main__":
    main()