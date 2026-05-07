"""
NEXUS Morning Briefing
Runs once per day between 6h-13h at startup.
Covers: date, météo, Railway health, réservations du jour, disque, nouveautés nuit.
"""
import asyncio
import logging
import os
from datetime import date, datetime

log = logging.getLogger('nexus.briefing')

_MONTHS_FR = [
    '', 'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
    'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
]
_DAYS_FR = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche']

_last_briefing_date: date | None = None


class MorningBriefing:
    def __init__(self, app) -> None:
        self.app = app

    async def run_if_morning(self) -> None:
        global _last_briefing_date
        now = datetime.now()
        today = date.today()

        if _last_briefing_date == today:
            return
        if not (6 <= now.hour < 13):
            return

        _last_briefing_date = today
        await asyncio.sleep(6)  # Wait for startup voice to finish
        await self._deliver()

    async def run_now(self) -> None:
        """Force briefing (e.g. command "briefing" from Kouider)."""
        await self._deliver()

    async def _deliver(self) -> None:
        log.info('Running morning briefing...')
        await self.app.gui_send({'type': 'thinking', 'active': True})

        now = datetime.now()
        parts: list[str] = []
        parts.append("Briefing matinal NEXUS.")
        day_fr  = _DAYS_FR[now.weekday()]
        month_fr = _MONTHS_FR[now.month]
        parts.append(f"Nous sommes {day_fr} {now.day} {month_fr} {now.year}, {now.hour}h{now.minute:02d}.")

        # 1. Weather
        weather = await self.app._fetch_weather()
        if weather:
            parts.append(f"Météo Oran: {weather['temp']} degrés, {weather['desc']}.")
            await self.app.gui_send({'type': 'widget', 'widget': 'weather', 'data': weather})

        # 2. Railway health
        railway_ok = await self._check_railway()
        status_str = 'ok' if railway_ok else 'offline'
        await self.app.gui_send({'type': 'widget', 'widget': 'railway', 'data': {'status': status_str}})
        if railway_ok:
            parts.append("Backend Railway opérationnel.")
        else:
            parts.append("Attention: backend Railway inaccessible.")

        # 3. Bookings
        bookings_count = await self._fetch_bookings()
        if bookings_count is not None:
            await self.app.gui_send({'type': 'widget', 'widget': 'bookings', 'data': {'count': bookings_count}})
            if bookings_count == 0:
                parts.append("Aucune réservation active aujourd'hui.")
            elif bookings_count == 1:
                parts.append("Une réservation active aujourd'hui.")
            else:
                parts.append(f"{bookings_count} réservations actives aujourd'hui.")

        # 4. Disk
        try:
            import shutil
            t, u, f = shutil.disk_usage('C:')
            pct = round(u / t * 100, 1)
            free_gb = round(f / 1e9, 1)
            await self.app.gui_send({'type': 'widget', 'widget': 'disk', 'data': {'total': t, 'used': u, 'free': f, 'pct': pct}})
            if pct > 85:
                parts.append(f"Disque C à {pct} pourcent — seulement {free_gb} giga libres. Pensez à nettoyer.")
        except Exception:
            pass

        # 5. Night watch summary (if any)
        night_summary = await self._get_night_summary()
        if night_summary:
            parts.append(f"Nouveautés de la nuit: {night_summary}")

        await self.app.gui_send({'type': 'thinking', 'active': False})

        full_text = ' '.join(parts)
        await self.app.speak(full_text)
        await self.app.journal(f'📋 Briefing matinal — {now.strftime("%H:%M")}')

    async def _check_railway(self) -> bool:
        import aiohttp
        url = os.environ.get('BACKEND_URL', 'https://ibrahim-backend-production.up.railway.app')
        try:
            async with aiohttp.ClientSession() as s:
                async with s.get(f'{url}/health', timeout=aiohttp.ClientTimeout(total=8)) as r:
                    return r.status == 200
        except Exception:
            return False

    async def _fetch_bookings(self) -> int | None:
        import aiohttp
        backend = os.environ.get('BACKEND_URL', 'https://ibrahim-backend-production.up.railway.app')
        token   = os.environ.get('PC_AGENT_TOKEN', '')
        try:
            async with aiohttp.ClientSession() as s:
                async with s.get(
                    f'{backend}/api/bookings?status=ACTIVE,CONFIRMED',
                    headers={'Authorization': f'Bearer {token}'},
                    timeout=aiohttp.ClientTimeout(total=8),
                ) as r:
                    data = await r.json()
                    items = data if isinstance(data, list) else data.get('data', [])
                    return len(items)
        except Exception as e:
            log.error('Bookings fetch: %s', e)
            return None

    async def _get_night_summary(self) -> str:
        """Read last night_watch report if available."""
        import json
        from pathlib import Path
        report_file = Path(__file__).parent.parent / '.night_watch_report.json'
        if not report_file.exists():
            return ''
        try:
            data = json.loads(report_file.read_text(encoding='utf-8'))
            from datetime import date as d
            if data.get('date') == str(d.today()):
                summary = data.get('summary', '')
                report_file.unlink(missing_ok=True)
                return summary
        except Exception:
            pass
        return ''
