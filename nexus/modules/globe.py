"""
NEXUS Globe — globe holographique 3D façon JARVIS, piloté à la voix.

« Montre le globe », « fais-le tourner », « vue satellite », « va sur Oran », « zoome », « montre les avions »,
« les séismes », « les satellites », « la météo », « qu'est-ce qui s'est passé dans cette zone ? », « ferme le globe ».
L'affichage est gui/globe.html (CesiumJS), chargé dans le HUD ; les ordres lui arrivent en {'type': 'globe', ...}.
Les données passent par /globe-data/<type> sur le serveur local de Nexus (pas de souci CORS, cache, IP de la maison) :
avions (adsb.lol → airplanes.live → OpenSky), séismes (USGS), satellites (CelesTrak), météo (Open-Meteo), lieux (OSM).
"""
import json
import logging
import re
import time
import unicodedata
import urllib.parse
import urllib.request

log = logging.getLogger('nexus.globe')

UA = 'Nexus-FIK/1.0 (assistant personnel; contact fikconciergerie.com)'
_cache: dict[str, tuple[float, bytes]] = {}


def _norm(t: str) -> str:
    t = unicodedata.normalize('NFD', t.lower())
    return ''.join(c for c in t if unicodedata.category(c) != 'Mn')


def _get(url: str, ttl: float, timeout: float = 12) -> bytes:
    hit = _cache.get(url)
    if hit and time.time() - hit[0] < ttl:
        return hit[1]
    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': 'application/json'})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        body = r.read()
    _cache[url] = (time.time(), body)
    if len(_cache) > 200:
        for k in sorted(_cache, key=lambda k: _cache[k][0])[:50]:
            _cache.pop(k, None)
    return body


def _f(q: dict, k: str, default: float) -> float:
    try:
        return float(q.get(k, [default])[0])
    except (TypeError, ValueError):
        return default


def _planes(q: dict) -> dict:
    lat, lon = _f(q, 'lat', 35.7), _f(q, 'lon', -0.6)
    nm = max(10, min(250, int(_f(q, 'nm', 200))))
    for base in ('https://api.adsb.lol/v2/point', 'https://api.airplanes.live/v2/point'):
        try:
            d = json.loads(_get(f'{base}/{lat:.3f}/{lon:.3f}/{nm}', 12))
            out = []
            for a in d.get('ac') or []:
                if a.get('lat') is None or a.get('lon') is None or a.get('alt_baro') == 'ground':
                    continue
                alt = a.get('alt_baro') or a.get('alt_geom') or 0
                out.append({'id': a.get('hex'), 'cs': (a.get('flight') or a.get('r') or '').strip(), 'type': a.get('t') or '',
                            'lat': a['lat'], 'lon': a['lon'], 'alt': round(float(alt) * 0.3048), 'spd': round(float(a.get('gs') or 0) * 1.852),
                            'trk': float(a.get('track') or 0)})
            return {'source': base.split('/')[2], 'planes': out}
        except Exception as e:
            log.info('avions %s : %s', base, e)
    # Secours : OpenSky (anonyme, quota limité) sur un carré autour du point
    dl = nm / 60
    url = (f'https://opensky-network.org/api/states/all?lamin={lat - dl:.2f}&lomin={lon - dl * 1.3:.2f}'
           f'&lamax={lat + dl:.2f}&lomax={lon + dl * 1.3:.2f}')
    d = json.loads(_get(url, 20))
    out = [{'id': s[0], 'cs': (s[1] or '').strip(), 'type': '', 'lat': s[6], 'lon': s[5], 'alt': round(s[7] or s[13] or 0),
            'spd': round((s[9] or 0) * 3.6), 'trk': s[10] or 0}
           for s in d.get('states') or [] if s[5] is not None and s[6] is not None and not s[8]]
    return {'source': 'opensky', 'planes': out}


def _quakes(_q: dict) -> dict:
    d = json.loads(_get('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_week.geojson', 300))
    return {'quakes': [{'mag': f['properties'].get('mag'), 'place': f['properties'].get('place'), 'time': f['properties'].get('time'),
                        'lon': f['geometry']['coordinates'][0], 'lat': f['geometry']['coordinates'][1], 'depth': f['geometry']['coordinates'][2]}
                       for f in d.get('features', [])]}


