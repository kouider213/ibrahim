"""
NEXUS Overlay — petite bulle flottante toujours visible en bas à droite de l'écran
(idée reprise de bertrandmbanwi/Jarvis, réécrite en tkinter pour Windows, sans dépendance lourde).

- Orbe animée : bleu = veille, vert = écoute, orange = réfléchit, cyan = parle.
- Dernière phrase de Nexus à côté de l'orbe.
- Clic sur l'orbe = micro on/off. Glisser = déplacer. Clic droit = menu (micro, interface, masquer).
- Raccourci clavier global NEXUS_HOTKEY (défaut ctrl+alt+n) = micro on/off de n'importe où
  (paquet « keyboard »). NEXUS_HOTKEY_TOGGLE (défaut ctrl+alt+b) = afficher / masquer la bulle.
- NEXUS_OVERLAY=0 pour la désactiver.
"""
import logging
import math
import os
import queue
import threading

log = logging.getLogger('nexus.overlay')

_COLORS = {
    'idle':      ('#1e6bff', '#0b2a66'),
    'listening': ('#22d36b', '#0b4d27'),
    'thinking':  ('#ffb020', '#5c3d05'),
    'speaking':  ('#22d3ee', '#0b4a55'),
}
_LABELS = {'idle': 'NEXUS · veille', 'listening': 'NEXUS · écoute', 'thinking': 'NEXUS · réfléchit', 'speaking': 'NEXUS · parle'}
_KEY = '#010203'          # couleur rendue transparente (fond de la fenêtre)
W, H, R = 300, 78, 26     # largeur, hauteur, rayon de l'orbe


