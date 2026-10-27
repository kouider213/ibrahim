"""Deux visages AMICAUX pour Dzaryx (Kouider 27/10 : le visage 3D « fait peur ») — rendu OpenCV, 360×480.
- 'orb'     : bulle de lumière souriante (yeux ronds, sourire qui s'ouvre quand il parle, ondes autour).
- 'cartoon' : petit bonhomme dessin animé (tête ronde, grands yeux brillants, cheveux courts, barbe légère, sourire).
Même interface que avatar.Avatar : frame(talk, listen) → BGR, i420(talk, listen) → bytes.
"""
import math
import random
import time

import numpy as np

W, H, FPS = 360, 480, 15


class CuteAvatar:
    def __init__(self, style: str = 'orb') -> None:
        import cv2
        self.cv2, self.style = cv2, style
        self.t0 = time.monotonic()
        self.mouth = 0.0
        self.next_blink, self.blink_until = self.t0 + 2.5, 0.0
        self.gaze, self.gaze_to, self.next_gaze = np.zeros(2), np.zeros(2), self.t0 + 2
        yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
        self.xx, self.yy = xx, yy
        d = np.sqrt(((xx - W / 2) / W) ** 2 + ((yy - H * 0.45) / H) ** 2)
        top, bot = (np.array([90, 45, 30]), np.array([40, 18, 12])) if style == 'orb' else (np.array([235, 215, 190]), np.array([200, 170, 140]))
        self.bg = (top + (bot - top) * np.clip(d * 1.6, 0, 1)[..., None]).astype(np.uint8)
        rnd = random.Random(3)
        self.parts = [(rnd.uniform(0, W), rnd.uniform(0, H), rnd.uniform(0.3, 1), rnd.uniform(0, 6.3)) for _ in range(40)]

    def _anim(self):
        now = time.monotonic()
        if now > self.next_blink:
            self.blink_until, self.next_blink = now + 0.15, now + random.uniform(2.5, 5.5)
        if now > self.next_gaze:
            self.gaze_to = np.array([random.uniform(-1, 1), random.uniform(-0.5, 0.5)])
            self.next_gaze = now + random.uniform(1.5, 3.5)
        self.gaze += (self.gaze_to - self.gaze) * 0.2
        return now - self.t0, now < self.blink_until

    def frame(self, talk: float, listen: float = 0.0) -> np.ndarray:
        target = min(1.0, max(0.0, talk)) ** 0.7
        self.mouth += (target - self.mouth) * (0.6 if target > self.mouth else 0.35)
        t, blink = self._anim()
        return self._orb(t, blink, listen) if self.style == 'orb' else self._cartoon(t, blink, listen)

    # ── Bulle de lumière ───────────────────────────────────────────────────
    def _orb(self, t: float, blink: bool, listen: float) -> np.ndarray:
        cv2, img = self.cv2, self.bg.copy()
        cx, cy = W // 2, int(H * 0.45 + 6 * math.sin(t * 1.4))       # flotte doucement
        R = int(W * 0.33 * (1 + 0.04 * self.mouth + 0.015 * math.sin(t * 2)))
        for x, y, a, ph in self.parts:                                 # poussière lumineuse
            yy = (y - t * 12 * a) % H
            cv2.circle(img, (int(x + 6 * math.sin(t + ph)), int(yy)), 1, (255, 220, 170), -1, cv2.LINE_AA)
        glow = np.zeros_like(img)
        cv2.circle(glow, (cx, cy), R + 18, (255, 190, 120), -1, cv2.LINE_AA)
        img = cv2.add(img, cv2.GaussianBlur(glow, (0, 0), 22) // 2)
        # Sphère : dégradé turquoise → violet, reflet en haut à gauche
        d = np.sqrt((self.xx - cx) ** 2 + (self.yy - cy) ** 2) / R
        m = np.clip((1 - d) * R / 1.5, 0, 1)[..., None]
        g = np.clip((self.yy - (cy - R)) / (2 * R), 0, 1)[..., None]
        col = np.array([250, 225, 120]) * (1 - g) + np.array([240, 120, 170]) * g
        hl = np.clip(1 - np.sqrt((self.xx - (cx - R * 0.35)) ** 2 + (self.yy - (cy - R * 0.4)) ** 2) / (R * 0.55), 0, 1)[..., None]
        col = col + (255 - col) * hl * 0.5
        img = (img * (1 - m) + col * m).astype(np.uint8)
        cv2.circle(img, (cx, cy), R, (255, 245, 220), 2, cv2.LINE_AA)
        # Ondes quand il parle
        for k in range(3):
            if self.mouth < 0.05:
                break
            ph = (t * 1.6 + k / 3) % 1
            a = (1 - ph) * self.mouth
            cv2.circle(img, (cx, cy), int(R + 10 + ph * 55), tuple(int(c * a) for c in (255, 230, 160)), 2, cv2.LINE_AA)
        # Yeux ronds (capsules blanches), clignement = arcs heureux
        ink = (90, 40, 40)
        ex, ey = int(R * 0.36), int(cy - R * 0.12)
        gx, gy = int(self.gaze[0] * R * 0.06), int(self.gaze[1] * R * 0.05)
        for s in (-1, 1):
            x0 = cx + s * ex + gx
            if blink or (self.mouth > 0.6 and math.sin(t * 3) > 0.7):
                cv2.ellipse(img, (x0, ey + gy + 4), (int(R * 0.13), int(R * 0.1)), 0, 200, 340, ink, 5, cv2.LINE_AA)
            else:
                h = int(R * (0.17 + 0.02 * listen))
                cv2.ellipse(img, (x0, ey + gy), (int(R * 0.11), h), 0, 0, 360, (255, 255, 255), -1, cv2.LINE_AA)
                cv2.ellipse(img, (x0 + gx // 2, ey + gy + 3), (int(R * 0.07), int(h * 0.68)), 0, 0, 360, ink, -1, cv2.LINE_AA)
                cv2.circle(img, (x0 + gx // 2 - int(R * 0.025), ey + gy - int(h * 0.25)), int(R * 0.03), (255, 255, 255), -1, cv2.LINE_AA)
        # Joues
        bl = np.zeros_like(img)
        for s in (-1, 1):
            cv2.ellipse(bl, (cx + s * int(R * 0.6), int(cy + R * 0.15)), (int(R * 0.14), int(R * 0.08)), 0, 0, 360, (180, 140, 255), -1, cv2.LINE_AA)
        bl = cv2.GaussianBlur(bl, (0, 0), 6)
        img = cv2.addWeighted(img, 1, bl, 0.6, 0)
        # Sourire : arc au repos, bouche ronde ouverte quand il parle
        my = int(cy + R * 0.28)
        if self.mouth > 0.08:
            hh = int(R * (0.05 + 0.16 * self.mouth))
            cv2.ellipse(img, (cx, my), (int(R * 0.2), hh), 0, 0, 360, (80, 40, 110), -1, cv2.LINE_AA)
            cv2.ellipse(img, (cx, my + hh // 2), (int(R * 0.1), max(2, hh // 3)), 0, 180, 360, (160, 130, 245), -1, cv2.LINE_AA)
            cv2.ellipse(img, (cx, my), (int(R * 0.2), hh), 0, 0, 360, ink, 3, cv2.LINE_AA)
        else:
            cv2.ellipse(img, (cx, my - int(R * 0.06)), (int(R * 0.2), int(R * 0.12)), 0, 20, 160, ink, 5, cv2.LINE_AA)
        # Ombre au sol
        sh = np.zeros_like(img)
        cv2.ellipse(sh, (W // 2, int(H * 0.88)), (int(R * 0.8 - 6 * math.sin(t * 1.4)), 12), 0, 0, 360, (255, 200, 140), -1, cv2.LINE_AA)
        return cv2.add(img, cv2.GaussianBlur(sh, (0, 0), 8) // 3)

    # ── Petit bonhomme dessin animé ────────────────────────────────────────
    def _cartoon(self, t: float, blink: bool, listen: float) -> np.ndarray:
        cv2, img = self.cv2, self.bg.copy()
        bob = 4 * math.sin(t * 1.5) + 3 * self.mouth * math.sin(t * 9)
        tilt = 3 * math.sin(t * 0.6) + 2 * listen
        cx, cy = W // 2, int(H * 0.42 + bob)
        R = int(W * 0.30)
        skin, skin_d, hair, ink, shirt = (150, 190, 240), (120, 160, 215), (45, 40, 40), (50, 40, 40), (190, 120, 40)
        # Corps (t-shirt arrondi)
        cv2.ellipse(img, (W // 2, int(H * 0.98)), (int(W * 0.40), int(H * 0.22)), 0, 180, 360, shirt, -1, cv2.LINE_AA)
        cv2.rectangle(img, (W // 2 - 26, int(cy + R * 0.8)), (W // 2 + 26, int(H * 0.78)), skin_d, -1)
        cv2.ellipse(img, (W // 2, int(H * 0.78)), (30, 14), 0, 0, 180, skin_d, -1, cv2.LINE_AA)
        layer = np.zeros_like(img)
        M = cv2.getRotationMatrix2D((cx, cy), tilt, 1.0)
        # Oreilles + tête ronde
        for s in (-1, 1):
            cv2.ellipse(layer, (cx + s * int(R * 0.95), cy + 10), (int(R * 0.16), int(R * 0.22)), 0, 0, 360, skin_d, -1, cv2.LINE_AA)
        cv2.ellipse(layer, (cx, cy), (R, int(R * 1.08)), 0, 0, 360, skin, -1, cv2.LINE_AA)
        # Barbe courte (ombre douce sur la mâchoire) + cheveux courts
        cv2.ellipse(layer, (cx, cy + int(R * 0.35)), (int(R * 0.92), int(R * 0.7)), 0, 15, 165, skin_d, -1, cv2.LINE_AA)
        cv2.ellipse(layer, (cx, cy + int(R * 0.25)), (int(R * 0.78), int(R * 0.6)), 0, 15, 165, skin, -1, cv2.LINE_AA)
        cv2.ellipse(layer, (cx, cy - int(R * 0.15)), (int(R * 1.02), int(R * 0.98)), 0, 190, 350, hair, -1, cv2.LINE_AA)
        cv2.ellipse(layer, (cx, cy - int(R * 0.05)), (int(R * 0.9), int(R * 0.62)), 0, 200, 340, skin, -1, cv2.LINE_AA)
        cv2.ellipse(layer, (cx + int(R * 0.1), cy - int(R * 0.62)), (int(R * 0.55), int(R * 0.22)), -8, 180, 360, hair, -1, cv2.LINE_AA)
        # Sourcils doux
        for s in (-1, 1):
            cv2.ellipse(layer, (cx + s * int(R * 0.36), cy - int(R * (0.3 + 0.04 * listen))), (int(R * 0.15), int(R * 0.06)), 0, 200, 340, hair, 4, cv2.LINE_AA)
        # Grands yeux brillants
        gx, gy = int(self.gaze[0] * R * 0.04), int(self.gaze[1] * R * 0.03)
        for s in (-1, 1):
            x0, y0 = cx + s * int(R * 0.36), cy - int(R * 0.05)
            if blink:
                cv2.ellipse(layer, (x0, y0), (int(R * 0.13), int(R * 0.08)), 0, 20, 160, ink, 4, cv2.LINE_AA)
                continue
            cv2.ellipse(layer, (x0, y0), (int(R * 0.15), int(R * 0.17)), 0, 0, 360, (255, 255, 255), -1, cv2.LINE_AA)
            cv2.circle(layer, (x0 + gx, y0 + gy + 3), int(R * 0.1), (70, 50, 40), -1, cv2.LINE_AA)
            cv2.circle(layer, (x0 + gx - int(R * 0.035), y0 + gy - int(R * 0.03)), int(R * 0.035), (255, 255, 255), -1, cv2.LINE_AA)
            cv2.circle(layer, (x0 + gx + int(R * 0.04), y0 + gy + int(R * 0.05)), int(R * 0.015), (255, 255, 255), -1, cv2.LINE_AA)
        # Nez + joues
        cv2.ellipse(layer, (cx, cy + int(R * 0.18)), (int(R * 0.08), int(R * 0.06)), 0, 0, 180, skin_d, 3, cv2.LINE_AA)
        for s in (-1, 1):
            cv2.ellipse(layer, (cx + s * int(R * 0.58), cy + int(R * 0.25)), (int(R * 0.12), int(R * 0.07)), 0, 0, 360, (150, 150, 250), -1, cv2.LINE_AA)
        # Bouche : grand sourire, s'ouvre en parlant
        my = cy + int(R * 0.42)
        if self.mouth > 0.08:
            hh = int(R * (0.06 + 0.2 * self.mouth))
            cv2.ellipse(layer, (cx, my), (int(R * 0.26), hh), 0, 0, 180, (60, 40, 110), -1, cv2.LINE_AA)
            cv2.rectangle(layer, (cx - int(R * 0.26), my - 3), (cx + int(R * 0.26), my + 2), (60, 40, 110), -1)
            cv2.rectangle(layer, (cx - int(R * 0.2), my - 2), (cx + int(R * 0.2), my + int(hh * 0.25)), (255, 255, 255), -1)
            cv2.ellipse(layer, (cx, my + int(hh * 0.75)), (int(R * 0.12), max(2, hh // 4)), 0, 180, 360, (140, 120, 240), -1, cv2.LINE_AA)
        else:
            cv2.ellipse(layer, (cx, my - int(R * 0.08)), (int(R * 0.24), int(R * 0.14)), 0, 15, 165, ink, 4, cv2.LINE_AA)
        mask = (layer.sum(2) > 0).astype(np.uint8) * 255
        layer = cv2.warpAffine(layer, M, (W, H))
        mask = cv2.warpAffine(mask, M, (W, H))
        m = (mask.astype(np.float32) / 255)[..., None]
        return (img * (1 - m) + layer * m).astype(np.uint8)

    def i420(self, talk: float, listen: float = 0.0) -> bytes:
        return self.cv2.cvtColor(self.frame(talk, listen), self.cv2.COLOR_BGR2YUV_I420).tobytes()


if __name__ == '__main__':
    import sys
    import cv2
    rows = []
    for style in ('orb', 'cartoon'):
        av = CuteAvatar(style)
        tiles = []
        for talk in (0.0, 0.5, 1.0):
            for _ in range(4):
                av.frame(talk)
            tiles.append(av.frame(talk))
        rows.append(np.hstack(tiles))
        n, t = 30, time.monotonic()
        for i in range(n):
            av.i420((i % 10) / 10)
        print(style, f'{(time.monotonic() - t) / n * 1000:.1f} ms / image')
    cv2.imwrite(sys.argv[1] if len(sys.argv) > 1 else 'cute.png', np.vstack(rows))
