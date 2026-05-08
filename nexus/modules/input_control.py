"""
NEXUS Input Control — Phase 4
Contrôle souris + clavier via ctypes Windows API (aucune dépendance externe).
"""
import ctypes
import ctypes.wintypes
import logging
import re
import time

log = logging.getLogger('nexus.input')

INPUT_MOUSE        = 0
INPUT_KEYBOARD     = 1
KEYEVENTF_KEYUP    = 0x0002
KEYEVENTF_UNICODE  = 0x0004
MOUSEEVENTF_MOVE      = 0x0001
MOUSEEVENTF_ABSOLUTE  = 0x8000
MOUSEEVENTF_LEFTDOWN  = 0x0002
MOUSEEVENTF_LEFTUP    = 0x0004
MOUSEEVENTF_RIGHTDOWN = 0x0008
MOUSEEVENTF_RIGHTUP   = 0x0010
MOUSEEVENTF_WHEEL     = 0x0800

VK_RETURN  = 0x0D
VK_ESCAPE  = 0x1B
VK_SPACE   = 0x20
VK_BACK    = 0x08
VK_DELETE  = 0x2E
VK_CONTROL = 0x11
VK_MENU    = 0x12
VK_SHIFT   = 0x10
VK_WIN     = 0x5B
VK_TAB     = 0x09
VK_F4      = 0x73

KEY_NAMES: dict[str, int] = {
    'entrée': VK_RETURN,  'enter': VK_RETURN,
    'échap':  VK_ESCAPE,  'escape': VK_ESCAPE, 'esc': VK_ESCAPE,
    'espace': VK_SPACE,   'space': VK_SPACE,
    'backspace': VK_BACK,
    'suppr':  VK_DELETE,  'delete': VK_DELETE,
    'tab':    VK_TAB,
    'ctrl':   VK_CONTROL, 'contrôle': VK_CONTROL,
    'alt':    VK_MENU,
    'shift':  VK_SHIFT,   'maj': VK_SHIFT,
    'win':    VK_WIN,
    'f4':     VK_F4,
}


class MOUSEINPUT(ctypes.Structure):
    _fields_ = [
        ('dx',          ctypes.c_long),
        ('dy',          ctypes.c_long),
        ('mouseData',   ctypes.c_ulong),
        ('dwFlags',     ctypes.c_ulong),
        ('time',        ctypes.c_ulong),
        ('dwExtraInfo', ctypes.POINTER(ctypes.c_ulong)),
    ]


class KEYBDINPUT(ctypes.Structure):
    _fields_ = [
        ('wVk',         ctypes.c_ushort),
        ('wScan',       ctypes.c_ushort),
        ('dwFlags',     ctypes.c_ulong),
        ('time',        ctypes.c_ulong),
        ('dwExtraInfo', ctypes.POINTER(ctypes.c_ulong)),
    ]


class _INPUTunion(ctypes.Union):
    _fields_ = [('mi', MOUSEINPUT), ('ki', KEYBDINPUT)]


class INPUT(ctypes.Structure):
    _fields_ = [('type', ctypes.c_ulong), ('_input', _INPUTunion)]


_user32 = ctypes.windll.user32


def _send(*inputs: INPUT) -> None:
    n   = len(inputs)
    arr = (INPUT * n)(*inputs)
    _user32.SendInput(n, arr, ctypes.sizeof(INPUT))


def _mouse(flags: int, dx: int = 0, dy: int = 0, data: int = 0) -> INPUT:
    mi = MOUSEINPUT(dx=dx, dy=dy, mouseData=ctypes.c_ulong(data & 0xFFFFFFFF),
                    dwFlags=flags, time=0, dwExtraInfo=None)
    inp = INPUT(); inp.type = INPUT_MOUSE; inp._input.mi = mi
    return inp


def _key(vk: int, up: bool = False) -> INPUT:
    ki = KEYBDINPUT(wVk=vk, wScan=0,
                    dwFlags=KEYEVENTF_KEYUP if up else 0, time=0, dwExtraInfo=None)
    inp = INPUT(); inp.type = INPUT_KEYBOARD; inp._input.ki = ki
    return inp


def _ukey(char: str, up: bool = False) -> INPUT:
    ki = KEYBDINPUT(wVk=0, wScan=ord(char),
                    dwFlags=KEYEVENTF_UNICODE | (KEYEVENTF_KEYUP if up else 0),
                    time=0, dwExtraInfo=None)
    inp = INPUT(); inp.type = INPUT_KEYBOARD; inp._input.ki = ki
    return inp


