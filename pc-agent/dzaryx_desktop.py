"""
Dzaryx Desktop Agent — PC voice control via Claude AI
Speak to control your Windows PC: open apps, search web, control camera, etc.
Usage: python dzaryx_desktop.py
"""
import os
import sys
import json
import subprocess
import webbrowser
import time
from pathlib import Path

try:
    import anthropic
    import speech_recognition as sr
    import pyttsx3
except ImportError as e:
    print(f"Missing dependency: {e}")
    print("Run: pip install -r requirements.txt")
    sys.exit(1)

# ── Config ──────────────────────────────────────────────────────────
API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
MODEL   = "claude-sonnet-4-6"
USER_HOME = Path.home()

# ── TTS engine ──────────────────────────────────────────────────────
engine = pyttsx3.init()
engine.setProperty('rate', 170)
engine.setProperty('volume', 0.95)
# Try to set a French or clear voice
voices = engine.getProperty('voices')
for v in voices:
    if 'fr' in v.id.lower() or 'french' in v.name.lower():
        engine.setProperty('voice', v.id)
        break

def speak(text: str) -> None:
    print(f"\n\033[36m[DZARYX]\033[0m {text}")
    engine.say(text)
    engine.runAndWait()

def print_state(label: str, color: str = '33') -> None:
    print(f"\033[{color}m[{label}]\033[0m", end=' ', flush=True)

# ── PC Control tools ─────────────────────────────────────────────────

APP_MAP = {
    'spotify':        'spotify',
    'chrome':         r'C:\Program Files\Google\Chrome\Application\chrome.exe',
    'google chrome':  r'C:\Program Files\Google\Chrome\Application\chrome.exe',
    'firefox':        r'C:\Program Files\Mozilla Firefox\firefox.exe',
    'edge':           'msedge',
    'vscode':         'code',
    'vs code':        'code',
    'visual studio code': 'code',
    'terminal':       'cmd.exe',
    'powershell':     'powershell.exe',
    'claude':         'claude',
    'claude code':    'claude',
    'notepad':        'notepad.exe',
    'bloc-notes':     'notepad.exe',
    'calculatrice':   'calc.exe',
    'calculateur':    'calc.exe',
    'explorer':       'explorer.exe',
    'fichiers':       'explorer.exe',
    'word':           'winword',
    'excel':          'excel',
    'vlc':            'vlc',
    'discord':        'discord',
    'telegram':       'telegram',
    'zoom':           'zoom',
}

FOLDER_MAP = {
    'bureau':          str(USER_HOME / 'OneDrive' / 'Bureau'),
    'desktop':         str(USER_HOME / 'OneDrive' / 'Bureau'),
    'documents':       str(USER_HOME / 'Documents'),
    'téléchargements': str(USER_HOME / 'Downloads'),
    'downloads':       str(USER_HOME / 'Downloads'),
    'images':          str(USER_HOME / 'Pictures'),
    'musique':         str(USER_HOME / 'Music'),
    'vidéos':          str(USER_HOME / 'Videos'),
    'ibrahim':         str(USER_HOME / 'OneDrive' / 'Bureau' / 'ibrahim'),
}

def open_app(name: str) -> str:
    name_l = name.lower().strip()
    cmd = None
    for key, val in APP_MAP.items():
        if key in name_l:
            cmd = val
            break
    if not cmd:
        cmd = name
    try:
        if Path(cmd).exists():
            subprocess.Popen([cmd], shell=False)
        else:
            subprocess.Popen(cmd, shell=True)
        return f"Application '{name}' lancée"
    except Exception as e:
        return f"Impossible de lancer '{name}': {e}"

def open_folder(path: str) -> str:
    path_l = path.lower().strip()
    resolved = FOLDER_MAP.get(path_l, path)
    try:
        subprocess.Popen(['explorer', resolved], shell=False)
        return f"Dossier '{resolved}' ouvert"
    except Exception as e:
        return f"Erreur dossier: {e}"

def web_search(query: str) -> str:
    url = f"https://www.google.com/search?q={query.replace(' ', '+')}"
    webbrowser.open(url)
    return f"Recherche Google: '{query}'"

