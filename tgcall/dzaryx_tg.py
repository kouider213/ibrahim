"""Dzaryx sur Telegram — vrais appels vocaux + messages, via un compte Telegram (userbot).

- Appel sortant : dès qu'un appel est en attente côté backend (/api/call/pending, ex. outil call_me),
  Dzaryx appelle Kouider/Houari sur Telegram, dit sa phrase d'accueil puis converse.
- Appel entrant : Kouider/Houari appelle le compte Dzaryx → il décroche et converse.
- Messages privés : texte → réponse texte ; vocal → réponse vocale.

Conversation : on enregistre la voix reçue (PCM 16 kHz), détection de fin de phrase par énergie,
puis /api/transcribe → /api/call/turn (cerveau Dzaryx, synchrone) → mp3 rejoué dans l'appel.
"""
import asyncio
import audioop
import base64
import io
import json
import logging
import os
import random
import re
import subprocess
import tempfile
import time
import wave
from pathlib import Path

import aiohttp
from pyrogram import Client, enums, filters as pfilters, raw
from pyrogram.types import Message
from pytgcalls import PyTgCalls, filters as cfilters
from pytgcalls.types.raw import AudioParameters, VideoParameters
from pytgcalls.types import (
    CallConfig, ChatUpdate, Device, Direction, ExternalMedia, MediaStream, RecordStream,
    StreamEnded, StreamFrames,
)

from ntgcalls import VideoRotation
from realtime import IN_RATE, OUT_RATE, RealtimeCall, speak
import face
import speaker

HERE = Path(__file__).parent


def load_env(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith('#') and '=' in line:
            k, v = line.split('=', 1)
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


load_env(HERE / '.env')

API_ID = int(os.environ['TG_API_ID'])
API_HASH = os.environ['TG_API_HASH']
BACKEND = os.environ.get('BACKEND_URL', 'https://ibrahim-backend-production.up.railway.app').rstrip('/')
TOKEN = os.environ['ACCESS_TOKEN']
# actor → identifiant Telegram (id numérique ou @username)
PEERS = {a: os.environ[f'{a.upper()}_TG'] for a in ('kouider', 'houari') if os.environ.get(f'{a.upper()}_TG')}
POLL_S = float(os.environ.get('POLL_S', '4'))
RETRY_S = float(os.environ.get('RETRY_S', '600'))   # appel manqué → 2e essai 10 min plus tard (une seule fois)
RETRY_TAG = "tu n'avais pas décroché"
# Voix temps réel (OpenAI Realtime) : discussion naturelle. 0 → ancienne chaîne (transcription → Dzaryx → voix).
REALTIME = os.environ.get('REALTIME', '1') == '1'
# « appels claude on » (Telegram) : les appels passent par le cerveau Claude (tous les outils, plus intelligent, un peu plus
# lent et payant) au lieu de la voix gratuite Gemini Live. Sinon Gemini d'abord, et bascule sur Claude s'il bloque (24/10).
CLAUDE_CALLS = HERE / 'cache' / 'claude-calls'
NO_FACE = HERE / 'cache' / 'no-face'          # « visage off » : appels sans le visage animé de Dzaryx
FACE_CALLS_CMD = re.compile(r'^visage\s+(on|off|oui|non)$', re.I)
CLAUDE_CALLS_CMD = re.compile(r'^appels?\s+claude\s+(on|off|oui|non)$', re.I)

SAMPLE_RATE = 16000
SPEECH_RMS = int(os.environ.get('SPEECH_RMS', '600'))   # seuil de voix (PCM 16 bits)
END_SILENCE_S = float(os.environ.get('END_SILENCE_S', '1.1'))  # silence qui termine une phrase (0.7 coupait Kouider en pleine phrase)
MIN_SPEECH_S = 0.35
MAX_UTTERANCE_S = 30

logging.basicConfig(level=logging.INFO, format='%(asctime)s [tg] %(message)s')
log = logging.getLogger('dzaryx-tg')
logging.getLogger('pyrogram').setLevel(logging.WARNING)
if os.environ.get('TG_DEBUG') == '1':   # journaux natifs de la connexion d'appel (ICE/relais) → ntg-debug.log
    _h = logging.FileHandler(HERE / 'ntg-debug.log')
    _h.setFormatter(logging.Formatter('%(asctime)s %(name)s %(message)s'))
    for _n in ('ntgcalls', 'webrtc'):
        logging.getLogger(_n).setLevel(logging.DEBUG)
        logging.getLogger(_n).addHandler(_h)
        logging.getLogger(_n).propagate = False

app = Client('dzaryx', api_id=API_ID, api_hash=API_HASH, workdir=str(HERE))
calls = PyTgCalls(app)


class _RelayOnly:
    """Appels par les relais de Telegram uniquement (18/10 : en direct en IPv6, le téléphone n'envoyait plus que
    des paquets vides → appel muet dans les deux sens ; par relais ça marchait). TG_P2P=1 pour revenir au direct."""
    def __init__(self, binding) -> None:
        self._b = binding

    def __getattr__(self, name: str):
        return getattr(self._b, name)

    def get_protocol(self):
        # TG_VERSIONS=13.0.0,12.0.0 : versions du protocole d'appel annoncées à Telegram (vide = celles de ntgcalls)
        p = self._b.get_protocol()
        want = [v.strip() for v in os.environ.get('TG_VERSIONS', '').split(',') if v.strip()]
        if want:
            p.library_versions = want
        return p

    async def connect_p2p(self, chat_id, servers, versions, p2p_allowed, *rest):
        log.info('connexion appel : versions %s, %d serveurs relais, paramètres %s', versions, len(servers or []), rest[:1])
        return await self._b.connect_p2p(chat_id, servers, versions, False, *rest)


if os.environ.get('TG_P2P', '0') != '1':
    calls._binding = _RelayOnly(calls._binding)
http: aiohttp.ClientSession | None = None

# user_id → actor, résolu au démarrage
peer_actor: dict[int, str] = {}
actor_peer: dict[str, int] = {}


class CallState:
    def __init__(self, actor: str):
        self.actor = actor
        self.speaking_until = 0.0     # Dzaryx parle → on n'écoute pas (pas d'écho)
        self.busy = False             # un tour est en cours de traitement
        self.task: asyncio.Task | None = None
        self.turn_pcm = b''           # voix du tour en cours (si Kouider continue sa phrase → on fusionne)
        self.answered = False         # Dzaryx a commencé à répondre (au-delà du « Mmh »)
        self.rt: RealtimeCall | None = None   # voix temps réel (sinon ancienne chaîne)
        self.outgoing = False         # c'est Dzaryx qui appelle (motif en attente)
        self.greeting = ''            # ce que Dzaryx voulait dire (appel muet raccroché → message écrit)
        self.buf = bytearray()
        self.voiced_s = 0.0
        self.silence_s = 0.0
        self.in_rate = SAMPLE_RATE    # 24 kHz si l'appel a commencé en voix temps réel puis basculé (enregistrement déjà lancé)
        self.rc_state = None
        self.eye_task: asyncio.Task | None = None   # L'ŒIL : regard continu pendant un appel vidéo


EYE_EVERY_S = float(os.environ.get('EYE_EVERY_S', '8'))
EYE_NOTE = ("L'ŒIL est actif : tu vois sa caméra en continu et tu te souviens de tout ce que tu as vu (outil memoire_visuelle "
            "pour « où j'ai posé… », « c'était combien… »). S'il te demande de guetter quelque chose (« préviens-moi si tu vois … »), "
            "utilise memoire_visuelle action=watch.")


async def eye_loop(user_id: int) -> None:
    """L'ŒIL : caméra allumée pendant l'appel → une image toutes les ~8 s au backend (mémoire visuelle). S'il remarque
    quelque chose d'utile (texte étranger, courrier, danger, chose à guetter), Dzaryx le dit de lui-même — seulement
    quand personne ne parle, et seulement à Kouider."""
    noted = False
    while True:
        st = active.get(user_id)
        if not st or not st.rt or st.rt.closed or st.actor != speaker.OWNER:
            return
        rt = st.rt
        jpg = await asyncio.to_thread(rt.snapshot) if rt.who == speaker.OWNER else None
        if jpg:
            try:
                if not noted:
                    noted = True
                    await rt._send({'type': 'conversation.item.create', 'item': {'type': 'message', 'role': 'system',
                                    'content': [{'type': 'input_text', 'text': EYE_NOTE}]}})
                res = await api('/api/call/eye', {'image': jpg}, st.actor, 30)
                say = (res or {}).get('say')
                if say and not rt.responding and not rt.out and not rt.closed:
                    log.info('œil → %s', say[:120])
                    await rt._send({'type': 'response.create', 'response': {'instructions':
                                    f'Tu viens de remarquer ça à sa caméra : dis-le-lui spontanément, en une phrase naturelle et courte : « {say} »'}})
            except Exception as e:
                log.warning('œil: %s', str(e)[:160])
        await asyncio.sleep(EYE_EVERY_S)


active: dict[int, CallState] = {}
last_call: dict[int, float] = {}   # user_id → monotonic du dernier appel (entrant ou sortant)
call_ended: dict[int, float] = {}  # user_id → monotonic de la fin du dernier appel
# Recomposer juste après un raccroché fait planter ntgcalls (SIGSEGV le 18/10 : 2e appel 3 s après le 1er).
CALL_GAP_S = float(os.environ.get('CALL_GAP_S', '15'))
ROTATION = {VideoRotation.VIDEO_ROTATION_0: 0, VideoRotation.VIDEO_ROTATION_90: 90,
            VideoRotation.VIDEO_ROTATION_180: 180, VideoRotation.VIDEO_ROTATION_270: 270}


# ── Backend ──────────────────────────────────────────────────────────────────

async def api(path: str, body: dict, actor: str, timeout: float = 90) -> dict:
    assert http is not None
    async with http.post(
        f'{BACKEND}{path}', json={**body, 'actor': actor},
        headers={'Authorization': f'Bearer {TOKEN}'},
        timeout=aiohttp.ClientTimeout(total=timeout),
    ) as r:
        if r.status >= 400:
            raise RuntimeError(f'{path} HTTP {r.status}: {(await r.text())[:200]}')
        return await r.json()


async def api_stream(path: str, body: dict, actor: str, timeout: float = 90):
    """NDJSON : rend chaque ligne dès qu'elle arrive (1re phrase de Dzaryx avant la suite)."""
    assert http is not None
    async with http.post(
        f'{BACKEND}{path}', json={**body, 'actor': actor},
        headers={'Authorization': f'Bearer {TOKEN}'},
        timeout=aiohttp.ClientTimeout(total=timeout),
    ) as r:
        if r.status >= 400:
            raise RuntimeError(f'{path} HTTP {r.status}: {(await r.text())[:200]}')
        async for line in r.content:
            if line.strip():
                yield json.loads(line)


# Petits « Mmh… » joués dès la fin de ta phrase : on sait tout de suite qu'il a entendu,
# pendant qu'il transcrit / réfléchit / génère la voix. Générés une fois via /api/tts.
FILLERS = ['Mmh…', 'Je regarde.', 'Ok, attends.', 'Deux secondes.']
LONG_FILLERS = ['Je cherche, deux secondes.', 'Je regarde ça, un instant.']   # si la réponse tarde (> 3,5 s)
LONG_WAIT_S = 3.5
FILLER_DIR = HERE / 'fillers'


async def ensure_fillers() -> None:
    FILLER_DIR.mkdir(exist_ok=True)
    for i, text in enumerate(FILLERS + LONG_FILLERS):
        f = FILLER_DIR / (f'{i}.mp3' if i < len(FILLERS) else f'long{i - len(FILLERS)}.mp3')
        if f.exists():
            continue
        try:
            res = await api('/api/tts', {'text': text}, 'kouider', 30)
            f.write_bytes(base64.b64decode(res['audio']))
        except Exception as e:
            log.warning('filler %r: %s', text, e)


async def play_filler(user_id: int, long: bool = False) -> None:
    files = list(FILLER_DIR.glob('long*.mp3' if long else '[0-9]*.mp3'))
    if not files:
        return
    try:
        await calls.play(user_id, MediaStream(str(random.choice(files)), AudioParameters(48000, 1),
                                              video_flags=MediaStream.Flags.IGNORE))
    except Exception as e:
        log.warning('filler: %s', e)


def pcm_to_wav(pcm: bytes) -> bytes:
    out = io.BytesIO()
    with wave.open(out, 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SAMPLE_RATE)
        w.writeframes(pcm)
    return out.getvalue()


def save_mp3(b64: str) -> str:
    f = tempfile.NamedTemporaryFile(prefix='dz_', suffix='.mp3', delete=False)
    f.write(base64.b64decode(b64))
    f.close()
    return f.name


def concat_mp3(paths: list[str]) -> str:
    """Plusieurs phrases → un seul fichier : un seul flux joué, donc pas de blanc entre les phrases."""
    if len(paths) == 1:
        return paths[0]
    out = tempfile.NamedTemporaryFile(prefix='dzc_', suffix='.wav', delete=False).name
    try:
        ins = [a for p in paths for a in ('-i', p)]
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', *ins, '-filter_complex',
                        f'concat=n={len(paths)}:v=0:a=1', '-ar', '48000', '-ac', '1', out],
                       check=True, timeout=10)
        return out
    except Exception as e:
        log.warning('concat: %s', e)
        return paths[0]


