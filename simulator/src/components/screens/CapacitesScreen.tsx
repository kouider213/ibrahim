import { useState } from 'react';
import { T, glass, tone, Segmented, Avatar } from '../ui/Kit.tsx';
import { Icon, splitEmoji } from '../ui/Icon.tsx';

interface Agent {
  id: string;
  icon: string;
  name: string;
  col: string;
  desc: string;
  examples: string[];
  tags: string[];
}

const AGENTS: Agent[] = [
  {
    id: 'booking', icon: '📋', name: 'Agent Réservations', col: '#0a9a5e',
    desc: 'Crée, modifie, annule des réservations. Vérifie disponibilité. Génère vouchers PDF. Synchro Google Agenda.',
    examples: [
      'Ahmed Sandero 22 au 26 mai 40€/j',
      'Disponibilité Jogger semaine prochaine ?',
      'Annule la résa de Karim',
      'Met dans l\'agenda la résa de Ali',
    ],
    tags: ['CREATE', 'UPDATE', 'AGENDA', 'VOUCHER'],
  },
  {
    id: 'finance', icon: '💰', name: 'Agent Finance', col: '#b86e00',
    desc: 'Rapports CA/profit Kouider vs Houari. Impayés. Facturation. Anomalies. Export comptable.',
    examples: [
      'Donne moi les revenus du mois',
      'Qui n\'a pas encore payé ?',
      'Rapport financier annuel 2026',
      'Exporte en Excel avril',
    ],
    tags: ['CA', 'PROFIT', 'IMPAYÉS', 'EXPORT'],
  },
  {
    id: 'clients', icon: '👤', name: 'Agent Clients', col: '#2f5bff',
    desc: 'Documents (passeport, permis, contrat). Score VIP/FREQUENT. Envoi WhatsApp/Telegram. Profil intelligence.',
    examples: [
      'Passeport de Sofiane Khelifi',
      'Envoie le permis de Ahmed sur WhatsApp',
      'Profil client Karim Benali',
      'Qui sont mes meilleurs clients ?',
    ],
    tags: ['DOCS', 'SCORE', 'WHATSAPP', 'OCR'],
  },
  {
    id: 'planning', icon: '📅', name: 'Agent Planning', col: '#2f5bff',
    desc: 'Calendrier Google. Rappels automatiques. Météo Oran. Actualités. Planification hebdomadaire.',
    examples: [
      'Météo demain à Oran',
      'Rappelle moi à 14h retour Berlingo',
      'Calendrier semaine prochaine',
      'Actualités Algérie aujourd\'hui',
    ],
    tags: ['AGENDA', 'RAPPELS', 'MÉTÉO', 'NEWS'],
  },
  {
    id: 'tiktok', icon: '🎬', name: 'Agent TikTok', col: '#e0304f',
    desc: 'Vidéos marketing TikTok 720×1280. Tendances Oran. Analyse concurrents réseaux. Hashtags darija+français.',
    examples: [
      'Fais moi une vidéo pour la Clio Alpine',
      'Tendances TikTok location voiture Oran',
      'Script voiceover Jumpy 9 places',
      'Crée une pub Jogger',
    ],
    tags: ['VIDÉO', 'TIKTOK', 'VOICEOVER', 'TRENDING'],
  },
  {
    id: 'marketing', icon: '🎨', name: 'Agent Marketing', col: '#c2570c',
    desc: 'Images pub. Suppression fond. Overlay texte. Photos réelles du parc. Création vidéo complète.',
    examples: [
      'Photo pub pour le Duster',
      'Crée une image Instagram Clio 5',
      'Supprime le fond de cette photo',
      'Variantes réseaux Sandero',
    ],
    tags: ['IMAGE', 'FOND', 'OVERLAY', 'SOCIAL'],
  },
  {
    id: 'nexus', icon: '💻', name: 'Agent Nexus PC', col: '#7a3cff',
    desc: 'Contrôle PC Windows à distance. Terminal streaming live. Gestion fichiers. Git. Screenshot. Wake on LAN.',
    examples: [
      'git status sur le projet ibrahim',
      'Prends un screenshot de l\'écran',
      'Démarre le PC (Wake on LAN)',
      'Ouvre Chrome sur le PC',
    ],
    tags: ['TERMINAL', 'FILES', 'GIT', 'SCREENSHOT'],
  },
  {
    id: 'memory', icon: '🧠', name: 'Agent Mémoire', col: '#0a9a5e',
    desc: 'Mémorisation long terme. Préférences Kouider. Règles métier. Historique d\'apprentissage.',
    examples: [
      'Souviens-toi que Karim est difficile',
      'Qu\'est-ce que j\'ai dit sur les livraisons ?',
      'Mes habitudes de la semaine',
      'Rapport d\'amélioration du mois',
    ],
    tags: ['MÉMOIRE', 'RÈGLES', 'HABITUDES', 'ÉVOLUTION'],
  },
  {
    id: 'general', icon: '🌐', name: 'Agent Général', col: '#0a9a5e',
    desc: 'Question/réponse tout sujet. Recherche web réelle (SearXNG + Jina). Actualités. Taux de change. Météo.',
    examples: [
      'Quel est le taux euro/dinar aujourd\'hui ?',
      'Comment fonctionne l\'assurance voiture en Algérie ?',
      'Actualités économie algérienne',
      'Meilleur itinéraire Oran → Alger',
    ],
    tags: ['WEB', 'ACTUALITÉS', 'TAUX', 'GÉNÉ'],
  },
  {
    id: 'code', icon: '⚙️', name: 'Agent Code', col: '#2f5bff',
    desc: 'Développement TypeScript/React. Deploy Railway/Netlify. Debug. Features. GitHub. Lecture/écriture fichiers.',
    examples: [
      'Lis le fichier FleetScreen.tsx',
      'Déploie le backend sur Railway',
      'Quelles sont les dernières erreurs Railway ?',
      'Crée un nouveau endpoint /api/stats',
    ],
    tags: ['CODE', 'DEPLOY', 'GITHUB', 'DEBUG'],
  },
  {
    id: 'obsidian', icon: '📓', name: 'Agent Obsidian', col: '#2f5bff',
    desc: 'Mémoire long terme via Obsidian vault sur PC Kouider. Profils clients. Notes personnalisées.',
    examples: [
      'Profil client Karim dans Obsidian',
      'Note dans Obsidian : Sofiane toujours en retard',
      'Liste tous les clients VIP',
      'Mets à jour le profil Ahmed',
    ],
    tags: ['VAULT', 'PROFILS', 'NOTES', 'OBSIDIAN'],
  },
  {
    id: 'network', icon: '📡', name: 'Agent Veille Concurrents', col: '#d6338a',
    desc: 'Analyse concurrents location voiture Oran. Recherche multi-sources réelle. Benchmark prix. SEO local.',
    examples: [
      'Analyse mes concurrents à Oran',
      'Prix location voiture Oran comparatif',
      'Veille TikTok concurrents',
      'Part de marché location Oran',
    ],
    tags: ['VEILLE', 'BENCHMARK', 'SEO', 'MARCHÉS'],
  },
  {
    id: 'designer', icon: '✨', name: 'Agent Designer', col: '#2f5bff',
    desc: 'Interface React/CSS. Charte graphique. Composants mobiles. Animations. Style dark luxueux.',
    examples: [
      'Crée une interface de facture',
      'Design card client VIP',
      'Palette couleurs pour l\'app',
      'Composant dashboard revenus',
    ],
    tags: ['UI', 'CSS', 'REACT', 'DESIGN'],
  },
  {
    id: 'video', icon: '🎞️', name: 'Agent Créateur Vidéo', col: '#b86e00',
    desc: 'Pipeline complet production vidéo TikTok/Reels. Script → montage → sous-titres → publication.',
    examples: [
      'Pipeline vidéo Duster complet',
      'Script voiceover pour Ramadan',
      'Instructions CapCut Jogger promo',
      'Vidéo tendance Aïd El Fitr',
    ],
    tags: ['PIPELINE', 'SCRIPT', 'CAPCUT', 'REELS'],
  },
];

