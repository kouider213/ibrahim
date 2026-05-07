"""
NEXUS Night Watch
Runs between 01h-05h (once per night).
Scrapes: Anthropic blog, GitHub claude skills, Reddit/HN tech news.
Saves a report for morning briefing.
"""
import asyncio
import json
import logging
import os
from datetime import date, datetime
from pathlib import Path

log = logging.getLogger('nexus.night_watch')

REPORT_FILE = Path(__file__).parent.parent / '.night_watch_report.json'
_last_watch_date: date | None = None

SOURCES = {
    'anthropic': 'https://www.anthropic.com/news',
    'hackernews': 'https://news.ycombinator.com/best',
}


class NightWatch:
    def __init__(self, app) -> None:
        self.app = app
        self._client = None
        self._setup_claude()

    def _setup_claude(self) -> None:
        api_key = os.environ.get('ANTHROPIC_API_KEY', '')
        if not api_key:
            return
        try:
            import anthropic
            self._client = anthropic.Anthropic(api_key=api_key)
        except ImportError:
            pass

    async def run_loop(self) -> None:
        """Check every hour if it's night time to run the watch."""
        while True:
            await asyncio.sleep(3600)
            await self._maybe_run()

    async def _maybe_run(self) -> None:
        global _last_watch_date
        now = datetime.now()
        today = date.today()

        if _last_watch_date == today:
            return
        if not (1 <= now.hour < 5):
            return

        _last_watch_date = today
        log.info('Night watch starting...')
        await self.app.journal('🌙 Night watch démarré')

        try:
            summary = await self._gather_news()
            if summary:
                REPORT_FILE.write_text(
                    json.dumps({'date': str(today), 'summary': summary}, ensure_ascii=False),
                    encoding='utf-8',
                )
                await self.app.journal(f'🌙 Night watch terminé — rapport prêt')
        except Exception as e:
            log.error('Night watch error: %s', e)

    async def _gather_news(self) -> str:
        import aiohttp
        raw_parts: list[str] = []

        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }

        async with aiohttp.ClientSession(headers=headers) as session:
            # Anthropic news
            try:
                async with session.get(SOURCES['anthropic'], timeout=aiohttp.ClientTimeout(total=15)) as r:
                    html = await r.text()
                    # Extract first 3000 chars of visible text (rough)
                    import re
                    text = re.sub(r'<[^>]+>', ' ', html)
                    text = re.sub(r'\s+', ' ', text).strip()
                    raw_parts.append(f"[Anthropic News]\n{text[:3000]}")
            except Exception as e:
                log.warning('Anthropic fetch: %s', e)

            # HackerNews
            try:
                async with session.get(
                    'https://hacker-news.firebaseio.com/v0/beststories.json',
                    timeout=aiohttp.ClientTimeout(total=10),
                ) as r:
                    story_ids = (await r.json())[:15]

                hn_titles: list[str] = []
                for sid in story_ids[:10]:
                    try:
                        async with session.get(
                            f'https://hacker-news.firebaseio.com/v0/item/{sid}.json',
                            timeout=aiohttp.ClientTimeout(total=5),
                        ) as rs:
                            s = await rs.json()
                            if s and s.get('title'):
                                hn_titles.append(f"- {s['title']}")
                    except Exception:
                        pass
                if hn_titles:
                    raw_parts.append(f"[HackerNews Top]\n" + '\n'.join(hn_titles))
            except Exception as e:
                log.warning('HN fetch: %s', e)

        if not raw_parts or not self._client:
            return ''

        combined = '\n\n'.join(raw_parts)[:6000]
        loop = asyncio.get_event_loop()
        summary = await loop.run_in_executor(None, self._summarize, combined)
        return summary

    def _summarize(self, raw: str) -> str:
        try:
            resp = self._client.messages.create(
                model='claude-haiku-4-5-20251001',
                max_tokens=300,
                system=(
                    "Tu es l'assistant de veille technologique de NEXUS pour Kouider (Fik Conciergerie). "
                    "Résume les actualités tech les plus importantes en 2-3 phrases en français. "
                    "Focus: Anthropic/Claude nouvelles features, IA générale, tech utile pour location de voitures/business. "
                    "Sois très bref et percutant."
                ),
                messages=[{'role': 'user', 'content': f"Actualités de cette nuit:\n{raw}"}],
            )
            return resp.content[0].text.strip()
        except Exception as e:
            log.error('Summarize error: %s', e)
            return ''
