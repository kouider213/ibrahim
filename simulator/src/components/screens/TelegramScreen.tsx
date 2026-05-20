import { useState } from 'react';

type MsgType = 'text' | 'photo' | 'video' | 'file' | 'voice' | 'alert';
interface TgMsg {
  id: string;
  from: 'dzaryx' | 'kouider' | 'system';
  type: MsgType;
  time: string;
  text?: string;
  subtext?: string;
  tag?: string;
  tagCol?: string;
  photo?: string; // emoji placeholder
  actions?: string[];
  isRead?: boolean;
}

const CHANNELS: Array<{ id: string; label: string; icon: string; unread: number }> = [
  { id: 'all',     label: 'DZARYX',       icon: '🤖', unread: 4  },
  { id: 'finance', label: 'FINANCE',       icon: '💰', unread: 2  },
  { id: 'resas',   label: 'RÉSERVATIONS',  icon: '📋', unread: 1  },
  { id: 'docs',    label: 'DOCUMENTS',     icon: '📄', unread: 0  },
  { id: 'nexus',   label: 'PC NEXUS',      icon: '💻', unread: 0  },
  { id: 'promo',   label: 'MARKETING',     icon: '🎬', unread: 1  },
];

const MESSAGES: Record<string, TgMsg[]> = {
  all: [
    {
      id: 'm1', from: 'system', type: 'text', time: '06:07',
      text: 'DZARYX ONLINE', subtext: 'Connecté depuis Railway · Socket.IO actif',
      tag: 'SYSTÈME', tagCol: '#00d4ff',
    },
    {
      id: 'm2', from: 'dzaryx', type: 'alert', time: '07:00',
      tag: '☀️ BRIEFING MATINAL', tagCol: '#ffb347',
      text: 'Bonjour Kouider 👋\n📊 4 réservations actives\n💰 CA du jour estimé: 186€\n⚠️ 2 impayés urgents (344€)\n📅 Retour Berlingo à 14h00\n🚗 Jumpy disponible depuis hier',
      actions: ['VOIR RÉSERVATIONS', 'IMPAYÉS'],
    },
    {
      id: 'm3', from: 'kouider', type: 'text', time: '07:02',
      text: 'Qui doit me rendre la Clio aujourd\'hui ?',
    },
    {
      id: 'm4', from: 'dzaryx', type: 'text', time: '07:02',
      text: '📅 Retours aujourd\'hui (20/05):\n\n• Karim Benali — Clio 5 Alpine\n  Fin de location: aujourd\'hui 18h\n  Statut paiement: ✅ PAYÉ\n  📞 0550 123 456\n\n• Sofiane Khelifi — Berlingo\n  Fin: aujourd\'hui 14h\n  Statut: ⚠️ IMPAYÉ (185€)',
      actions: ['CONTACTER SOFIANE'],
    },
    {
      id: 'm5', from: 'dzaryx', type: 'alert', time: '08:15',
      tag: '⚠️ ALERTE IMPAYÉ', tagCol: '#ff3366',
      text: 'Sofiane Khelifi — 3 jours retard\nLocation: Berlingo (5 jours)\nMontant dû: 185€\n📞 0551 987 321',
      actions: ['CONTACTER', 'VOIR RÉSA'],
    },
    {
      id: 'm6', from: 'kouider', type: 'text', time: '08:20',
      text: 'Donne moi le passeport de Sofiane',
    },
    {
      id: 'm7', from: 'dzaryx', type: 'file', time: '08:20',
      tag: '📄 DOCUMENT TROUVÉ', tagCol: '#00e676',
      text: 'Sofiane Khelifi\nPasseport: AH1234567\nNé: 12/03/1988 | Exp: 08/2027\n🔒 Envoyé via canal sécurisé',
      photo: '🪪',
      actions: ['VOIR DOCUMENT'],
    },
    {
      id: 'm8', from: 'kouider', type: 'text', time: '10:30',
      text: 'Fais moi une réservation pour Ahmed Mansouri, Jogger, du 22 au 26 mai, 45€/j',
    },
    {
      id: 'm9', from: 'dzaryx', type: 'alert', time: '10:31',
      tag: '✅ RÉSERVATION CRÉÉE', tagCol: '#00e676',
      text: 'Ahmed Mansouri\nVéhicule: Jogger\n📅 22/05 → 26/05 (4 jours)\n💰 Prix: 180€ | Profit Kouider: ~52€\n🆔 ID: BK-2478\n📅 Ajouté Google Agenda',
      actions: ['VOIR DÉTAILS', 'AGENDA'],
    },
    {
      id: 'm10', from: 'kouider', type: 'text', time: '14:05',
      text: 'Donne moi les revenus du mois',
    },
    {
      id: 'm11', from: 'dzaryx', type: 'alert', time: '14:05',
      tag: '📊 RAPPORT MAI 2026', tagCol: '#00d4ff',
      text: 'CA BRUT: 2 847€\nProfit Kouider: 743€\nEncaissé: 2 503€\nÀ encaisser: 344€\n\nTop véhicule: Jumpy 9pl (812€)\nRéservations: 18 | Actives: 4\nOccupation moy: 64%\n\n📈 +12% vs avril 2026',
      actions: ['DÉTAIL PAR VOITURE', 'EXPORTER EXCEL'],
    },
  ],
  finance: [
    {
      id: 'f1', from: 'dzaryx', type: 'alert', time: '07:00',
      tag: '💰 RAPPORT QUOTIDIEN', tagCol: '#ffb347',
      text: 'CA aujourd\'hui (estimé): 186€\nCA semaine: 1 243€\nCA mois (20 jours): 2 847€\nProfit Kouider mois: 743€',
    },
    {
      id: 'f2', from: 'dzaryx', type: 'alert', time: '08:15',
      tag: '⚠️ 2 IMPAYÉS URGENTS', tagCol: '#ff3366',
      text: '1. Sofiane Khelifi — 185€ (3j retard)\n2. Yacine Bouzid — 159€ (5j retard)\n\nTotal à encaisser: 344€',
      actions: ['RELANCER TOUT', 'VOIR DÉTAILS'],
    },
    {
      id: 'f3', from: 'dzaryx', type: 'alert', time: '12:00',
      tag: '✅ PAIEMENT REÇU', tagCol: '#00e676',
      text: 'Karim Benali a payé 220€\nRéservation BK-2471 soldée ✅\nMontant: 220€ — Clio 5 Alpine (5j)',
    },
    {
      id: 'f4', from: 'dzaryx', type: 'alert', time: '18:30',
      tag: '📊 BILAN JOURNÉE', tagCol: '#00d4ff',
      text: 'Encaissé aujourd\'hui: 220€\nNouv. réservations: 1 (+180€)\nImpayés restants: 2 (344€)\nProfit estimé jour: 47€',
    },
  ],
  resas: [
    {
      id: 'r1', from: 'dzaryx', type: 'alert', time: '07:00',
      tag: '📋 ÉTAT DU PARC', tagCol: '#00d4ff',
      text: 'Réservations actives: 4\n─────────────────\n🚗 Clio 5 Alpine → Karim B.\n🚗 Berlingo → Sofiane K.\n🚗 Jumpy 9pl → Famille Hadj\n🚗 Sandero → Riad T.\n─────────────────\nDisponibles: Jogger, Duster, i10',
    },
    {
      id: 'r2', from: 'dzaryx', type: 'alert', time: '10:31',
      tag: '✅ NOUVELLE RÉSA', tagCol: '#00e676',
      text: 'Ahmed Mansouri — Jogger\n22/05 → 26/05 · 4 jours\nPrix: 180€ | Profit: 52€\nID: BK-2478',
      actions: ['VOIR', 'ANNULER'],
    },
    {
      id: 'r3', from: 'dzaryx', type: 'alert', time: '13:55',
      tag: '⏰ RETOUR DANS 1H', tagCol: '#ffb347',
      text: 'Sofiane Khelifi — Berlingo\nRetour prévu: 14h00\n⚠️ IMPAYÉ: 185€ à encaisser\n📞 0551 987 321',
      actions: ['APPELER', 'MARQUER PAYÉ'],
    },
    {
      id: 'r4', from: 'dzaryx', type: 'alert', time: '14:30',
      tag: '✅ RETOUR CONFIRMÉ', tagCol: '#00e676',
      text: 'Berlingo rendu par Sofiane K.\nÉtat véhicule: Normal\n💰 185€ encaissé\n✅ Réservation soldée',
    },
  ],
  docs: [
    {
      id: 'd1', from: 'kouider', type: 'text', time: '09:10',
      text: 'Passeport de Karim Benali',
    },
    {
      id: 'd2', from: 'dzaryx', type: 'file', time: '09:10',
      tag: '🪪 PASSEPORT', tagCol: '#00d4ff',
      photo: '🪪',
      text: 'Karim Benali\nN°: AB7654321\nNé: 05/07/1990\nExp: 03/2029\n✅ Document valide',
      actions: ['VOIR ORIGINAL'],
    },
    {
      id: 'd3', from: 'kouider', type: 'text', time: '11:20',
      text: 'Permis de conduire Ahmed Mansouri',
    },
    {
      id: 'd4', from: 'dzaryx', type: 'file', time: '11:20',
      tag: '🚗 PERMIS DE CONDUIRE', tagCol: '#00e676',
      photo: '🪪',
      text: 'Ahmed Mansouri\nPermis: 0712345678\nCatégorie: B\nDélivré: Oran — 2015\nExp: 2035',
      actions: ['VOIR ORIGINAL'],
    },
    {
      id: 'd5', from: 'dzaryx', type: 'alert', time: '17:00',
      tag: '⚠️ DOCS MANQUANTS', tagCol: '#ffb347',
      text: '3 clients sans document enregistré:\n• Yacine Bouzid (location active)\n• Farid Kaci (location active)\n• Nabil Ould Ali (résa à venir 22/05)',
      actions: ['DEMANDER DOCS'],
    },
  ],
  nexus: [
    {
      id: 'n1', from: 'system', type: 'text', time: '06:55',
      text: 'NEXUS PC ONLINE', subtext: 'PC Kouider connecté · Windows 11 · RAM: 12.4GB libre',
      tag: 'PC AGENT', tagCol: '#7c3aed',
    },
    {
      id: 'n2', from: 'kouider', type: 'text', time: '09:00',
      text: 'Nexus: git status sur le projet ibrahim',
    },
    {
      id: 'n3', from: 'dzaryx', type: 'alert', time: '09:00',
      tag: '💻 TERMINAL — ibrahim/', tagCol: '#7c3aed',
      text: '$ git status\nOn branch main\nYour branch is up to date.\n\nnothing to commit, working tree clean\n\n[Exit: 0 · 0.3s]',
    },
    {
      id: 'n4', from: 'kouider', type: 'text', time: '09:05',
      text: 'Prends un screenshot de l\'écran',
    },
    {
      id: 'n5', from: 'dzaryx', type: 'photo', time: '09:05',
      tag: '📸 SCREENSHOT PC', tagCol: '#7c3aed',
      photo: '🖥️',
      text: 'Écran principal · 1920×1080 · 20/05/2026 09:05',
    },
    {
      id: 'n6', from: 'kouider', type: 'text', time: '20:30',
      text: 'Éteins le PC',
    },
    {
      id: 'n7', from: 'dzaryx', type: 'alert', time: '20:30',
      tag: '💻 PC — ARRÊT', tagCol: '#ff3366',
      text: '$ shutdown /s /t 60\nArrêt planifié dans 60 secondes.\nNexus se déconnecte...\n\n🔴 PC OFFLINE',
    },
  ],
  promo: [
    {
      id: 'p1', from: 'kouider', type: 'text', time: '10:00',
      text: 'Fais moi une vidéo marketing pour la Clio 5 Alpine',
    },
    {
      id: 'p2', from: 'dzaryx', type: 'text', time: '10:00',
      text: '🎬 Je lance la production...\n📸 Récupération photo Clio 5 Alpine...\n✍️ Script voiceover:\n"La Clio 5 Alpine — La sportivité au meilleur prix à Oran. Réservez maintenant depuis 45€/jour."\n🎵 Ajout musique tendance...\n📱 Format 720×1280 TikTok...',
    },
    {
      id: 'p3', from: 'dzaryx', type: 'video', time: '10:02',
      tag: '🎬 VIDÉO PRÊTE', tagCol: '#ff6b6b',
      photo: '🎬',
      text: 'Clio 5 Alpine — TikTok Promo\nDurée: 30s · 720×1280\nMusique: ✅\nVoiceover: ✅ (darija)',
      actions: ['PUBLIER TIKTOK', 'VOIR VIDÉO'],
    },
    {
      id: 'p4', from: 'dzaryx', type: 'alert', time: '14:00',
      tag: '📊 VEILLE CONCURRENTS', tagCol: '#00d4ff',
      text: 'Analyse location voiture Oran:\n\n• West Car Oran: dès 4500 DA/j\n• Location Confort Oran: 5000 DA/j\n• Karroussa: 4200 DA/j\n\n📈 Fik Conciergerie: compétitif\nSources: web_search (3 sites)' ,
      actions: ['VOIR ANALYSE COMPLÈTE'],
    },
  ],
};

