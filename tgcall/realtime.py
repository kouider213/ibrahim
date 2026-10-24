"""Voix temps réel des appels Telegram : OpenAI Realtime (parole ↔ parole) branché sur l'appel.

- La voix de Kouider (PCM 24 kHz reçu de l'appel) part en continu vers OpenAI.
- OpenAI détecte la fin de phrase, répond en voix (~1 s) ; si Kouider parle par-dessus, il s'arrête.
- Pour toute info réelle, le modèle appelle l'outil ask_dzaryx → /api/call/turn (le vrai cerveau Dzaryx).
- La voix de Dzaryx est envoyée dans l'appel par tranches de 10 ms, au rythme réel, sans trou.
La clé OpenAI est temporaire (fournie par le backend, /api/call/realtime) : la vraie clé reste sur Railway.
"""
import asyncio
import audioop
import base64
import hashlib
import json
import logging
import os
import re
import subprocess
import time
from pathlib import Path
from typing import Awaitable, Callable

import aiohttp
from pytgcalls import PyTgCalls
from pytgcalls.types import Device

import speaker
from gemini_live import GeminiLiveWS

log = logging.getLogger('dzaryx-tg')

IN_RATE = 24000                    # voix reçue de l'appel (RecordStream) et envoyée à OpenAI
OUT_RATE = 48000                   # voix jouée dans l'appel
FRAME_10MS = OUT_RATE // 100 * 2   # 960 octets = 10 ms mono 16 bits
SILENCE = b'\x00' * FRAME_10MS
SEND_EVERY_S = 0.1                 # voix de Kouider envoyée à OpenAI par paquets de 100 ms
VIDEO_FRESH_S = 2.0                # image caméra considérée « en direct » si reçue il y a moins de 2 s
VIDEO_EVERY_S = 3.0                # au plus une image caméra envoyée à OpenAI toutes les 3 s
CHECK_EVERY_S = 4.0                # voix re-vérifiée toutes les 4 s de parole (téléphone passé à quelqu'un d'autre ?)
BARGE_RMS = int(os.environ.get('BARGE_RMS', '400'))    # pendant que Dzaryx parle, il faut au moins ce volume pour passer…
ECHO_MARGIN = 2.0                  # … et 2× l'écho mesuré sur CE téléphone (haut-parleur ~25 %, écouteurs ~0)
ECHO_K0 = 0.25                     # écho supposé au départ (haut-parleur), appris ensuite tranche par tranche
VOICE_TARGET = 4000                # sa voix est remontée vers ce volume (micro d'écouteurs ~1000 le 20/10)
MAX_GAIN = 4.0
ECHO_TAIL_S = 0.8                  # l'écho revient encore ~0,5 s après la dernière tranche jouée
BARGE_OPEN_S = 1.5                 # voix forte entendue → on laisse tout passer 1,5 s (il coupe la parole)
RECONNECTS = 3                     # coupures Gemini Live (1007 le 20/10) → nouvelle session, l'appel continue
# Voix bloquée (24/10 17h : sa voix arrivait, Gemini ne transcrivait ni ne répondait → Dzaryx muet) : s'il a parlé
# au moins STALL_SPEECH_S et que rien ne répond STALL_WAIT_S après sa dernière phrase → on passe sur le cerveau Claude.
STALL_RMS = int(os.environ.get('STALL_RMS', '900'))
STALL_SPEECH_S = 1.2
STALL_WAIT_S = float(os.environ.get('STALL_WAIT_S', '7'))
VOICE_KEEP_S = 30                  # au plus 30 s de sa voix gardées (vérification + apprentissage en fin d'appel)
# Outils permis quand ce n'est PAS Kouider (sa femme, un proche, un inconnu) : rien qui touche à ses affaires
GUEST_TOOLS = {'web_search', 'end_call', 'call_back_later', 'leave_message', 'learn_voice', 'verify_code'}
NAMES = json.loads(os.environ.get('TG_SPEAKER_NAMES', '{}'))   # {"prénom": "Prénom (sa femme)"} dans .env : pas de prénoms dans le dépôt public
OPENAI_OUT_S = 1800                # OpenAI sans crédit → on passe direct à Gemini Live pendant 30 min
openai_out_until = 0.0
# Limite gratuite Gemini Live atteinte → Kouider prévenu sur Telegram, voix de secours, nouvel essai toutes les heures,
# et message quand la voix normale revient (Kouider 19/10).
GEMINI_RETRY_S = 3600
gemini_out_until = 0.0
gemini_alerted = False
LIMIT_RE = re.compile(r'quota|exhaust|resource|429|rate.?limit|limit', re.I)
# Le cerveau met du temps (secours gratuit sans Claude : jusqu'à 48 s le 23/10, Kouider a raccroché dans le silence)
# → Dzaryx dit « je vérifie » après WAIT_S, puis « encore quelques secondes ». Phrases générées une fois, gardées sur disque.
WAIT_LINES = [(7, 'Attends, je vérifie ça.'), (22, 'Je cherche encore, quelques secondes.')]
WAIT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'cache', 'wait')
wait_pcm: dict[str, bytes] = {}


def notify_kouider(text: str) -> None:
    """Message Telegram à Kouider via tgcall/outbox (envoyé par outbox_loop dans les 3 s)."""
    try:
        out = Path(__file__).parent / 'outbox'
        out.mkdir(exist_ok=True)
        (out / f'{int(time.time() * 1000)}-voix.txt').write_text(text, encoding='utf-8')
    except Exception as e:
        log.warning('message voix: %s', e)


