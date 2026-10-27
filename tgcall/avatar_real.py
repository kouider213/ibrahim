"""Visage RÉALISTE de Dzaryx (hologramme bleu, image choisie par Kouider le 27/10 : assets/dzaryx_bust.png).
Animation locale en direct, synchronisée sur sa voix : la mâchoire et la lèvre du bas descendent quand il parle
(déformation cv2.remap + intérieur de bouche), clignements, regard, tête qui respire et hoche, effets d'hologramme.
Points du visage trouvés une fois avec YuNet (models/face_detection_yunet_2023mar.onnx).
Même interface que avatar_cute.CuteAvatar : frame(talk, listen) → BGR 360×480, i420(talk, listen) → bytes.
"""
import math
import random
import time
from pathlib import Path

import numpy as np

W, H, FPS = 360, 480, 15
ROOT = Path(__file__).resolve().parent
BUST = ROOT / 'assets' / 'dzaryx_bust.png'
DETECT = ROOT / 'models' / 'face_detection_yunet_2023mar.onnx'


class RealAvatar:
    def __init__(self) -> None:
        import cv2
        self.cv2 = cv2
        src = cv2.imread(str(BUST))
        if src is None:
            raise FileNotFoundError(BUST)
        self.img = cv2.resize(src, (W, H), interpolation=cv2.INTER_AREA)
        det = cv2.FaceDetectorYN.create(str(DETECT), '', (W, H), 0.6)
        _, faces = det.detect(self.img)
        if faces is None:
            raise RuntimeError('visage introuvable sur l\'image')
        f = faces[0]
        self.eyes = [(float(f[4]), float(f[5])), (float(f[6]), float(f[7]))]
        self.nose = (float(f[8]), float(f[9]))
        mr, ml = (float(f[10]), float(f[11])), (float(f[12]), float(f[13]))
        self.mc = ((mr[0] + ml[0]) / 2, (mr[1] + ml[1]) / 2 + 2)        # milieu de la bouche (ligne des lèvres)
        self.mw = (ml[0] - mr[0]) / 2                                      # demi-largeur de la bouche
        self.eye_w = (self.eyes[1][0] - self.eyes[0][0]) * 0.26
        self.face_h = float(f[3])
        yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
        self.xx, self.yy = xx, yy
        # Zone qui descend avec la mâchoire : sous la ligne des lèvres, centrée sur la bouche, s'éteint vers le cou
        mx, my = self.mc
        wx = np.exp(-((xx - mx) / (self.mw * 2.1)) ** 2)
        chin = my + self.face_h * 0.27
        wy = np.clip((yy - my) / 3, 0, 1) * np.clip(1 - (yy - chin) / (self.face_h * 0.22), 0, 1)
        self.jaw_w = (wx * wy).astype(np.float32)
        # Paupières : couleur de la peau juste au-dessus de chaque œil
        self.lid = []
        for ex, ey in self.eyes:
            y0 = int(ey - self.eye_w * 0.5)
            patch = self.img[max(0, y0 - 3):y0 + 3, int(ex - self.eye_w):int(ex + self.eye_w)]
            self.lid.append(tuple(int(c) for c in patch.reshape(-1, 3).mean(0)) if patch.size else (120, 90, 60))
        # Bords gauche/droite fondus dans le bleu nuit (cache le logo et les panneaux de l'affiche d'origine)
        edge = np.clip(np.minimum(xx, W - 1 - xx) / 55 - 0.15, 0, 1) ** 1.5
        top = np.clip(yy / 30, 0, 1)
        self.fade = (edge * top)[..., None].astype(np.float32)
        self.navy = np.array([30, 14, 6], np.float32)
        sl = np.ones((H, 1, 1), np.float32)
        sl[::3] = 0.86
        self.scan = sl
        self.t0 = time.monotonic()
        self.mouth = 0.0
        self.next_blink, self.blink_t = self.t0 + 2.5, -1.0
        self.nod = 0.0

    def frame(self, talk: float, listen: float = 0.0) -> np.ndarray:
        cv2 = self.cv2
        now = time.monotonic()
        t = now - self.t0
        target = min(1.0, max(0.0, talk)) ** 0.75
        self.mouth += (target - self.mouth) * (0.65 if target > self.mouth else 0.4)
        img = self.img
        mx, my = self.mc
        # 1) Mâchoire : tout ce qui est sous les lèvres descend de d pixels
        d = self.mouth * self.face_h * 0.055
        if d > 0.4:
            img = cv2.remap(img, self.xx, self.yy - d * self.jaw_w, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
            # intérieur de la bouche (sombre) + dents du haut, fondu doux
            mask = np.zeros((H, W), np.uint8)
            cv2.ellipse(mask, (int(mx), int(my + d * 0.45)), (int(self.mw * 0.8), max(1, int(d * 0.55))), 0, 0, 360, 255, -1, cv2.LINE_AA)
            inner = np.zeros_like(img)
            inner[:] = (40, 18, 22)
            cv2.ellipse(inner, (int(mx), int(my + 1)), (int(self.mw * 0.6), max(1, int(d * 0.22))), 0, 0, 180, (205, 200, 190), -1, cv2.LINE_AA)
            m = (cv2.GaussianBlur(mask, (0, 0), 1.2).astype(np.float32) / 255)[..., None]
            img = (img * (1 - m) + inner * m).astype(np.uint8)
        else:
            img = img.copy()
        # 2) Clignement (paupière couleur peau qui descend, ~180 ms)
        if now > self.next_blink:
            self.blink_t, self.next_blink = now, now + random.uniform(2.5, 5.5)
        k = (now - self.blink_t) / 0.18
        if 0 <= k <= 1:
            close = math.sin(k * math.pi)
            for (ex, ey), col in zip(self.eyes, self.lid):
                ew, eh = self.eye_w, self.eye_w * 0.55
                lm = np.zeros((H, W), np.uint8)
                cv2.ellipse(lm, (int(ex), int(ey - eh + eh * 1.1 * close)), (int(ew), int(eh * 1.1 * close) + 1), 0, 180, 360, 255, -1, cv2.LINE_AA)
                cv2.rectangle(lm, (int(ex - ew), int(ey - eh)), (int(ex + ew), int(ey - eh + eh * 1.1 * close)), 255, -1)
                em = np.zeros((H, W), np.uint8)
                cv2.ellipse(em, (int(ex), int(ey)), (int(ew), int(eh)), 0, 0, 360, 255, -1)
                lm = cv2.bitwise_and(lm, em)
                m = (cv2.GaussianBlur(lm, (0, 0), 1.5).astype(np.float32) / 255)[..., None]
                img = (img * (1 - m) + np.array(col, np.float32) * m).astype(np.uint8)
                if close > 0.85:
                    cv2.line(img, (int(ex - ew * 0.9), int(ey + 1)), (int(ex + ew * 0.9), int(ey + 1)), (60, 35, 25), 1, cv2.LINE_AA)
        # 3) Tête : respiration, balancement, petit hochement quand il parle, penche quand il écoute
        self.nod += ((self.mouth * 1.6 * math.sin(t * 6.5)) - self.nod) * 0.25
        ang = 1.2 * math.sin(t * 0.5) + 0.6 * math.sin(t * 1.3) + 1.5 * listen
        dy = 2.5 * math.sin(t * 0.9) + self.nod
        sc = 1 + 0.008 * math.sin(t * 0.9)
        M = cv2.getRotationMatrix2D((W / 2, H * 0.85), ang, sc)
        M[1, 2] += dy
        img = cv2.warpAffine(img, M, (W, H), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
        # 4) Hologramme : halo qui pulse avec la voix, lignes de balayage, bande lumineuse, léger scintillement
        glow = cv2.resize(cv2.GaussianBlur(cv2.resize(img, (W // 4, H // 4)), (0, 0), 2.5), (W, H))
        out = cv2.addWeighted(img, 1.0, glow, 0.18 + 0.22 * self.mouth, 0).astype(np.float32)
        out *= self.scan * (0.95 + 0.05 * math.sin(t * 17) * math.sin(t * 2.3))
        band = int((t * 70) % (H + 80)) - 40
        if 0 <= band < H - 8:
            out[band:band + 8] *= np.array([1.25, 1.18, 1.05], np.float32)
        out = out * self.fade + self.navy * (1 - self.fade)
        return np.clip(out, 0, 255).astype(np.uint8)

    def i420(self, talk: float, listen: float = 0.0) -> bytes:
        return self.cv2.cvtColor(self.frame(talk, listen), self.cv2.COLOR_BGR2YUV_I420).tobytes()


if __name__ == '__main__':
    import sys
    import cv2
    av = RealAvatar()
    tiles = []
    for talk in (0.0, 0.5, 1.0):
        for _ in range(5):
            av.frame(talk)
        tiles.append(av.frame(talk))
    av.blink_t = time.monotonic() - 0.09
    tiles.append(av.frame(0.0))
    cv2.imwrite(sys.argv[1] if len(sys.argv) > 1 else 'real.png', np.hstack(tiles))
    n, t = 30, time.monotonic()
    for i in range(n):
        av.i420((i % 10) / 10)
    print(f'{(time.monotonic() - t) / n * 1000:.1f} ms / image')