def open_url(url: str) -> str:
    if not url.startswith('http'):
        url = 'https://' + url
    webbrowser.open(url)
    return f"URL ouverte: {url}"

def play_music(query: str) -> str:
    # Try Spotify URI first
    try:
        spotify_uri = f"spotify:search:{query}"
        result = subprocess.run(['start', '', spotify_uri], shell=True, timeout=3)
        if result.returncode == 0:
            return f"Spotify — recherche: '{query}'"
    except Exception:
        pass
    # Fallback: open Spotify web
    url = f"https://open.spotify.com/search/{query.replace(' ', '%20')}"
    webbrowser.open(url)
    return f"Spotify ouvert: '{query}'"

def take_screenshot() -> str:
    try:
        import pyautogui  # optional dep
        ts = time.strftime('%Y%m%d_%H%M%S')
        dest = str(USER_HOME / 'OneDrive' / 'Bureau' / f'screenshot_{ts}.png')
        pyautogui.screenshot(dest)
        subprocess.Popen(['explorer', '/select,', dest], shell=False)
        return f"Screenshot sauvegardé: {dest}"
    except ImportError:
        # Use Windows Snipping Tool
        subprocess.Popen('snippingtool', shell=True)
        return "Outil de capture d'écran ouvert"
    except Exception as e:
        return f"Erreur screenshot: {e}"

def open_claude_code() -> str:
    # Try Windows Terminal first, then cmd
    cmds = [
        ['wt.exe', '-d', str(USER_HOME / 'OneDrive' / 'Bureau' / 'ibrahim'), 'cmd', '/k', 'claude'],
        ['cmd.exe', '/k', 'claude'],
    ]
    for cmd in cmds:
        try:
            subprocess.Popen(cmd, shell=False)
            return "Terminal Claude Code ouvert"
        except Exception:
            continue
    return "Impossible d'ouvrir Claude Code terminal"

def activate_camera() -> str:
    try:
        subprocess.Popen('start microsoft.windows.camera:', shell=True)
        return "Application Caméra Windows ouverte"
    except Exception as e:
        return f"Erreur caméra: {e}"

def run_command(cmd: str) -> str:
    try:
        result = subprocess.run(
            cmd, shell=True, capture_output=True, text=True, timeout=15,
            encoding='utf-8', errors='replace'
        )
        output = (result.stdout or result.stderr or "Commande exécutée").strip()
        return output[:600]
    except subprocess.TimeoutExpired:
        return "Timeout — commande trop longue"
    except Exception as e:
        return f"Erreur: {e}"

def set_volume(level: str) -> str:
    try:
        vol = int(level)
        vol = max(0, min(100, vol))
        # Use PowerShell to set volume
        ps_cmd = f"(Get-AudioDevice -Playback).DefaultAudio.Volume = {vol/100}"
        # Simpler approach using nircmd if available, else PowerShell
        subprocess.run(
            f'powershell -c "$vol={vol}/100; (New-Object -ComObject WScript.Shell).SendKeys([char]173)"',
            shell=True, timeout=5
        )
        return f"Volume ajusté à {vol}%"
    except Exception as e:
        return f"Impossible d'ajuster le volume: {e}"

def open_dzaryx_web() -> str:
    webbrowser.open('https://ibrahim-fik-conciergerie.netlify.app')
    return "Interface Dzaryx web ouverte"