export default function TelegramScreen() {
  const [activeChannel, setActiveChannel] = useState('all');
  const msgs = MESSAGES[activeChannel] ?? [];

  return (
    <div style={{
      height: '100%', display: 'flex', flexDirection: 'column',
      background: '#17212b', color: '#fff', fontFamily: 'system-ui, -apple-system, sans-serif',
      position: 'relative',
    }}>
      {/* Telegram header bar */}
      <div style={{
        background: '#17212b', borderBottom: '1px solid #0d1721',
        padding: '8px 12px 6px', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          {/* Bot avatar */}
          <div style={{
            width: 34, height: 34, borderRadius: '50%',
            background: 'linear-gradient(135deg, #00d4ff22, #00d4ff44)',
            border: '1.5px solid #00d4ff55',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 16, flexShrink: 0,
          }}>🤖</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>
              Dzaryx Bot
            </div>
            <div style={{ fontSize: 10, color: '#00e676', marginTop: 1 }}>
              ● en ligne
            </div>
          </div>
          <div style={{ fontSize: 9, color: '#ffffff33', fontFamily: 'Share Tech Mono', letterSpacing: '0.05em' }}>
            TELEGRAM DEMO
          </div>
        </div>

        {/* Channel tabs */}
        <div style={{ display: 'flex', gap: 4, overflowX: 'auto', scrollbarWidth: 'none', paddingBottom: 2 }}>
          {CHANNELS.map(ch => {
            const active = activeChannel === ch.id;
            return (
              <button
                key={ch.id}
                onClick={() => setActiveChannel(ch.id)}
                style={{
                  flexShrink: 0, background: active ? '#2b5278' : '#182533',
                  border: active ? '1px solid #00d4ff44' : '1px solid transparent',
                  borderRadius: 12, padding: '3px 8px',
                  display: 'flex', alignItems: 'center', gap: 4,
                  cursor: 'pointer', transition: 'all 0.15s',
                  position: 'relative',
                }}
              >
                <span style={{ fontSize: 10 }}>{ch.icon}</span>
                <span style={{ fontSize: 7, color: active ? '#fff' : '#aaa', letterSpacing: '0.05em', fontFamily: 'Share Tech Mono' }}>
                  {ch.label}
                </span>
                {ch.unread > 0 && (
                  <div style={{
                    position: 'absolute', top: -4, right: -4,
                    background: '#ff3366', borderRadius: '50%',
                    width: 14, height: 14, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 7, color: '#fff', fontWeight: 700,
                  }}>
                    {ch.unread}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Messages */}
      <div style={{
        flex: 1, overflowY: 'auto', padding: '8px 10px',
        display: 'flex', flexDirection: 'column', gap: 6,
        background: 'linear-gradient(180deg, #0d1721 0%, #182533 100%)',
      }}>
        {msgs.map(msg => (
          <TgMessage key={msg.id} msg={msg} />
        ))}

        {/* Bottom hint */}
        <div style={{
          textAlign: 'center', padding: '16px 0 4px',
          fontSize: 8, color: '#ffffff22', fontFamily: 'Share Tech Mono', letterSpacing: '0.1em',
        }}>
          — SIMULATION — LES MESSAGES RÉELS ARRIVENT EN TEMPS RÉEL VIA TELEGRAM BOT —
        </div>
      </div>

      {/* Input bar (display only) */}
      <div style={{
        padding: '8px 10px', background: '#17212b',
        borderTop: '1px solid #0d1721', flexShrink: 0,
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <div style={{
          flex: 1, background: '#182533', borderRadius: 20,
          padding: '8px 14px', fontSize: 11, color: '#ffffff33',
          border: '1px solid #2a3a50',
        }}>
          Envoie un message à Dzaryx...
        </div>
        <div style={{
          width: 32, height: 32, borderRadius: '50%',
          background: '#2b5278', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 14,
        }}>🎙️</div>
      </div>
    </div>
  );
}

function TgMessage({ msg }: { msg: TgMsg }) {
  const isKouider = msg.from === 'kouider';
  const isSystem  = msg.from === 'system';

  if (isSystem) {
    return (
      <div style={{ textAlign: 'center', padding: '4px 0' }}>
        <span style={{
          background: '#182533', borderRadius: 12, padding: '4px 12px',
          fontSize: 8, color: '#ffffff44', fontFamily: 'Share Tech Mono', letterSpacing: '0.1em',
        }}>
          {msg.tag && <span style={{ color: msg.tagCol ?? '#00d4ff' }}>{msg.tag} · </span>}
          {msg.text}
          {msg.subtext && <span style={{ color: '#ffffff22' }}> · {msg.subtext}</span>}
        </span>
      </div>
    );
  }

  if (isKouider) {
    return (
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <div style={{
          maxWidth: '75%', background: '#2b5278', borderRadius: '12px 12px 2px 12px',
          padding: '7px 11px', boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
        }}>
          <div style={{ fontSize: 11, color: '#fff', lineHeight: 1.5, whiteSpace: 'pre-line' }}>
            {msg.text}
          </div>
          <div style={{ fontSize: 8, color: '#ffffff55', textAlign: 'right', marginTop: 3 }}>
            {msg.time} ✓✓
          </div>
        </div>
      </div>
    );
  }

  // Dzaryx message
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 7 }}>
      {/* Avatar */}
      <div style={{
        width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
        background: '#00d4ff15', border: '1px solid #00d4ff33',
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14,
      }}>🤖</div>

      <div style={{ maxWidth: '78%', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {/* Name */}
        <div style={{ fontSize: 9, color: '#00d4ff', fontWeight: 600, marginLeft: 1 }}>Dzaryx</div>

        <div style={{
          background: '#182533', borderRadius: '2px 12px 12px 12px',
          padding: '8px 11px', boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
        }}>
          {/* Tag */}
          {msg.tag && (
            <div style={{
              fontFamily: 'Share Tech Mono', fontSize: 8, color: msg.tagCol ?? '#00d4ff',
              fontWeight: 700, letterSpacing: '0.08em', marginBottom: 5,
              borderLeft: `2px solid ${msg.tagCol ?? '#00d4ff'}`,
              paddingLeft: 6,
            }}>
              {msg.tag}
            </div>
          )}

          {/* Photo/Video placeholder */}
          {msg.photo && (
            <div style={{
              background: '#0d1721', borderRadius: 8, padding: '16px',
              textAlign: 'center', fontSize: 32, marginBottom: 7,
              border: '1px solid #ffffff08',
            }}>
              {msg.photo}
              {msg.type === 'photo' && (
                <div style={{ fontSize: 8, color: '#ffffff33', marginTop: 4, fontFamily: 'Share Tech Mono' }}>
                  [IMAGE]
                </div>
              )}
              {msg.type === 'video' && (
                <div style={{ fontSize: 8, color: '#ff6b6b44', marginTop: 4, fontFamily: 'Share Tech Mono' }}>
                  ▶ VIDÉO
                </div>
              )}
              {msg.type === 'file' && (
                <div style={{ fontSize: 8, color: '#00d4ff44', marginTop: 4, fontFamily: 'Share Tech Mono' }}>
                  📎 DOCUMENT
                </div>
              )}
            </div>
          )}

          {/* Text */}
          {msg.text && (
            <div style={{
              fontSize: 10.5, color: '#d8eaff', lineHeight: 1.6, whiteSpace: 'pre-line',
              fontFamily: msg.type === 'alert' ? 'Share Tech Mono' : 'inherit',
            }}>
              {msg.text}
            </div>
          )}

          {/* Action buttons */}
          {msg.actions && msg.actions.length > 0 && (
            <div style={{ display: 'flex', gap: 5, marginTop: 8, flexWrap: 'wrap' }}>
              {msg.actions.map((a, i) => (
                <button
                  key={i}
                  style={{
                    background: i === 0 ? '#2b5278' : '#1a2d3e',
                    border: '1px solid #00d4ff33', borderRadius: 8,
                    padding: '4px 8px', fontSize: 8, color: '#a8d8f0',
                    cursor: 'pointer', fontFamily: 'Share Tech Mono', letterSpacing: '0.05em',
                    transition: 'background 0.15s',
                  }}
                >
                  {a}
                </button>
              ))}
            </div>
          )}

          {/* Time */}
          <div style={{ fontSize: 8, color: '#ffffff33', textAlign: 'right', marginTop: 5 }}>
            {msg.time}
          </div>
        </div>
      </div>
    </div>
  );
}
