import { useState } from 'react';

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
    id: 'booking', icon: '📋', name: 'Agent Réservations', col: '#00e676',
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
    id: 'finance', icon: '💰', name: 'Agent Finance', col: '#ffb347',
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
    id: 'clients', icon: '👤', name: 'Agent Clients', col: '#e9b949',
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
    id: 'planning', icon: '📅', name: 'Agent Planning', col: '#c084fc',
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
    id: 'tiktok', icon: '🎬', name: 'Agent TikTok', col: '#ff6b9d',
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
    id: 'marketing', icon: '🎨', name: 'Agent Marketing', col: '#fb923c',
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
    id: 'nexus', icon: '💻', name: 'Agent Nexus PC', col: '#7c3aed',
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
    id: 'memory', icon: '🧠', name: 'Agent Mémoire', col: '#34d399',
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
    id: 'general', icon: '🌐', name: 'Agent Général', col: '#60a5fa',
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
    id: 'code', icon: '⚙️', name: 'Agent Code', col: '#a78bfa',
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
    id: 'obsidian', icon: '📓', name: 'Agent Obsidian', col: '#e879f9',
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
    id: 'network', icon: '📡', name: 'Agent Veille Concurrents', col: '#f472b6',
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
    id: 'designer', icon: '✨', name: 'Agent Designer', col: '#38bdf8',
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
    id: 'video', icon: '🎞️', name: 'Agent Créateur Vidéo', col: '#fbbf24',
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
  { icon: '☀️', title: 'Briefing Matinal', col: '#ffb347', desc: 'Chaque matin à l\'heure de réveil de Kouider — CA du jour, retours, impayés, météo Oran' },
  { icon: '⚠️', title: 'Alertes Impayés', col: '#ff3366', desc: '48h → relance normale · 72h+ → alerte urgente · calcul automatique délai' },
  { icon: '🚗', title: 'Retours Véhicules', col: '#00e676', desc: '1h avant chaque retour prévu → rappel client + montant à encaisser' },
  { icon: '📅', title: 'Arrivées J+1', col: '#e9b949', desc: 'Soir J-1 → liste des clients attendus demain + docs manquants' },
  { icon: '📊', title: 'Bilan Quotidien', col: '#c084fc', desc: '18h30 chaque jour → CA encaissé, nouvelles réservations, résumé' },
  { icon: '🚨', title: 'Anomalies Business', col: '#ff6b6b', desc: 'Perte réelle (client_ppd < owner_ppd), grande résa > 2000€, voiture surutilisée' },
  { icon: '📄', title: 'Docs Manquants', col: '#fb923c', desc: 'Rappel si client actif sans passeport/permis enregistré' },
  { icon: '🧠', title: 'Contexte AI Matin', col: '#34d399', desc: 'Rappels intelligents injectés dans Claude chaque matin (impayés, retours, anniversaires)' },
];

