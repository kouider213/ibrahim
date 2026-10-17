"""
NEXUS Globe — globe holographique 3D façon JARVIS, piloté à la voix.

« Montre le globe », « fais-le tourner », « vue satellite », « va sur Oran », « zoome », « montre les avions »,
« les séismes », « les satellites », « la météo », « qu'est-ce qui s'est passé dans cette zone ? », « ferme le globe ».
L'affichage est gui/globe.html (CesiumJS), chargé dans le HUD ; les ordres lui arrivent en {'type': 'globe', ...}.
Les données passent par /globe-data/<type> sur le serveur local de Nexus (pas de souci CORS, cache, IP de la maison) :
avions (adsb.lol → airplanes.live → OpenSky), séismes (USGS), satellites (CelesTrak), météo (Open-Meteo), lieux (OSM),
avions en route vers / au départ d'une ville (OpenSky + routes adsbdb), caméras publiques (TfL Londres, Caltrans Californie,
Digitraffic Finlande, et partout dans le monde avec une clé gratuite Windy dans .env : WINDY_WEBCAMS_KEY).
"""
import gzip
import json
import logging
import math
import os
import re
import time
import unicodedata
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor

log = logging.getLogger('nexus.globe')

UA = 'Nexus-FIK/1.0 (assistant personnel; contact fikconciergerie.com)'
_cache: dict[str, tuple[float, bytes]] = {}


def _norm(t: str) -> str:
    t = unicodedata.normalize('NFD', t.lower())
    return ''.join(c for c in t if unicodedata.category(c) != 'Mn')


_down: dict[str, float] = {}


def _get(url: str, ttl: float, timeout: float = 12, headers: dict | None = None) -> bytes:
    hit = _cache.get(url)
    if hit and time.time() - hit[0] < ttl:
        return hit[1]
    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': 'application/json', 'Accept-Encoding': 'gzip', **(headers or {})})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        body = r.read()
        if r.headers.get('Content-Encoding') == 'gzip':
            body = gzip.decompress(body)
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
        if time.time() < _down.get(base, 0):      # source en panne : on ne la réessaie pas avant 10 min
            continue
        try:
            d = json.loads(_get(f'{base}/{lat:.3f}/{lon:.3f}/{nm}', 12, timeout=6))
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
            _down[base] = time.time() + 600
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


def _km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = math.pi / 180
    x = math.sin((lat2 - lat1) * r / 2) ** 2 + math.cos(lat1 * r) * math.cos(lat2 * r) * math.sin((lon2 - lon1) * r / 2) ** 2
    return 12742 * math.asin(math.sqrt(min(1, x)))