def gemini_failed(err: Exception) -> None:
    global gemini_out_until, gemini_alerted
    if not LIMIT_RE.search(str(err)):
        return
    gemini_out_until = time.monotonic() + GEMINI_RETRY_S
    if not gemini_alerted:
        gemini_alerted = True
        log.warning('limite gratuite Gemini Live atteinte : %s', str(err)[:160])
        notify_kouider('🔊 Limite gratuite de ma voix (Gemini) atteinte pour aujourd\'hui. Je passe sur ma voix de secours '
                       '(un peu plus lente) : tout continue de marcher. Je réessaie toutes les heures et je te préviens '
                       'dès que ma voix normale revient. Si tu recharges du crédit OpenAI, je l\'utilise aussi.')


def gemini_ok() -> None:
    global gemini_alerted
    if gemini_alerted:
        gemini_alerted = False
        notify_kouider('🔊 Ma voix normale est revenue (crédit gratuit Gemini de nouveau dispo).')
ROTATE = {90: 'transpose=1', 180: 'transpose=1,transpose=1', 270: 'transpose=2'}


def frame_to_jpeg(raw: bytes, w: int, h: int, rotation: int = 0, max_w: int = 768) -> bytes:
    """Image caméra brute de l'appel (I420 / yuv420p) → JPEG, redressée et réduite."""
    vf = ','.join(f for f in (ROTATE.get(rotation), f"scale='min({max_w},iw)':-2") if f)
    out = subprocess.run(['ffmpeg', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'yuv420p', '-s', f'{w}x{h}',
                          '-i', '-', '-frames:v', '1', '-vf', vf, '-q:v', '4', '-f', 'mjpeg', '-'],
                         input=raw, capture_output=True, timeout=10, check=True)
    return out.stdout

ApiFn = Callable[[str, dict, str, float], Awaitable[dict]]
# Outils exécutés ici (pas au backend) : nom → fonction(args) → (résultat, relancer la parole ?)
LocalTool = Callable[[dict], Awaitable[tuple[str, bool]]]