def _sats(_q: dict) -> dict:
    # CelesTrak demande de ne pas recharger plus d'une fois toutes les 2 h
    out = []
    for group in ('stations', 'visual'):
        try:
            out += json.loads(_get(f'https://celestrak.org/NORAD/elements/gp.php?GROUP={group}&FORMAT=json', 7200))
        except Exception as e:
            log.info('satellites %s : %s', group, e)
    seen, sats = set(), []
    for s in out:
        if s.get('NORAD_CAT_ID') in seen:
            continue
        seen.add(s.get('NORAD_CAT_ID'))
        sats.append(s)
    return {'sats': sats[:220]}


def _weather(q: dict) -> dict:
    lat, lon = _f(q, 'lat', 35.7), _f(q, 'lon', -0.6)
    url = ('https://api.open-meteo.com/v1/forecast?' + urllib.parse.urlencode({
        'latitude': f'{lat:.3f}', 'longitude': f'{lon:.3f}', 'timezone': 'auto', 'forecast_days': 1,
        'current': 'temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code',
        'daily': 'sunrise,sunset'}))
    d = json.loads(_get(url, 600))
    c = d.get('current') or {}
    daily = d.get('daily') or {}
    return {'temp': c.get('temperature_2m'), 'feels': c.get('apparent_temperature'), 'hum': c.get('relative_humidity_2m'),
            'wind': c.get('wind_speed_10m'), 'code': c.get('weather_code'), 'offset': d.get('utc_offset_seconds', 0),
            'sunrise': (daily.get('sunrise') or [''])[0][-5:], 'sunset': (daily.get('sunset') or [''])[0][-5:]}


def _place(q: dict) -> dict:
    lat, lon = _f(q, 'lat', 0), _f(q, 'lon', 0)
    url = 'https://nominatim.openstreetmap.org/reverse?' + urllib.parse.urlencode({'lat': f'{lat:.3f}', 'lon': f'{lon:.3f}', 'format': 'json', 'zoom': 6, 'accept-language': 'fr'})
    a = (json.loads(_get(url, 3600)) or {}).get('address') or {}
    return {'name': a.get('state') or a.get('region') or a.get('county') or a.get('country') or '', 'country': a.get('country') or ''}


def _geocode(q: dict) -> dict:
    name = (q.get('q') or [''])[0][:120]
    url = 'https://nominatim.openstreetmap.org/search?' + urllib.parse.urlencode({'q': name, 'format': 'json', 'limit': 1, 'accept-language': 'fr'})
    r = json.loads(_get(url, 86400))
    if not r:
        return {'found': False}
    p = r[0]
    bb = [float(x) for x in p.get('boundingbox', [])]   # [sud, nord, ouest, est]
    return {'found': True, 'name': p.get('display_name', name).split(',')[0], 'full': p.get('display_name', ''),
            'lat': float(p['lat']), 'lon': float(p['lon']), 'bbox': bb}


DATA = {'planes': _planes, 'quakes': _quakes, 'sats': _sats, 'weather': _weather, 'geocode': _geocode, 'place': _place}


def serve(kind: str, query: str) -> tuple[int, bytes]:
    """Appelé par le serveur HTTP local : /globe-data/<kind>?<query>."""
    fn = DATA.get(kind)
    if not fn:
        return 404, b'{"error":"inconnu"}'
    try:
        return 200, json.dumps(fn(urllib.parse.parse_qs(query)), ensure_ascii=False).encode()
    except Exception as e:
        log.warning('globe-data %s : %s', kind, e)
        return 502, json.dumps({'error': str(e)[:200]}).encode()


# ── Commandes vocales ─────────────────────────────────────────────────────────

