#!/usr/bin/env python3
"""
Helper utilities for measuring exact pixel bounding boxes, circle centers/radii,
RGB hex colors, and coordinate grid overlays from a reference diagram image.
"""
import sys
from PIL import Image
import numpy as np
import cv2


def save_grid_overlay(image_path: str, output_path: str, step: int = 50):
    img = Image.open(image_path).convert("RGB")
    arr = np.array(img)
    h, w, _ = arr.shape
    grid_img = arr.copy()
    for x in range(0, w, step):
        cv2.line(grid_img, (x, 0), (x, h), (200, 200, 200), 1)
        cv2.putText(grid_img, str(x), (x + 2, 14), cv2.FONT_HERSHEY_SIMPLEX, 0.38, (220, 0, 0), 1)
    for y in range(0, h, step):
        cv2.line(grid_img, (0, y), (w, y), (200, 200, 200), 1)
        cv2.putText(grid_img, str(y), (2, y + 12), cv2.FONT_HERSHEY_SIMPLEX, 0.38, (220, 0, 0), 1)
    Image.fromarray(grid_img).save(output_path)
    print(f"Saved grid overlay ({w}x{h}) to {output_path}")


def sample_hex_color(arr: np.ndarray, x: int, y: int, half_win: int = 3) -> str:
    h, w, _ = arr.shape
    patch = arr[max(0, y - half_win):min(h, y + half_win + 1),
                max(0, x - half_win):min(w, x + half_win + 1)].reshape(-1, 3)
    med = np.median(patch, axis=0).astype(int)
    return f"#{med[0]:02X}{med[1]:02X}{med[2]:02X}"


def flood_bbox(arr: np.ndarray, x0: int, y0: int, dark_thresh: int = 120):
    gray = cv2.cvtColor(arr, cv2.COLOR_RGB2GRAY)
    h, w = gray.shape
    barrier = (gray < dark_thresh).astype(np.uint8)
    mask = np.zeros((h + 2, w + 2), np.uint8)
    mask[1:-1, 1:-1] = barrier
    flood = np.zeros((h, w), np.uint8)
    cv2.floodFill(flood, mask, (x0, y0), 255)
    ys, xs = np.where(flood == 255)
    x1, y1, x2, y2 = int(xs.min() - 1), int(ys.min() - 1), int(xs.max() + 1), int(ys.max() + 1)
    return {
        "x1": x1, "y1": y1, "x2": x2, "y2": y2,
        "w": x2 - x1, "h": y2 - y1,
        "cx": round(0.5 * (x1 + x2), 1), "cy": round(0.5 * (y1 + y2), 1)
    }


def fit_circle_perimeter(arr: np.ndarray, cx0: int, cy0: int, r_min: float = 10.0, r_max: float = 30.0):
    black = (arr[:, :, 0] < 100) & (arr[:, :, 1] < 100) & (arr[:, :, 2] < 100)
    angles = np.linspace(0, 2 * np.pi, 72, endpoint=False)
    ca, sa = np.cos(angles), np.sin(angles)
    best_score, best = -1, None
    for r in np.arange(r_min, r_max, 0.5):
        for cy in range(cy0 - 8, cy0 + 9):
            for cx in range(cx0 - 8, cx0 + 9):
                px = np.round(cx + r * ca).astype(int)
                py = np.round(cy + r * sa).astype(int)
                score = int(black[py, px].sum())
                if score > best_score:
                    best_score = score
                    best = {"cx": cx, "cy": cy, "r": float(r), "score": score}
    return best


if __name__ == "__main__":
    if len(sys.argv) >= 3:
        save_grid_overlay(sys.argv[1], sys.argv[2])


def verify_tex_file(tex_path: str):
    import re
    with open(tex_path) as f:
        s = f.read()
    assert s.count("{") == s.count("}"), f"Unbalanced braces: {s.count('{')} vs {s.count('}')}"
    assert s.count("(") == s.count(")"), f"Unbalanced parens: {s.count('(')} vs {s.count(')')}"
    assert s.count("\\begin{") == s.count("\\end{"), "Unbalanced environments"
    defined = set(re.findall(r"\\definecolor\{(\w+)\}", s)) | {
        "black", "white", "red", "green", "blue", "cyan", "magenta", "yellow", "orange", "purple", "gray", "grey", "none"
    }
    for expr in re.findall(r"(?:fill|draw|top color|bottom color)=([A-Za-z0-9!]+)", s):
        for part in expr.split("!"):
            if part and not part.isdigit() and not part.startswith("\\"):
                assert part in defined, f"Undefined color '{part}' in '{expr}'"
    print(f"Verified {tex_path}: {len(s)} bytes, braces/parens/colors all valid.")