def mp3_duration(path: str) -> float:
    try:
        out = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration',
                              '-of', 'csv=p=0', path], capture_output=True, text=True, timeout=10)
        return float(out.stdout.strip())
    except Exception:
        return 5.0


# ── Appel : parler / écouter ─────────────────────────────────────────────────

async def say(user_id: int, audio_b64: str | None, first: bool = False, path: str | None = None) -> None:
    st = active.get(user_id)
    if (not audio_b64 and not path) or st is None:
        return
    path = path or save_mp3(audio_b64)
    st.speaking_until = time.monotonic() + mp3_duration(path) + 0.4
    stream = MediaStream(path, AudioParameters(48000, 1), video_flags=MediaStream.Flags.IGNORE)
    if first:
        # Lance (ou décroche) l'appel avec la phrase d'accueil, puis on écoute.
        await calls.play(user_id, stream, CallConfig(timeout=45))
        st.speaking_until = time.monotonic() + mp3_duration(path) + 0.4
        await calls.record(user_id, RecordStream(True, AudioParameters(SAMPLE_RATE, 1)))
    else:
        log.info('lecture réponse (%.1fs)', mp3_duration(path))
        await calls.play(user_id, stream)
        log.info('lecture lancée')


async def handle_utterance(user_id: int, pcm: bytes) -> None:
    st = active.get(user_id)
    if st is None:
        return
    st.busy = True
    st.answered = False
    st.turn_pcm = pcm
    t0 = time.monotonic()
    try:
        await play_filler(user_id)
        wav_b64 = base64.b64encode(pcm_to_wav(pcm)).decode()
        tr = await api('/api/transcribe', {'audio': wav_b64, 'mimeType': 'audio/wav', 'provider': 'fast'},
                       st.actor, 40)
        text = (tr.get('text') or '').strip()
        log.info('%s a dit: %r', st.actor, text)
        if not text:
            return
        t1 = time.monotonic()

        # Les phrases arrivent en flux : la 1re est jouée tout de suite, les suivantes sont mises de côté
        # pendant qu'elle se joue, puis jouées ENSEMBLE (un seul fichier → pas de trou entre les phrases).
        queue: asyncio.Queue = asyncio.Queue()

        async def reader() -> None:
            try:
                async for part in api_stream('/api/call/turn', {'message': text, 'stream': True}, st.actor):
                    if part.get('audio'):
                        await queue.put(part)
            except Exception as e:
                log.error('réponse en flux: %s', e)
            finally:
                await queue.put(None)

        rtask = asyncio.create_task(reader())
        try:
            try:
                part = await asyncio.wait_for(queue.get(), LONG_WAIT_S)
            except asyncio.TimeoutError:
                await play_filler(user_id, long=True)       # « Je cherche, deux secondes. » : la ligne n'est pas morte
                part = await queue.get()
            if part is None:
                return
            log.info('Dzaryx (stt %.1fs, 1re phrase %.1fs): %r', t1 - t0, time.monotonic() - t1,
                     (part.get('text') or '')[:120])
            st.answered = True
            await say(user_id, part['audio'])
            done = False
            while not done:
                wait = st.speaking_until - 0.4 - time.monotonic()
                if wait > 0:
                    await asyncio.sleep(wait)
                if active.get(user_id) is not st:
                    return
                paths: list[str] = []
                nxt = await queue.get()                   # attend au moins la phrase suivante
                while nxt is not None:
                    paths.append(save_mp3(nxt['audio']))
                    if queue.empty():
                        break
                    nxt = queue.get_nowait()
                if nxt is None:
                    done = True
                if paths:
                    await say(user_id, None, path=concat_mp3(paths))
        finally:
            rtask.cancel()
    except asyncio.CancelledError:
        log.info('tour annulé : Kouider continuait sa phrase')
        raise
    except Exception as e:
        log.error('tour échoué: %s', e)
    finally:
        if st.task is asyncio.current_task():
            st.busy = False


def start_turn(user_id: int, pcm: bytes) -> None:
    st = active.get(user_id)
    if st is None:
        return
    st.task = asyncio.create_task(handle_utterance(user_id, pcm))


@calls.on_update(cfilters.stream_frame(Direction.INCOMING))
async def on_frames(_, update: StreamFrames) -> None:
    st = active.get(update.chat_id)
    if update.device == Device.CAMERA:       # appel vidéo : on garde la dernière image
        if st is not None and st.rt is not None and update.frames:
            fr = update.frames[-1]
            st.rt.feed_video(fr.frame, fr.info.width, fr.info.height, ROTATION.get(fr.info.rotation, 0))
            if st.eye_task is None and st.actor == speaker.OWNER:
                st.eye_task = asyncio.create_task(eye_loop(update.chat_id))
        return
    if update.device == Device.SCREEN:
        return
    if st is not None and st.rt is not None:
        for fr in update.frames:
            st.rt.feed(fr.frame)
        return
    # On écoute aussi pendant que Dzaryx réfléchit (avant sa réponse) : si Kouider reprend sa phrase,
    # on annule le tour en cours et on repart avec toute la phrase. Pendant qu'il parle : pas d'écoute (écho).
    if st is None or (st.busy and st.answered) or time.monotonic() < st.speaking_until:
        if st is not None:
            st.buf.clear(); st.voiced_s = 0.0; st.silence_s = 0.0
        return
    for fr in update.frames:
        data = fr.frame
        if st.in_rate != SAMPLE_RATE and data:
            data, st.rc_state = audioop.ratecv(data, 2, 1, st.in_rate, SAMPLE_RATE, st.rc_state)
        dur = len(data) / (2 * SAMPLE_RATE)
        rms = audioop.rms(data, 2) if data else 0
        if rms >= SPEECH_RMS:
            st.voiced_s += dur
            st.silence_s = 0.0
            st.buf.extend(data)
        elif st.buf:
            st.silence_s += dur
            st.buf.extend(data)
        total = len(st.buf) / (2 * SAMPLE_RATE)
        if st.buf and (st.silence_s >= END_SILENCE_S or total >= MAX_UTTERANCE_S):
            pcm = bytes(st.buf)
            enough = st.voiced_s >= MIN_SPEECH_S
            st.buf.clear(); st.voiced_s = 0.0; st.silence_s = 0.0
            if enough:
                if st.busy and not st.answered and st.task and not st.task.done():
                    st.task.cancel()
                    pcm = st.turn_pcm + pcm
                    log.info('Kouider continue sa phrase → je fusionne et je relance')
                start_turn(update.chat_id, pcm)
            return


@calls.on_update(cfilters.chat_update(ChatUpdate.Status.INCOMING_CALL))
async def on_incoming(_, update: ChatUpdate) -> None:
    actor = peer_actor.get(update.chat_id)
    if actor is None:
        log.info('appel entrant ignoré de %s (inconnu)', update.chat_id)
        return
    await start_call(actor, update.chat_id)