const PROACTIVE_FEATURES = [
  { icon: '☀️', title: 'Briefing Matinal', col: '#b86e00', desc: 'Chaque matin à l\'heure de réveil de Kouider — CA du jour, retours, impayés, météo Oran' },
  { icon: '⚠️', title: 'Alertes Impayés', col: '#e0304f', desc: '48h → relance normale · 72h+ → alerte urgente · calcul automatique délai' },
  { icon: '🚗', title: 'Retours Véhicules', col: '#0a9a5e', desc: '1h avant chaque retour prévu → rappel client + montant à encaisser' },
  { icon: '📅', title: 'Arrivées J+1', col: '#2f5bff', desc: 'Soir J-1 → liste des clients attendus demain + docs manquants' },
  { icon: '📊', title: 'Bilan Quotidien', col: '#2f5bff', desc: '18h30 chaque jour → CA encaissé, nouvelles réservations, résumé' },
  { icon: '🚨', title: 'Anomalies Business', col: '#e0304f', desc: 'Perte réelle (client_ppd < owner_ppd), grande résa > 2000€, voiture surutilisée' },
  { icon: '📄', title: 'Docs Manquants', col: '#c2570c', desc: 'Rappel si client actif sans passeport/permis enregistré' },
  { icon: '🧠', title: 'Contexte AI Matin', col: '#0a9a5e', desc: 'Rappels intelligents injectés dans Claude chaque matin (impayés, retours, anniversaires)' },
];

