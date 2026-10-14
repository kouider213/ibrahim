"""
NEXUS UI Automation — cliquer sur les VRAIS boutons de la fenêtre au lieu de deviner sur une capture.

Windows décrit chaque fenêtre (boutons, liens, champs, menus, onglets…) via l'API d'accessibilité UI Automation,
celle des lecteurs d'écran ; c'est aussi ce qu'utilisent Windows-MCP et Copilot. « Clique sur Envoyer » :
Nexus lit la fenêtre au premier plan, trouve le contrôle dont le nom correspond le mieux et l'active
directement (Invoke), sans dépendre de la position à l'écran. Plus rapide (pas d'appel à Claude) et plus fiable.
Si rien ne correspond assez (ex. un jeu, une image), Nexus repasse au clic par vision (vision_click.py).

Windows seulement (pip uiautomation). Ailleurs : try_handle renvoie None et rien ne change.
"""
import difflib
import logging
import re
import sys
import time
import unicodedata

from modules.vision_click import CLICK_RE, TYPE_IN_RE, _COORDS_RE

log = logging.getLogger('nexus.ui_automation')

MIN_SCORE = 62          # en dessous : pas assez sûr → clic par vision
MAX_NODES = 2500        # fenêtres énormes (navigateur) : on s'arrête là
MAX_SECONDS = 3.0

CLICKABLE = {'ButtonControl', 'HyperlinkControl', 'MenuItemControl', 'TabItemControl', 'ListItemControl',
             'CheckBoxControl', 'RadioButtonControl', 'TreeItemControl', 'SplitButtonControl', 'DataItemControl',
             'ComboBoxControl', 'TextControl', 'ImageControl'}
EDITABLE = {'EditControl', 'ComboBoxControl', 'DocumentControl'}
# Les contrôles vraiment cliquables passent avant un simple texte portant le même nom
TYPE_BONUS = {'ButtonControl': 8, 'HyperlinkControl': 6, 'MenuItemControl': 6, 'TabItemControl': 6,
              'SplitButtonControl': 6, 'CheckBoxControl': 4, 'RadioButtonControl': 4, 'ListItemControl': 3}
_FILLER = re.compile(r"^(?:(?:le|la|les|un|une|du|de la|bouton|lien|onglet|menu|case|icône|icone)\s+|l['’]\s*)", re.I)


def available() -> bool:
    if sys.platform != 'win32':
        return False
    try:
        import uiautomation  # noqa: F401
        return True
    except Exception:
        return False


def _norm(s: str) -> str:
    s = unicodedata.normalize('NFD', s.lower()).encode('ascii', 'ignore').decode()
    return re.sub(r'[^a-z0-9]+', ' ', s).strip()


def _clean_target(t: str) -> str:
    t = t.strip(' .«»"\'')
    for _ in range(3):
        t = _FILLER.sub('', t)
    return t.strip()


def score(name: str, target: str) -> int:
    """Ressemblance 0-100 entre le nom d'un contrôle et ce que Kouider a dit."""
    n, t = _norm(name), _norm(target)
    if not n or not t:
        return 0
    if n == t:
        return 100
    if n.startswith(t) or (t.startswith(n) and len(n) >= 3):
        return 85
    words_t, words_n = set(t.split()), set(n.split())
    if words_t and words_t <= words_n:
        return 78
    if t in n:
        return 70
    overlap = len(words_t & words_n) / max(1, len(words_t))
    ratio = difflib.SequenceMatcher(None, n, t).ratio()
    return int(max(overlap * 65, ratio * 75))


def _walk(kinds: set[str]):
    """Contrôles visibles et actifs de la fenêtre au premier plan : (contrôle, nom, type)."""
    import uiautomation as auto
    fg = auto.GetForegroundControl()
    if not fg:
        return
    root = fg.GetTopLevelControl() or fg
    t0, n = time.monotonic(), 0
    for ctrl, _depth in auto.WalkControl(root, includeTop=False, maxDepth=40):
        n += 1
        if n > MAX_NODES or time.monotonic() - t0 > MAX_SECONDS:
            break
        kind = ctrl.ControlTypeName
        if kind not in kinds:
            continue
        try:
            if ctrl.IsOffscreen or not ctrl.IsEnabled:
                continue
            name = (ctrl.Name or '').strip()
        except Exception:
            continue
        if name:
            yield ctrl, name, kind


def _best(target: str, kinds: set[str]):
    best = None
    for ctrl, name, kind in _walk(kinds):
        base = score(name, target)
        s = base + (TYPE_BONUS.get(kind, 0) if base >= 60 else 0)
        if not best or s > best[0]:
            best = (s, ctrl, name, kind)
            if s >= 108:
                break
    return best


def click_on(target: str) -> str | None:
    target = _clean_target(target)
    if not target or not available():
        return None
    try:
        best = _best(target, CLICKABLE)
    except Exception as e:
        log.warning('lecture fenêtre: %s', e)
        return None
    if not best or best[0] < MIN_SCORE:
        log.info('UIA : rien d\'assez proche de %r (meilleur %s) → vision', target, best and (best[0], best[2]))
        return None
    s, ctrl, name, kind = best
    try:
        pat = ctrl.GetInvokePattern() if hasattr(ctrl, 'GetInvokePattern') else None
        if pat:
            pat.Invoke()
        else:
            ctrl.Click(simulateMove=False)
    except Exception:
        try:
            ctrl.Click(simulateMove=False)
        except Exception as e:
            log.warning('clic UIA %r: %s', name, e)
            return None
    log.info('UIA clic %r (%s, score %d)', name, kind, s)
    return f'✅ Cliqué sur « {name} »'


def type_into(text: str, field: str) -> str | None:
    field = _clean_target(field)
    if not field or not available():
        return None
    try:
        best = _best(field, EDITABLE)
    except Exception as e:
        log.warning('lecture fenêtre: %s', e)
        return None
    if not best or best[0] < MIN_SCORE:
        return None
    _s, ctrl, name, _kind = best
    try:
        ctrl.SetFocus()
        vp = ctrl.GetValuePattern() if hasattr(ctrl, 'GetValuePattern') else None
        if vp and not vp.IsReadOnly:
            vp.SetValue(text)
        else:
            ctrl.Click(simulateMove=False)
            import uiautomation as auto
            auto.SendKeys(text.replace('{', '{{').replace('}', '}}'), waitTime=0.01)
    except Exception as e:
        log.warning('saisie UIA %r: %s', name, e)
        return None
    return f'✅ Écrit « {text} » dans « {name} »'


def describe_window(limit: int = 40) -> str:
    """Liste lisible des boutons / champs de la fenêtre active (« qu'est-ce que je peux cliquer ? »)."""
    if not available():
        return ''
    seen, lines = set(), []
    try:
        for _ctrl, name, kind in _walk(CLICKABLE | EDITABLE):
            key = (name, kind)
            if key in seen or kind in ('TextControl', 'ImageControl'):
                continue
            seen.add(key)
            lines.append(f"• {name} ({kind.replace('Control', '').lower()})")
            if len(lines) >= limit:
                break
    except Exception as e:
        log.warning('lecture fenêtre: %s', e)
    return '\n'.join(lines)


def try_handle(text: str) -> str | None:
    """Même phrases que vision_click : « clique sur X », « écris X dans Y ». None = pas géré ici."""
    t = text.strip()
    m = TYPE_IN_RE.search(t)
    if m:
        return type_into(m.group(1).strip(), m.group(2).strip(' .'))
    m = CLICK_RE.search(t)
    if m and not _COORDS_RE.match(m.group(1).strip()):
        return click_on(m.group(1))
    return None