@calls.on_update(cfilters.chat_update(ChatUpdate.Status.LEFT_CALL))
async def on_left(_, update: ChatUpdate) -> None:
    st = active.pop(update.chat_id, None)
    call_ended[update.chat_id] = time.monotonic()
    if not active:
        asyncio.create_task(tg_live(False))
    if st:
        if st.rt:
            await st.rt.close()
            asyncio.create_task(remember_call(update.chat_id, st.actor, st.rt))
            # Raccroché avant le contrôle des 12 s (23/10 15h : 10 s de silence total) → même traitement qu'un appel muet
            if st.outgoing and st.rt.rms_max == 0 and st.rt.n_in >= 200:
                log.warning('appel MUET raccroché par %s : %d tranches, volume 0 → j\'écris', st.actor, st.rt.n_in)
                asyncio.create_task(missed_call(st.actor, update.chat_id, st.greeting, None, why='muet', tip=MUTE_TIP))
        log.info('appel terminé avec %s', update.chat_id)


async def remember_call(user_id: int, actor: str, rt: RealtimeCall) -> None:
    """Mémoire des appels : résumé + choses à faire gardés par Dzaryx, et envoyés en message Telegram."""
    try:
        await asyncio.to_thread(rt.learn_at_end)
    except Exception as e:
        log.warning('apprentissage de la voix: %s', e)
    if any(l['role'] == 'user' for l in rt.lines):
        asyncio.create_task(call_event('ok'))
    if not rt.lines:
        return
    try:
        res = await api('/api/call/summary', {'lines': rt.lines, 'durationS': time.monotonic() - rt.started}, actor, 60)
        mem = res.get('memory')
        if not mem:
            log.info('appel sans rien à retenir')
            return
        text = f"📞 Résumé de l'appel\n{mem['summary']}"
        if mem.get('todos'):
            text += '\n\nÀ faire :\n' + '\n'.join(f'• {t}' for t in mem['todos'])
        await app.send_message(user_id, text)
        log.info('appel retenu : %r', mem['summary'][:120])
    except Exception as e:
        log.error('mémoire de l\'appel: %s', e)


@calls.on_update(cfilters.stream_end())
async def on_end(_, update: StreamEnded) -> None:
    st = active.get(update.chat_id)
    log.info('fin de flux %s %s', update.stream_type, update.device)
    if st:
        st.speaking_until = min(st.speaking_until, time.monotonic() + 0.3)


async def start_call(actor: str, user_id: int) -> None:
    if user_id in active:
        return
    last_call[user_id] = time.monotonic()
    active[user_id] = CallState(actor)
    asyncio.create_task(tg_live(True))
    if REALTIME and not CLAUDE_CALLS.exists() and await start_realtime(actor, user_id):
        return
    ans: dict | None = None
    try:
        # answer = phrase d'accueil (motif de l'appel en attente, sinon "je t'écoute") + retire l'attente
        ans = await api('/api/call/answer', {}, actor)
        log.info('appel %s → %r', actor, ans.get('text'))
        await say(user_id, ans.get('audio'), first=True)
    except Exception as e:
        log.error('appel %s impossible: %s', actor, e)
        active.pop(user_id, None)
        if ans and ans.get('incoming'):
            await missed_call(actor, user_id, ans.get('text') or '', e)
        try:
            await calls.leave_call(user_id)
        except Exception:
            pass


async def call_event(kind: str) -> None:
    """Santé des appels (bilan du matin) : ok / muet / manque / bascule (voix gratuite bloquée → Claude)."""
    try:
        await api('/api/call/health-event', {'kind': kind}, 'kouider', 10)
    except Exception as e:
        log.warning('santé des appels: %s', e)


async def tg_live(live: bool) -> None:
    """Appel Telegram en cours : l'app Dzaryx de l'iPhone lâche son micro (sinon Telegram n'envoie que du silence)."""
    try:
        await api('/api/call/tg-live', {'live': live}, 'kouider', 10)
    except Exception as e:
        log.warning('tg-live: %s', e)


async def missed_call(actor: str, user_id: int, reason: str, err: Exception | None, why: str = '', tip: str = '') -> None:
    """Kouider n'a pas décroché : il reçoit par écrit ce que Dzaryx voulait lui dire. Pas décroché / refusé → « ne pas
    déranger » côté serveur (hold) : plus d'appel ni de message tant qu'il n'a pas répondu (Kouider 20/10). Son muet → 2e essai."""
    why = why or ('occupé' if 'Busy' in type(err).__name__ else 'pas de réponse')
    asyncio.create_task(call_event('muet' if why == 'muet' else 'manque'))
    hold = False
    try:   # gardé pour son prochain appel (« avant tout, j'ai des choses pour toi »), retiré si le 2e essai passe
        hold = bool((await api('/api/call/missed', {'reason': strip_greeting(reason), 'why': why}, actor, 15)).get('hold'))
    except Exception as e:
        log.warning('boîte des appels: %s', e)
    retry = not hold and RETRY_TAG not in reason          # un seul nouvel essai, jamais en boucle
    try:
        if hold:
            later = ("🔕 Je n'insiste pas : silence pendant 1 h (ou jusqu'à ton message), puis je t'envoie ce que j'avais pour toi.\n"
                     "Si tu es pris plus longtemps, dis-moi à partir de quelle heure je peux te rappeler (ex. « dispo à 15h »).")
        else:
            later = (f'Je réessaie dans {int(RETRY_S // 60)} min, ou rappelle-moi quand tu veux.'
                     if retry else 'Rappelle-moi quand tu veux.')
        await app.send_message(user_id, f'📞 Appel manqué ({why}). Je voulais te dire :\n{strip_greeting(reason)}\n\n{tip}{later}')
        log.info('appel manqué → message envoyé%s', ' (ne pas déranger)' if hold else '')
    except Exception as e:
        log.error('message appel manqué: %s', e)
    if retry:
        asyncio.create_task(retry_call(actor, user_id, reason))


def strip_greeting(greeting: str) -> str:
    """« Allô Kouider, c'est Dzaryx. Je te rappelle, tu n'avais pas décroché. X » → « X »."""
    s = re.sub(r"^Allô [^,]+, c'est Dzaryx\.\s*", '', greeting).strip()
    s = re.sub(r"^Je te rappelle, tu n'avais pas décroché\.\s*", '', s).strip()
    return s or greeting


async def retry_call(actor: str, user_id: int, greeting: str) -> None:
    """2e essai, sauf si on s'est parlé entre-temps (il a rappelé, ou un autre appel a eu lieu)."""
    missed_at = time.monotonic()
    await asyncio.sleep(RETRY_S)
    if user_id in active or last_call.get(user_id, 0) > missed_at:
        log.info("2e essai annulé : on s'est parlé entre-temps")
        return
    reason = strip_greeting(greeting)
    try:
        await api('/api/call/retry', {'reason': reason}, actor)
        log.info('2e essai lancé pour %s', actor)
    except Exception as e:
        log.error('2e essai: %s', e)