const SECTIONS: Array<{ title: string; col: string; items: string[] }> = [
              {
                title: '🤖 Intelligence Artificielle', col: '#2f5bff',
                items: [
                  'Gemini (cerveau gratuit par défaut)',
                  'Claude (tâches difficiles, code)',
                  'Gemini Live (voix principale), OpenAI en secours',
                  'Groq Whisper (transcription voix)',
                  'Routing automatique par intention (14 agents)',
                  'Anti-hallucination 4 gates bloquants',
                  'Contexte business toujours présent',
                ],
              },
              {
                title: '💬 Communication', col: '#0a9a5e',
                items: [
                  'Chat texte (FR / AR / darija)',
                  'Voix — Microphone → Whisper → Claude → TTS',
                  'Telegram Bot (canal principal Kouider)',
                  'WhatsApp client (envoi messages + docs)',
                  'Notifications iPhone (web push)',
                  'SMS notification (via WhatsApp API)',
                  'Socket.IO temps réel (streaming réponses)',
                ],
              },
              {
                title: '📋 Business Réservations', col: '#b86e00',
                items: [
                  'Créer réservation (voix ou texte)',
                  'Modifier / annuler réservation',
                  'Vérifier disponibilité voiture',
                  'Voucher PDF généré automatiquement',
                  'Google Calendar synchronisé',
                  'Anti-double-booking automatique',
                  'Recherche par nom / tél / voiture / ID',
                  'Confirmation suppression (gate admin)',
                ],
              },
              {
                title: '💰 Finance & Comptabilité', col: '#c2570c',
                items: [
                  'CA aujourd\'hui / semaine / mois / annuel',
                  'Profit Kouider réel (vs prix Houari)',
                  'Distinction Kouider / Houari (rented_by)',
                  'Impayés avec délai et urgence',
                  'Rapport financier par véhicule',
                  'Export Excel comptable',
                  'Revenus prorabilisés (jours réels)',
                  'Anomalies : pertes, grandes résas, surpays',
                ],
              },
              {
                title: '📄 Documents Clients', col: '#2f5bff',
                items: [
                  'Stockage passeport / permis / contrat',
                  'OCR scan caméra (extraction données)',
                  'Envoi document via Telegram buffer',
                  'URLs signées Supabase (accès sécurisé)',
                  'Log accès documents (audit trail)',
                  'Masquage automatique données sensibles',
                  'Alerte docs manquants (clients actifs)',
                ],
              },
              {
                title: '🖥️ PC Agent Nexus', col: '#7a3cff',
                items: [
                  'Terminal streaming live (commandes)',
                  'Git : pull / push / status / log',
                  'Gestion fichiers (lire / écrire / lister)',
                  'Screenshot écran en temps réel',
                  'Wake on LAN (démarrer PC à distance)',
                  'Contrôle souris / clavier',
                  'Nonce anti-replay Redis (sécurité)',
                  'Watchdog auto-restart si crash',
                ],
              },
              {
                title: '🌐 Recherche Web', col: '#2f5bff',
                items: [
                  'SearXNG (moteur de recherche privé)',
                  'Jina Reader (lecture articles complets)',
                  'Jina YouTube / TikTok',
                  'Minimum 2 tentatives avant "non trouvé"',
                  'Veille concurrents location Oran',
                  'Taux change EUR/DZD temps réel',
                  'Actualités Algérie / météo',
                ],
              },
              {
                title: '🎬 Marketing & Médias', col: '#e0304f',
                items: [
                  'Vidéo TikTok 720×1280 FFmpeg',
                  'Script voiceover (darija / français)',
                  'Photo pub depuis vrai parc (Supabase)',
                  'Suppression fond (remove.bg)',
                  'Overlay texte sur photo',
                  'Variantes Instagram / Reels / Story',
                  'Instructions montage CapCut précises',
                  'Publication réseaux sociaux',
                ],
              },
];

