"""Reconnaissance du visage (qui est sur la photo / à la caméra ?) — empreintes locales, rien ne sort du VPS.

- OpenCV : YuNet trouve le visage (models/face_detection_yunet_2023mar.onnx), SFace en fait un vecteur de 128 nombres
  (models/face_recognition_sface_2021dec.onnx).
- faceprints/<nom>.npy = moyenne des vecteurs de la personne (+ .json : nombre d'échantillons), comme speaker.py.
- Kouider : appris avec un selfie (« retiens mon visage » + photo sur Telegram), puis à chaque photo de lui reconnue.
"""
import json
import logging
import threading
from pathlib import Path

import numpy as np

log = logging.getLogger('dzaryx-tg')

ROOT = Path(__file__).resolve().parent
DETECT = ROOT / 'models' / 'face_detection_yunet_2023mar.onnx'
RECOG = ROOT / 'models' / 'face_recognition_sface_2021dec.onnx'
PRINTS = ROOT / 'faceprints'
OWNER = 'kouider'
MATCH = 0.40          # même personne au-dessus (cosinus SFace, seuil OpenCV 0.363)
LEARN = 0.50          # assez sûr pour enrichir l'empreinte tout seul
MAX_SAMPLES = 30

_lock = threading.Lock()
_models = None


def _get():
    global _models
    if _models is None:
        import cv2
        _models = (cv2.FaceDetectorYN.create(str(DETECT), '', (320, 320), 0.8),
                   cv2.FaceRecognizerSF.create(str(RECOG), ''))
    return _models


def available() -> bool:
    return DETECT.exists() and RECOG.exists()


def embed(jpg: bytes) -> list[np.ndarray]:
    """Image (JPEG/PNG) → une empreinte normalisée par visage, le plus grand d'abord ([] = aucun visage)."""
    import cv2
    img = cv2.imdecode(np.frombuffer(jpg, np.uint8), cv2.IMREAD_COLOR)
    if img is None:
        return []
    h, w = img.shape[:2]
    if max(h, w) > 1280:                   # selfie 12 Mpx → plus rapide, visage toujours net
        k = 1280 / max(h, w)
        img = cv2.resize(img, (int(w * k), int(h * k)))
        h, w = img.shape[:2]
    out = []
    with _lock:
        det, rec = _get()
        det.setInputSize((w, h))
        _, faces = det.detect(img)
        if faces is None:
            return []
        for f in sorted(faces, key=lambda f: -f[2] * f[3])[:5]:
            if f[2] < 40 or f[3] < 40:      # trop petit pour être fiable
                continue
            v = rec.feature(rec.alignCrop(img, f)).flatten().astype(np.float32)
            n = float(np.linalg.norm(v))
            if n:
                out.append(v / n)
    return out


def _load(name: str) -> tuple[np.ndarray | None, int]:
    f = PRINTS / f'{name}.npy'
    if not f.exists():
        return None, 0
    meta = PRINTS / f'{name}.json'
    n = json.loads(meta.read_text()).get('n', 1) if meta.exists() else 1
    return np.load(f), n


def people() -> dict[str, np.ndarray]:
    if not PRINTS.exists():
        return {}
    return {f.stem: np.load(f) for f in PRINTS.glob('*.npy')}


def known(name: str = OWNER) -> int:
    return _load(name)[1]


def enroll(name: str, vec: np.ndarray) -> int:
    name = name.strip().lower()
    PRINTS.mkdir(exist_ok=True)
    cur, n = _load(name)
    w = min(n, MAX_SAMPLES)
    new = vec if cur is None else (cur * w + vec) / (w + 1)
    new = new / (np.linalg.norm(new) or 1)
    np.save(PRINTS / f'{name}.npy', new)
    (PRINTS / f'{name}.json').write_text(json.dumps({'n': n + 1}))
    log.info('visage de %s appris (%d échantillons)', name, n + 1)
    return n + 1


def identify(vec: np.ndarray) -> tuple[str, float]:
    """→ (personne reconnue ou '' , score)."""
    best, best_s = '', -1.0
    for name, ref in people().items():
        s = float(np.dot(vec, ref))
        if s > best_s:
            best, best_s = name, s
    return (best if best_s >= MATCH else ''), best_s


def who_is_there(jpg: bytes, learn: bool = False) -> list[tuple[str, float]]:
    """Tous les visages de l'image → [(prénom ou 'inconnu', score)]. learn=True : un visage de Kouider très sûr
    enrichit son empreinte (lumière, lunettes, barbe qui changent)."""
    res = []
    for v in embed(jpg):
        who, s = identify(v)
        if learn and who == OWNER and s >= LEARN:
            enroll(OWNER, v)
        res.append((who or 'inconnu', s))
    return res


def hint(jpg: bytes, learn: bool = False) -> str:
    """Phrase pour Dzaryx (« [VISAGE : …] ») ou '' s'il n'y a aucun visage / rien d'appris."""
    if not available() or not people():
        return ''
    try:
        found = who_is_there(jpg, learn)
    except Exception as e:
        log.warning('visage: %s', e)
        return ''
    if not found:
        return ''
    names = ['Kouider (c\'est bien lui, reconnu à son visage)' if w == OWNER else
             (w.capitalize() if w != 'inconnu' else 'une personne que tu ne connais pas') for w, _ in found]
    log.info('visages : %s', ', '.join(f'{w} {s:.2f}' for w, s in found))
    return f"[VISAGE : sur l'image il y a {', '.join(names)}.]"