def call_tools(user_id: int) -> dict:
    """Outils de la voix temps réel exécutés ici : message écrit et raccrocher."""
    async def send_text_to_me(args: dict) -> tuple[str, bool]:
        text = (args.get('text') or '').strip()
        if not text:
            return 'Texte vide, rien envoyé.', True
        await app.send_message(user_id, text)
        return '✅ Envoyé sur Telegram.', True

    async def end_call(_: dict) -> tuple[str, bool]:
        st = active.get(user_id)
        # 31/10 12h56 : Kouider appelle, rien de lui n'est transcrit, Gemini imagine « sa femme a décroché » et raccroche.
        # Il ne raccroche jamais sur quelqu'un dont il n'a compris aucune phrase.
        if st and st.rt and not any(l['role'] == 'user' for l in st.rt.lines):
            return ('PAS RACCROCHÉ : tu n\'as encore compris aucune phrase de lui (ligne ou bruit). Ne raccroche pas : '
                    'dis « je t\'entends mal, tu peux répéter ? » et attends.'), True
        asyncio.create_task(hang_up(user_id))
        return 'Raccroché.', False

    async def look(_: dict) -> tuple[str, bool]:
        st = active.get(user_id)
        if st and st.rt and await st.rt.show_camera(force=True):
            return 'Image de la caméra ajoutée : décris ce que tu vois.', True
        return 'Caméra coupée : aucune image. Demande-lui d\'activer la vidéo dans Telegram.', True

    async def pc_look(_: dict) -> tuple[str, bool]:
        st = active.get(user_id)
        if not st or not st.rt:
            return 'Vue du PC indisponible.', True
        res = await api('/api/call/pc-look', {}, st.actor, 30)
        if not res.get('ok') or not res.get('image'):
            return f"Je ne vois pas l'écran du PC : {res.get('error') or 'capture impossible'}.", True
        await st.rt.show_image(res['image'])
        return "Image de l'écran du PC ajoutée : décris ce que tu vois (fenêtres, textes lisibles), sans inventer.", True

    async def whatsapp_link(args: dict) -> tuple[str, bool]:
        st = active.get(user_id)
        actor = st.actor if st else 'kouider'
        res = await api('/api/call/tool', {'name': 'whatsapp_link', 'input': args}, actor, 20)
        if not res.get('ok') or not res.get('link'):
            return res.get('text') or 'Lien impossible.', True
        await app.send_message(user_id, f"💬 WhatsApp pour {res.get('client')} — appuie pour envoyer :\n\n"
                                        f"{args.get('message', '').strip()}\n\n👉 {res['link']}",
                               disable_web_page_preview=True)
        return f"✅ Lien WhatsApp pour {res.get('client')} envoyé à Kouider sur Telegram. Il n'a plus qu'à appuyer.", True

    async def send_contract(args: dict) -> tuple[str, bool]:
        st = active.get(user_id)
        actor = st.actor if st else 'kouider'
        res = await api('/api/call/tool', {'name': 'send_contract', 'input': args}, actor, 30)
        if not res.get('ok') or not res.get('link'):
            return res.get('text') or 'Contrat impossible.', True
        await app.send_message(user_id, f"✍️ Contrat à signer pour {res.get('client')} — appuie pour l'envoyer sur WhatsApp :\n\n"
                                        f"{res.get('message', '')}\n\n👉 {res['link']}",
                               disable_web_page_preview=True)
        return f"✅ Lien WhatsApp du contrat pour {res.get('client')} envoyé à Kouider sur Telegram. Il n'a plus qu'à appuyer.", True

    async def interpreter(args: dict) -> tuple[str, bool]:
        st = active.get(user_id)
        if not st or not st.rt:
            return 'Mode interprète indisponible.', True
        log.info('interprète %s (%s)', 'ON' if args.get('on') else 'OFF', args.get('language', ''))
        return await st.rt.set_interpreter(bool(args.get('on')), str(args.get('language') or '')), True

    async def call_back_later(args: dict) -> tuple[str, bool]:
        """Quelqu'un d'autre a décroché : on rappelle Kouider plus tard avec le VRAI motif (jamais dit à la personne)."""
        st = active.get(user_id)
        if st and not st.outgoing:   # c'est LUI qui appelle : personne d'autre « n'a décroché » (31/10 12h56)
            return ('REFUSÉ : c\'est Kouider qui t\'appelle lui-même depuis son Telegram, personne d\'autre n\'a décroché. '
                    'Ne raccroche pas : demande-lui ce qu\'il veut (« je t\'écoute, vas-y »).'), True
        held = strip_greeting(st.rt.held_greeting) if st and st.rt and st.rt.held_greeting else ''
        who = (args.get('who_answered') or '').strip()
        reason = held or 'Je te rappelle comme prévu.'
        if who:
            reason = f"{who} m'a dit que tu serais là. {reason}"
        inp = {k: args[k] for k in ('delay_minutes', 'at_time', 'at_date') if args.get(k)}
        if not inp:
            return 'Il me faut une heure ou un délai (« vers 18h », « dans une heure »). Demande-le gentiment.', True
        res = await api('/api/call/tool', {'name': 'call_me', 'input': {**inp, 'reason': reason}}, st.actor if st else 'kouider', 20)
        return (res.get('text') or 'Rappel programmé.') + ' Dis simplement que tu rappelleras Kouider à ce moment-là, sans dire pourquoi.', True

    async def leave_message(args: dict) -> tuple[str, bool]:
        text = (args.get('text') or '').strip()
        if not text:
            return 'Message vide.', True
        frm = (args.get('from') or '').strip() or 'quelqu\'un'
        await app.send_message(user_id, f'📝 Message de {frm} (au téléphone avec Dzaryx) :\n{text}')
        return '✅ Message transmis à Kouider par écrit.', True

    async def learn_voice(args: dict) -> tuple[str, bool]:
        st = active.get(user_id)
        return (await st.rt.learn_voice(str(args.get('name') or '')) if st and st.rt else 'Indisponible.'), True

    async def verify_code(args: dict) -> tuple[str, bool]:
        st = active.get(user_id)
        if not st or not st.rt:
            return 'Indisponible.', True
        out = await st.rt.verify_code(str(args.get('code') or ''))
        return out, not out.startswith('✅')   # code bon → la bascule relance elle-même la parole

    return {'send_text_to_me': send_text_to_me, 'end_call': end_call, 'look': look, 'pc_look': pc_look,
            'whatsapp_link': whatsapp_link, 'send_contract': send_contract, 'interpreter': interpreter,
            'call_back_later': call_back_later, 'leave_message': leave_message, 'learn_voice': learn_voice,
            'verify_code': verify_code}


async def hang_up(user_id: int) -> None:
    st = active.get(user_id)
    if st and st.rt:
        await st.rt.wait_silent()          # finir son « au revoir »
    st = active.pop(user_id, None)
    call_ended[user_id] = time.monotonic()
    if not active:
        asyncio.create_task(tg_live(False))
    try:
        await calls.leave_call(user_id)
    except Exception as e:
        log.warning('raccrocher: %s', e)
    if st and st.rt:
        await st.rt.close()
        asyncio.create_task(remember_call(user_id, st.actor, st.rt))
    log.info('Dzaryx a raccroché')


async def start_realtime(actor: str, user_id: int) -> bool:
    """Appel en voix temps réel. False → on bascule sur l'ancienne chaîne."""
    st = active[user_id]
    assert http is not None
    rt = RealtimeCall(calls, http, api, user_id, actor, call_tools(user_id))
    try:
        # connexion OpenAI pendant que le téléphone sonne
        ans, _ = await asyncio.gather(api('/api/call/answer', {'noAudio': True}, actor), rt.connect())
    except Exception as e:
        log.error('voix temps réel indisponible (%s) → ancienne voix', e)
        await rt.close()
        return False
    st.rt = rt
    rt.on_stall = lambda why: switch_to_claude(user_id, rt, why)
    st.outgoing = bool(ans.get('incoming'))   # Dzaryx appelle (motif en attente) ≠ Kouider qui appelle
    greeting = ans.get('text') or 'Oui, je t\'écoute.'
    log.info('appel %s (temps réel) → %r', actor, greeting)
    st.greeting = greeting
    try:
        # Le visage animé de Dzaryx passe par la « caméra » (« visage off » sur Telegram pour revenir au son seul)
        rt.show_face = False   # visage retiré (Kouider 27/10 : « il va nous servir à rien »)
        if rt.show_face:
            from avatar_cute import FPS, H, W
            stream = MediaStream(ExternalMedia.AUDIO | ExternalMedia.VIDEO, AudioParameters(OUT_RATE, 1),
                                 VideoParameters(W, H, FPS, False))
        else:
            stream = MediaStream(ExternalMedia.AUDIO, AudioParameters(OUT_RATE, 1), video_flags=MediaStream.Flags.IGNORE)
        try:
            await calls.play(user_id, stream, CallConfig(timeout=45))
        except Exception as e:
            if not rt.show_face:
                raise
            log.warning('appel avec visage refusé (%s) → son seul', e)   # jamais d'appel perdu à cause de la vidéo
            rt.show_face = False
            await calls.play(user_id, MediaStream(ExternalMedia.AUDIO, AudioParameters(OUT_RATE, 1),
                                                  video_flags=MediaStream.Flags.IGNORE), CallConfig(timeout=45))
        await calls.record(user_id, RecordStream(True, AudioParameters(IN_RATE, 1), camera=os.environ.get('TG_CAMERA', '1') == '1'))
        rt.start_audio()
        await rt.greet(greeting, st.outgoing)
        asyncio.create_task(mute_guard(actor, user_id, rt, greeting, st.outgoing))
    except Exception as e:
        log.error('appel %s impossible: %s', actor, e)
        await rt.close()
        active.pop(user_id, None)
        if st.outgoing:
            await missed_call(actor, user_id, greeting, e)
        try:
            await calls.leave_call(user_id)
        except Exception:
            pass
    return True


MUTE_CHECK_S = float(os.environ.get('MUTE_CHECK_S', '12'))
MUTE_TIP = ('🔇 L\'appel était muet : ton téléphone n\'envoyait aucun son (micro/haut-parleur bloqués côté iPhone). '
            'Ferme l\'app Dzaryx (et toute app qui utilise le micro), vérifie le Bluetooth, puis rappelle-moi.\n\n')


async def switch_to_claude(user_id: int, rt: RealtimeCall, why: str) -> None:
    """La voix temps réel (Gemini) ne répond plus en plein appel : l'appel continue sur l'ancienne chaîne
    (transcription → cerveau Claude avec tous ses outils → voix), au lieu de laisser Kouider parler dans le vide."""
    st = active.get(user_id)
    if st is None or st.rt is not rt:
        return
    log.warning('appel %s : voix temps réel %s → je passe sur le cerveau Claude', st.actor, why)
    asyncio.create_task(call_event('bascule'))
    st.rt = None
    st.in_rate, st.rc_state = IN_RATE, None
    await rt.close()
    asyncio.create_task(remember_call(user_id, st.actor, rt))
    try:
        tts = await api('/api/tts', {'text': 'Pardon, je t\'entendais mal. C\'est bon, je t\'écoute : tu peux répéter ?'}, st.actor, 30)
        await say(user_id, tts.get('audio'))
    except Exception as e:
        log.warning('phrase de reprise: %s', e)


async def mute_guard(actor: str, user_id: int, rt: RealtimeCall, greeting: str, outgoing: bool) -> None:
    """Appel décroché mais 100 % silence reçu (volume 0 — même un micro au repos capte du bruit) :
    le son est bloqué côté téléphone (19/10). On ne laisse pas Kouider dans un appel muet : on raccroche,
    il reçoit le message par écrit + l'astuce, et un 2e essai (appel sortant)."""
    if rt.show_face:
        # 27/10 : 2 appels muets juste après l'ajout du visage animé → si rien n'arrive en 6 s, on retire la vidéo
        # SANS raccrocher (même flux, son seul) ; si le son revient, c'était la vidéo : on la coupe pour les appels suivants
        await asyncio.sleep(6)
        if rt.closed or active.get(user_id) is None or active[user_id].rt is not rt:
            return
        if rt.n_in >= 300 and rt.rms_max == 0:
            log.warning('appel avec visage MUET après 6 s → je passe en son seul sans raccrocher')
            rt.show_face = False
            try:
                await calls.play(user_id, MediaStream(ExternalMedia.AUDIO, AudioParameters(OUT_RATE, 1),
                                                      video_flags=MediaStream.Flags.IGNORE))
            except Exception as e:
                log.warning('passage en son seul : %s', e)
            await asyncio.sleep(MUTE_CHECK_S)
            if rt.closed or active.get(user_id) is None or active[user_id].rt is not rt:
                return
            if rt.rms_max > 0:
                log.warning('le son est revenu sans la vidéo → visage coupé pour les prochains appels (« visage on » pour réessayer)')
                NO_FACE.parent.mkdir(exist_ok=True)
                NO_FACE.touch()
                return
        else:
            await asyncio.sleep(max(0.0, MUTE_CHECK_S - 6))
    else:
        await asyncio.sleep(MUTE_CHECK_S)
    if rt.closed or active.get(user_id) is None or active[user_id].rt is not rt:
        return
    if rt.n_in < MUTE_CHECK_S * 50 or rt.rms_max > 0:   # 100 tranches/s attendues ; du son → tout va bien
        return
    log.warning('appel MUET : %d tranches reçues, volume 0 après %.0f s → je raccroche et j\'écris', rt.n_in, MUTE_CHECK_S)
    st = active.pop(user_id, None)
    call_ended[user_id] = time.monotonic()
    if not active:
        asyncio.create_task(tg_live(False))
    try:
        await calls.leave_call(user_id)
    except Exception as e:
        log.warning('raccrocher (muet): %s', e)
    await rt.close()
    if outgoing:
        await missed_call(actor, user_id, greeting, None, why='muet', tip=MUTE_TIP)
    else:
        try:
            await app.send_message(user_id, MUTE_TIP.strip())
        except Exception as e:
            log.error('message appel muet: %s', e)


