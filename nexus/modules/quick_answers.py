"""
NEXUS Quick Answers — réponses instantanées sans IA (idée reprise de JARVIS / TechEnClair)
Heure, date, calculs simples, batterie, CPU/RAM : réponse immédiate, sans coût d'API,
et ça marche même si internet est coupé.

Les motifs sont volontairement stricts (phrase entière) : « à quelle heure arrive Ahmed ? »
ne doit PAS répondre l'heure, ça part vers Dzaryx comme avant.
"""
import ast
import logging
import operator
import re
from datetime import datetime

log = logging.getLogger('nexus.quick_answers')

_JOURS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche']
_MOIS  = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août',
          'septembre', 'octobre', 'novembre', 'décembre']

# Politesses / préfixes retirés avant de comparer
_FILLER_RE = re.compile(
    r"^(?:nexus|dzaryx|hey|eh|dis|dis[\s-]moi|stp|s'il\s+te\s+pla[iî]t|tu\s+peux\s+me\s+dire)\b[\s,]*", re.I)
_FILLER_END_RE = re.compile(r"[\s,]*(?:nexus|stp|s'il\s+te\s+pla[iî]t|fr[eè]re|mon\s+fr[eè]re)$", re.I)

_TIME_RE = re.compile(
    r"^(?:il\s+est\s+quelle\s+heure|quelle\s+heure(?:\s+est[\s-]il|\s+il\s+est)?|"
    r"(?:t'?as|tu\s+as|donne[\s-]moi|c'est\s+quoi)\s+l'heure|l'heure)$", re.I)
_DATE_RE = re.compile(
    r"^(?:on\s+est\s+quel\s+jour|quel\s+jour\s+(?:on\s+est|sommes[\s-]nous|est[\s-]on|on\s+est\s+aujourd'hui)|"
    r"(?:quelle\s+est\s+la|c'est\s+quoi\s+la|donne[\s-]moi\s+la)\s+date(?:\s+d'aujourd'hui)?|"
    r"quelle\s+date(?:\s+on\s+est|\s+aujourd'hui)?|on\s+est\s+le\s+combien|la\s+date)$", re.I)
_BATTERY_RE = re.compile(
    r"^(?:(?:il\s+(?:me\s+)?reste\s+)?combien\s+(?:de|d')\s*batterie|(?:niveau|[eé]tat)\s+(?:de\s+la\s+)?batterie|"
    r"(?:la\s+)?batterie(?:\s+(?:du\s+pc|[aà]\s+combien|elle\s+est\s+[aà]\s+combien))?)$", re.I)
_SYS_RE = re.compile(
    r"^(?:(?:[eé]tat|utilisation|niveau|charge|conso(?:mmation)?)\s+(?:du\s+|de\s+la\s+)?(?:cpu|processeur|ram|m[eé]moire)"
    r"(?:\s+(?:et\s+(?:du\s+|de\s+la\s+)?)?(?:cpu|processeur|ram|m[eé]moire))?|"
    r"(?:le\s+|la\s+)?(?:cpu|processeur|ram)(?:\s+et\s+(?:le\s+|la\s+)?(?:cpu|processeur|ram))?(?:\s+(?:[aà]\s+combien|est\s+[aà]\s+combien))?|"
    r"comment\s+va\s+le\s+pc)$", re.I)

# Calculs : « combien font 12 fois 8 », « calcule 1500 divisé par 3 », « 15 pourcent de 4000 »
_CALC_PREFIX_RE = re.compile(r"^(?:combien\s+(?:font|fait|ça\s+fait)|calcule|c'est\s+combien|ça\s+fait\s+combien)\s+", re.I)
_PERCENT_RE = re.compile(r"^([\d.,]+)\s*(?:%|pour\s*cent|pourcents?)\s+de\s+([\d.,]+)$", re.I)
_SQRT_RE    = re.compile(r"^racine\s+(?:carr[eé]e\s+)?de\s+([\d.,]+)$", re.I)
_WORD_OPS = [
    (r'multipli[eé]s?\s+par', '*'), (r'divis[eé]s?\s+par', '/'), (r'\bau\s+carr[eé]\b', '**2'),
    (r'\bfois\b', '*'), (r'\bplus\b', '+'), (r'\bmoins\b', '-'), (r'\bsur\b', '/'), (r'(?<=\d)\s*x\s*(?=\d)', '*'),
    (r'(?<=\d)\s*[×]\s*(?=\d)', '*'), (r'÷', '/'),
]
_OPS = {ast.Add: operator.add, ast.Sub: operator.sub, ast.Mult: operator.mul,
        ast.Div: operator.truediv, ast.Pow: operator.pow, ast.USub: operator.neg, ast.UAdd: operator.pos}