# ── Claude tool definitions ──────────────────────────────────────────
TOOLS = [
    {
        "name": "open_app",
        "description": "Lance une application Windows: Spotify, Chrome, Firefox, VS Code, Terminal, PowerShell, Claude Code, Notepad, Calculatrice, Excel, Word, Discord, Telegram, Zoom, etc.",
        "input_schema": {
            "type": "object",
            "properties": {
                "name": {"type": "string", "description": "Nom de l'app à ouvrir"}
            },
            "required": ["name"]
        }
    },
    {
        "name": "open_folder",
        "description": "Ouvre un dossier dans l'explorateur Windows (bureau, documents, téléchargements, images, musique, vidéos, ibrahim, ou chemin absolu)",
        "input_schema": {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Nom ou chemin du dossier"}
            },
            "required": ["path"]
        }
    },
    {
        "name": "web_search",
        "description": "Effectue une recherche Google dans le navigateur",
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Termes de recherche"}
            },
            "required": ["query"]
        }
    },
    {
        "name": "open_url",
        "description": "Ouvre une URL spécifique dans le navigateur par défaut",
        "input_schema": {
            "type": "object",
            "properties": {
                "url": {"type": "string", "description": "URL à ouvrir (ex: youtube.com, github.com)"}
            },
            "required": ["url"]
        }
    },
    {
        "name": "play_music",
        "description": "Lance une musique/artiste/playlist sur Spotify",
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Titre, artiste, ou playlist"}
            },
            "required": ["query"]
        }
    },
    {
        "name": "take_screenshot",
        "description": "Prend une capture d'écran et la sauvegarde sur le Bureau",
        "input_schema": {
            "type": "object",
            "properties": {},
            "required": []
        }
    },
    {
        "name": "open_claude_code",
        "description": "Ouvre un terminal Windows avec Claude Code activé",
        "input_schema": {
            "type": "object",
            "properties": {},
            "required": []
        }
    },
    {
        "name": "activate_camera",
        "description": "Active l'application caméra Windows",
        "input_schema": {
            "type": "object",
            "properties": {},
            "required": []
        }
    },
    {
        "name": "run_command",
        "description": "Exécute une commande PowerShell ou CMD Windows et retourne le résultat",
        "input_schema": {
            "type": "object",
            "properties": {
                "cmd": {"type": "string", "description": "Commande à exécuter"}
            },
            "required": ["cmd"]
        }
    },
    {
        "name": "open_dzaryx_web",
        "description": "Ouvre l'interface web Dzaryx dans le navigateur",
        "input_schema": {
            "type": "object",
            "properties": {},
            "required": []
        }
    }
]

TOOL_FN = {
    'open_app':        open_app,
    'open_folder':     open_folder,
    'web_search':      web_search,
    'open_url':        open_url,
    'play_music':      play_music,
    'take_screenshot': take_screenshot,
    'open_claude_code': open_claude_code,
    'activate_camera': activate_camera,
    'run_command':     run_command,
    'open_dzaryx_web': open_dzaryx_web,
}

SYSTEM = """Tu es Dzaryx, l'assistant IA personnel de Kouider (Fik Conciergerie, Oran, Algérie), actif sur son PC Windows.
Tu contrôles son PC via des outils. Réponds en français, sois concis et direct.
Exemples de commandes:
- "ouvre Spotify" → open_app(name="spotify")
- "lance une musique de Drake" → play_music(query="Drake")
- "ouvre le terminal Claude Code" → open_claude_code()
- "cherche la météo d'Oran" → web_search(query="météo Oran")
- "ouvre le dossier bureau" → open_folder(path="bureau")
- "prends un screenshot" → take_screenshot()
- "active la caméra" → activate_camera()
Après chaque action, confirme en 1 phrase courte."""

# ── Claude client ─────────────────────────────────────────────────────
client = anthropic.Anthropic(api_key=API_KEY)
history: list[dict] = []

def ask_claude(user_text: str) -> str:
    history.append({"role": "user", "content": user_text})

    while True:
        print_state("DZARYX RÉFLÉCHIT", '34')
        resp = client.messages.create(
            model=MODEL,
            max_tokens=512,
            system=SYSTEM,
            tools=TOOLS,
            messages=history,
        )

        tool_results = []
        for block in resp.content:
            if block.type == 'tool_use':
                fn = TOOL_FN.get(block.name)
                if fn:
                    print_state(f"OUTIL: {block.name}", '35')
                    args = block.input if isinstance(block.input, dict) else {}
                    result = fn(**args)
                    print(result)
                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": block.id,
                        "content": result
                    })

        if tool_results:
            history.append({"role": "assistant", "content": resp.content})
            history.append({"role": "user",      "content": tool_results})
            continue  # get final text response

        text = ""
        for block in resp.content:
            if hasattr(block, 'text'):
                text += block.text

        text = text.strip()
        if text:
            history.append({"role": "assistant", "content": text})

        # Prune history
        if len(history) > 24:
            history[:] = history[-24:]

        return text or "Action effectuée."