async def send_outbox_message(uid: int, m: dict) -> None:
    try:
        text = (m.get('text') or '')[:4000]
        if m.get('album'):     # photos d'une voiture / d'un bien : album(s) de 10 max, légende sur la 1re
            from pyrogram.types import InputMediaPhoto
            urls = [x['url'] for x in m['album'] if x.get('url')]
            for i in range(0, len(urls), 10):
                chunk = urls[i:i + 10]
                media = [InputMediaPhoto(u, caption=(text[:1000] if i == 0 and j == 0 else '')) for j, u in enumerate(chunk)]
                try:
                    if len(media) == 1:
                        await app.send_photo(uid, chunk[0], caption=(text[:1000] if i == 0 else None) or None)
                    else:
                        await app.send_media_group(uid, media)
                except Exception as e:   # lien refusé par Telegram : on envoie au moins les liens
                    log.warning('album → Telegram: %s', e)
                    await app.send_message(uid, (text + '\n' if i == 0 and text else '') + '\n'.join(chunk), disable_web_page_preview=True)
        elif m.get('file'):      # pièce jointe d'un mail… : lien temporaire du backend → document Telegram
            async with aiohttp.ClientSession() as http:
                async with http.get(m['file']['url'], timeout=aiohttp.ClientTimeout(total=300)) as r:   # APK ~40 Mo
                    r.raise_for_status()
                    doc = io.BytesIO(await r.read())
            doc.name = (m['file'].get('name') or 'fichier')[:120]
            await app.send_document(uid, doc, caption=text[:1000] or None)
        elif m.get('location'):  # point GPS épinglé (salle de sport…) : s'ouvre dans Maps / Waze
            loc = m['location']
            await app.send_venue(uid, float(loc['lat']), float(loc['lng']), (loc.get('title') or 'Lieu')[:100],
                                 (loc.get('address') or '')[:200])
        elif m.get('image'):
            photo = io.BytesIO(base64.b64decode(m['image'])); photo.name = 'pc.jpg'
            await app.send_photo(uid, photo, caption=text[:1000] or None)
        elif text:
            for t, u in MD_IMAGE.findall(text):
                try:
                    await app.send_photo(uid, u, caption=t[:1000] or None)
                except Exception as e:
                    log.warning('image → Telegram: %s', e)
            await send_text_safe(uid, MD_IMAGE.sub('', text).strip() or '📷')
    except Exception as e:
        log.error('message backend → Telegram: %s', e)


def split_text(text: str, limit: int = 4000) -> list[str]:
    """Telegram refuse les messages > 4096 caractères : on coupe aux paragraphes."""
    parts, cur = [], ''
    for para in text.split('\n\n'):
        while len(para) > limit:                     # paragraphe géant : coupe brute
            parts.append(para[:limit]); para = para[limit:]
        if cur and len(cur) + len(para) + 2 > limit:
            parts.append(cur); cur = para
        else:
            cur = f'{cur}\n\n{para}' if cur else para
    if cur:
        parts.append(cur)
    return parts or ['…']


VIDEO_TEXT_WAIT_S = 15                     # vidéo : sa consigne arrive souvent juste après (ou pendant l'envoi)
PHOTO_TEXT_WAIT_S = 8                       # délai pour qu'un texte envoyé juste après une photo parte avec elle
photo_wait: dict[int, asyncio.Future] = {}   # uid → légende attendue pour la photo en cours

MD_IMAGE = re.compile(r'!\[([^\]]*)\]\((https?://[^)\s]+)\)')


async def send_text_safe(chat_id: int, text: str, reply_to: Message | None = None) -> None:
    """Texte → Telegram ; si le markdown casse (lien bizarre…), on renvoie en texte brut au lieu de « souci technique »."""
    try:
        if reply_to:
            await reply_to.reply_text(text, disable_web_page_preview=True)
        else:
            await app.send_message(chat_id, text, disable_web_page_preview=True)
    except Exception as e:
        log.warning('texte → Telegram (markdown refusé, envoi brut): %s', e)
        await app.send_message(chat_id, text, disable_web_page_preview=True, parse_mode=enums.ParseMode.DISABLED)


async def reply_out(msg: Message, out: dict) -> None:
    """Réponse du cerveau → Telegram : texte (coupé si long) puis les graphiques en images."""
    text = (out.get('text') or '…').strip()
    # « ![Avant / maintenant](https://…) » dans le texte : Pyrogram le prend pour un emoji perso et plante (int(url), 27/10)
    # → l'image part en photo, le texte sans elle
    images = [{'title': t, 'url': u} for t, u in MD_IMAGE.findall(text)] + list(out.get('images') or [])
    text = MD_IMAGE.sub('', text).strip() or ('📷' if images else '…')
    for i, part in enumerate(split_text(text)):
        await send_text_safe(msg.chat.id, part, msg if i == 0 else None)
    for img in images:
        try:
            await app.send_photo(msg.chat.id, img['url'], caption=(img.get('title') or '')[:1000] or None)
        except Exception as e:
            log.warning('image → Telegram: %s', e)
            try:   # photo refusée par Telegram (lien signé, format…) : au moins le lien, jamais rien
                await app.send_message(msg.chat.id, f"{img.get('title') or '📎'} : {img['url']}", disable_web_page_preview=False)
            except Exception:
                pass


async def poll_pending() -> None:
    while True:
        for actor, uid in actor_peer.items():
            try:
                res = await api('/api/call/pending', {}, actor, 15)
                for m in res.get('messages') or []:      # résultats arrivés après coup (mise à jour Nexus, écran du PC…), même en plein appel
                    asyncio.create_task(send_outbox_message(uid, m))
                # déjà en ligne avec lui : on ne recompose pas après, Dzaryx le dit dans l'appel en cours (Kouider 20/10)
                if res.get('call') and uid in active and res['call'].get('id') not in merging:
                    merging.add(res['call']['id'])
                    asyncio.create_task(merge_into_call(actor, uid, res['call']['id']))
                # l'appel reste en attente côté serveur tant qu'on n'a pas composé : on le prend au tour suivant
                elif res.get('call') and uid not in active and time.monotonic() - call_ended.get(uid, -1e9) >= CALL_GAP_S:
                    log.info('appel en attente pour %s → je compose', actor)
                    asyncio.create_task(start_call(actor, uid))
            except Exception as e:
                log.warning('pending %s: %s', actor, e)
        await asyncio.sleep(POLL_S)


merging: set[str] = set()


async def merge_into_call(actor: str, user_id: int, call_id: str) -> None:
    """Appel demandé pendant un appel en cours → l'info est dite dans cet appel (ou gardée), jamais un 2e appel."""
    try:
        reason = (await api('/api/call/merge', {'callId': call_id}, actor, 15)).get('reason')
        if not reason:
            return
        st = active.get(user_id)
        said = bool(st and st.rt and await st.rt.announce(strip_greeting(reason)))
        if not said:   # ancienne voix / quelqu'un d'autre au téléphone / appel fini → gardé pour son prochain appel
            await api('/api/call/merge', {'keep': strip_greeting(reason)}, actor, 15)
            log.info('info gardée pour plus tard (pas dite dans l\'appel) : %r', reason[:80])
    except Exception as e:
        log.warning('info pendant l\'appel: %s', e)
    finally:
        await asyncio.sleep(120)
        merging.discard(call_id)


class _ErrorCollector(logging.Handler):
    """Garde les erreurs du service pour les remonter au backend (auto-test quotidien)."""
    def __init__(self) -> None:
        super().__init__(logging.ERROR)
        self.items: list[str] = []

    def emit(self, record: logging.LogRecord) -> None:
        if len(self.items) < 20:
            self.items.append(f'{record.name}: {record.getMessage()}'[:300])


_errors = _ErrorCollector()
logging.getLogger().addHandler(_errors)


async def heartbeat() -> None:
    """Signe de vie au backend toutes les minutes (alerte à Kouider s'il s'arrête) + erreurs récentes."""
    while True:
        try:
            errs, _errors.items = _errors.items, []
            await api('/api/call/heartbeat', {'connected': app.is_connected, 'errors': errs, 'inCall': bool(active)}, 'kouider', 15)
        except Exception as e:
            log.warning('heartbeat: %s', e)
        await asyncio.sleep(60)


# ── Messages privés ──────────────────────────────────────────────────────────

FACE_CMD = re.compile(r'\b(retiens|m[ée]morise|apprends|enregistre)\b.*\b(visage|t[êe]te|face)\b', re.I)
GUARD_CMD = re.compile(r'^v[ée]rif(?:ication)?\s+(?:de\s+la\s+)?voix\s+(on|off|oui|non)$', re.I)
PASSCODE_CMD = re.compile(r'^code secret\s*[:=]?\s*(\S.{1,40})$', re.I)


OFFICE_EXT = ('.docx', '.xlsx', '.csv', '.txt')
SPORT_CODE_CMD = re.compile(r'sport|s[ée]ance|muscu|salle|tapis|elliptique|programme|code|coder|appli|site|bug', re.I)
EDL_CMD = re.compile(r'[ée]tat|edl|d[ée]part|retour|inspection|lieux|livraison|rendu', re.I)


