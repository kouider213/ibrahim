"""
NEXUS Vision Click — « clique sur le bouton Envoyer », « écris bonjour dans la recherche »
Capture d'écran → Claude localise l'élément → clic pyautogui aux coordonnées réelles.
"""
import base64
import io
import logging
import os
import re
import time

log = logging.getLogger('nexus.vision_click')

MODEL     = os.environ.get('NEXUS_VISION_CLICK_MODEL', 'claude-opus-5-5')
MAX_WIDTH = 1280  # image envoyée à Claude ; les coordonnées sont remises à l'échelle

# « clique sur le bouton Envoyer » — mais pas « clique sur 100 200 » (géré par input_control)
CLICK_RE = re.compile(r'\b(?:clique[rz]?|click)\s+(?:sur\s+)?(.{2,})$', re.I)
_COORDS_RE = re.compile(r'^\d+[,\s]+\d+$')
TYPE_IN_RE = re.compile(
    r'\b(?:[eé]cris|tape|saisis)\s+[«"\']?(.+?)[»"\']?\s+dans\s+(?:la\s+|le\s+|l[\'’]\s*)?(.{3,})$', re.I)

_SCHEMA = {
    'type': 'object',
    'properties': {
        'found': {'type': 'boolean'},
        'x':     {'type': 'integer'},
        'y':     {'type': 'integer'},
        'label': {'type': 'string'},
    },
    'required': ['found', 'x', 'y', 'label'],
    'additionalProperties': False,
}


def _screenshot_b64():
    """Retourne (b64_png, largeur_image, hauteur_image, facteur_x, facteur_y)."""
    import pyautogui
    shot = pyautogui.screenshot()
    screen_w, screen_h = pyautogui.size()           # espace de coordonnées du clic
    img = shot
    if img.width > MAX_WIDTH:
        ratio = MAX_WIDTH / img.width
        img = img.resize((MAX_WIDTH, round(img.height * ratio)))
    buf = io.BytesIO()
    img.save(buf, format='PNG')
    return (base64.standard_b64encode(buf.getvalue()).decode(),
            img.width, img.height, screen_w / img.width, screen_h / img.height)


def locate(target: str) -> tuple[int, int, str] | None:
    """Demande à Claude où se trouve `target` à l'écran. Coordonnées écran réelles ou None."""
    import anthropic
    b64, w, h, fx, fy = _screenshot_b64()
    client = anthropic.Anthropic()
    resp = client.messages.create(
        model=MODEL,
        max_tokens=1024,
        messages=[{
            'role': 'user',
            'content': [
                {'type': 'image', 'source': {'type': 'base64', 'media_type': 'image/png', 'data': b64}},
                {'type': 'text', 'text': (
                    f"Capture d'écran Windows de {w}x{h} pixels. Trouve l'élément cliquable qui correspond à : "
                    f"« {target} ». Donne le centre de l'élément en pixels de cette image (x vers la droite, "
                    f"y vers le bas) et un court libellé de ce que tu as trouvé. "
                    f"Si rien ne correspond clairement, found=false et x=y=0.")},
            ],
        }],
        # Paramètres récents passés en extra_body pour rester compatible avec les anciens SDK installés
        extra_headers={'anthropic-beta': 'server-side-fallback-2026-07-01'},
        extra_body={
            'output_config': {'effort': 'low', 'format': {'type': 'json_schema', 'schema': _SCHEMA}},
            'fallbacks': 'default',
        },
    )
    if resp.stop_reason == 'refusal':
        log.warning('Vision click refusé par le modèle')
        return None
    import json
    text = next((b.text for b in resp.content if b.type == 'text'), '')
    data = json.loads(text)
    if not data.get('found'):
        return None
    x, y = int(data['x']), int(data['y'])
    if not (0 <= x <= w and 0 <= y <= h):
        return None
    return round(x * fx), round(y * fy), data.get('label', target)


def click_on(target: str) -> str:
    if not os.environ.get('ANTHROPIC_API_KEY'):
        return "❌ ANTHROPIC_API_KEY manquante — impossible d'analyser l'écran."
    try:
        found = locate(target)
    except Exception as e:
        log.error('Vision click: %s', e)
        return f'❌ Analyse écran échouée : {e}'
    if not found:
        return f"Je ne vois pas « {target} » à l'écran."
    import pyautogui
    x, y, label = found
    pyautogui.moveTo(x, y, duration=0.25)
    pyautogui.click()
    log.info('Vision click « %s » → (%d, %d) %s', target, x, y, label)
    return f'✅ Cliqué sur {label}.'


def type_into(text: str, target: str) -> str:
    result = click_on(target)
    if not result.startswith('✅'):
        return result
    import pyautogui
    time.sleep(0.3)
    try:
        import pyperclip  # gère accents et caractères spéciaux, contrairement à typewrite
        pyperclip.copy(text)
        pyautogui.hotkey('ctrl', 'v')
    except ImportError:
        pyautogui.typewrite(text, interval=0.02)
    return f'{result} Texte saisi : {text}'


def try_handle(text: str) -> str | None:
    t = text.strip()
    m = TYPE_IN_RE.search(t)
    if m:
        return type_into(m.group(1).strip(), m.group(2).strip(' .'))
    m = CLICK_RE.search(t)
    if m and not _COORDS_RE.match(m.group(1).strip()):
        return click_on(m.group(1).strip(' .'))
    return None