def _bearing(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = math.pi / 180
    y = math.sin((lon2 - lon1) * r) * math.cos(lat2 * r)
    x = math.cos(lat1 * r) * math.sin(lat2 * r) - math.sin(lat1 * r) * math.cos(lat2 * r) * math.cos((lon2 - lon1) * r)
    return (math.atan2(y, x) / r + 360) % 360


_no_route: dict[str, float] = {}


def _route(cs: str) -> dict | None:
    """Départ/arrivée d'un vol par son indicatif (adsbdb, gratuit) ; None si inconnu."""
    if time.time() < _no_route.get(cs, 0):
        return None
    try:
        r = (json.loads(_get(f'https://api.adsbdb.com/v0/callsign/{urllib.parse.quote(cs)}', 21600, timeout=6)).get('response') or {})
        fr = r.get('flightroute') if isinstance(r, dict) else None
        if isinstance(fr, dict) and fr.get('destination'):
            return fr
    except Exception:
        pass
    _no_route[cs] = time.time() + 21600
    return None


def _airport(a: dict) -> dict:
    return {'iata': a.get('iata_code') or a.get('icao_code') or '', 'city': a.get('municipality') or a.get('name') or '',
            'name': a.get('name') or '', 'country': a.get('country_name') or '', 'lat': a.get('latitude'), 'lon': a.get('longitude')}


def _inbound(q: dict) -> dict:
    """Avions en route vers (mode=in) ou partis de (mode=out) une ville : positions OpenSky + route de chaque vol."""
    lat, lon = _f(q, 'lat', 35.62), _f(q, 'lon', -0.62)
    out_mode = (q.get('mode') or ['in'])[0] == 'out'
    dl = 24.0
    dlon = min(45.0, dl / max(0.3, math.cos(math.radians(lat))))
    url = (f'https://opensky-network.org/api/states/all?lamin={max(-89, lat - dl):.1f}&lomin={max(-180, lon - dlon):.1f}'
           f'&lamax={min(89, lat + dl):.1f}&lomax={min(180, lon + dlon):.1f}')
    states = json.loads(_get(url, 45, timeout=20)).get('states') or []
    cands = []
    for s in states:
        cs = (s[1] or '').strip()
        if not cs or s[5] is None or s[6] is None or s[8]:
            continue
        d = _km(s[6], s[5], lat, lon)
        trk = s[10] or 0
        b = _bearing(s[6], s[5], lat, lon) if not out_mode else _bearing(lat, lon, s[6], s[5])
        diff = abs((trk - b + 180) % 360 - 180)
        vr = s[11] or 0
        near = d < 150 and (diff < 60 or (vr >= 0 if out_mode else vr <= 0))   # près de la ville : en approche / en montée
        if near or (d < 3800 and diff < 28):
            cands.append((d, cs, s, near))
    cands.sort(key=lambda c: c[0])
    # Autour d'une grande ville les avions proches rempliraient tout : 30 places pour eux, le reste pour ceux qui arrivent de loin
    cands = ([c for c in cands if c[3]][:30] + [c for c in cands if not c[3]])[:90]
    cands = [c[:3] for c in cands]
    with ThreadPoolExecutor(10) as ex:
        routes = list(ex.map(lambda c: _route(c[1]), cands))
    flights, airport = [], None
    for (d, cs, s), fr in zip(cands, routes):
        if not fr:
            continue
        end = fr.get('origin' if out_mode else 'destination') or {}
        if end.get('latitude') is None or _km(end['latitude'], end['longitude'], lat, lon) > 70:
            continue
        airport = airport or _airport(end)
        spd = (s[9] or 0) * 3.6
        dist = _km(s[6], s[5], end['latitude'], end['longitude'])
        flights.append({'cs': cs, 'id': s[0], 'airline': ((fr.get('airline') or {}).get('name') or ''),
                        'from': _airport(fr.get('origin') or {}), 'to': _airport(fr.get('destination') or {}),
                        'lat': s[6], 'lon': s[5], 'alt': round(s[7] or s[13] or 0), 'spd': round(spd), 'trk': s[10] or 0,
                        'vr': s[11] or 0, 'dist': round(dist), 'eta': round(dist / spd * 60) if spd > 80 and not out_mode else None})
    flights.sort(key=lambda f: f['dist'] if not out_mode else -f['dist'])
    return {'mode': 'out' if out_mode else 'in', 'airport': airport, 'flights': flights, 'checked': len(cands)}


# ── Caméras publiques (officielles, faites pour être regardées) ──────────────
_CALTRANS = (32.4, -124.6, 42.1, -114.0)
_FINLAND = (59.6, 19.0, 70.2, 31.7)
_LONDON = (51.2, -0.7, 51.8, 0.4)
_cam_lists: dict[str, tuple[float, list]] = {}


def _in_box(lat: float, lon: float, box: tuple, pad: float) -> bool:
    return box[0] - pad <= lat <= box[2] + pad and box[1] - pad <= lon <= box[3] + pad


def _cam_list(name: str, loader) -> list:
    hit = _cam_lists.get(name)
    if hit and time.time() - hit[0] < 6 * 3600:
        return hit[1]
    try:
        cams = loader()
    except Exception as e:
        log.info('caméras %s : %s', name, e)
        return hit[1] if hit else []
    _cam_lists[name] = (time.time(), cams)
    return cams


def _tfl() -> list:
    out = []
    for c in json.loads(_get('https://api.tfl.gov.uk/Place/Type/JamCam', 21600, timeout=20)):
        p = {a['key']: a['value'] for a in c.get('additionalProperties') or []}
        if p.get('available') == 'false' or not p.get('imageUrl'):
            continue
        out.append({'id': c['id'], 'name': c.get('commonName', ''), 'city': 'Londres', 'lat': c['lat'], 'lon': c['lon'],
                    'img': p['imageUrl'], 'video': p.get('videoUrl', ''), 'src': 'TfL'})
    return out


def _caltrans() -> list:
    def district(n: int) -> list:
        try:
            d = json.loads(_get(f'https://cwwp2.dot.ca.gov/data/d{n}/cctv/cctvStatusD{n:02d}.json', 21600, timeout=25))
        except Exception:
            return []
        out = []
        for row in d.get('data') or []:
            c = row.get('cctv') or {}
            loc, img = c.get('location') or {}, ((c.get('imageData') or {}).get('static') or {}).get('currentImageURL')
            if c.get('inService') != 'true' or not img:
                continue
            try:
                out.append({'id': f"ct{n}-{c.get('index')}", 'name': loc.get('locationName', ''), 'city': loc.get('nearbyPlace') or 'Californie',
                            'lat': float(loc['latitude']), 'lon': float(loc['longitude']), 'img': img, 'video': '', 'src': 'Caltrans'})
            except (KeyError, ValueError):
                pass
        return out
    with ThreadPoolExecutor(6) as ex:
        return [c for part in ex.map(district, range(1, 13)) for c in part]


def _finland() -> list:
    out = []
    for f in json.loads(_get('https://tie.digitraffic.fi/api/weathercam/v1/stations', 21600, timeout=20)).get('features') or []:
        pr = f.get('properties') or {}
        presets = [x['id'] for x in pr.get('presets') or [] if x.get('inCollection')]
        if not presets or pr.get('collectionStatus') != 'GATHERING':
            continue
        lon, lat = f['geometry']['coordinates'][:2]
        out.append({'id': pr['id'], 'name': pr.get('name', '').split('_', 1)[-1], 'city': 'Finlande', 'lat': lat, 'lon': lon,
                    'img': f'https://weathercam.digitraffic.fi/{presets[0]}.jpg', 'video': '', 'src': 'Digitraffic'})
    return out


def _windy_raw(params: dict, ttl: float = 300) -> dict:
    """Requête Windy Webcams : directe si la clé est dans .env, sinon via le backend (clé gardée côté serveur)."""
    key = os.getenv('WINDY_WEBCAMS_KEY', '').strip()
    if key:
        url = 'https://api.windy.com/webcams/api/v3/webcams?' + urllib.parse.urlencode(
            {**params, 'limit': 50, 'lang': 'fr', 'include': 'location,images,player'})
        headers = {'x-windy-api-key': key}
    else:
        token = os.getenv('PC_AGENT_TOKEN', '').strip()
        if not token:
            return {}
        backend = os.getenv('BACKEND_URL', 'https://ibrahim-backend-production.up.railway.app').rstrip('/')
        url = f'{backend}/api/nexus/data/webcams?' + urllib.parse.urlencode(params)
        headers = {'Authorization': f'Bearer {token}'}
    try:
        return json.loads(_get(url, ttl, timeout=15, headers=headers))
    except Exception as e:
        log.info('caméras windy : %s', e)
        return {}


def _windy_cams(d: dict) -> list:
    out = []
    for w in d.get('webcams') or []:
        loc, pl = w.get('location') or {}, w.get('player') or {}
        out.append({'id': f"w{w.get('webcamId')}", 'name': w.get('title', ''), 'city': loc.get('city') or loc.get('country') or '',
                    'country': loc.get('country') or '', 'lat': loc.get('latitude'), 'lon': loc.get('longitude'),
                    'img': (((w.get('images') or {}).get('current') or {}).get('preview') or ''), 'video': '',
                    'embed': pl.get('live') or pl.get('day') or '', 'src': 'Windy', 'views': w.get('viewCount')})
    return [c for c in out if c['lat'] is not None]


def _windy(lat: float, lon: float, km: float) -> list:
    return _windy_cams(_windy_raw({'nearby': f'{lat:.3f},{lon:.3f},{int(min(250, max(5, km)))}'}))


# Clé Windy gratuite : 68 000+ caméras recensées, mais lecture limitée aux 1 050 premières (offset ≤ 1000) → les plus regardées
def _world(q: dict) -> dict:
    with ThreadPoolExecutor(6) as ex:
        pages = list(ex.map(lambda o: _windy_raw({'offset': o, 'sortKey': 'popularity', 'sortDirection': 'desc'}, 3600), range(0, 1001, 50)))
        keyless = list(ex.map(lambda nl: _cam_list(*nl), [('tfl', _tfl), ('caltrans', _caltrans), ('finland', _finland)]))
    seen, windy = set(), []
    for c in (c for p in pages for c in _windy_cams(p)):
        if c['id'] not in seen:
            seen.add(c['id']); windy.append(c)
    for name, part in zip(('Royaume-Uni', 'États-Unis', 'Finlande'), keyless):
        for c in part:
            c.setdefault('country', name)
    free = [c for part in keyless for c in part]
    windy_total = max((p.get('total') or 0 for p in pages), default=0)
    return {'cams': windy + free, 'total': windy_total + len(free), 'windy_total': windy_total, 'windy': bool(pages and pages[0])}


def _cams(q: dict) -> dict:
    lat, lon = _f(q, 'lat', 35.7), _f(q, 'lon', -0.6)
    km = max(5.0, min(250.0, _f(q, 'km', 60)))
    pool = []
    if _in_box(lat, lon, _LONDON, km / 80):
        pool += _cam_list('tfl', _tfl)
    if _in_box(lat, lon, _CALTRANS, km / 80):
        pool += _cam_list('caltrans', _caltrans)
    if _in_box(lat, lon, _FINLAND, km / 80):
        pool += _cam_list('finland', _finland)
    pool += _windy(lat, lon, km)
    for c in pool:
        c['dist'] = round(_km(lat, lon, c['lat'], c['lon']), 1)
    near = sorted((c for c in pool if c['dist'] <= km), key=lambda c: c['dist'])[:80]
    return {'cams': near, 'windy': bool(os.getenv('WINDY_WEBCAMS_KEY', '').strip() or os.getenv('PC_AGENT_TOKEN', '').strip()),
            'nearest_elsewhere': None if near else _nearest_cam_zone(lat, lon)}


def _nearest_cam_zone(lat: float, lon: float) -> dict:
    zones = [('Londres', 51.507, -0.128), ('San Francisco', 37.775, -122.419), ('Los Angeles', 34.052, -118.244), ('Helsinki', 60.170, 24.938)]
    name, zl, zo = min(zones, key=lambda z: _km(lat, lon, z[1], z[2]))
    return {'name': name, 'lat': zl, 'lon': zo, 'dist': round(_km(lat, lon, zl, zo))}


DATA = {'planes': _planes, 'quakes': _quakes, 'sats': _sats, 'weather': _weather, 'geocode': _geocode, 'place': _place,
        'inbound': _inbound, 'cams': _cams, 'world': _world}


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
# « Y a-t-il des avions qui se dirigent vers Oran ? », « les vols qui partent d'Alger »
_FLIGHTS_OUT = re.compile(r"\b(avions?|vols?)\b.*?\b(?:qui\s+(?:partent|part|decollent|decolle|ont decolle|viennent|vient|arrivent|arrive)\s+(?:de|d'|du|des)|(?:partis?|decolles?|en provenance|au depart|venant|provenant)\s+(?:de|d'|du|des))\s*(.+)$")
_FLIGHTS_IN = re.compile(r"\b(avions?|vols?)\b.*?\b(?:qui\s+(?:vont|va|arrivent|arrive|atterrissent|atterrit|se dirigent|se dirige|volent|vole|descendent)\s+(?:vers|a|sur|en|au|aux|pour)|(?:se dirigeant|en route|en direction|en approche)\s+(?:vers|de|d'|pour|sur)|a destination\s+(?:de|d')|vers|pour)\s*(.+)$")
_FLIGHTS_CLOSE = re.compile(r"\b(ferme|cache|enleve|retire)\b.*\b(liste|widget|panneau|vols?)\b")
# Caméras publiques du monde (≠ « ouvre la caméra » = webcam du PC, gérée plus loin dans nexus.py)
_CAMS = re.compile(r"\b(cameras?|webcams?|cams)\b")
_CAMS_WORLD = re.compile(r"\b(du monde|dans le monde|monde entier|toute la planete|de la planete|partout|toutes les cameras|mondiales?)\b")
_CAMS_PLACE = re.compile(r"\b(?:a|au|aux|en|de|du|des|sur|dans|pres de|autour de|a cote de)\s+(.+)$")
_CAM_NEXT = re.compile(r"\b(suivante?|autre|change|prochaine?)\b")
_CAM_PREV = re.compile(r"\b(precedente?|d.avant|retour)\b")
_CAM_BIG = re.compile(r"\b(agrandi\w*|plus grand\w*|plein ecran|en grand)\b")
_CAM_SMALL = re.compile(r"\b(reduis|reduit|plus petit\w*|en petit)\b")
_CAM_CLOSE = re.compile(r"\b(ferme|cache|enleve|retire|coupe|eteins|arrete)\b")
_FILLER = re.compile(r"\b(s.il te pla[iî]t|stp|en ce moment|maintenant|actuellement|aujourd.hui|nexus|sur le globe|sur la carte|en direct|en live|live|publiques?|open source|ouvertes?|du monde)\b")


def _clean_place(p: str) -> str:
    p = _FILLER.sub(' ', p)
    p = re.sub(r"^(?:l'|la |le |les )", '', p.strip(' .,!?'))
    return re.sub(r'\s+', ' ', p).strip(' .,!?')


_FLY = re.compile(r"\b(va|vas|allons|zoom\w*|montre(?:[- ]moi)?|centre|emmene(?:[- ]moi)?|focus|direction|affiche|survole)\b\s+(?:sur|a|en|au|aux|vers|dans|la ville de|le pays)\s+(.+)$")


class Globe:
    def __init__(self, app):
        self.app = app
        self.active = False
        self.cams_open = False
        self.flights_open = False

    async def _send(self, **cmd) -> None:
        await self.app.gui_send({'type': 'globe', **cmd})

    async def _ensure_open(self) -> str:
        if self.active:
            return ''
        self.active = True
        await self._send(action='open')
        return ''

    async def handle(self, text: str) -> str | None:
        t = _norm(text).strip(' .!?')
        if _CLOSE.search(t):
            if not self.active:
                return None
            self.active = False      # les widgets restent dans la page : on garde cams_open / flights_open
            await self._send(action='close')
            return 'Globe fermé.'
        # ── Avions vers / depuis une ville : ouvre le globe si besoin, la liste s'affiche sur le côté
        mo, mi = _FLIGHTS_OUT.search(t), _FLIGHTS_IN.search(t)
        m = mo or mi
        if m:
            place = _clean_place(m.group(2))
            if place and not re.search(_GLOBE, place) and not _HIDE.match(t):
                pre = await self._ensure_open()
                self.flights_open = True
                await self._send(action='inbound', query=place, mode='out' if mo else 'in')
                return pre      # la page annonce elle-même le résultat (globe_reply)
        if self.cams_open and not self.flights_open and _FLIGHTS_CLOSE.search(t):
            self.cams_open = False
            await self._send(action='cam_close_all')
            return 'Liste des caméras fermée.'
        if self.flights_open and _FLIGHTS_CLOSE.search(t):
            self.flights_open = False
            await self._send(action='inbound_close')
            return 'Liste des vols fermée.'

        # ── Caméras publiques
        if _CAMS.search(t):
            after = t[_CAMS.search(t).end():]
            pm = _CAMS_PLACE.search(_FILLER.sub(' ', _CAMS_WORLD.sub(' ', after)))
            place = _clean_place(pm.group(1)) if pm else ''
            if self.cams_open and _CAM_CLOSE.search(t):
                self.cams_open = False
                await self._send(action='cam_close')
                return 'Caméra fermée.'
            if self.cams_open and _CAM_NEXT.search(t) and not place:
                await self._send(action='cam_next'); return 'Caméra suivante.'
            if self.cams_open and _CAM_PREV.search(t) and not place:
                await self._send(action='cam_prev'); return 'Caméra précédente.'
            if self.cams_open and _CAM_BIG.search(t):
                await self._send(action='cam_size', big=True); return 'Je l\'agrandis.'
            if self.cams_open and _CAM_SMALL.search(t):
                await self._send(action='cam_size', big=False); return 'Je la réduis.'
            if not place and _CAMS_WORLD.search(t) and not _CAM_CLOSE.search(t):
                pre = await self._ensure_open()
                self.cams_open = True
                await self._send(action='cams_world')
                return pre      # la page annonce le nombre de caméras (globe_reply)
            plural = bool(re.search(r"\b(cameras|webcams|cams)\b", t))
            if place or (self.active and (plural or 'webcam' in t)):
                pre = await self._ensure_open()
                self.cams_open = True
                await self._send(action='cams', query=place)
                return pre

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
                if k == 'planes' and hide and self.flights_open:
                    self.flights_open = False
                    await self._send(action='inbound_close')
                replies.append(f"{'Je cache' if hide else 'Voici'} {names[k]}.")
        if _ZOOM_OUT.search(t):
            await self._send(action='zoom', dir='out'); replies.append('Je recule.')
        elif _ZOOM_IN.search(t):
            await self._send(action='zoom', dir='in'); replies.append('Je zoome.')
        if _HOME.search(t):
            await self._send(action='home'); replies.append('Vue d\'ensemble.')
        return ' '.join(replies) if replies else None