def video_audio(path: str) -> str | None:
    """Voix de la vidéo (2 min max, mp3 mono) en base64 — None si la vidéo est muette."""
    out = tempfile.mktemp(prefix='dzvid_', suffix='.mp3')
    try:
        r = subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', path, '-vn', '-ac', '1', '-ar', '16000', '-b:a', '48k', '-t', '120', out],
                           capture_output=True, timeout=120)
        if r.returncode != 0 or not os.path.exists(out) or os.path.getsize(out) < 4000:
            return None
        return base64.b64encode(Path(out).read_bytes()).decode()
    finally:
        if os.path.exists(out):
            os.unlink(out)


def video_frames(path: str, n: int = 12) -> list[str]:
    """État des lieux vidéo : n images réparties sur toute la vidéo (1280 px), en base64 JPEG."""
    out = tempfile.mkdtemp(prefix='dzvid_')
    try:
        probe = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path],
                               capture_output=True, text=True, timeout=30)
        dur = max(1.0, float(probe.stdout.strip() or 0))
        subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-vf', f'fps={n / dur:.4f},scale=1280:-2', '-frames:v', str(n),
                        '-q:v', '3', f'{out}/f%02d.jpg'], check=True, timeout=180)
        return [base64.b64encode(f.read_bytes()).decode() for f in sorted(Path(out).glob('f*.jpg'))]
    finally:
        for f in Path(out).glob('*'):
            f.unlink()
        os.rmdir(out)


def office_text(path: str, name: str) -> str:
    """Texte d'un Word / Excel / CSV / TXT envoyé sur Telegram (menu, liste de prix…), sans bibliothèque en plus."""
    import zipfile
    from html import unescape
    low = name.lower()
    if low.endswith(('.csv', '.txt')):
        return Path(path).read_text(errors='ignore')
    with zipfile.ZipFile(path) as z:
        if low.endswith('.docx'):
            xml = z.read('word/document.xml').decode('utf8', 'ignore')
            xml = re.sub(r'</w:p>|<w:tab/>|<w:br/>', lambda m: '\n' if m.group(0) != '<w:tab/>' else '\t', xml)
            return unescape(re.sub(r'<[^>]+>', '', xml))
        shared = [unescape(re.sub(r'<[^>]+>', '', x)) for x in re.findall(r'<si>(.*?)</si>', z.read('xl/sharedStrings.xml').decode('utf8', 'ignore'), re.S)] \
            if 'xl/sharedStrings.xml' in z.namelist() else []
        out = []
        for sheet in sorted(n for n in z.namelist() if re.match(r'xl/worksheets/sheet\d+\.xml$', n)):
            for row in re.findall(r'<row[^>]*>(.*?)</row>', z.read(sheet).decode('utf8', 'ignore'), re.S):
                cells = []
                for attrs, inner in re.findall(r'<c\b([^>]*?)(?:/>|>(.*?)</c>)', row, re.S):
                    v = ''.join(re.findall(r'<v>(.*?)</v>', inner, re.S)) or ''.join(re.findall(r'<t[^>]*>(.*?)</t>', inner, re.S))
                    cells.append(shared[int(v)] if 't="s"' in attrs and v.isdigit() and int(v) < len(shared) else unescape(v))
                if any(c.strip() for c in cells):
                    out.append(' | '.join(cells))
        return '\n'.join(out)


VOICE_DIR = HERE / 'voice-samples'   # ses propres vocaux (privé, hors dépôt) → « TA VOIX » (backend my-voice.ts)
VOICE_KEEP_S = 150.0


def build_voice_sample(path: str) -> tuple[str, float] | None:
    """Ajoute ce vocal à ses échantillons, garde les plus récents (~2 min 30), renvoie (mp3 base64, secondes)."""
    VOICE_DIR.mkdir(exist_ok=True)
    dst = VOICE_DIR / f'{int(time.time() * 1000)}.mp3'
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', path, '-ac', '1', '-ar', '44100', '-b:a', '128k', str(dst)], check=True)
    dur = lambda f: float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', str(f)],
                                         capture_output=True, text=True).stdout.strip() or 0)
    keep, total = [], 0.0
    for f in sorted(VOICE_DIR.glob('*.mp3'), reverse=True):
        if total >= VOICE_KEEP_S:
            f.unlink(missing_ok=True)
            continue
        d = dur(f)
        if d < 2:      # vocal vide / trop court : inutile pour la voix
            f.unlink(missing_ok=True)
            continue
        keep.append(f); total += d
    if not keep:
        return None
    lst = VOICE_DIR / 'list.txt'
    lst.write_text(''.join(f"file '{f}'\n" for f in reversed(keep)))
    out = Path(tempfile.mktemp(prefix='voice_', suffix='.mp3'))
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', str(lst), '-c', 'copy', str(out)], check=True)
    b64 = base64.b64encode(out.read_bytes()).decode()
    out.unlink(missing_ok=True)
    return b64, total


async def push_voice_sample(path: str) -> None:
    try:
        built = await asyncio.to_thread(build_voice_sample, path)
        if built:   # envoi en arrière-plan : l'apprentissage (~1 min) ne retarde pas la réponse au vocal
            async def send() -> None:
                try:
                    await api('/api/call/voice-sample', {'audio': built[0], 'seconds': built[1]}, speaker.OWNER, 240)
                except Exception as e:
                    log.warning('échantillon de voix (envoi): %s', e)
            asyncio.create_task(send())
    except Exception as e:
        log.warning('échantillon de voix: %s', e)


def learn_owner_voice(path: str) -> None:
    """Vocal Telegram de Kouider → sa voix s'apprend (reconnaissance au téléphone)."""
    if not speaker.available():
        return
    v = speaker.voiced(speaker.ogg_to_pcm(path, 16000), 16000)
    if len(v) / 32000 < speaker.MIN_ENROLL_S:
        return
    vec = speaker.embed(v, 16000)
    if vec is None:
        return
    if speaker.known() >= 3 and speaker.identify(vec)[2] < speaker.REJECT:   # pas sa voix (quelqu'un d'autre a parlé)
        log.info('vocal : voix différente de Kouider, pas apprise')
        return
    speaker.enroll(speaker.OWNER, vec)