class Overlay:
    def __init__(self, app) -> None:
        self.app = app
        self._q: queue.Queue = queue.Queue()
        self._state = 'idle'
        self._thinking = False
        self._speaking = False
        self._text = 'Clic = micro · ctrl+alt+n'
        self._phase = 0.0
        self._visible = True
        self.enabled = os.getenv('NEXUS_OVERLAY', '1') != '0'

    # ── Appelé par Nexus (n'importe quel thread) ─────────────────────────────
    def on_event(self, data: dict) -> None:
        if self.enabled:
            self._q.put(data)

    def start(self) -> None:
        if not self.enabled:
            return
        threading.Thread(target=self._run, daemon=True, name='nexus-overlay').start()
        threading.Thread(target=self._hotkeys, daemon=True, name='nexus-hotkey').start()

    # ── Raccourcis clavier globaux ───────────────────────────────────────────
    def _hotkeys(self) -> None:
        try:
            import keyboard
        except ImportError:
            log.warning('Raccourci clavier indisponible : pip install keyboard')
            return
        try:
            keyboard.add_hotkey(os.getenv('NEXUS_HOTKEY', 'ctrl+alt+n'), self._toggle_mic)
            keyboard.add_hotkey(os.getenv('NEXUS_HOTKEY_TOGGLE', 'ctrl+alt+b'), lambda: self._q.put({'type': '_toggle_visible'}))
            log.info('Raccourcis : %s (micro), %s (bulle)', os.getenv('NEXUS_HOTKEY', 'ctrl+alt+n'),
                     os.getenv('NEXUS_HOTKEY_TOGGLE', 'ctrl+alt+b'))
        except Exception as e:
            log.warning('hotkey: %s', e)

    def _toggle_mic(self) -> None:
        try:
            self.app.toggle_mic()
            self._q.put({'type': '_mic', 'on': self.app.mic_active})
        except Exception as e:
            log.warning('toggle mic: %s', e)

    # ── Fenêtre tkinter (toujours dans ce thread) ────────────────────────────
    def _run(self) -> None:
        try:
            import tkinter as tk
        except Exception as e:
            log.warning('Overlay indisponible (tkinter) : %s', e)
            return
        try:
            root = tk.Tk()
        except Exception as e:     # pas d'écran (session de service, bureau distant fermé…)
            log.warning('Overlay : pas d\'écran (%s)', e)
            return
        self.root = root
        root.overrideredirect(True)
        root.attributes('-topmost', True)
        try:
            root.attributes('-transparentcolor', _KEY)
            root.attributes('-alpha', 0.94)
        except Exception:
            pass
        sw, sh = root.winfo_screenwidth(), root.winfo_screenheight()
        root.geometry(f'{W}x{H}+{sw - W - 18}+{sh - H - 60}')
        root.configure(bg=_KEY)

        c = tk.Canvas(root, width=W, height=H, bg=_KEY, highlightthickness=0)
        c.pack()
        self.c = c
        # Fond « pilule »
        r = H // 2 - 4
        c.create_oval(4, 4, 4 + 2 * r, H - 4, fill='#0d1117', outline='')
        c.create_oval(W - 4 - 2 * r, 4, W - 4, H - 4, fill='#0d1117', outline='')
        c.create_rectangle(4 + r, 4, W - 4 - r, H - 4, fill='#0d1117', outline='')
        cx, cy = 4 + r, H // 2
        self._halo = c.create_oval(cx - R, cy - R, cx + R, cy + R, fill='', outline='#1e6bff', width=2)
        self._orb = c.create_oval(cx - R + 8, cy - R + 8, cx + R - 8, cy + R - 8, fill='#1e6bff', outline='')
        self._title = c.create_text(cx + R + 10, 22, anchor='w', fill='#9fb3c8', font=('Segoe UI', 9, 'bold'),
                                    text=_LABELS['idle'])
        self._body = c.create_text(cx + R + 10, 46, anchor='w', fill='#e6edf3', font=('Segoe UI', 9),
                                   width=W - (cx + R + 24), text=self._text)
        self._center = (cx, cy)

        # Souris : clic orbe = micro, glisser = déplacer, clic droit = menu
        self._drag = None
        c.bind('<ButtonPress-1>', self._press)
        c.bind('<B1-Motion>', self._motion)
        c.bind('<ButtonRelease-1>', self._release)
        menu = tk.Menu(root, tearoff=0)
        menu.add_command(label='Micro on/off', command=self._toggle_mic)
        menu.add_command(label="Ouvrir l'interface", command=lambda: threading.Thread(
            target=self.app._open_browser, daemon=True).start())
        menu.add_command(label='Masquer (ctrl+alt+b)', command=lambda: self._set_visible(False))
        c.bind('<Button-3>', lambda e: menu.tk_popup(e.x_root, e.y_root))

        root.after(40, self._tick)
        root.mainloop()

    def _press(self, e) -> None:
        self._drag = (e.x_root, e.y_root, self.root.winfo_x(), self.root.winfo_y(), False)

    def _motion(self, e) -> None:
        if not self._drag:
            return
        x0, y0, wx, wy, _ = self._drag
        dx, dy = e.x_root - x0, e.y_root - y0
        if abs(dx) + abs(dy) > 4:
            self._drag = (x0, y0, wx, wy, True)
            self.root.geometry(f'+{wx + dx}+{wy + dy}')

    def _release(self, e) -> None:
        moved = self._drag[4] if self._drag else False
        self._drag = None
        cx, cy = self._center
        if not moved and (e.x - cx) ** 2 + (e.y - cy) ** 2 <= (R + 4) ** 2:
            threading.Thread(target=self._toggle_mic, daemon=True).start()

    def _set_visible(self, v: bool) -> None:
        self._visible = v
        (self.root.deiconify if v else self.root.withdraw)()

    def _consume(self) -> None:
        while True:
            try:
                d = self._q.get_nowait()
            except queue.Empty:
                return
            t = d.get('type')
            if t == 'thinking':
                self._thinking = bool(d.get('active'))
            elif t == 'waveform':
                self._speaking = bool(d.get('active'))
            elif t == 'speak' and d.get('text'):
                self._text = str(d['text'])
            elif t == 'journal' and d.get('text'):
                self._text = str(d['text'])
            elif t == '_mic':
                self._text = 'Micro activé, je t\'écoute.' if d.get('on') else 'Micro coupé.'
            elif t == '_toggle_visible':
                self._set_visible(not self._visible)

    def _tick(self) -> None:
        try:
            self._consume()
            listening = bool(getattr(self.app, 'mic_active', False)) or \
                bool(getattr(getattr(self.app, 'wake_det', None), 'in_session', False))
            state = ('speaking' if self._speaking else 'thinking' if self._thinking
                     else 'listening' if listening else 'idle')
            self._state = state
            main, dark = _COLORS[state]
            speed = {'idle': 0.05, 'listening': 0.12, 'thinking': 0.22, 'speaking': 0.3}[state]
            self._phase += speed
            amp = {'idle': 2, 'listening': 4, 'thinking': 3, 'speaking': 6}[state]
            k = (math.sin(self._phase) + 1) / 2
            cx, cy = self._center
            rh = R - 2 + amp * k
            ro = R - 8 + (amp / 2) * k
            self.c.coords(self._halo, cx - rh, cy - rh, cx + rh, cy + rh)
            self.c.coords(self._orb, cx - ro, cy - ro, cx + ro, cy + ro)
            self.c.itemconfigure(self._orb, fill=main if k > 0.3 or state != 'idle' else dark)
            self.c.itemconfigure(self._halo, outline=main)
            self.c.itemconfigure(self._title, text=_LABELS[state])
            txt = self._text.replace('\n', ' ')
            self.c.itemconfigure(self._body, text=txt if len(txt) <= 90 else txt[:87] + '…')
        except Exception as e:
            log.debug('overlay tick: %s', e)
        self.root.after(40, self._tick)
