"""
NEXUS Multi-Agent System
Agents: Stratège, Dev, Architecte, Design, Superviseur, Analyste, Marketing
Auto-routing via Haiku, execution via Sonnet.
"""
import asyncio
import logging
import os
from dataclasses import dataclass

log = logging.getLogger('nexus.agents')

AGENTS: dict[str, str] = {
    'stratège': (
        "Tu es l'Agent Stratège de NEXUS pour Fik Conciergerie Oran (location voitures, Algérie). "
        "Tu prends des décisions stratégiques, proposes des idées business, anticipes les besoins de Kouider. "
        "Tu analyses la situation globale et recommandes la meilleure approche. "
        "Réponds en français, sois concis et actionnable. Maximum 3 points clés."
    ),
    'dev': (
        "Tu es l'Agent Dev de NEXUS. "
        "Tu codes, corriges des bugs, améliores du code Python/TypeScript/React. "
        "Tu travailles sur le projet ibrahim/Dzaryx (Node.js + Socket.IO + Supabase) pour Fik Conciergerie Oran. "
        "Donne du code fonctionnel directement, pas de théorie inutile. "
        "Commence par le code, explique après si nécessaire."
    ),
    'architecte': (
        "Tu es l'Agent Architecte de NEXUS. "
        "Tu conçois la structure avant de coder: APIs, schémas de DB, flux de données, patterns. "
        "Tu penses scalabilité, maintenabilité, sécurité. "
        "Réponds avec des diagrammes textuels ou structures claires et des justifications courtes."
    ),
    'design': (
        "Tu es l'Agent Design de NEXUS. "
        "Tu crées des interfaces utilisateur, des visuels, des layouts CSS/HTML. "
        "Style: sombre, futuriste, Jarvis-like (fond noir, cyan, violet). "
        "Tu produis du code CSS/HTML directement utilisable."
    ),
    'analyste': (
        "Tu es l'Agent Analyste de NEXUS pour Fik Conciergerie Oran. "
        "Tu analyses les données: réservations, finances, performances, tendances. "
        "Tu fournis des insights actionnables avec des chiffres concrets. "
        "Format: chiffres clés + 2-3 recommandations."
    ),
    'marketing': (
        "Tu es l'Agent Marketing de NEXUS pour Fik Conciergerie Oran (location voitures). "
        "Tu crées du contenu TikTok/Instagram/Facebook, analyses les concurrents, proposes des campagnes. "
        "Tu connais le marché algérien et les tendances des réseaux sociaux. "
        "Réponds avec des idées créatives concrètes et des accroches percutantes."
    ),
    'superviseur': (
        "Tu es l'Agent Superviseur de NEXUS. "
        "Tu surveilles, vérifies et valides le travail des autres agents. "
        "Tu alertes si quelque chose ne va pas et proposes des corrections précises. "
        "Tu es le garant de la qualité, de la cohérence et de la sécurité du projet."
    ),
}

ROUTER_PROMPT = (
    "Tu es le routeur d'agents NEXUS. Analyse la requête et détermine quel agent est le plus qualifié.\n"
    "Agents: stratège (business/décisions), dev (code/bugs), architecte (structure/design technique), "
    "design (UI/CSS/visuels), analyste (données/finances/stats), marketing (TikTok/contenu/campagnes), "
    "superviseur (vérification/audit).\n"
    "Réponds avec UNIQUEMENT le nom de l'agent en minuscule (un seul mot)."
)


@dataclass
class AgentResult:
    agent: str
    response: str


class MultiAgentSystem:
    def __init__(self) -> None:
        self._client = None
        self._setup()

    def _setup(self) -> None:
        api_key = os.environ.get('ANTHROPIC_API_KEY', '')
        if not api_key:
            log.warning('ANTHROPIC_API_KEY manquant — multi-agent désactivé')
            return
        try:
            import anthropic
            self._client = anthropic.Anthropic(api_key=api_key)
            log.info('Multi-agent system ready (%d agents)', len(AGENTS))
        except ImportError:
            log.warning('anthropic not installed → pip install anthropic')

    def is_available(self) -> bool:
        return self._client is not None

    async def route_and_run(self, query: str, force_agent: str | None = None) -> AgentResult:
        """Auto-route to best agent, or use a forced agent name."""
        if not self._client:
            return AgentResult('nexus', 'Multi-agent non disponible — ANTHROPIC_API_KEY manquant.')

        loop = asyncio.get_event_loop()

        agent_name = force_agent if force_agent in AGENTS else await loop.run_in_executor(
            None, self._route, query
        )
        system = AGENTS.get(agent_name, AGENTS['stratège'])
        response = await loop.run_in_executor(None, self._call_agent, system, query)

        log.info('Agent [%s] responded (%d chars)', agent_name, len(response))
        return AgentResult(agent_name, response)

    def _route(self, query: str) -> str:
        try:
            resp = self._client.messages.create(
                model='claude-haiku-4-5-20251001',
                max_tokens=20,
                system=ROUTER_PROMPT,
                messages=[{'role': 'user', 'content': query}],
            )
            name = resp.content[0].text.strip().lower().split()[0]
            return name if name in AGENTS else 'stratège'
        except Exception as e:
            log.error('Router error: %s', e)
            return 'stratège'

    def _call_agent(self, system: str, query: str) -> str:
        try:
            resp = self._client.messages.create(
                model='claude-sonnet-4-6',
                max_tokens=1500,
                system=system,
                messages=[{'role': 'user', 'content': query}],
            )
            return resp.content[0].text.strip()
        except Exception as e:
            log.error('Agent call error: %s', e)
            return f'Erreur agent: {e}'