export default function CapacitesScreen() {
  const [activeTab, setActiveTab] = useState<'agents' | 'proactif' | 'capacites'>('agents');
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div style={{
      height: '100%', display: 'flex', flexDirection: 'column',
      background: '#020810', color: '#fff', fontFamily: 'Share Tech Mono',
      position: 'relative', overflow: 'hidden',
    }}>
      <Corner pos="tl" /><Corner pos="tr" /><Corner pos="bl" /><Corner pos="br" />

      {/* Header */}
      <div style={{ padding: '10px 14px 0', borderBottom: '1px solid #e9b94912', flexShrink: 0, background: 'rgba(2,8,16,0.97)' }}>
        <div style={{ fontFamily: 'Orbitron', fontSize: 11, color: '#e9b949', letterSpacing: '0.3em', fontWeight: 700, textShadow: '0 0 12px #e9b94955', marginBottom: 8 }}>
          DZARYX — CAPACITÉS
        </div>
        <div style={{ display: 'flex', gap: 4, marginBottom: 0 }}>
          {(['agents', 'proactif', 'capacites'] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)} style={{
              flex: 1, background: activeTab === tab ? '#e9b9490d' : 'transparent',
              border: 'none', borderBottom: activeTab === tab ? '2px solid #e9b949' : '2px solid transparent',
              padding: '6px 4px', fontFamily: 'Orbitron', fontSize: 7,
              color: activeTab === tab ? '#e9b949' : '#ffffff33',
              letterSpacing: '0.15em', cursor: 'pointer',
            }}>
              {tab === 'agents' ? '14 AGENTS' : tab === 'proactif' ? 'PROACTIF' : 'CAPACITÉS'}
            </button>
          ))}
        </div>
        <div style={{ height: 1, background: 'linear-gradient(90deg, transparent, #e9b94944, transparent)', marginTop: 0 }} />
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>

        {activeTab === 'agents' && (
          <>
            <div style={{ fontSize: 8, color: '#ffffff22', letterSpacing: '0.1em', textAlign: 'center', padding: '4px 0' }}>
              {AGENTS.length} agents spécialisés — routing automatique par intention
            </div>
            {AGENTS.map(agent => {
              const isOpen = expanded === agent.id;
              return (
                <div key={agent.id} style={{
                  borderRadius: 10, border: `1px solid ${agent.col}22`,
                  background: `linear-gradient(135deg, ${agent.col}05, rgba(2,8,16,0.6))`,
                  overflow: 'hidden',
                }}>
                  <button
                    onClick={() => setExpanded(isOpen ? null : agent.id)}
                    style={{
                      width: '100%', background: 'none', border: 'none', cursor: 'pointer',
                      padding: '9px 12px', display: 'flex', alignItems: 'center', gap: 10,
                      textAlign: 'left',
                    }}
                  >
                    <span style={{ fontSize: 18, flexShrink: 0 }}>{agent.icon}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 10, color: '#e8f4ff', fontWeight: 600, marginBottom: 2 }}>
                        {agent.name}
                      </div>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {agent.tags.map(t => (
                          <span key={t} style={{
                            fontSize: 6, background: `${agent.col}15`, color: `${agent.col}cc`,
                            borderRadius: 4, padding: '1px 5px', fontFamily: 'Orbitron', letterSpacing: '0.08em',
                          }}>{t}</span>
                        ))}
                      </div>
                    </div>
                    <span style={{ fontSize: 9, color: '#ffffff33', flexShrink: 0 }}>
                      {isOpen ? '▲' : '▼'}
                    </span>
                  </button>

                  {isOpen && (
                    <div style={{ padding: '0 12px 12px', borderTop: `1px solid ${agent.col}11` }}>
                      <div style={{ fontSize: 9, color: '#ffffff66', lineHeight: 1.6, marginBottom: 8 }}>
                        {agent.desc}
                      </div>
                      <div style={{ fontFamily: 'Orbitron', fontSize: 6, color: `${agent.col}77`, letterSpacing: '0.15em', marginBottom: 5 }}>
                        EXEMPLES DE COMMANDES
                      </div>
                      {agent.examples.map((ex, i) => (
                        <div key={i} style={{
                          display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4,
                          padding: '5px 8px', background: `${agent.col}08`, borderRadius: 6,
                          border: `1px solid ${agent.col}11`,
                        }}>
                          <span style={{ fontSize: 8, color: `${agent.col}77`, flexShrink: 0 }}>›</span>
                          <span style={{ fontSize: 9, color: '#d8eaff', lineHeight: 1.4 }}>"{ex}"</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}

        {activeTab === 'proactif' && (
          <>
            <div style={{ fontSize: 8, color: '#ffffff22', letterSpacing: '0.1em', textAlign: 'center', padding: '4px 0' }}>
              Dzaryx envoie des alertes automatiquement, sans que tu ne demandes rien
            </div>

            {/* Timeline visual */}
            <div style={{ background: 'rgba(233,185,73,0.03)', borderRadius: 10, padding: '12px', border: '1px solid #e9b9490f', marginBottom: 4 }}>
              <div style={{ fontFamily: 'Orbitron', fontSize: 7, color: '#e9b94966', letterSpacing: '0.2em', marginBottom: 10 }}>
                ◉ TIMELINE JOURNÉE TYPE — KOUIDER
              </div>
              {[
                { time: '07:00', label: 'Briefing matinal', col: '#ffb347', icon: '☀️' },
                { time: '08:15', label: 'Alertes impayés', col: '#ff3366', icon: '⚠️' },
                { time: 'J-1h', label: 'Rappel chaque retour', col: '#00e676', icon: '🚗' },
                { time: '18:00', label: 'Bilan journée', col: '#c084fc', icon: '📊' },
                { time: 'Veille', label: 'Arrivées lendemain', col: '#e9b949', icon: '📅' },
                { time: 'Live', label: 'Anomalies en temps réel', col: '#ff6b6b', icon: '🚨' },
              ].map((item, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <div style={{
                    fontFamily: 'Orbitron', fontSize: 7, color: item.col, minWidth: 35,
                    textAlign: 'right', letterSpacing: '0.05em',
                  }}>{item.time}</div>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: item.col, flexShrink: 0 }} />
                  <div style={{ fontSize: 8, color: '#e8f4ff' }}>
                    {item.icon} {item.label}
                  </div>
                </div>
              ))}
            </div>

            {PROACTIVE_FEATURES.map(f => (
              <div key={f.title} style={{
                borderRadius: 10, border: `1px solid ${f.col}22`,
                background: `linear-gradient(135deg, ${f.col}05, rgba(2,8,16,0.6))`,
                padding: '10px 12px',
                display: 'flex', alignItems: 'flex-start', gap: 10,
              }}>
                <span style={{ fontSize: 20, flexShrink: 0 }}>{f.icon}</span>
                <div>
                  <div style={{ fontSize: 10, color: '#e8f4ff', fontWeight: 600, marginBottom: 3 }}>
                    {f.title}
                  </div>
                  <div style={{ fontSize: 8, color: '#ffffff55', lineHeight: 1.5 }}>
                    {f.desc}
                  </div>
                </div>
              </div>
            ))}
          </>
        )}

        {activeTab === 'capacites' && (
          <>
            <div style={{ fontSize: 8, color: '#ffffff22', letterSpacing: '0.1em', textAlign: 'center', padding: '4px 0' }}>
              Tout ce que Dzaryx peut faire
            </div>

            {[
              {
                title: '🤖 Intelligence Artificielle', col: '#e9b949',
                items: [
                  'Claude Sonnet 4.6 (IA principale)',
                  'OpenAI GPT-4o (finance + code review)',
                  'Gemini Flash (images + design)',
                  'Groq Whisper (transcription voix)',
                  'ElevenLabs (TTS voix Dzaryx)',
                  'Routing automatique par intention (14 agents)',
                  'Anti-hallucination 4 gates bloquants',
                  'Contexte business toujours présent',
                ],
              },
              {
                title: '💬 Communication', col: '#00e676',
                items: [
                  'Chat texte (FR / AR / darija)',
                  'Voix — Microphone → Whisper → Claude → TTS',
                  'Telegram Bot (canal principal Kouider)',
                  'WhatsApp client (envoi messages + docs)',
                  'Push Notification iPhone (Pushover)',
                  'SMS notification (via WhatsApp API)',
                  'Socket.IO temps réel (streaming réponses)',
                ],
              },
              {
                title: '📋 Business Réservations', col: '#ffb347',
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
                title: '💰 Finance & Comptabilité', col: '#fb923c',
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
                title: '📄 Documents Clients', col: '#a78bfa',
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
                title: '🖥️ PC Agent Nexus', col: '#7c3aed',
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
                title: '🌐 Recherche Web', col: '#38bdf8',
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
                title: '🎬 Marketing & Médias', col: '#ff6b9d',
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
            ].map(section => (
              <div key={section.title} style={{
                borderRadius: 10, border: `1px solid ${section.col}22`,
                background: `linear-gradient(135deg, ${section.col}05, rgba(2,8,16,0.5))`,
                padding: '10px 12px',
              }}>
                <div style={{ fontFamily: 'Orbitron', fontSize: 8, color: section.col, letterSpacing: '0.15em', marginBottom: 8 }}>
                  {section.title}
                </div>
                {section.items.map((item, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginBottom: 4 }}>
                    <span style={{ fontSize: 6, color: `${section.col}88`, flexShrink: 0, marginTop: 3 }}>●</span>
                    <span style={{ fontSize: 8.5, color: '#c8e8ff', lineHeight: 1.5 }}>{item}</span>
                  </div>
                ))}
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

function Corner({ pos }: { pos: 'tl' | 'tr' | 'bl' | 'br' }) {
  const s = 12, t = 1.5, col = '#e9b949';
  const bT = pos.startsWith('t') ? `${t}px solid ${col}33` : 'none';
  const bB = pos.startsWith('b') ? `${t}px solid ${col}33` : 'none';
  const bL = pos.endsWith('l')   ? `${t}px solid ${col}33` : 'none';
  const bR = pos.endsWith('r')   ? `${t}px solid ${col}33` : 'none';
  const h  = pos.endsWith('l')   ? { left: 4 }  : { right: 4 };
  const v  = pos.startsWith('t') ? { top: 4 }   : { bottom: 4 };
  return <div style={{ position: 'absolute', zIndex: 1, width: s, height: s, borderTop: bT, borderBottom: bB, borderLeft: bL, borderRight: bR, ...h, ...v }} />;
}