class RealtimeCall:
    def __init__(self, calls: PyTgCalls, http: aiohttp.ClientSession, api: ApiFn, user_id: int, actor: str,
                 local_tools: dict[str, LocalTool] | None = None):
        self.calls, self.http, self.api = calls, http, api
        self.local_tools = local_tools or {}
        self.responding = False           # OpenAI est en train de produire une réponse
        self.user_id, self.actor = user_id, actor
        self.ws: aiohttp.ClientWebSocketResponse | None = None
        self.out = bytearray()            # voix de Dzaryx à jouer (48 kHz)
        self.inp = bytearray()            # voix de Kouider pas encore envoyée
        self.rate_state = None
        self.tasks: list[asyncio.Task] = []
        self.closed = False
        self.provider = ''
        self.playing = False              # l'appel Telegram est établi → on peut envoyer des tranches
        self.video: tuple[bytes, int, int, int, float] | None = None   # dernière image caméra (brute, l, h, rotation, quand)
        self.video_sent = 0.0
        self.lines: list[dict] = []       # transcription de l'appel (mémoire des appels, envoyée à la fin)
        self.started = time.monotonic()
        self.interpreter = ''             # langue du client en mode interprète ('' = normal)
        # Qui parle ? (reconnaissance de la voix, speaker.py) — 'kouider', un proche (prénom appris), 'inconnu' ou '?'
        self.guarded = False              # voix de Kouider connue → on vérifie avant de parler affaires
        self.who = 'kouider'
        self.by_code = False              # déverrouillé par le code secret (pas par la voix → on n'apprend pas)
        self.decided = asyncio.Event()
        self.voice = bytearray()          # sa voix (24 kHz) pour la vérification
        self.win = bytearray()            # voix depuis la dernière vérification
        self.last_vec = None
        self.full_instr = ''
        self.guest_instr = ''
        self.held_greeting = ''           # ce que Dzaryx devait dire (motif / messages en attente) : seulement à Kouider
        self.held_outgoing = False
        self.play_until = 0.0             # Dzaryx est audible au téléphone jusqu'à… (écho possible)
        self.open_until = 0.0             # anti-écho ouvert (Kouider parle par-dessus) jusqu'à…
        self.out_env = 0.0                # volume récent de la voix de Dzaryx jouée (pic qui retombe en ~1 s)
        self.echo_k = ECHO_K0             # écho = echo_k × voix de Dzaryx (appris : écouteurs → presque 0)
        self.voice_lvl = 0.0              # volume habituel de sa voix (pic qui retombe en ~10 s)
        self.reconnects = 0
        self.on_stall = None              # async (why) → l'appel passe sur l'ancienne chaîne (cerveau Claude)
        self.loud_s = 0.0                 # secondes de sa voix depuis la dernière réaction de Dzaryx
        self.last_loud = 0.0
        self.tools_running = 0

    # ── Connexion ────────────────────────────────────────────────────────────
    async def _connect_openai(self) -> dict:
        res = await self.api('/api/call/realtime', {}, self.actor, 20)
        self.ws = await self.http.ws_connect(
            f"wss://api.openai.com/v1/realtime?model={res.get('model', 'gpt-realtime')}",
            headers={'Authorization': f"Bearer {res['key']}"}, heartbeat=20, max_msg_size=0)
        # 1er événement = session.created, ou une erreur (19/10 : crédit OpenAI épuisé → la socket s'ouvre
        # quand même, puis l'erreur arrive : sans ce contrôle l'appel restait muet)
        first = await self.ws.receive(timeout=8)
        ev = json.loads(first.data) if first.type == aiohttp.WSMsgType.TEXT else {'type': 'error', 'error': str(first.type)}
        if ev.get('type') == 'error':
            await self.ws.close()
            raise RuntimeError(ev.get('error'))
        self.provider = 'openai'
        return res

    async def connect(self) -> None:
        """Gemini Live d'abord (GRATUIT, toujours la même voix — Kouider 19/10 : Dzaryx gratuit sauf Railway) ;
        en panne → OpenAI Realtime s'il a du crédit ; sinon exception → ancienne voix."""
        global openai_out_until
        res = None
        try:
            if time.monotonic() < gemini_out_until:
                raise RuntimeError('limite Gemini atteinte, nouvel essai plus tard')
            res = await self.api('/api/call/realtime-gemini', {}, self.actor, 20)
            self.ws = await GeminiLiveWS.connect(self.http, res)
            await self.ws.receive(timeout=8)   # session.created
            self.provider = 'gemini'
            gemini_ok()
        except Exception as e:
            res = None
            if time.monotonic() >= gemini_out_until:
                gemini_failed(e)
            log.warning('Gemini Live indisponible (%s) → OpenAI', str(e)[:160])
            if time.monotonic() < openai_out_until:
                raise RuntimeError('OpenAI sans crédit') from e
            try:
                res = await self._connect_openai()
            except Exception as e2:
                if re.search(r'quota|credit|billing|401|402|429', str(e2), re.I):
                    openai_out_until = time.monotonic() + OPENAI_OUT_S   # inutile de retenter à chaque appel
                raise
        self.tasks.append(asyncio.create_task(self._reader()))
        self.tasks.append(asyncio.create_task(self._sender()))
        self.full_instr, self.guest_instr = res.get('instructions') or '', res.get('guestInstructions') or ''
        if self.guest_instr and speaker.available() and speaker.known() > 0 and speaker.guard_on():
            self.guarded, self.who = True, '?'
            await self._session(self.guest_instr, auto=False)   # rien d'automatique tant qu'on ne sait pas qui parle
        log.info('voix temps réel connectée (%s)%s', self.provider, ' (vérification de la voix)' if self.guarded else '')

    n_in = n_out = n_voiced = 0; rms_max = 0   # diagnostic : tranches audio reçues / envoyées (voix) pendant l'appel

    def start_audio(self) -> None:
        """L'appel est décroché : on commence à jouer (au rythme réel)."""
        if not self.playing:
            self.playing = True
            self.tasks.append(asyncio.create_task(self._pacer()))
            self.tasks.append(asyncio.create_task(self._stall_watch()))
            if len(wait_pcm) < len(WAIT_LINES):
                self.tasks.append(asyncio.create_task(self._load_wait_lines()))

    async def _load_wait_lines(self) -> None:
        for _, text in WAIT_LINES:
            if text in wait_pcm:
                continue
            path = os.path.join(WAIT_DIR, hashlib.md5(text.encode()).hexdigest()[:12] + '.pcm')
            try:
                if not os.path.exists(path):
                    pcm = await speak(self.http, self.api, text, self.actor)
                    os.makedirs(WAIT_DIR, exist_ok=True)
                    with open(path, 'wb') as f:
                        f.write(pcm)
                with open(path, 'rb') as f:
                    wait_pcm[text] = f.read()
            except Exception as e:
                log.warning('phrase d\'attente %r : %s', text, str(e)[:120])
                return

    def _reacted(self) -> None:
        self.loud_s = 0.0

    def _stall(self, why: str) -> None:
        cb, self.on_stall = self.on_stall, None   # une seule bascule
        if cb and not self.closed:
            asyncio.create_task(cb(why))

    async def _stall_watch(self) -> None:
        """Il a parlé, puis plus rien ne répond (ni voix, ni outil) → bascule sur le cerveau Claude."""
        while not self.closed:
            await asyncio.sleep(0.5)
            if self.guarded and self.who == '?':
                continue
            if (self.loud_s >= STALL_SPEECH_S and not self.responding and not self.out and not self.tools_running
                    and time.monotonic() - self.last_loud >= STALL_WAIT_S):
                log.warning('voix temps réel muette (%.1fs de sa voix sans réponse) → cerveau Claude', self.loud_s)
                self._stall('pas de réponse')
                return

    async def _say_while_waiting(self) -> None:
        """Pendant que ask_dzaryx cherche : une courte phrase si le silence dure (annulé dès que la réponse arrive)."""
        t0 = time.monotonic()
        for at, text in WAIT_LINES:
            await asyncio.sleep(max(0.0, at - (time.monotonic() - t0)))
            if text in wait_pcm and not self.responding and not self.out and not self.closed:
                log.info('attente du cerveau → %r', text)
                self._play(wait_pcm[text])

    async def close(self) -> None:
        if not self.closed:
            log.info('audio de l\'appel : %d reçus (volume max %d), %d envoyés dont %d de voix', self.n_in, self.rms_max, self.n_out, self.n_voiced)
        self.closed = True
        for t in self.tasks:
            t.cancel()
        if self.ws and not self.ws.closed:
            await self.ws.close()

    async def _send(self, event: dict) -> None:
        if self.ws and not self.ws.closed:
            await self.ws.send_str(json.dumps(event))

    async def greet(self, text: str, outgoing: bool = False) -> None:
        """Dzaryx parle en premier (motif de l'appel, ou « je t'écoute »)."""
        self.held_outgoing = outgoing
        if self.guarded:   # on ne sait pas encore qui décroche : accueil neutre, le motif attend la voix de Kouider
            self.held_greeting = text
            text = 'Allô, Kouider ? C\'est Dzaryx.' if outgoing else 'Oui, allô ? Je t\'écoute.'
            await self._send({'type': 'response.create', 'response': {
                'instructions': f'Dis seulement, naturellement : « {text} » — rien d\'autre.'}})
            return
        if outgoing:   # sinon « c'est toi qui m'as appelé » est compris comme une question sur ses appels
            await self._send({'type': 'conversation.item.create', 'item': {'type': 'message', 'role': 'system', 'content': [
                {'type': 'input_text', 'text': f"C'est TOI (Dzaryx) qui appelles {self.actor.capitalize()}, il n'a pas appelé. "
                 f"Motif de ton appel : « {text} ». S'il demande pourquoi tu appelles ou dit que c'est toi qui l'as "
                 "appelé, confirme et redonne le motif en une phrase."}]}})
        await self._send({'type': 'response.create', 'response': {
            'instructions': f'Commence l\'appel en disant, naturellement et presque mot pour mot : « {text} »'}})

    # ── Voix de Kouider → OpenAI ─────────────────────────────────────────────
    def feed(self, pcm24k: bytes) -> None:
        self.n_in += 1
        rms = audioop.rms(pcm24k, 2)
        self.rms_max = max(self.rms_max, rms)
        self.voice.extend(pcm24k); self.win.extend(pcm24k)
        # Anti-écho (20/10 : Gemini entendait sa propre voix revenir du téléphone, se coupait et se répondait —
        # « tu t'écoutes ») : pendant que Dzaryx parle, le faible retour du haut-parleur est remplacé par du silence.
        now = time.monotonic()
        if self.out:
            self.play_until = now + ECHO_TAIL_S
        playing = now < self.play_until
        if self.provider == 'gemini' and playing and now >= self.open_until:
            if rms >= max(BARGE_RMS, ECHO_MARGIN * self.echo_k * self.out_env):
                self.open_until = now + BARGE_OPEN_S
            else:
                if self.out_env > 500:   # ce qui revient pendant qu'il se tait = l'écho : on garde son pic (retombe en ~3 s)
                    self.echo_k = max(min(rms / self.out_env, 1.0), self.echo_k * 0.998)
                pcm24k = bytes(len(pcm24k))
        elif not playing and rms > 300:
            self.voice_lvl = max(float(rms), self.voice_lvl * 0.999)
        if not playing and rms >= STALL_RMS:
            self.loud_s += len(pcm24k) / (2 * IN_RATE)
            self.last_loud = now
        # Micro faible (écouteurs Bluetooth : volume max ~1000 au lieu de ~7000) → Gemini ne détectait pas sa voix
        if self.voice_lvl and rms:
            gain = min(MAX_GAIN, max(1.0, VOICE_TARGET / self.voice_lvl))
            if gain > 1.05:
                pcm24k = audioop.mul(pcm24k, 2, gain)
        self.inp.extend(pcm24k)
        cap = VOICE_KEEP_S * IN_RATE * 2
        if len(self.voice) > cap:
            del self.voice[:len(self.voice) - cap]
        if len(self.win) > cap:
            del self.win[:len(self.win) - cap]

    # ── Qui parle ? ──────────────────────────────────────────────────────────
    async def _session(self, instructions: str, auto: bool = True) -> None:
        await self._send({'type': 'session.update', 'session': {'type': 'realtime', 'instructions': instructions,
            'audio': {'input': {'turn_detection': {'type': 'semantic_vad', 'eagerness': 'high',
                                                   'create_response': auto, 'interrupt_response': True}}}}})

    def _identify(self, pcm: bytes) -> tuple[str | None, float]:
        """→ ('kouider' | prénom d'un proche | 'inconnu' | None = pas encore sûr, score de Kouider)."""
        v = speaker.voiced(pcm, IN_RATE)
        secs = len(v) / (2 * IN_RATE)
        vec = speaker.embed(v, IN_RATE) if secs >= 1.0 else None
        if vec is None:
            return None, 0.0
        self.last_vec = vec
        best, best_s, owner_s = speaker.identify(vec)
        if owner_s >= speaker.MATCH:
            who = 'kouider'
        elif best and best != speaker.OWNER and best_s >= speaker.MATCH and best_s > owner_s + 0.1:
            who = best
        elif owner_s < speaker.REJECT and secs >= 2.0:
            who = 'inconnu'
        elif secs >= 8.0:                     # toujours pas sûr après 8 s → prudence
            who = 'inconnu'
        else:
            who = None
        log.info('voix : %s (%.1f s, kouider %.2f, meilleur %s %.2f)', who or '?', secs, owner_s, best, best_s)
        return who, owner_s

    async def _on_turn(self) -> None:
        """Fin d'une phrase : tant qu'on ne sait pas qui parle, on vérifie avant de répondre."""
        if not self.guarded:
            return
        if self.who == '?':
            who, _ = await asyncio.to_thread(self._identify, bytes(self.voice))
            self.win.clear()
            if who:
                await self._become(who)
            else:   # pas encore sûr : réponse neutre, sans rien dévoiler
                why = (' C\'est TOI qui as appelé (pas lui) : si on te demande pourquoi, dis « j\'ai quelque chose pour Kouider, '
                       'c\'est bien toi ? » sans donner le motif.') if self.held_outgoing else ''
                await self._send({'type': 'response.create', 'response': {'instructions':
                    'Tu ne sais pas encore qui est au téléphone. Réponds en une phrase courte et neutre, sans aucune '
                    'information (ex. « Oui, c\'est Dzaryx, l\'assistant de Kouider. C\'est qui à l\'appareil ? »).' + why}})
            return
        if len(speaker.voiced(bytes(self.win), IN_RATE)) / (2 * IN_RATE) < CHECK_EVERY_S:
            return
        pcm = bytes(self.win); self.win.clear()      # re-vérifie de temps en temps (téléphone passé ?)
        who, owner_s = await asyncio.to_thread(self._identify, pcm)
        if not who or who == self.who or (self.by_code and who == 'inconnu'):
            return
        if self.who == 'kouider' and owner_s >= speaker.REJECT:   # pour lui enlever la main, il faut être sûr
            return
        log.info('changement de voix : %s → %s', self.who, who)
        await self._become(who, switched=True)

    async def _become(self, who: str, switched: bool = False) -> None:
        prev, self.who = self.who, who
        self.decided.set()
        if who == 'kouider':
            await self._session(self.full_instr)
            note = '🔐 VOIX : c\'est bien Kouider (voix reconnue). Mode normal : tu peux tout lui dire.'
            if self.held_greeting:
                note += (f' Ce que tu devais lui dire en décrochant : « {self.held_greeting} ». Dis-le maintenant, '
                         'naturellement (sans redire allô), puis réponds à ce qu\'il vient de dire.')
                if self.held_outgoing:
                    note += ' C\'est TOI qui l\'as appelé (il n\'a pas appelé) : c\'est le motif de ton appel.'
                self.held_greeting = ''
            elif switched:
                note += ' Il vient de reprendre le téléphone.'
        else:
            await self._session(self.guest_instr)
            name = NAMES.get(who) or (who.capitalize() if who != 'inconnu' else '')
            note = (f'🔒 VOIX : ce n\'est PAS Kouider. C\'est {name} (voix reconnue). ' if name else
                    '🔒 VOIX : ce n\'est PAS Kouider (voix inconnue). Demande naturellement qui est à l\'appareil. ')
            note += 'Ne dévoile AUCUNE information sur ses affaires ni sur le motif de l\'appel.'
            if switched and prev == 'kouider':
                note += ' Kouider a passé le téléphone : ne répète rien de ce qui a été dit avant.'
            elif self.held_outgoing:
                note += ' C\'est toi qui appelais Kouider : demande quand il sera disponible, puis call_back_later.'
        await self._send({'type': 'conversation.item.create', 'item': {'type': 'message', 'role': 'system',
                          'content': [{'type': 'input_text', 'text': note}]}})
        await self._send({'type': 'response.create'})

    async def announce(self, info: str) -> bool:
        """Un appel devait partir pendant qu'on est déjà en ligne : Dzaryx le glisse dans la conversation
        (« ah attends, j'ai aussi une autre info… ») au lieu de rappeler après (Kouider 20/10).
        False = pas dit (quelqu'un d'autre au téléphone, appel fini) → gardé pour plus tard."""
        if self.closed or (self.guarded and self.who != 'kouider'):
            return False
        end = time.monotonic() + 30
        while (self.responding or self.out) and time.monotonic() < end and not self.closed:   # on le laisse finir sa phrase
            await asyncio.sleep(0.3)
        await asyncio.sleep(1.2)
        if self.closed:
            return False
        await self._send({'type': 'conversation.item.create', 'item': {'type': 'message', 'role': 'system', 'content': [
            {'type': 'input_text', 'text': 'Tu devais appeler Kouider pour une autre info, mais vous êtes DÉJÀ en ligne : ne '
             f'raccroche pas et ne propose pas de rappeler. Info : « {info} ».'}]}})
        await self._send({'type': 'response.create', 'response': {'instructions':
            'Enchaîne naturellement, par exemple : « Ah attends, j\'ai aussi une autre info pour toi : … », dis l\'info en une '
            'ou deux phrases, puis reviens à ce dont vous parliez (« bon, on en était où ? »).'}})
        log.info('info glissée dans l\'appel en cours : %r', info[:80])
        return True

    async def learn_voice(self, name: str) -> str:
        name = (name or '').strip().split()[0].lower() if (name or '').strip() else ''
        if not name or name == speaker.OWNER:
            return 'Prénom manquant (et la voix de Kouider s\'apprend toute seule).'
        if self.last_vec is None:
            return 'Pas encore assez entendu sa voix : continue de discuter, puis réessaie.'
        await asyncio.to_thread(speaker.enroll, name, self.last_vec)
        self.who = name
        self.decided.set()
        return f'✅ Voix de {name.capitalize()} retenue : la prochaine fois tu la reconnaîtras. Continue la conversation.'

    async def verify_code(self, code: str) -> str:
        if not speaker.has_passcode():
            return 'Aucun code secret n\'a été défini : reste discret (Kouider peut en créer un sur Telegram : « code secret … »).'
        if not speaker.check_passcode(code):
            log.warning('code secret faux')
            return 'Code faux. Reste aimable et discret, ne donne aucune information.'
        self.by_code = True
        asyncio.create_task(self._become('kouider'))
        return '✅ Code correct : c\'est Kouider.'

    def learn_at_end(self) -> None:
        """Fin d'appel : la voix de Kouider s'affine — seulement si c'était sûrement lui (reconnu par sa voix,
        ou, tant qu'aucune empreinte n'existe, quand c'est lui qui a appelé depuis son compte)."""
        if self.actor != speaker.OWNER or not speaker.available() or self.by_code or self.who != 'kouider':
            return
        if not self.guarded and (speaker.known() or self.held_outgoing):
            return
        v = speaker.voiced(bytes(self.voice), IN_RATE)
        if len(v) / (2 * IN_RATE) < speaker.MIN_ENROLL_S:
            return
        vec = speaker.embed(v, IN_RATE)
        if vec is None or (self.guarded and speaker.identify(vec)[2] < speaker.MATCH):
            return
        speaker.enroll(speaker.OWNER, vec)

    async def _sender(self) -> None:
        while not self.closed:
            await asyncio.sleep(SEND_EVERY_S)
            if self.inp:
                chunk = bytes(self.inp); self.inp.clear()
                await self._send({'type': 'input_audio_buffer.append', 'audio': base64.b64encode(chunk).decode()})

    # ── Caméra de Kouider (appel vidéo) ──────────────────────────────────────
    def feed_video(self, raw: bytes, w: int, h: int, rotation: int) -> None:
        if w > 0 and h > 0 and len(raw) >= w * h * 3 // 2:
            if self.video is None:
                log.info('caméra de %s reçue (%dx%d, rotation %d)', self.actor, w, h, rotation)
            self.video = (raw, w, h, rotation, time.monotonic())

    def snapshot(self) -> str | None:
        """Image caméra en direct → JPEG base64 (None si la caméra est coupée)."""
        if not self.video or time.monotonic() - self.video[4] > VIDEO_FRESH_S:
            return None
        raw, w, h, rot, _ = self.video
        try:
            return base64.b64encode(frame_to_jpeg(raw, w, h, rot)).decode()
        except Exception as e:
            log.warning('image caméra: %s', e)
            return None

    async def show_camera(self, force: bool = False) -> bool:
        """Comme l'app : l'image de la caméra accompagne ce que Kouider dit → OpenAI la voit."""
        if not force and time.monotonic() - self.video_sent < VIDEO_EVERY_S:
            return False
        jpg = await asyncio.to_thread(self.snapshot)
        if not jpg:
            return False
        self.video_sent = time.monotonic()
        await self._send({'type': 'conversation.item.create', 'item': {'type': 'message', 'role': 'user', 'content': [
            {'type': 'input_image', 'image_url': f'data:image/jpeg;base64,{jpg}'}]}})
        return True

    async def show_image(self, jpg_b64: str) -> None:
        """Image extérieure (écran du PC) ajoutée à la conversation : le modèle la voit et la décrit."""
        await self._send({'type': 'conversation.item.create', 'item': {'type': 'message', 'role': 'user', 'content': [
            {'type': 'input_image', 'image_url': f'data:image/jpeg;base64,{jpg_b64}'}]}})

    # ── Voix de Dzaryx → appel (tranches de 10 ms au rythme réel) ────────────
    async def _pacer(self) -> None:
        nxt = time.monotonic()
        while not self.closed:
            nxt += 0.01
            if len(self.out) >= FRAME_10MS:
                frame = bytes(self.out[:FRAME_10MS]); del self.out[:FRAME_10MS]
                self.n_voiced += 1
                self.out_env = max(audioop.rms(frame, 2), self.out_env * 0.99)
            else:
                frame = SILENCE
                self.out_env *= 0.99
            try:
                await self.calls.send_frame(self.user_id, Device.MICROPHONE, frame)
                self.n_out += 1
            except Exception as e:
                log.warning('send_frame: %s', e)
                return
            delay = nxt - time.monotonic()
            if delay > 0:
                await asyncio.sleep(delay)
            elif delay < -0.2:          # retard accumulé (machine occupée) → on se recale
                nxt = time.monotonic()

    def _play(self, pcm24k: bytes) -> None:
        up, self.rate_state = audioop.ratecv(pcm24k, 2, 1, IN_RATE, OUT_RATE, self.rate_state)
        self.out.extend(up)

    # ── Événements OpenAI ────────────────────────────────────────────────────
    async def _reader(self) -> None:
        while True:
            await self._read_ws()
            if self.closed or self.provider != 'gemini' or self.reconnects >= RECONNECTS:
                break
            self.reconnects += 1
            try:
                await self._reconnect()
            except Exception as e:
                log.warning('reconnexion Gemini Live impossible: %s', str(e)[:160])
                break
        if not self.closed:
            log.warning('voix temps réel déconnectée')
            self._stall('déconnectée')

    async def _reconnect(self) -> None:
        """Gemini Live a coupé en plein appel : nouvelle session avec la conversation jusqu'ici, Dzaryx reprend."""
        res = await self.api('/api/call/realtime-gemini', {}, self.actor, 20)
        guest = self.guarded and self.who != 'kouider'
        if guest:
            res = {**res, 'instructions': self.guest_instr}
        self.ws = await GeminiLiveWS.connect(self.http, res)
        await self.ws.receive(timeout=8)   # session.created
        self.responding = False
        log.info('voix temps réel reconnectée (%d)', self.reconnects)
        said = '\n'.join(f"{'Dzaryx' if l['role'] == 'dzaryx' else l.get('speaker') or self.actor.capitalize()} : {l['text']}"
                         for l in self.lines[-16:])
        await self._send({'type': 'conversation.item.create', 'item': {'type': 'message', 'role': 'system', 'content': [
            {'type': 'input_text', 'text': 'La ligne a eu une micro-coupure technique, l\'appel continue. Conversation '
             f'jusqu\'ici :\n{said or "(rien encore)"}'}]}})
        await self._send({'type': 'response.create', 'response': {'instructions':
            'Reprends naturellement en une phrase courte : « Pardon, petite coupure. » puis réponds à sa dernière '
            'phrase si tu ne l\'avais pas fait, sinon « je t\'écoute ».'}})

    async def _read_ws(self) -> None:
        assert self.ws is not None
        async for msg in self.ws:
            if msg.type != aiohttp.WSMsgType.TEXT:
                if msg.type in (aiohttp.WSMsgType.CLOSED, aiohttp.WSMsgType.ERROR):
                    break
                continue
            ev = json.loads(msg.data)
            t = ev.get('type', '')
            if t in ('response.output_audio.delta', 'response.audio.delta'):
                self._play(base64.b64decode(ev['delta']))
            elif t == 'response.created':
                self.responding = True
                self._reacted()
            elif t == 'response.done':
                self.responding = False
            elif t == 'input_audio_buffer.committed':
                asyncio.create_task(self._on_turn())
            elif t == 'input_audio_buffer.speech_started':
                asyncio.create_task(self.show_camera())
                if self.out:
                    self.out.clear()          # Kouider parle par-dessus → Dzaryx se tait tout de suite
                    log.info('interrompu par %s', self.actor)
            elif t == 'conversation.item.input_audio_transcription.completed':
                said = (ev.get('transcript') or '').strip()
                log.info('%s a dit: %r', self.actor, said)
                if said:
                    line = {'role': 'user', 'text': said}
                    if self.who not in ('kouider', '?'):
                        line['speaker'] = NAMES.get(self.who) or ('inconnu' if self.who == 'inconnu' else self.who.capitalize())
                    self.lines.append(line)
            elif t in ('response.output_audio_transcript.done', 'response.audio_transcript.done'):
                said = (ev.get('transcript') or '').strip()
                log.info('Dzaryx: %r', said[:200])
                if said:
                    self.lines.append({'role': 'dzaryx', 'text': said})
            elif t == 'response.function_call_arguments.done':
                self._reacted()
                asyncio.create_task(self._tool(ev))
            elif t == 'error':
                log.error('realtime: %s', ev.get('error'))

    async def _tool(self, ev: dict) -> None:
        self.tools_running += 1   # un outil qui cherche 20 s n'est pas une voix bloquée
        try:
            await self._run_tool(ev)
        finally:
            self.tools_running -= 1
            self._reacted()

    async def _run_tool(self, ev: dict) -> None:
        call_id, name = ev.get('call_id'), ev.get('name')
        try:
            args = json.loads(ev.get('arguments') or '{}')
        except json.JSONDecodeError:
            args = {}
        t0 = time.monotonic()
        follow_up = True
        if self.guarded and name not in GUEST_TOOLS and self.who != 'kouider':
            if self.who == '?':
                try:
                    await asyncio.wait_for(self.decided.wait(), 6)
                except asyncio.TimeoutError:
                    pass
        if self.guarded and name not in GUEST_TOOLS and self.who != 'kouider':
            log.warning('outil %s refusé : ce n\'est pas Kouider (%s)', name, self.who)
            result = ('BLOQUÉ : ce n\'est pas Kouider au téléphone (voix pas reconnue). Ne donne AUCUNE information '
                      'sur ses affaires. Reste naturel et discret.')
        elif name in self.local_tools:
            try:
                result, follow_up = await self.local_tools[name](args)
            except Exception as e:
                result = f'Échec : {e}'
        elif name == 'ask_dzaryx':
            try:
                body = {'message': args.get('request', ''), 'textOnly': True}
                jpg = await asyncio.to_thread(self.snapshot)
                if jpg:   # caméra allumée → le vrai Dzaryx reçoit l'image (état des lieux, documents…), comme dans l'app
                    body.update(image=jpg, imageMime='image/jpeg')
                waiting = asyncio.create_task(self._say_while_waiting())
                try:
                    out = await self.api('/api/call/turn', body, self.actor, 90)
                finally:
                    waiting.cancel()
                result = out.get('text') or 'Pas de réponse.'
            except Exception as e:
                result = f'Erreur technique : {e}. Dis-lui que tu n\'arrives pas à vérifier pour le moment.'
        else:
            try:   # lecture rapide (réservations, mails, flotte…) sans le cerveau complet
                out = await self.api('/api/call/tool', {'name': name, 'input': args}, self.actor, 30)
                result = out.get('text') or 'Rien trouvé.'
            except Exception as e:
                result = f'Erreur technique : {e}. Essaie ask_dzaryx.'
        log.info('%s (%.1fs) %r → %r', name, time.monotonic() - t0, (args.get('request') or json.dumps(args, ensure_ascii=False))[:80], result[:120])
        await self._send({'type': 'conversation.item.create', 'item': {
            'type': 'function_call_output', 'call_id': call_id, 'output': result}})
        if follow_up:
            await self._send({'type': 'response.create'})

    async def set_interpreter(self, on: bool, language: str = '') -> str:
        """Mode interprète : transcription toutes langues + on laisse finir les phrases ; règles renvoyées au modèle."""
        self.interpreter = (language.strip() or 'la langue du client') if on else ''
        transcription = {'model': 'gpt-4o-mini-transcribe'} if on else {'model': 'gpt-4o-mini-transcribe', 'language': 'fr'}
        await self._send({'type': 'session.update', 'session': {'type': 'realtime', 'audio': {'input': {
            'transcription': transcription,
            'turn_detection': {'type': 'semantic_vad', 'eagerness': 'low' if on else 'high',
                               'create_response': True, 'interrupt_response': True}}}}})
        if not on:
            return ('Mode interprète arrêté. Redeviens l\'assistant de Kouider en français, comme avant. '
                    'Dis-lui juste « ok, j\'arrête de traduire ».')
        lang = self.interpreter
        return (f'MODE INTERPRÈTE ACTIVÉ ({lang}). Règles jusqu\'à « stop traduction » : '
                f'1) Annonce-toi au client en {lang} en une phrase (« Bonjour, je suis Dzaryx, je traduis pour Kouider »). '
                f'2) Kouider parle français → répète EXACTEMENT sa phrase en {lang}, à la 1re personne, rien d\'autre. '
                f'3) Le client parle {lang} (ou une autre langue) → répète sa phrase en français pour Kouider, à la 1re personne. '
                '4) Pas de commentaire, pas de réponse de ta part, pas d\'outil : tu es seulement la voix qui traduit. '
                'Montants, dates, heures, noms et numéros traduits fidèlement. '
                '5) Exception : si Kouider dit « Dzaryx, … » il te parle à toi (réponds en français), '
                'et « stop traduction » / « arrête de traduire » → appelle interpreter avec on:false.')

    async def wait_silent(self, max_s: float = 15) -> None:
        """Attend que Dzaryx ait fini de parler (réponse terminée + voix jouée)."""
        end = time.monotonic() + max_s
        await asyncio.sleep(0.3)
        while (self.responding or self.out) and time.monotonic() < end:
            await asyncio.sleep(0.1)
        await asyncio.sleep(0.4)