@app.on_message(pfilters.private & pfilters.incoming)
async def on_message(_, msg: Message) -> None:
    uid = msg.from_user.id if msg.from_user else 0
    if app.me and uid == app.me.id:                        # ses propres messages (notes, résumés) : rien à faire
        return
    actor = peer_actor.get(uid)
    if actor is None:
        log.info('message de %s (@%s) ignoré — ajoute son id dans .env', uid,
                 msg.from_user.username if msg.from_user else '?')
        return
    try:
        if msg.location:                                     # position : traitée par on_raw_geo (voir plus bas)
            return
        if msg.document and ((msg.document.mime_type or '') == 'application/pdf' or (msg.document.file_name or '').lower().endswith('.pdf')):
            await app.send_chat_action(uid, enums.ChatAction.TYPING)
            path = await msg.download(file_name=tempfile.mktemp(prefix='dzpdf_', suffix='.pdf'))
            try:
                text = subprocess.run(['pdftotext', '-layout', path, '-'], capture_output=True, text=True, timeout=30).stdout
            finally:
                os.unlink(path)
            name = msg.document.file_name or 'document.pdf'
            body = (f"[Document PDF reçu sur Telegram : « {name} ». Si c'est un billet d'avion / une carte d'embarquement, "
                    f"enregistre-le avec l'outil travel (add_trip). Si c'est un menu / une liste de produits ou de prix pour un site client, "
                    f"recopie TOUT dans manage_client_site edit.]\n{msg.caption or ''}\n\n{text.strip()[:15000]}")
            if text.strip():
                out = await api('/api/call/turn', {'message': body, 'textOnly': True, 'channel': 'message'}, actor, 120)
            else:   # PDF scanné (photo d'un menu…) : la 1re page part en image, Claude la lit
                path = await msg.download(file_name=tempfile.mktemp(prefix='dzpdf_', suffix='.pdf'))
                try:
                    subprocess.run(['pdftoppm', '-r', '110', '-l', '1', '-jpeg', '-singlefile', path, path[:-4]], timeout=60, check=True)
                    b64 = base64.b64encode(Path(path[:-4] + '.jpg').read_bytes()).decode()
                finally:
                    for f in (path, path[:-4] + '.jpg'):
                        if os.path.exists(f):
                            os.unlink(f)
                out = await api('/api/call/turn', {'message': body + '(PDF scanné : voici sa 1re page en image)', 'image': b64,
                                                   'imageMime': 'image/jpeg', 'textOnly': True, 'channel': 'message'}, actor, 120)
            await reply_out(msg, out)
            return
        if msg.document and (msg.document.file_name or '').lower().endswith(OFFICE_EXT):
            await app.send_chat_action(uid, enums.ChatAction.TYPING)
            name = msg.document.file_name
            path = await msg.download(file_name=tempfile.mktemp(prefix='dzdoc_', suffix=Path(name).suffix))
            try:
                text = office_text(path, name)
            except Exception as e:
                log.warning('document %s: %s', name, e)
                text = ''
            finally:
                os.unlink(path)
            body = (f"[Document reçu sur Telegram : « {name} ». Si c'est un menu / une liste de produits ou de prix pour un site client, "
                    f"recopie TOUT dans manage_client_site edit.]\n{msg.caption or ''}\n\n{text.strip()[:15000] or '(document vide ou illisible)'}")
            out = await api('/api/call/turn', {'message': body, 'textOnly': True, 'channel': 'message'}, actor, 120)
            await reply_out(msg, out)
            return
        if msg.voice or msg.audio:
            path = await msg.download(file_name=tempfile.mktemp(prefix='dzin_', suffix='.ogg'))
            b64 = base64.b64encode(Path(path).read_bytes()).decode()
            if msg.voice and actor == speaker.OWNER and not msg.forward_origin:   # son propre vocal (pas transféré)
                try:
                    await asyncio.to_thread(learn_owner_voice, path)
                except Exception as e:
                    log.warning('voix du vocal: %s', e)
                await push_voice_sample(path)   # « TA VOIX » : Dzaryx apprend à parler avec sa voix
            os.unlink(path)
            tr = await api('/api/transcribe', {'audio': b64, 'mimeType': 'audio/ogg'}, actor, 40)
            text = (tr.get('text') or '').strip()
            if not text:
                await msg.reply_text("Je n'ai pas bien entendu, tu peux répéter ?")
                return
            await app.send_chat_action(uid, enums.ChatAction.RECORD_AUDIO)
            out = await api('/api/call/turn', {'message': text, 'textOnly': True, 'channel': 'message'}, actor)
            reply = out.get('text') or '…'
            try:   # même voix que les appels
                await reply_voice_pcm(msg, await speak(http, api, re.sub(r'[*_#`>|]', '', reply)[:900], actor))
                return
            except Exception as e:   # même réponse relue par la voix de secours (ElevenLabs → Gemini → Google), sans redemander au cerveau
                log.warning('voix temps réel pour le vocal: %s → voix de secours', str(e)[:160])
                try:
                    out = {**out, 'audio': (await api('/api/tts', {'text': re.sub(r'[*_#`>|]', '', reply)[:900]}, actor, 60)).get('audio')}
                except Exception as e2:
                    log.warning('voix de secours: %s → réponse écrite', e2)
            if out.get('audio'):
                mp3 = save_mp3(out['audio'])
                ogg = mp3[:-4] + '.ogg'
                subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', mp3, '-c:a', 'libopus', '-b:a', '48k', ogg], check=True)
                await msg.reply_voice(ogg)
                os.unlink(mp3); os.unlink(ogg)
            else:
                await reply_out(msg, out)
        elif (msg.video or (msg.document and (msg.document.mime_type or '').startswith('video/'))) and actor == speaker.OWNER:
            # 28/10 : N'IMPORTE QUELLE vidéo (séance de sport, bug d'appli à coder, site à copier…) → images + voix transcrite
            # → description, puis le cerveau normal agit avec ta consigne (texte avec la vidéo ou envoyé juste après).
            # État des lieux (27/10) : légende « départ Clio Benali », ou vidéo de voiture sans consigne.
            caption = msg.caption or ''
            caption_wait, t_vid = None, time.monotonic()
            if not caption and uid not in photo_wait:
                caption_wait = asyncio.get_running_loop().create_future()
                photo_wait[uid] = caption_wait
            if not (caption and EDL_CMD.search(caption) and not SPORT_CODE_CMD.search(caption)):
                await app.send_chat_action(uid, enums.ChatAction.TYPING)
                path = await msg.download(file_name=tempfile.mktemp(prefix='dzvid_', suffix='.mp4'))
                try:
                    frames = await asyncio.to_thread(video_frames, path, 16)
                    audio = await asyncio.to_thread(video_audio, path)
                finally:
                    os.unlink(path)
                if caption_wait is not None:
                    try:
                        caption = await asyncio.wait_for(asyncio.shield(caption_wait), max(0.5, VIDEO_TEXT_WAIT_S - (time.monotonic() - t_vid)))
                    except asyncio.TimeoutError:
                        caption = ''
                    finally:
                        if photo_wait.get(uid) is caption_wait:
                            del photo_wait[uid]
                seen = await api('/api/jarvis/video-read', {'frames': [{'base64': f, 'mime': 'image/jpeg'} for f in frames], 'caption': caption,
                                                            **({'audio': audio, 'audioMime': 'audio/mpeg'} if audio else {})}, actor, 240)
                if seen.get('kind') == 'car' and (not caption or EDL_CMD.search(caption)):
                    await msg.reply_text('🎥 État des lieux vidéo : je regarde la voiture sous tous les angles et le tableau de bord (1 min environ)…')
                    out = await api('/api/jarvis/inspection-frames', {'frames': [{'base64': f, 'mime': 'image/jpeg'} for f in frames[:14]],
                                                                      'caption': caption}, actor, 240)
                    for part in split_text(str(out.get('text') or out.get('error') or 'Analyse impossible.')):
                        await msg.reply_text(part)
                    return
                speech = f"\nVoix dans la vidéo : « {seen.get('speech')[:1500]} »" if seen.get('speech') else ''
                note = (f"[🎥 Kouider t'a envoyé une VIDÉO ({seen.get('title') or seen.get('kind')}). Ce qu'on y voit : {seen.get('description', '')}{speech}]\n"
                        + (f'Sa consigne : {caption}' if caption else 'Pas de consigne : résume ce que tu vois en 2 lignes et demande-lui ce qu\'il veut en faire.'))
                out = await api('/api/call/turn', {'message': note, 'image': frames[len(frames) // 2] if frames else None, 'imageMime': 'image/jpeg',
                                                   'textOnly': True, 'channel': 'message'}, actor, 240)
                await reply_out(msg, out)
                return
            if caption_wait is not None and photo_wait.get(uid) is caption_wait:
                del photo_wait[uid]
            await msg.reply_text('🎥 État des lieux vidéo : je regarde la voiture sous tous les angles et le tableau de bord (1 min environ)…')
            await app.send_chat_action(uid, enums.ChatAction.TYPING)
            path = await msg.download(file_name=tempfile.mktemp(prefix='dzvid_', suffix='.mp4'))
            try:
                frames = await asyncio.to_thread(video_frames, path)
            finally:
                os.unlink(path)
            out = await api('/api/jarvis/inspection-frames', {'frames': [{'base64': f, 'mime': 'image/jpeg'} for f in frames],
                                                              'caption': caption}, actor, 240)
            for part in split_text(str(out.get('text') or out.get('error') or 'Analyse impossible.')):
                await msg.reply_text(part)
        elif msg.photo or (msg.document and (msg.document.mime_type or '').startswith('image/')):
            await app.send_chat_action(uid, enums.ChatAction.TYPING)
            # Photo sans légende : le texte qui suit dans les secondes d'après en fait partie
            # (27/10 22h06 : photo puis « c'était comment j'étais avant » traités séparément → texte sans la photo)
            caption_wait, t_photo = None, time.monotonic()
            if not msg.caption and uid not in photo_wait:
                caption_wait = asyncio.get_running_loop().create_future()
                photo_wait[uid] = caption_wait
            path = await msg.download(file_name=tempfile.mktemp(prefix='dzimg_', suffix='.jpg'))
            pic = Path(path).read_bytes()
            b64 = base64.b64encode(pic).decode()
            os.unlink(path)
            mime = 'image/jpeg' if msg.photo else msg.document.mime_type
            if actor == speaker.OWNER and FACE_CMD.search(msg.caption or ''):   # « retiens mon visage » + selfie
                vecs = await asyncio.to_thread(face.embed, pic)
                if vecs:
                    n = face.enroll(face.OWNER, vecs[0])
                    await msg.reply_text(f'🙂 C\'est noté, je retiens ton visage ({n} photo{"s" if n > 1 else ""} de toi). '
                                         'Quand tu me montres ta tête, je saurai que c\'est toi.')
                else:
                    await msg.reply_text('Je ne vois pas bien de visage sur cette photo — renvoie un selfie de face, bien éclairé.')
                return
            seen = await asyncio.to_thread(face.hint, pic, actor == speaker.OWNER)
            caption = msg.caption or ''
            if caption_wait is not None:
                try:
                    caption = await asyncio.wait_for(asyncio.shield(caption_wait), max(0.5, PHOTO_TEXT_WAIT_S - (time.monotonic() - t_photo)))
                except asyncio.TimeoutError:
                    caption = ''
                finally:
                    if photo_wait.get(uid) is caption_wait:
                        del photo_wait[uid]
            out = await api('/api/call/turn', {'message': f'{seen}\n{caption}'.strip() if seen else caption,
                                               'image': b64, 'imageMime': mime,
                                               'textOnly': True, 'channel': 'message'}, actor, 120)
            await reply_out(msg, out)
        elif msg.text and PASSCODE_CMD.match(msg.text.strip()) and actor == speaker.OWNER:
            speaker.set_passcode(PASSCODE_CMD.match(msg.text.strip()).group(1))
            try:
                await msg.delete()   # le code ne reste pas écrit dans la conversation
            except Exception:
                pass
            await app.send_message(uid, '🔐 Code secret enregistré (message effacé). Si un jour je ne reconnais pas ta voix '
                                        'au téléphone, je te le demanderai.')
        elif msg.text and GUARD_CMD.match(msg.text.strip()) and actor == speaker.OWNER:
            on = GUARD_CMD.match(msg.text.strip()).group(1).lower() in ('on', 'oui')
            speaker.set_guard(on)
            await app.send_message(uid, '🔐 Vérification de la voix ACTIVÉE : au téléphone je vérifie que c\'est toi avant de parler affaires.'
                                   if on else '🔓 Vérification de la voix désactivée : ton compte Telegram suffit, je te parle direct.')
        elif msg.text and FACE_CALLS_CMD.match(msg.text.strip()) and actor == speaker.OWNER:
            on = FACE_CALLS_CMD.match(msg.text.strip()).group(1).lower() in ('on', 'oui')
            NO_FACE.parent.mkdir(exist_ok=True)
            NO_FACE.unlink(missing_ok=True) if on else NO_FACE.touch()
            await app.send_message(uid, '🙂 Visage activé : pendant nos appels tu me vois (petit bonhomme qui parle et t\'écoute).'
                                   if on else '🔈 Visage désactivé : appels en son seul. « visage on » pour me revoir.')
        elif msg.text and CLAUDE_CALLS_CMD.match(msg.text.strip()) and actor == speaker.OWNER:
            on = CLAUDE_CALLS_CMD.match(msg.text.strip()).group(1).lower() in ('on', 'oui')
            CLAUDE_CALLS.parent.mkdir(exist_ok=True)
            CLAUDE_CALLS.touch() if on else CLAUDE_CALLS.unlink(missing_ok=True)
            await app.send_message(uid, '🧠 Appels sur le cerveau Claude : je t\'entends et je réfléchis avec tous mes outils '
                                        '(réponse ~2-3 s, utilise ton crédit Claude). « appels claude off » pour revenir à la voix gratuite.'
                                   if on else '⚡ Appels sur la voix gratuite (Gemini), avec bascule automatique sur Claude si elle bloque. '
                                              '« appels claude on » pour tout passer sur Claude.')
        elif msg.text and VOICE_CMD.match(msg.text.strip()):
            await voice_command(msg, actor, VOICE_CMD.match(msg.text.strip()).group(1))
        elif msg.text:
            waiting = photo_wait.get(uid)
            if waiting is not None and not waiting.done():   # légende de la photo qui vient d'arriver : partira avec elle
                waiting.set_result(msg.text)
                return
            await app.send_chat_action(uid, enums.ChatAction.TYPING)
            # 180 s : sans crédit Claude, le cerveau de secours peut dépasser 90 s (23/10 6h42 : 2 × « souci technique »)
            out = await api('/api/call/turn', {'message': msg.text, 'textOnly': True, 'channel': 'message'}, actor, 180)
            await reply_out(msg, out)
    except Exception as e:
        log.error('message échoué: %s %r', e, e)
        await msg.reply_text('⏳ Je n\'ai pas réussi à te répondre à temps (serveur lent). Renvoie ton message, je le reprends.'
                             if isinstance(e, asyncio.TimeoutError) else 'Petit souci technique, réessaie dans un instant.')


@app.on_raw_update(group=-1)
async def on_raw_geo(client, update, users, chats) -> None:
    """Position (et position EN DIRECT) lue en brut : Pyrogram ne parse pas une position en direct
    « jusqu'à ce que je l'arrête » (période infinie) → msg.location vide. Telegram modifie le même
    message à chaque déplacement (UpdateEditMessage)."""
    if not isinstance(update, (raw.types.UpdateNewMessage, raw.types.UpdateEditMessage)):
        return
    m = update.message
    media = getattr(m, 'media', None)
    if getattr(m, 'out', True) or not isinstance(media, (raw.types.MessageMediaGeo, raw.types.MessageMediaGeoLive)):
        return
    if not isinstance(getattr(m, 'peer_id', None), raw.types.PeerUser):
        return
    geo = media.geo
    actor = peer_actor.get(m.peer_id.user_id)
    if actor is None or not isinstance(geo, raw.types.GeoPoint):
        return
    try:
        await api('/api/call/location', {'lat': geo.lat, 'lng': geo.long}, actor, 15)
        if isinstance(update, raw.types.UpdateNewMessage):
            live = isinstance(media, raw.types.MessageMediaGeoLive)
            log.info('position %s reçue de %s', 'en direct' if live else 'fixe', actor)
            await client.send_message(m.peer_id.user_id, '📍 Position en direct reçue. Je calcule tes trajets avec le trafic '
                                      'depuis là où tu es et je vois si tu es bien parti.' if live else
                                      '📍 Position reçue. Pour que je suive tes départs, partage-la « en direct » '
                                      '(jusqu\'à ce que tu l\'arrêtes).')
    except Exception as e:
        log.warning('position: %s', e)


async def reply_voice_pcm(msg: Message, pcm: bytes) -> None:
    ogg = tempfile.mktemp(prefix='dzv_', suffix='.ogg')
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 's16le', '-ar', str(IN_RATE), '-ac', '1', '-i', '-',
                    '-c:a', 'libopus', '-b:a', '48k', ogg], input=pcm, check=True, timeout=30)
    try:
        await msg.reply_voice(ogg)
    finally:
        os.unlink(ogg)