// v4 (16/11 soir) : Kouider « ici c'est pas bien affiché » → cartes écrasées dans une boîte de 520 px. Plus de
// hauteur fixe ni de défilement interne : la page s'affiche en entier dans une feuille, au style du Kit.
export default function CapacitesScreen() {
  const [tab, setTab] = useState<'agents' | 'proactif' | 'capacites'>('agents');
  const [expanded, setExpanded] = useState<string | null>(null);
  const intro = (t: string) => <div style={{ fontSize: 13.5, color: T.muted, lineHeight: 1.45, margin: '2px 2px 4px' }}>{t}</div>;

  return (
    <div style={{ color: T.text, fontFamily: T.font, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <Segmented value={tab} onChange={setTab} items={[
        { id: 'agents', label: 'Agents', count: AGENTS.length },
        { id: 'proactif', label: 'Proactif' },
        { id: 'capacites', label: 'Tout' },
      ]} />

      {tab === 'agents' && <>
        {intro('Chaque message part tout seul vers le bon spécialiste.')}
        {AGENTS.map(agent => {
          const open = expanded === agent.id;
          return (
            <div key={agent.id} style={{ ...glass(open ? agent.col : undefined), borderRadius: 18, overflow: 'hidden' }}>
              <button onClick={() => setExpanded(open ? null : agent.id)} style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', color: T.text, fontFamily: T.font }}>
                <Avatar icon={agent.icon} color={agent.col} size={40} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 650, letterSpacing: '-0.015em' }}>{agent.name.replace(/^Agent /, '')}</div>
                  <div style={{ fontSize: 12.5, color: T.muted, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{agent.tags.map(t => t.charAt(0) + t.slice(1).toLowerCase()).join(' · ')}</div>
                </div>
                <Icon name="chevronDown" size={16} color="var(--dz-faint)" stroke={2.2} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .25s' }} />
              </button>
              {open && (
                <div style={{ padding: '0 14px 14px' }}>
                  <div style={{ fontSize: 13.5, color: T.muted, lineHeight: 1.55, marginBottom: 10 }}>{agent.desc}</div>
                  <div style={{ fontFamily: T.mono, fontSize: 10.5, letterSpacing: '0.12em', color: agent.col, marginBottom: 6 }}>DIS PAR EXEMPLE</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {agent.examples.map((ex, i) => (
                      <div key={i} style={{ fontSize: 13.5, padding: '8px 11px', borderRadius: 12, background: tone(agent.col, 0.08), border: `1px solid ${tone(agent.col, 0.16)}`, lineHeight: 1.4 }}>« {ex} »</div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </>}

      {tab === 'proactif' && <>
        {intro('Ce que Dzaryx fait de lui-même, sans que tu demandes.')}
        <div style={{ ...glass(), borderRadius: 18, padding: '14px 16px' }}>
          <div style={{ fontFamily: T.mono, fontSize: 10.5, letterSpacing: '0.12em', color: T.muted, marginBottom: 10 }}>TA JOURNÉE TYPE</div>
          {[
            { time: '07:00', label: 'Briefing du matin', col: '#f59e0b' },
            { time: '08:15', label: 'Alertes impayés', col: '#f04438' },
            { time: '−1 h', label: 'Rappel avant chaque retour', col: '#12b76a' },
            { time: '18:00', label: 'Bilan de la journée', col: '#3d6bff' },
            { time: 'Veille', label: 'Arrivées du lendemain', col: '#8b5cf6' },
            { time: 'Direct', label: 'Anomalies en temps réel', col: '#f04438' },
          ].map((it, i, arr) => (
            <div key={i} style={{ display: 'flex', alignItems: 'stretch', gap: 12 }}>
              <div style={{ width: 48, fontFamily: T.mono, fontSize: 12, color: it.col, textAlign: 'right', paddingTop: 1 }}>{it.time}</div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: it.col, boxShadow: `0 0 8px ${it.col}`, marginTop: 4 }} />
                {i < arr.length - 1 && <span style={{ flex: 1, width: 2, background: 'var(--dz-line)', margin: '3px 0' }} />}
              </div>
              <div style={{ fontSize: 14, fontWeight: 500, paddingBottom: 14 }}>{it.label}</div>
            </div>
          ))}
        </div>
        {PROACTIVE_FEATURES.map(f => {
          const ic = splitEmoji(f.icon);
          return (
            <div key={f.title} style={{ ...glass(), borderRadius: 18, padding: '12px 14px', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <div style={{ width: 34, height: 34, borderRadius: 10, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', background: `linear-gradient(145deg, ${f.col}, color-mix(in srgb, ${f.col} 70%, #000))` }}>
                {ic.icon ? <Icon name={ic.icon} size={17} stroke={2} /> : <span>{f.icon}</span>}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14.5, fontWeight: 650 }}>{f.title}</div>
                <div style={{ fontSize: 13, color: T.muted, lineHeight: 1.45, marginTop: 2 }}>{f.desc}</div>
              </div>
            </div>
          );
        })}
      </>}

      {tab === 'capacites' && <>
        {intro('Tout ce que Dzaryx sait faire.')}
        {SECTIONS.map(sec => {
          const { icon, text } = splitEmoji(sec.title);
          return (
            <div key={sec.title} style={{ ...glass(), borderRadius: 18, padding: '14px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', background: `linear-gradient(145deg, ${sec.col}, color-mix(in srgb, ${sec.col} 70%, #000))` }}>
                  <Icon name={icon ?? 'sparkles'} size={17} stroke={2} />
                </div>
                <div style={{ fontSize: 15.5, fontWeight: 650, letterSpacing: '-0.015em' }}>{text}</div>
              </div>
              {sec.items.map((it, i) => (
                <div key={i} style={{ display: 'flex', gap: 9, alignItems: 'flex-start', padding: '5px 0', borderTop: i ? '1px solid var(--dz-line)' : 'none' }}>
                  <Icon name="check" size={14} color={sec.col} stroke={2.4} style={{ marginTop: 3 }} />
                  <span style={{ fontSize: 13.5, lineHeight: 1.45 }}>{it}</span>
                </div>
              ))}
            </div>
          );
        })}
      </>}
    </div>
  );
}