async def speak(http: aiohttp.ClientSession, api: ApiFn, text: str, actor: str, voice: str | None = None) -> bytes:
    """Fait dire `text` par la voix des appels → PCM 24 kHz mono 16 bits. Gemini Live (gratuit) d'abord,
    OpenAI seulement pour essayer une de ses voix (« voix N ») ou si Gemini est en panne."""
    if voice is None and time.monotonic() >= gemini_out_until:
        try:
            pcm = await speak_gemini(http, api, text, actor)
            gemini_ok()
            return pcm
        except Exception as e:
            gemini_failed(e)
            log.warning('voix Gemini pour le vocal: %s → OpenAI', str(e)[:160])
    if time.monotonic() < openai_out_until:
        raise RuntimeError('OpenAI sans crédit')
    res = await api('/api/call/realtime', {}, actor, 20)
    pcm = bytearray()
    async with http.ws_connect(
            f"wss://api.openai.com/v1/realtime?model={res.get('model', 'gpt-realtime')}",
            headers={'Authorization': f"Bearer {res['key']}"}, max_msg_size=0) as ws:
        await ws.send_str(json.dumps({'type': 'session.update', 'session': {
            'type': 'realtime', 'tools': [],
            'instructions': 'Tu es une voix de lecture. Lis le texte fourni EXACTEMENT, mot pour mot, en français, '
                            'ton naturel et chaleureux, sans rien ajouter ni commenter.',
            'audio': {'input': {'turn_detection': None},
                      'output': {'voice': voice or res.get('voice') or 'cedar'}}}}))
        await ws.send_str(json.dumps({'type': 'response.create', 'response': {
            'output_modalities': ['audio'], 'conversation': 'none', 'input': [],
            'instructions': 'Prononce EXACTEMENT ce texte, mot pour mot, et RIEN d\'autre (pas d\'introduction, '
                            f'pas de « d\'accord », pas de commentaire) : « {text} »'}}))
        async for msg in ws:
            if msg.type != aiohttp.WSMsgType.TEXT:
                break
            ev = json.loads(msg.data)
            t = ev.get('type', '')
            if t in ('response.output_audio.delta', 'response.audio.delta'):
                pcm.extend(base64.b64decode(ev['delta']))
            elif t == 'response.done':
                break
            elif t == 'error':
                raise RuntimeError(ev.get('error'))
    if not pcm:
        raise RuntimeError('aucun son reçu')
    return bytes(pcm)


async def speak_gemini(http: aiohttp.ClientSession, api: ApiFn, text: str, actor: str) -> bytes:
    res = await api('/api/call/realtime-gemini', {}, actor, 20)
    res = {**res, 'tools': [], 'instructions': 'Tu es une voix de lecture. Lis le texte fourni EXACTEMENT, mot pour mot, '
           'en français, ton naturel et chaleureux, sans rien ajouter ni commenter.'}
    ws = await GeminiLiveWS.connect(http, res)
    pcm = bytearray()
    try:
        await ws.receive(timeout=8)   # session.created
        await ws.send_str(json.dumps({'type': 'response.create', 'response': {'instructions':
            f'Prononce EXACTEMENT ce texte, mot pour mot, et RIEN d\'autre : « {text} »'}}))
        async def collect() -> None:
            async for msg in ws:
                ev = json.loads(msg.data)
                if ev['type'] == 'response.output_audio.delta':
                    pcm.extend(base64.b64decode(ev['delta']))
                elif ev['type'] == 'response.done':
                    return
        await asyncio.wait_for(collect(), 90)
    finally:
        await ws.close()
    if not pcm:
        raise RuntimeError('aucun son reçu')
    return bytes(pcm)
