"""
NEXUS TikTok Analyzer
Analyse TikTok via Chrome profil dédié NEXUS.
Premier lancement: Chrome s'ouvre → connecte-toi à TikTok une fois → cookies sauvegardés.
"""
import asyncio
import logging
import time
import urllib.parse
from pathlib import Path

log = logging.getLogger('nexus.tiktok')

CHROME_PATHS = [
    r'C:\Program Files\Google\Chrome\Application\chrome.exe',
    r'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe',
]

# Profil Chrome dédié NEXUS (séparé du Chrome principal pour éviter conflits)
NEXUS_PROFILE_DIR = str(
    Path.home() / 'AppData' / 'Local' / 'Google' / 'Chrome' / 'User Data' / 'NEXUS'
)

KEYWORDS = [
    'location voiture Oran',
    'location aéroport Oran',
    'Fik Conciergerie',
    'تأجير سيارات وهران',
]

# Sélecteurs TikTok (TikTok change souvent ses classes)
_DESC_SELECTORS = [
    '[data-e2e="search-card-desc"]',
    '[class*="DivDescription"]',
    '[class*="video-desc"]',
    'h3',
]
_LIKE_SELECTORS = [
    '[data-e2e="like-count"]',
    '[data-e2e="search-card-like-count"]',
    '[class*="LikeCount"]',
    '[class*="like-count"]',
]
_ITEM_SELECTORS = [
    '[data-e2e="search_top-item"]',
    '[class*="DivItemContainerForSearch"]',
    '[class*="search-card-container"]',
    'div[class*="ItemContainer"]',
]


class TikTokAnalyzer:
    def __init__(self, app) -> None:
        self.app = app

    async def analyze(self, keyword: str | None = None) -> str:
        kw = keyword.strip() if keyword else KEYWORDS[0]
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(None, self._sync_analyze, kw)

    async def analyze_all(self) -> str:
        """Analyse les 2 premiers mots-clés."""
        results = []
        for kw in KEYWORDS[:2]:
            r = await self.analyze(kw)
            results.append(r)
            await asyncio.sleep(3)
        return '\n\n'.join(results)

    def _sync_analyze(self, keyword: str) -> str:
        try:
            from selenium import webdriver
            from selenium.webdriver.chrome.options import Options
            from selenium.webdriver.common.by import By
            from selenium.common.exceptions import WebDriverException
        except ImportError:
            return (
                'selenium non installé.\n'
                'Installe: pip install selenium\n'
                'ChromeDriver télécharge automatiquement avec selenium>=4.6'
            )

        opts = Options()
        opts.add_argument(f'--user-data-dir={NEXUS_PROFILE_DIR}')
        opts.add_argument('--profile-directory=Default')
        opts.add_argument('--no-sandbox')
        opts.add_argument('--disable-dev-shm-usage')
        opts.add_argument('--disable-blink-features=AutomationControlled')
        opts.add_argument('--disable-notifications')
        opts.add_experimental_option('excludeSwitches', ['enable-automation'])
        opts.add_experimental_option('useAutomationExtension', False)

        driver = None
        try:
            driver = webdriver.Chrome(options=opts)
            # Masque l'automation pour éviter blocage TikTok
            driver.execute_cdp_cmd('Page.addScriptToEvaluateOnNewDocument', {
                'source': 'Object.defineProperty(navigator,"webdriver",{get:()=>undefined})'
            })

            encoded = urllib.parse.quote(keyword)
            driver.get(f'https://www.tiktok.com/search?q={encoded}')
            time.sleep(5)

            # Vérifie si connecté
            body_text = driver.find_element(By.TAG_NAME, 'body').text
            if any(w in body_text for w in ['Log in', 'Connexion', 'Sign up', "S'inscrire"]):
                return (
                    f'⚠️ TikTok non connecté dans le profil NEXUS.\n'
                    f'Action: Lance NEXUS, ouvre Chrome avec ce profil et connecte-toi à TikTok:\n'
                    f'Profil: {NEXUS_PROFILE_DIR}'
                )

            # Cherche les vidéos
            items = []
            for sel in _ITEM_SELECTORS:
                try:
                    items = driver.find_elements(By.CSS_SELECTOR, sel)
                    if items:
                        break
                except Exception:
                    continue

            videos = []
            for item in items[:6]:
                desc = self._get_text(item, _DESC_SELECTORS)
                likes = self._get_text(item, _LIKE_SELECTORS) or '?'
                if desc or likes != '?':
                    line = f'• {desc[:70] or "(sans titre)"}  ❤️ {likes}'
                    videos.append(line)

            if not videos:
                return f'📱 TikTok "{keyword}": aucun résultat (page peut-être chargée partiellement)'

            header = f'📱 TikTok "{keyword}" — {len(videos)} vidéos:\n'
            return header + '\n'.join(videos[:5])

        except WebDriverException as e:
            msg = str(e)
            if 'cannot find Chrome binary' in msg:
                return 'Chrome non trouvé — installe Google Chrome'
            if 'session not created' in msg:
                return (
                    'Impossible de créer session Chrome.\n'
                    'Assure-toi que Chrome est fermé ou utilise un autre profil.'
                )
            log.error('TikTok WebDriver: %s', msg[:200])
            return f'Erreur Chrome TikTok: {msg[:150]}'
        except Exception as e:
            log.error('TikTok error: %s', e)
            return f'Erreur TikTok: {e}'
        finally:
            if driver:
                try:
                    driver.quit()
                except Exception:
                    pass

    @staticmethod
    def _get_text(element, selectors: list[str]) -> str:
        for sel in selectors:
            try:
                el = element.find_element(
                    __import__('selenium.webdriver.common.by', fromlist=['By']).By.CSS_SELECTOR,
                    sel,
                )
                text = el.text.strip()
                if text:
                    return text
            except Exception:
                continue
        return ''
