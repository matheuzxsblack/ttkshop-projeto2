#!/usr/bin/env python3
"""Recolor jacket only: person bbox + LAB distance from fabric samples + skin cut-out."""
from __future__ import annotations

import cv2
import numpy as np
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "images"

SWATCH = {
    "caramelo": (72, 130, 198),
    "azul": (120, 70, 35),
    "vermelho": (50, 50, 190),
    "rosa": (180, 170, 220),
    "verde": (60, 95, 70),
}

SAMPLES = {
    "warm": [(0.46, 0.40), (0.54, 0.46), (0.50, 0.56)],
    "dark": [(0.48, 0.42), (0.56, 0.50), (0.44, 0.52)],
    "light": [(0.47, 0.41), (0.55, 0.47), (0.51, 0.55)],
}


def face_exclude_mask(bgr: np.ndarray) -> np.ndarray:
    h, w = bgr.shape[:2]
    face = np.zeros((h, w), np.uint8)
    cv2.ellipse(face, (int(w * 0.50), int(h * 0.27)), (int(w * 0.11), int(h * 0.09)), 0, 0, 360, 255, -1)
    return cv2.dilate(face, np.ones((5, 5), np.uint8), iterations=1)


def ref_fabric_color(bgr: np.ndarray, kind: str) -> np.ndarray:
    h, w = bgr.shape[:2]
    cols = [bgr[int(h * y), int(w * x)] for x, y in SAMPLES[kind]]
    cols = np.array(cols, dtype=np.float32)
    if kind == "warm":
        cols = cols[(cols[:, 2] > 110) & (cols[:, 0] < 120)]
    elif kind == "light":
        cols = cols[(cols[:, 0] > 150) & (cols[:, 1] > 150) & (cols[:, 2] > 150)]
    if len(cols) == 0:
        cols = np.array([bgr[int(h * 0.5), int(w * 0.48)]], dtype=np.float32)
    return np.mean(cols, axis=0)


def fabric_mask(bgr: np.ndarray, kind: str) -> np.ndarray:
    h, w = bgr.shape[:2]
    ref = ref_fabric_color(bgr, kind)

    lab = cv2.cvtColor(bgr, cv2.COLOR_BGR2LAB).astype(np.float32)
    rlab = cv2.cvtColor(np.uint8([[ref]]), cv2.COLOR_BGR2LAB)[0, 0].astype(np.float32)

    dist = np.linalg.norm(lab - rlab, axis=2)
    thresh = 34 if kind == "dark" else 38 if kind == "light" else 42
    m = (dist < thresh).astype(np.uint8) * 255

    torso = np.zeros((h, w), np.uint8)
    torso[int(h * 0.14) : int(h * 0.80), int(w * 0.06) : int(w * 0.94)] = 255
    m = cv2.bitwise_and(m, torso)

    face = face_exclude_mask(bgr)
    m = cv2.bitwise_and(m, cv2.bitwise_not(face))

    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, k, iterations=2)
    m = cv2.medianBlur(m, 5)
    return m


def lab_recolor(bgr: np.ndarray, mask: np.ndarray, target_bgr: tuple[int, int, int], mix: float = 0.82) -> np.ndarray:
    tgt = cv2.cvtColor(np.uint8([[list(target_bgr)]]), cv2.COLOR_BGR2LAB)[0, 0].astype(np.float32)
    lab = cv2.cvtColor(bgr, cv2.COLOR_BGR2LAB).astype(np.float32)
    L, a, b = cv2.split(lab)
    sel = mask > 127
    L[sel] = np.clip(L[sel] * (1 - mix) + tgt[0] * mix, 0, 255)
    a[sel] = np.clip(a[sel] * (1 - mix) + tgt[1] * mix, 0, 255)
    b[sel] = np.clip(b[sel] * (1 - mix) + tgt[2] * mix, 0, 255)
    out = cv2.cvtColor(cv2.merge([L, a, b]).astype(np.uint8), cv2.COLOR_LAB2BGR)
    alpha = cv2.GaussianBlur(mask.astype(np.float32) / 255.0, (25, 25), 0)[..., None]
    return (alpha * out.astype(np.float32) + (1.0 - alpha) * bgr.astype(np.float32)).astype(np.uint8)


def gray_jacket(bgr: np.ndarray, mask: np.ndarray) -> np.ndarray:
    lab = cv2.cvtColor(bgr, cv2.COLOR_BGR2LAB).astype(np.float32)
    L, a, b = cv2.split(lab)
    sel = mask > 127
    a[sel] = 128.0
    b[sel] = 128.0
    out = cv2.cvtColor(cv2.merge([L, a, b]).astype(np.uint8), cv2.COLOR_LAB2BGR)
    alpha = cv2.GaussianBlur(mask.astype(np.float32) / 255.0, (25, 25), 0)[..., None]
    return (alpha * out.astype(np.float32) + (1.0 - alpha) * bgr.astype(np.float32)).astype(np.uint8)


def run(src: str, dst: str, kind: str, target: tuple[int, int, int] | None, mix: float = 0.82, gray: bool = False) -> None:
    bgr = cv2.imread(str(ROOT / src))
    mask = fabric_mask(bgr, kind)
    if gray:
        out = gray_jacket(bgr, mask)
    else:
        out = lab_recolor(bgr, mask, target, mix=mix)
    cv2.imwrite(str(ROOT / dst), out, [cv2.IMWRITE_PNG_COMPRESSION, 3])
    pct = int(100 * np.count_nonzero(mask) / mask.size)
    print(f"{dst}: mask {pct}%")


def main() -> None:
    # Variantes extras: use imagens geradas por IA (color-*.png). Não regerar Caramelo.
    run("color-preto.png", "color-azul-marinho.png", "dark", SWATCH["azul"], mix=0.88)
    run("color-preto.png", "color-vermelho.png", "dark", SWATCH["vermelho"], mix=0.88)
    run("color-preto.png", "color-cinza.png", "dark", None, gray=True)
    run("color-bege.png", "color-rosa.png", "light", (190, 165, 210), mix=0.62)
    run("color-marrom.png", "color-verde-militar.png", "warm", (55, 100, 65), mix=0.78)


if __name__ == "__main__":
    main()