# ── Speech recognition ────────────────────────────────────────────────
recognizer = sr.Recognizer()
recognizer.energy_threshold = 300
recognizer.dynamic_energy_threshold = True
recognizer.pause_threshold = 0.8

def listen_once() -> str | None:
    with sr.Microphone() as source:
        print_state("ÉCOUTE", '32')
        print("Parlez maintenant...", end=' ', flush=True)
        try:
            recognizer.adjust_for_ambient_noise(source, duration=0.3)
            audio = recognizer.listen(source, timeout=12, phrase_time_limit=20)
        except sr.WaitTimeoutError:
            print("(silence)")
            return None

    try:
        print_state("TRANSCRIPTION", '33')
        text = recognizer.recognize_google(audio, language='fr-FR')
        print(f"\033[1m{text}\033[0m")
        return text
    except sr.UnknownValueError:
        print("(incompréhensible)")
        return None
    except sr.RequestError as e:
        print(f"Erreur SR: {e}")
        return None

# ── Main loop ─────────────────────────────────────────────────────────
def main() -> None:
    if not API_KEY:
        print("\033[31mERREUR: ANTHROPIC_API_KEY non définie.\033[0m")
        print("Ajoutez dans votre environnement:")
        print('  setx ANTHROPIC_API_KEY "votre_clé_api"')
        sys.exit(1)

    print("\n" + "═" * 52)
    print("    ██████╗ ███████╗ █████╗ ██████╗ ██╗   ██╗██╗  ██╗")
    print("    ██╔══██╗╚════██║██╔══██╗██╔══██╗╚██╗ ██╔╝╚██╗██╔╝")
    print("    ██║  ██║    ██╔╝███████║██████╔╝ ╚████╔╝  ╚███╔╝ ")
    print("    ██║  ██║   ██╔╝ ██╔══██║██╔══██╗  ╚██╔╝   ██╔██╗ ")
    print("    ██████╔╝   ██║  ██║  ██║██║  ██║   ██║   ██╔╝ ██╗")
    print("    ╚═════╝    ╚═╝  ╚═╝  ╚═╝╚═╝  ╚═╝   ╚═╝   ╚═╝  ╚═╝")
    print("    DESKTOP AGENT · FIK CONCIERGERIE · ORAN")
    print("═" * 52)
    print("\nCommandes disponibles:")
    print("  • Ouvre/Lance [application]")
    print("  • Lance une musique de [artiste] sur Spotify")
    print("  • Cherche [requête] sur Google")
    print("  • Ouvre le dossier [nom]")
    print("  • Prends un screenshot")
    print("  • Ouvre Claude Code terminal")
    print("  • Active la caméra")
    print("  • Ouvre YouTube / Instagram / etc.")
    print("\nDites 'arrête Dzaryx' pour quitter.\n")

    speak("Dzaryx Desktop activé. Je contrôle votre PC. Parlez pour commander.")

    stop_words = {'arrête dzaryx', 'stop dzaryx', 'quitte dzaryx', 'ferme dzaryx', 'au revoir dzaryx'}

    while True:
        try:
            text = listen_once()
            if not text:
                continue

            if text.lower().strip() in stop_words or any(w in text.lower() for w in ['arrête dzaryx', 'quitte dzaryx']):
                speak("À bientôt Kouider. Dzaryx Desktop arrêté.")
                break

            response = ask_claude(text)
            if response:
                speak(response)

        except KeyboardInterrupt:
            print("\n")
            speak("Dzaryx Desktop arrêté.")
            break
        except Exception as e:
            print(f"\n\033[31m[ERREUR]\033[0m {e}")
            time.sleep(1)
            continue

if __name__ == '__main__':
    main()