# « voix » → échantillons ; « voix 3 » / « voix marin » → la choisir (appels + vocaux)
VOICE_CMD = re.compile(r'^voix(?:\s+(\w+))?\s*$', re.I)
VOICE_SAMPLE = 'Salut Kouider, c\'est Dzaryx. Tu as deux nouvelles réservations aujourd\'hui, je te les lis ?'


async def voice_command(msg: Message, actor: str, choice: str | None) -> None:
    cur = await api('/api/call/voice', {}, actor, 15)
    voices: list[str] = cur['voices']
    if choice:
        v = voices[int(choice) - 1] if choice.isdigit() and 0 < int(choice) <= len(voices) else choice.lower()
        if v not in voices:
            await msg.reply_text(f'Je ne connais pas cette voix. Choix : 1 à {len(voices)}.')
            return
        await api('/api/call/voice', {'voice': v}, actor, 15)
        await msg.reply_text(f'C\'est noté : voix {voices.index(v) + 1} ({v}) pour les appels et les vocaux.')
        return
    await msg.reply_text(f'Voici {len(voices)} voix. Réponds « voix 2 » (par exemple) pour choisir. Actuelle : {voices.index(cur["voice"]) + 1}.')
    for i, v in enumerate(voices, 1):
        try:
            await app.send_chat_action(msg.chat.id, enums.ChatAction.RECORD_AUDIO)
            pcm = await speak(http, api, VOICE_SAMPLE, actor, voice=v)
            ogg = tempfile.mktemp(prefix='dzs_', suffix='.ogg')
            subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 's16le', '-ar', str(IN_RATE), '-ac', '1', '-i', '-',
                            '-c:a', 'libopus', '-b:a', '48k', ogg], input=pcm, check=True, timeout=30)
            await app.send_voice(msg.chat.id, ogg, caption=f'Voix {i}' + (' (actuelle)' if v == cur['voice'] else ''))
            os.unlink(ogg)
        except Exception as e:
            log.error('échantillon %s: %s', v, e)


# ── Boîte d'envoi : messages à Kouider déposés par d'autres scripts du VPS (récap de session…) ──
OUTBOX = HERE / 'outbox'


ALARM_MP3 = FILLER_DIR / 'alarm.mp3'
ALARM_TEXT = ("Allô Kouider, c'est Dzaryx. Alerte : le serveur principal ne répond plus depuis plusieurs minutes. "
              "Je ne peux plus répondre ni aux clients ni à toi. Les détails sont sur Telegram.")


async def alarm_call(uid: int, text: str) -> None:
    """Appel d'alarme SANS le backend (surveillance VPS : Railway en panne) : sonne, lit un message, raccroche.
    Voix générée si le backend répond, sinon le message préenregistré alarm.mp3."""
    if uid in active:
        log.info('alarme : déjà en appel, message écrit seulement')
        return
    path = str(ALARM_MP3)
    if text and text != ALARM_TEXT:
        try:
            path = save_mp3((await api('/api/tts', {'text': text}, 'kouider', 20))['audio'])
        except Exception as e:
            log.warning('alarme : voix indisponible (%s) → message préenregistré', e)
    if not Path(path).exists():
        log.error('alarme : aucun message audio')
        return
    last_call[uid] = time.monotonic()
    try:
        await calls.play(uid, MediaStream(path, AudioParameters(48000, 1), video_flags=MediaStream.Flags.IGNORE),
                         CallConfig(timeout=45))
        await asyncio.sleep(mp3_duration(path) * 2 + 2)     # le temps de décrocher puis d'écouter
        log.info('alarme : appel passé')
    except Exception as e:
        log.warning('alarme : pas décroché (%s)', e)
    finally:
        try:
            await calls.leave_call(uid)
        except Exception:
            pass


async def outbox_loop() -> None:
    """Toutes les 3 s : envoie à Kouider, dans l'ordre des noms, les fichiers tgcall/outbox/*.txt
    (avec la photo <même nom>.jpg si elle existe), puis les supprime. Un fichier *.call (texte à dire,
    vide = alarme serveur) le fait appeler en plus."""
    OUTBOX.mkdir(exist_ok=True)
    while True:
        await asyncio.sleep(3)
        uid = actor_peer.get('kouider')
        if not uid:
            continue
        for call in sorted(OUTBOX.glob('*.call')):
            text = call.read_text(encoding='utf-8').strip() or ALARM_TEXT
            call.unlink(missing_ok=True)
            log.info('outbox → appel d\'alarme : %s', call.name)
            asyncio.create_task(alarm_call(uid, text))
        for txt in sorted(OUTBOX.glob('*.txt')):
            img = txt.with_suffix('.jpg')
            # document joint : même nom, autre extension (pdf, docx, xlsx… — déposé par le PC cloud)
            docs = [f for f in OUTBOX.glob(txt.stem + '.*') if f.suffix.lower() not in ('.txt', '.jpg', '.call')]
            try:
                text = txt.read_text(encoding='utf-8').strip()
                if docs:
                    for doc in docs:
                        await app.send_document(uid, str(doc), caption=text[:1000],
                                                file_name=doc.name[len(txt.stem) + 1:] or doc.name)   # « <stamp>.<nom d'origine> »
                elif img.exists():
                    await app.send_photo(uid, str(img), caption=text[:1000])
                elif text:
                    await app.send_message(uid, text[:4000])
                log.info('outbox → kouider : %s', txt.name)
                await asyncio.sleep(1.5)
            except Exception as e:
                log.error('outbox %s: %s', txt.name, e)
            finally:
                txt.unlink(missing_ok=True)
                img.unlink(missing_ok=True)
                for doc in docs:
                    doc.unlink(missing_ok=True)


# ── Démarrage ────────────────────────────────────────────────────────────────

async def main() -> None:
    global http
    http = aiohttp.ClientSession()
    await calls.start()
    me = await app.get_me()
    log.info('connecté en tant que %s (@%s)', me.first_name, me.username)
    for actor, ref in PEERS.items():
        try:
            u = await app.get_users(int(ref) if ref.lstrip('-').isdigit() else ref)
            peer_actor[u.id] = actor
            actor_peer[actor] = u.id
            log.info('%s = %s (id %s)', actor, u.first_name, u.id)
        except Exception as e:
            log.error('%s introuvable (%s): %s — il doit d\'abord écrire au compte Dzaryx', actor, ref, e)
    await ensure_fillers()
    if not ALARM_MP3.exists():
        try:
            ALARM_MP3.write_bytes(base64.b64decode((await api('/api/tts', {'text': ALARM_TEXT}, 'kouider', 30))['audio']))
        except Exception as e:
            log.warning('message d\'alarme non généré: %s', e)
    asyncio.create_task(poll_pending())
    asyncio.create_task(heartbeat())
    asyncio.create_task(outbox_loop())
    await asyncio.Event().wait()


if __name__ == '__main__':
    app.run(main())