def _normalize(text: str) -> str:
    t = text.strip().lower().replace('’', "'")
    t = re.sub(r'[?!.]+$', '', t).strip()
    for _ in range(2):
        t = _FILLER_RE.sub('', t).strip()
        t = _FILLER_END_RE.sub('', t).strip()
    return re.sub(r'\s+', ' ', t)


def _num(s: str) -> float:
    return float(s.replace(',', '.'))


def _fmt(x: float) -> str:
    if abs(x - round(x)) < 1e-9:
        return f'{int(round(x)):,}'.replace(',', ' ')
    return f'{x:,.4f}'.rstrip('0').rstrip('.').replace(',', ' ').replace('.', ',')


def _safe_eval(expr: str) -> float:
    def ev(node):
        if isinstance(node, ast.Expression):
            return ev(node.body)
        if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)):
            return node.value
        if isinstance(node, ast.BinOp) and type(node.op) in _OPS:
            left, right = ev(node.left), ev(node.right)
            if isinstance(node.op, ast.Pow) and abs(right) > 10:
                raise ValueError('puissance trop grande')
            return _OPS[type(node.op)](left, right)
        if isinstance(node, ast.UnaryOp) and type(node.op) in _OPS:
            return _OPS[type(node.op)](ev(node.operand))
        raise ValueError('expression non autorisée')
    return ev(ast.parse(expr, mode='eval'))


def _calc(t: str) -> str | None:
    m = _CALC_PREFIX_RE.match(t)
    if not m:
        return None
    expr = t[m.end():].strip()
    p = _PERCENT_RE.match(expr)
    if p:
        return f'{p.group(1)} pourcent de {p.group(2)}, ça fait {_fmt(_num(p.group(1)) * _num(p.group(2)) / 100)}.'
    s = _SQRT_RE.match(expr)
    if s:
        return f'La racine carrée de {s.group(1)}, c\'est {_fmt(_num(s.group(1)) ** 0.5)}.'
    e = re.sub(r'(?<=\d) (?=\d{3}\b)', '', expr)          # « 1 500 » (dictée) → 1500
    e = re.sub(r'(?<=\d),(?=\d)', '.', e)                  # virgule décimale
    for pat, op in _WORD_OPS:
        e = re.sub(pat, f' {op} ', e, flags=re.I)
    e = e.replace('égal', '').replace('=', '').strip()
    if not re.fullmatch(r'[\d.\s+\-*/()]+', e) or not re.search(r'\d\s*[+\-*/]', e):
        return None
    try:
        result = _safe_eval(e)
    except ZeroDivisionError:
        return 'Division par zéro, ça marche pas frère.'
    except (ValueError, SyntaxError):
        return None
    return f'Ça fait {_fmt(result)}.'


def _battery() -> str:
    import psutil
    b = psutil.sensors_battery()
    if b is None:
        return "Ce PC n'a pas de batterie, il est branché sur secteur."
    state = 'en charge' if b.power_plugged else 'sur batterie'
    left = ''
    if not b.power_plugged and b.secsleft not in (psutil.POWER_TIME_UNLIMITED, psutil.POWER_TIME_UNKNOWN) and b.secsleft > 0:
        h, m = divmod(b.secsleft // 60, 60)
        left = f', environ {h}h{m:02d} restantes'
    return f'Batterie à {round(b.percent)} pourcent, {state}{left}.'


def _sysinfo() -> str:
    import psutil
    cpu = psutil.cpu_percent(interval=0.5)
    ram = psutil.virtual_memory()
    return (f'Processeur à {round(cpu)} pourcent. Mémoire vive : {round(ram.percent)} pourcent utilisée, '
            f'{round(ram.available / 1e9, 1)} giga libres.')


def try_answer(text: str) -> str | None:
    """Réponse instantanée, ou None si la phrase doit partir vers le routeur normal / l'IA."""
    t = _normalize(text)
    if not t or len(t) > 80:
        return None
    now = datetime.now()
    if _TIME_RE.match(t):
        return f'Il est {now.hour}h{now.minute:02d}.'
    if _DATE_RE.match(t):
        return f'On est {_JOURS[now.weekday()]} {now.day} {_MOIS[now.month - 1]} {now.year}.'
    try:
        if _BATTERY_RE.match(t):
            return _battery()
        if _SYS_RE.match(t):
            return _sysinfo()
    except Exception as e:  # psutil absent ou capteur illisible → on laisse le routeur normal répondre
        log.warning('Quick answer système: %s', e)
        return None
    return _calc(t)