_GLOBE = r"(globe|terre|planete|carte du monde|mappemonde|monde en 3d)"
_OPEN = re.compile(rf"\b(montre|affiche|ouvre|lance|mets|sors)\b.*\b{_GLOBE}")
_CLOSE = re.compile(rf"\b(ferme|cache|enleve|quitte|retire|range)\b.*\b{_GLOBE}")
_SPIN_OFF = re.compile(r"\b(arrete|stop|stoppe|bloque|fige)\b.*\b(tourn|rotation)")
_SPIN_ON = re.compile(r"\b(fais|fait|faire|le|la)?\s*tourn|\brotation\b|\bspin\b")
_SAT_VIEW = re.compile(r"\b(vue|mode|image|photo|vraie[s]? image[s]?)\s+(satellite|reelle|realiste)|\bvue satellite\b")
_HOLO_VIEW = re.compile(r"\b(vue|mode)\s+(holo|hologramme|holographique|normale?|bleue?)")
_HIDE = re.compile(r"\b(cache|enleve|retire|masque|sans|coupe|eteins|desactive)\b")
_LAYERS = {
    'planes': re.compile(r"\b(avions?|vols?|trafic aerien|aeronefs?)\b"),
    'quakes': re.compile(r"\b(seismes?|tremblements? de terre|sismique)\b"),
    'sats':   re.compile(r"\b(satellites|iss|station spatiale|orbites?)\b"),
    'weather': re.compile(r"\b(meteo|temperature|temps qu.il fait)\b"),
}
_ZOOM_IN = re.compile(r"\b(zoom(e|er)?( avant| plus)?|rapproche|approche|plus pres)\b(?!.*\b(sur|a|en|vers)\b)")
_ZOOM_OUT = re.compile(r"\b(dezoom\w*|zoom arriere|recule|eloigne|plus loin)\b")
_HOME = re.compile(r"\b(vue d.ensemble|reviens|retour|vue globale|tout le globe|tout le monde)\b")
_EVENTS = re.compile(r"(qu.est.ce qui (s.est passe|se passe)|quoi de neuf|evenements?|il s.est passe quoi|quoi de recent|ce qui se passe)")
_FLY = re.compile(r"\b(va|vas|allons|zoom\w*|montre(?:[- ]moi)?|centre|emmene(?:[- ]moi)?|focus|direction|affiche|survole)\b\s+(?:sur|a|en|au|aux|vers|dans|la ville de|le pays)\s+(.+)$")


class Globe:
    def __init__(self, app):
        self.app = app
        self.active = False

    async def _send(self, **cmd) -> None:
        await self.app.gui_send({'type': 'globe', **cmd})

    async def handle(self, text: str) -> str | None:
        t = _norm(text).strip(' .!?')
        if _CLOSE.search(t):
            if not self.active:
                return None
            self.active = False
            await self._send(action='close')
            return 'Globe fermé.'
        opening = bool(_OPEN.search(t))
        if not self.active and not opening:
            return None      # globe fermé : on ne vole pas les autres commandes (« montre-moi les réservations »…)
        replies: list[str] = []
        if opening and not self.active:
            self.active = True
            await self._send(action='open')
            replies.append('Voici le globe.')

        m = _FLY.search(t)
        if m and not _EVENTS.search(t):
            # Texte sans accents : Nominatim retrouve « bejaia » comme « Béjaïa »
            place = re.sub(r"\b(sur le globe|sur la carte|s.il te plait|stp|nexus)\b", '', m.group(2)).strip(' .,!?')
            if place and not any(p.search(_norm(place)) for p in _LAYERS.values()) and not re.search(_GLOBE, _norm(place)):
                await self._send(action='fly', query=place)
                return ' '.join(replies + [f'Je t\'emmène sur {place.title()}.'])

        if _SPIN_OFF.search(t):
            await self._send(action='spin', on=False); replies.append('Rotation arrêtée.')
        elif _SPIN_ON.search(t):
            await self._send(action='spin', on=True); replies.append('Rotation lancée.')
        if _HOLO_VIEW.search(t):
            await self._send(action='view', mode='holo'); replies.append('Vue holographique.')
        elif _SAT_VIEW.search(t):
            await self._send(action='view', mode='satellite'); replies.append('Vue satellite.')
        if _EVENTS.search(t):
            await self._send(action='events')
            return ' '.join(replies)                  # '' = traité ; la page répond elle-même (globe_reply)
        hide = bool(_HIDE.search(t))
        names = {'planes': 'les avions', 'quakes': 'les séismes', 'sats': 'les satellites', 'weather': 'la météo'}
        for k, rx in _LAYERS.items():
            if k == 'sats' and _SAT_VIEW.search(t):
                continue
            if rx.search(t):
                await self._send(action='layer', name=k, on=not hide)
                replies.append(f"{'Je cache' if hide else 'Voici'} {names[k]}.")
        if _ZOOM_OUT.search(t):
            await self._send(action='zoom', dir='out'); replies.append('Je recule.')
        elif _ZOOM_IN.search(t):
            await self._send(action='zoom', dir='in'); replies.append('Je zoome.')
        if _HOME.search(t):
            await self._send(action='home'); replies.append('Vue d\'ensemble.')
        return ' '.join(replies) if replies else None