# ── Regex ─────────────────────────────────────────────────────────────────────
_CLICK_RE  = re.compile(r'\b(clique?|click)\s+(?:sur\s+)?(\d+)[,\s]+(\d+)\b', re.I)
_RCLICK_RE = re.compile(r'\b(clic\s+droit|right.?click)\s+(?:sur\s+)?(\d+)[,\s]+(\d+)\b', re.I)
_MOVE_RE   = re.compile(r'\b(?:bouge?|d[eé]place?|move)\s+(?:la\s+)?souris\s+(?:[àa]\s+)?(\d+)[,\s]+(\d+)\b', re.I)
_TYPE_RE   = re.compile(r'\b(?:tape|[eé]cris?|type|saisis?)\s+[«"\'"]?(.+?)[»"\'"]?\s*$', re.I)
_SCROLL_RE = re.compile(r'\b(?:scroll|d[eé]file?)\s+(haut|bas|up|down)\s*(\d*)\b', re.I)
_KEY_RE    = re.compile(r'\b(?:appuie?\s+sur|presse?\s+|press\s+)\s*(.+)', re.I)


class InputControl:

    def move_mouse(self, x: int, y: int) -> str:
        sw = _user32.GetSystemMetrics(0)
        sh = _user32.GetSystemMetrics(1)
        ax = int(x * 65535 / sw)
        ay = int(y * 65535 / sh)
        _send(_mouse(MOUSEEVENTF_MOVE | MOUSEEVENTF_ABSOLUTE, ax, ay))
        return f'✅ Souris → ({x}, {y})'

    def click(self, x: int, y: int) -> str:
        self.move_mouse(x, y)
        time.sleep(0.05)
        _send(_mouse(MOUSEEVENTF_LEFTDOWN), _mouse(MOUSEEVENTF_LEFTUP))
        return f'✅ Clic → ({x}, {y})'

    def right_click(self, x: int, y: int) -> str:
        self.move_mouse(x, y)
        time.sleep(0.05)
        _send(_mouse(MOUSEEVENTF_RIGHTDOWN), _mouse(MOUSEEVENTF_RIGHTUP))
        return f'✅ Clic droit → ({x}, {y})'

    def double_click(self, x: int, y: int) -> str:
        self.click(x, y)
        time.sleep(0.08)
        _send(_mouse(MOUSEEVENTF_LEFTDOWN), _mouse(MOUSEEVENTF_LEFTUP))
        return f'✅ Double-clic → ({x}, {y})'

    def type_text(self, text: str) -> str:
        for char in text:
            _send(_ukey(char), _ukey(char, up=True))
            time.sleep(0.02)
        return f'✅ Tapé: {text[:60]}'

    def press_key(self, key_name: str) -> str:
        vk = KEY_NAMES.get(key_name.lower().strip())
        if not vk and len(key_name) == 1:
            vk = _user32.VkKeyScanW(ord(key_name)) & 0xFF
        if not vk:
            return f'❌ Touche inconnue: {key_name}'
        _send(_key(vk), _key(vk, up=True))
        return f'✅ Touche: {key_name}'

    def hotkey(self, *keys: str) -> str:
        vks = []
        for k in keys:
            v = KEY_NAMES.get(k.lower().strip())
            if not v and len(k) == 1:
                v = _user32.VkKeyScanW(ord(k)) & 0xFF
            if not v:
                return f'❌ Touche inconnue: {k}'
            vks.append(v)
        for v in vks:
            _send(_key(v))
        for v in reversed(vks):
            _send(_key(v, up=True))
        return f'✅ Raccourci: {"+".join(keys)}'

    def scroll(self, direction: str, amount: int = 3) -> str:
        delta = 120 * amount * (1 if direction in ('haut', 'up') else -1)
        _send(_mouse(MOUSEEVENTF_WHEEL, data=delta))
        return f'✅ Scroll {"↑" if delta > 0 else "↓"} ×{amount}'

    def try_handle(self, text: str) -> str | None:
        t = text.strip()

        m = _RCLICK_RE.search(t)
        if m:
            return self.right_click(int(m.group(2)), int(m.group(3)))

        m = _CLICK_RE.search(t)
        if m:
            return self.click(int(m.group(2)), int(m.group(3)))

        m = _MOVE_RE.search(t)
        if m:
            return self.move_mouse(int(m.group(1)), int(m.group(2)))

        m = _TYPE_RE.search(t)
        if m:
            return self.type_text(m.group(1))

        m = _SCROLL_RE.search(t)
        if m:
            amount = int(m.group(2)) if m.group(2) else 3
            return self.scroll(m.group(1).lower(), amount)

        m = _KEY_RE.search(t)
        if m:
            keys_str = m.group(1).strip()
            keys = [k.strip() for k in re.split(r'[+&]', keys_str)]
            if len(keys) > 1:
                return self.hotkey(*keys)
            return self.press_key(keys[0])

        return None
