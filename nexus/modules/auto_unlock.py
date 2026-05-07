"""
NEXUS Auto-Unlock
Déverrouille le PC Windows après veille — tape le mot de passe stocké localement.
Le mot de passe est chiffré avec Fernet (clé dérivée de l'ID machine).
JAMAIS envoyé sur internet.
"""
import base64
import logging
import os
import platform
import subprocess
import time
from pathlib import Path

log = logging.getLogger('nexus.unlock')

_KEY_FILE  = Path(__file__).parent.parent / '.unlock_key'
_PASS_FILE = Path(__file__).parent.parent / '.unlock_enc'


def _get_machine_key() -> bytes:
    """Dérive une clé de chiffrement unique à ce PC."""
    import hashlib
    machine_id = platform.node() + str(os.getenv('COMPUTERNAME', ''))
    raw = hashlib.sha256(machine_id.encode()).digest()
    return base64.urlsafe_b64encode(raw)


def _get_fernet():
    from cryptography.fernet import Fernet
    key = _get_machine_key()
    return Fernet(key)


def save_password(password: str) -> None:
    """Chiffre et sauvegarde le mot de passe Windows localement."""
    f = _get_fernet()
    encrypted = f.encrypt(password.encode())
    _PASS_FILE.write_bytes(encrypted)
    log.info('Password saved encrypted at %s', _PASS_FILE)


def load_password() -> str | None:
    """Déchiffre et retourne le mot de passe sauvegardé."""
    if not _PASS_FILE.exists():
        return None
    try:
        f = _get_fernet()
        return f.decrypt(_PASS_FILE.read_bytes()).decode()
    except Exception as e:
        log.error('Password decrypt error: %s', e)
        return None


def is_configured() -> bool:
    return _PASS_FILE.exists()


def unlock_pc() -> str:
    """Déverrouille le PC en tapant le mot de passe via pyautogui."""
    try:
        import pyautogui
    except ImportError:
        return 'pyautogui non installé — pip install pyautogui'

    password = load_password()
    if not password:
        return (
            'Mot de passe non configuré. '
            'Dis "nexus enregistre mon mot de passe" suivi du mot de passe.'
        )

    pyautogui.FAILSAFE = False
    try:
        # Réveille l'écran
        pyautogui.press('escape')
        time.sleep(0.5)
        pyautogui.press('space')
        time.sleep(1)
        # Click au centre pour focus le champ password
        w, h = pyautogui.size()
        pyautogui.click(w // 2, h // 2)
        time.sleep(0.5)
        # Type le mot de passe
        pyautogui.typewrite(password, interval=0.05)
        time.sleep(0.2)
        pyautogui.press('enter')
        log.info('PC unlock sequence sent')
        return '✅ PC déverrouillé'
    except Exception as e:
        log.error('Unlock error: %s', e)
        return f'Erreur déverrouillage: {e}'


def wake_and_unlock() -> str:
    """Réveille le PC de veille puis déverrouille."""
    try:
        # Simulation touche pour réveiller de la veille
        import pyautogui
        pyautogui.FAILSAFE = False
        pyautogui.press('shift')  # Gentle wake
        time.sleep(2)
        return unlock_pc()
    except ImportError:
        return 'pyautogui non installé'
