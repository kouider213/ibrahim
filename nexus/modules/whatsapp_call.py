"""
NEXUS WhatsApp Call — « appelle Houari sur WhatsApp », « appel vidéo WhatsApp avec Ahmed »
(idée reprise de JARVIS / TechEnClair, réécrite pour Windows + WhatsApp Desktop)

Ouvre WhatsApp Desktop → cherche le contact → VÉRIFIE par la vision que c'est bien
la bonne conversation (sinon on n'appelle personne) → raccourci d'appel
(Ctrl+Maj+C vocal, Ctrl+Maj+V vidéo) → clic vision en secours si le raccourci n'a rien fait.
"""
import logging
import os
import re
import sys
import time

from modules import vision_click

log = logging.getLogger('nexus.whatsapp_call')

# « whatsapp » obligatoire : « appelle-moi » reste à Dzaryx (call_me sur le téléphone)
CALL_RE = re.compile(
    r"\b(?:appelle[rz]?|appel(?:\s+(?:vocal|vid[eé]o))?(?:\s+whatsapp)?\s+(?:[aà]|avec)|t[eé]l[eé]phone\s+[aà]|"
    r"lance\s+(?:un\s+)?appel(?:\s+(?:vocal|vid[eé]o))?(?:\s+whatsapp)?\s+(?:[aà]|avec))\s+(.+?)"
    r"(?:\s+(?:sur|via|par|avec|en)\s+whatsapp(?:\s+(?:en\s+)?vid[eé]o)?)?$",
    re.I,
)
_VIDEO_RE = re.compile(r'\bvid[eé]o\b', re.I)


def wants_call(text: str) -> bool:
    return bool(re.search(r'\bwhats\s?app\b', text, re.I) and CALL_RE.search(text))


def _contact_from(text: str) -> str | None:
    t = re.sub(r'\bwhats\s?app\b', 'whatsapp', text.strip().rstrip(' .!?'), flags=re.I)
    t = re.sub(r'^(?:nexus|dzaryx)[\s,]+', '', t, flags=re.I)
    m = CALL_RE.search(t)
    if not m:
        return None
    name = re.sub(r'\s+(?:sur|via|par|avec|en)\s+whatsapp.*$', '', m.group(1), flags=re.I)
    name = re.sub(r'\b(?:whatsapp|en\s+vid[eé]o|vid[eé]o|vocal|stp|s\'il\s+te\s+pla[iî]t)\b', '', name, flags=re.I)
    name = name.strip(' ,.')
    return name or None


def _focus_whatsapp(timeout: float = 12) -> bool:
    import pyautogui
    end = time.time() + timeout
    while time.time() < end:
        wins = [w for w in pyautogui.getWindowsWithTitle('WhatsApp') if w.title.strip()]
        if wins:
            w = wins[0]
            try:
                if w.isMinimized:
                    w.restore()
                w.activate()
            except Exception:
                pass  # activate() lève parfois une erreur alors que la fenêtre passe bien devant
            time.sleep(1.0)
            return True
        time.sleep(0.5)
    return False


def call(text: str) -> str:
    if sys.platform != 'win32':
        return "L'appel WhatsApp ne marche que sur le PC Windows."
    contact = _contact_from(text)
    if not contact:
        return "Dis-moi qui appeler, par exemple : « appelle Houari sur WhatsApp »."
    video = bool(_VIDEO_RE.search(text))

    import pyautogui
    try:
        import pyperclip
    except ImportError:
        pyperclip = None

    os.startfile('whatsapp:')  # protocole enregistré par WhatsApp Desktop (Microsoft Store)
    if not _focus_whatsapp():
        return "❌ WhatsApp Desktop ne s'ouvre pas. Il est bien installé sur le PC ?"

    # Recherche du contact (Ctrl+F), on vide l'ancienne recherche, on colle le nom (accents OK)
    pyautogui.hotkey('ctrl', 'f')
    time.sleep(0.8)
    pyautogui.hotkey('ctrl', 'a')
    if pyperclip:
        pyperclip.copy(contact)
        pyautogui.hotkey('ctrl', 'v')
    else:
        pyautogui.typewrite(contact, interval=0.03)
    time.sleep(2.0)
    pyautogui.press('enter')
    time.sleep(2.5)

    if not os.environ.get('ANTHROPIC_API_KEY'):
        # Sans la vision on ne peut pas vérifier le contact → on n'appelle pas à l'aveugle
        return f"J'ai ouvert la conversation avec {contact} sur WhatsApp. Vérifie que c'est la bonne et lance l'appel."

    # Sécurité : ne jamais appeler quelqu'un d'autre que le contact demandé
    try:
        header = vision_click.locate(
            f"le nom du contact « {contact} » affiché dans l'EN-TÊTE de la conversation ouverte "
            f"(en haut de la zone de discussion, pas dans la liste de gauche ni dans la recherche)")
    except Exception as e:
        log.error('Vérification contact: %s', e)
        header = None
    if not header:
        pyautogui.press('esc')
        return f"Je n'ai pas trouvé {contact} dans WhatsApp, je n'ai appelé personne. Essaie avec le nom exact du contact."

    pyautogui.hotkey('ctrl', 'shift', 'v' if video else 'c')
    time.sleep(3.0)

    # Secours si le raccourci n'a rien lancé : le bouton d'appel est encore visible dans l'en-tête
    kind = 'vidéo (icône caméra)' if video else 'vocal (icône téléphone)'
    try:
        btn = vision_click.locate(
            f"le bouton pour DÉMARRER un appel {kind} dans l'en-tête de la conversation WhatsApp avec {contact}. "
            f"Si un appel est déjà en cours (fenêtre d'appel, bouton raccrocher rouge, « Appel en cours », "
            f"« Sonnerie »), réponds found=false. Ne choisis JAMAIS un bouton pour raccrocher.")
    except Exception as e:
        log.error('Vérification appel: %s', e)
        btn = None
    if btn:
        x, y, _ = btn
        pyautogui.click(x, y)
        log.info('Appel WhatsApp lancé par clic vision (%d, %d)', x, y)

    return f"📞 J'appelle {contact} sur WhatsApp{' en vidéo' if video else ''}."
