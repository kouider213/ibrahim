import { useState, useRef } from 'react';
import { api } from '../../services/api.ts';

interface Props { onClose: () => void; }

type Tab = 'feedback' | 'checklist' | 'history';
type CheckStatus = '✅' | '⚠️' | '❌' | '☐';

interface CheckItem { id: string; label: string; status: CheckStatus; note: string; }
interface HistoryEntry { date: string; description: string; status: 'done' | 'partial' | 'planned'; }

const CATEGORIES = ['Design', 'Bug', 'Fonctionnalité manquante', 'Autre'];

const CHECKLIST_GROUPS: { title: string; icon: string; items: string[] }[] = [
  {
    title: 'VOCAL & IA', icon: '🎙',
    items: [
      'Écoute permanente active au démarrage',
      'Reconnaissance vocale française',
      'Reconnaissance vocale arabe/darija',
      'Réponse TTS ElevenLabs réaliste',
      'Détection automatique de langue',
      'Interruption possible mid-réponse',
    ],
  },
  {
    title: 'IA VISION', icon: '👁',
    items: [
      'Activation caméra',
      'Analyse dégâts voiture',
      'Lecture document / OCR',
      'Reconnaissance objet',
      'Réponse vocale après analyse vision',
    ],
  },
  {
    title: 'BUSINESS FIK CONCIERGERIE', icon: '🚗',
    items: [
      'Voir liste réservations',
      'Créer nouvelle réservation',
      'Modifier réservation existante',
      'Anti double-réservation',
      'Voir flotte véhicules',
      'Disponibilité véhicule',
      'Calcul bénéfices Kouider/Houari',
      'Gestion acomptes',
      'Génération contrat PDF',
      'OCR passeport client',
      'OCR permis de conduire',
      'Suivi client complet',
      'Rappels automatiques',
      'Sync Google Calendar',
      'Rapport financier vocal',
    ],
  },
  {
    title: 'APP WEB IBRAHIM (Netlify)', icon: '🌐',
    items: [
      'Chat interface fonctionnel',
      'Dashboard temps réel',
      'LiveRevenue (revenus)',
      'AIAlerts (alertes IA)',
      'LiveFleet (parc véhicules)',
      'WhatsAppAI (intégration WhatsApp)',
      'TikTokAI (automatisation TikTok)',
      'DzaryxCore (état système IA)',
      'VoiceMode (mode vocal)',
      'ValidationQueue (validations)',
      'BookingForm (créer réservation)',
      'CalendarView (calendrier)',
      'ClientsView (clients)',
      'FinanceDashboard (finances)',
      'TasksView (tâches IA en arrière-plan)',
    ],
  },
  {
    title: 'BOT TELEGRAM', icon: '✈️',
    items: [
      'Commande /start',
      'Commande /status système',
      'Créer réservation par chat',
      'Voir réservations du jour',
      'Rapport revenus par message',
      'Info client par nom/téléphone',
      'OCR document via photo',
      'Vision IA analyse dégâts',
      'Contrôle Nexus PC vocal',
      'Notifications proactives Telegram',
    ],
  },
  {
    title: 'MÉMOIRE IA', icon: '🧠',
    items: [
      'Mémorisation conversation en cours',
      'Rappel contexte session précédente',
      'Apprentissage préférences utilisateur',
      'Historique recherchable',
    ],
  },
  {
    title: 'CONTRÔLE NEXUS PC', icon: '💻',
    items: [
      'Connexion WebSocket PC stable',
      'Ouvrir Chrome via commande vocale',
      'Ouvrir VS Code',
      'Capture écran PC → envoi',
      'Exécution commande terminal',
    ],
  },
  {
    title: 'CRÉATION CONTENU', icon: '🎬',
    items: [
      'Générer script TikTok',
      'Générer voix off IA',
    ],
  },
  {
    title: 'SYSTÈME', icon: '⚙️',
    items: [
      'Connexion Railway stable',
      'Connexion Supabase stable',
      'Pas de freeze navigation',
      'Pas de crash mémoire',
      'Performance fluide (60fps)',
    ],
  },
];

const INITIAL_HISTORY: HistoryEntry[] = [
  { date: '2026-05-18', description: 'Création du simulateur Android web — pages Voice + Text', status: 'done' },
  { date: '2026-05-17', description: 'Implémentation VAD en React Native — expo-av metering', status: 'done' },
  { date: '2026-05-17', description: 'Intégration expo-image-picker + scan document', status: 'done' },
  { date: '2026-05-16', description: 'Nexus PC control — screenshot, sysinfo, exec', status: 'done' },
  { date: '2026-05-15', description: 'EAS env vars configurés — BACKEND_URL, MOBILE_TOKEN', status: 'done' },
  { date: '2026-05-14', description: 'EAS build APK v1.2.0 (build 4)', status: 'done' },
  { date: '2026-05-13', description: 'Ajout heatmap activité 60 jours dans revenue.tsx', status: 'done' },
  { date: '2026-05-12', description: 'Tâches IA background — écran tasks.tsx', status: 'done' },
  { date: '2026-05-11', description: 'Redesign complet Jarvis — voice.tsx + text.tsx', status: 'planned' },
];

function makeChecklist(): CheckItem[] {
  return CHECKLIST_GROUPS.flatMap(g =>
    g.items.map(label => ({
      id: `${g.title}-${label}`,
      label,
      status: '☐' as CheckStatus,
      note: '',
    }))
  );
}

const STATUS_CYCLE: CheckStatus[] = ['☐', '✅', '⚠️', '❌'];

export default function FeedbackPanel({ onClose }: Props) {
  const [tab, setTab]         = useState<Tab>('feedback');
  const [category, setCat]    = useState(CATEGORIES[0]!);
  const [feedText, setFeedText] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent]       = useState(false);
  const [checklist, setCheck] = useState<CheckItem[]>(() => makeChecklist());
  const [history]             = useState<HistoryEntry[]>(INITIAL_HISTORY);
  const [search, setSearch]   = useState('');
  const screenshotRef         = useRef<string | null>(null);

  async function handleSendFeedback() {
    if (!feedText.trim()) return;
    setSending(true);
    await api.sendFeedback({
      category,
      text: feedText,
      screenshot: screenshotRef.current ?? undefined,
      url: window.location.href,
      timestamp: new Date().toISOString(),
    });
    setSent(true);
    setSending(false);
    setTimeout(() => { setSent(false); setFeedText(''); }, 3000);
  }

  function cycleStatus(id: string) {
    setCheck(c => c.map(item => {
      if (item.id !== id) return item;
      const idx = STATUS_CYCLE.indexOf(item.status);
      return { ...item, status: STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length]! };
    }));
  }

  function updateNote(id: string, note: string) {
    setCheck(c => c.map(item => item.id !== id ? item : { ...item, note }));
  }

  const score = {
    ok:      checklist.filter(i => i.status === '✅').length,
    partial: checklist.filter(i => i.status === '⚠️').length,
    fail:    checklist.filter(i => i.status === '❌').length,
    total:   checklist.length,
  };

  function exportReport() {
    const report = {
      date: new Date().toISOString(),
      score,
      items: checklist.filter(i => i.status !== '☐'),
      history,
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `dzaryx-report-${Date.now()}.json`;
    a.click(); URL.revokeObjectURL(url);
  }

  const filteredChecklist = search
    ? checklist.filter(i => i.label.toLowerCase().includes(search.toLowerCase()))
    : checklist;

  return (
    <div style={{
      height: '100%',
      background: 'rgba(3,5,15,0.97)',
      borderLeft: '1px solid #00d4ff22',
      display: 'flex', flexDirection: 'column',
      fontFamily: 'Exo 2, system-ui',
      backdropFilter: 'blur(10px)',
    }}>
      {/* Header */}
      <div style={{
        padding: '16px 16px 0',
        borderBottom: '1px solid #00d4ff1a',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <span style={{ fontFamily: 'Orbitron', fontSize: 10, color: '#00d4ff', letterSpacing: '0.2em' }}>
            PANEL QUALITÉ
          </span>
          <div style={{ flex: 1 }} />
          <button onClick={onClose} style={{
            background: 'none', border: '1px solid #ff336633', borderRadius: 6,
            padding: '3px 8px', cursor: 'pointer', color: '#ff3366aa',
            fontFamily: 'Share Tech Mono', fontSize: 9,
          }}>✕</button>
        </div>
        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4 }}>
          {(['feedback', 'checklist', 'history'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                flex: 1, padding: '6px 4px', background: 'none',
                border: 'none', borderBottom: `2px solid ${tab === t ? '#00d4ff' : 'transparent'}`,
                cursor: 'pointer', color: tab === t ? '#00d4ff' : '#ffffff44',
                fontFamily: 'Share Tech Mono', fontSize: 9, letterSpacing: '0.1em',
                textTransform: 'uppercase', transition: 'all 0.2s ease',
              }}
            >
              {t === 'feedback' ? '💬 FEEDBACK' : t === 'checklist' ? '✓ CHECK' : '📋 HISTORIQUE'}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
        {tab === 'feedback' && (
          <FeedbackTab
            category={category} onCategory={setCat}
            text={feedText} onText={setFeedText}
            sending={sending} sent={sent}
            onSend={handleSendFeedback}
            categories={CATEGORIES}
          />
        )}
        {tab === 'checklist' && (
          <ChecklistTab
            checklist={filteredChecklist}
            groups={CHECKLIST_GROUPS}
            score={score}
            search={search} onSearch={setSearch}
            onCycle={cycleStatus}
            onNote={updateNote}
            onExport={exportReport}
          />
        )}
        {tab === 'history' && (
          <HistoryTab history={history} />
        )}
      </div>
    </div>
  );
}

// ── Sub-panels ──────────────────────────────────────────────────────────────

function FeedbackTab({
  category, onCategory, text, onText,
  sending, sent, onSend, categories,
}: {
  category: string; onCategory: (c: string) => void;
  text: string; onText: (t: string) => void;
  sending: boolean; sent: boolean;
  onSend: () => void; categories: string[];
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <label style={labelStyle}>CATÉGORIE</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
          {categories.map(c => (
            <button
              key={c}
              onClick={() => onCategory(c)}
              style={{
                padding: '4px 10px', borderRadius: 20,
                background: category === c ? 'rgba(0,212,255,0.15)' : 'transparent',
                border: `1px solid ${category === c ? '#00d4ff66' : '#ffffff22'}`,
                color: category === c ? '#00d4ff' : '#ffffff55',
                fontFamily: 'Exo 2', fontSize: 10, cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >{c}</button>
          ))}
        </div>
      </div>

      <div>
        <label style={labelStyle}>QU'EST-CE QUI NE TE PLAÎT PAS ?</label>
        <textarea
          value={text}
          onChange={e => onText(e.target.value)}
          placeholder="Décris le problème ou la suggestion..."
          rows={5}
          style={{
            width: '100%', marginTop: 6, background: 'rgba(0,212,255,0.04)',
            border: '1px solid #00d4ff22', borderRadius: 8, padding: '10px 12px',
            color: '#fff', fontFamily: 'Exo 2', fontSize: 11, resize: 'vertical',
            outline: 'none', lineHeight: 1.6, boxSizing: 'border-box',
          }}
        />
      </div>

      <button
        onClick={onSend}
        disabled={!text.trim() || sending}
        style={{
          padding: '10px 16px', borderRadius: 8, cursor: text.trim() ? 'pointer' : 'default',
          background: sent
            ? 'rgba(0,230,118,0.15)'
            : text.trim() ? 'rgba(0,212,255,0.1)' : 'transparent',
          border: `1px solid ${sent ? '#00e67666' : text.trim() ? '#00d4ff44' : '#ffffff22'}`,
          color: sent ? '#00e676' : text.trim() ? '#00d4ff' : '#ffffff33',
          fontFamily: 'Orbitron', fontSize: 9, letterSpacing: '0.2em',
          transition: 'all 0.2s ease',
        }}
      >
        {sent ? '✓ ENVOYÉ' : sending ? 'ENVOI...' : 'ENVOYER À CLAUDE'}
      </button>

      <div style={{
        marginTop: 8, padding: 12, background: 'rgba(255,107,0,0.05)',
        border: '1px solid #ff6b0022', borderRadius: 8,
      }}>
        <p style={{ fontFamily: 'Share Tech Mono', fontSize: 8, color: '#ff6b0066', margin: 0, lineHeight: 1.8 }}>
          INFO: Le feedback est stocké dans Supabase et notifié via Railway.
          Les screenshots nécessitent l'autorisation du navigateur.
        </p>
      </div>
    </div>
  );
}

function ChecklistTab({
  checklist, groups, score, search, onSearch, onCycle, onNote, onExport,
}: {
  checklist: CheckItem[];
  groups: typeof CHECKLIST_GROUPS;
  score: { ok: number; partial: number; fail: number; total: number };
  search: string; onSearch: (s: string) => void;
  onCycle: (id: string) => void;
  onNote: (id: string, note: string) => void;
  onExport: () => void;
}) {
  const pct = Math.round((score.ok / score.total) * 100);
  const [expanded, setExpanded] = useState<string[]>([]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Score bar */}
      <div style={{ background: 'rgba(0,212,255,0.05)', borderRadius: 8, padding: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontFamily: 'Orbitron', fontSize: 9, color: '#00d4ff', letterSpacing: '0.2em' }}>
            PROGRESSION {pct}%
          </span>
          <div style={{ display: 'flex', gap: 10 }}>
            <Stat label="✅" val={score.ok} col="#00e676" />
            <Stat label="⚠️" val={score.partial} col="#f39c12" />
            <Stat label="❌" val={score.fail} col="#ff3366" />
          </div>
        </div>
        <div style={{ height: 4, background: '#00d4ff15', borderRadius: 2 }}>
          <div style={{ height: '100%', width: `${pct}%`, background: '#00d4ff', borderRadius: 2, transition: 'width 0.3s ease' }} />
        </div>
      </div>

      {/* Search */}
      <input
        value={search}
        onChange={e => onSearch(e.target.value)}
        placeholder="Rechercher une fonctionnalité..."
        style={{
          background: 'rgba(255,255,255,0.04)', border: '1px solid #ffffff22',
          borderRadius: 8, padding: '7px 12px', color: '#fff',
          fontFamily: 'Exo 2', fontSize: 10, outline: 'none', width: '100%',
          boxSizing: 'border-box',
        }}
      />

      {/* Groups */}
      {search ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {checklist.map(item => (
            <CheckRow key={item.id} item={item} onCycle={onCycle} onNote={onNote} />
          ))}
        </div>
      ) : (
        groups.map(group => {
          const groupItems = checklist.filter(i => i.id.startsWith(group.title));
          const isExp = expanded.includes(group.title);
          const groupOk = groupItems.filter(i => i.status === '✅').length;

          return (
            <div key={group.title} style={{
              border: '1px solid #00d4ff1a', borderRadius: 8, overflow: 'hidden',
            }}>
              <button
                onClick={() => setExpanded(e =>
                  e.includes(group.title) ? e.filter(x => x !== group.title) : [...e, group.title]
                )}
                style={{
                  width: '100%', background: 'rgba(0,212,255,0.04)',
                  border: 'none', padding: '9px 12px', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 8,
                }}
              >
                <span style={{ fontSize: 12 }}>{group.icon}</span>
                <span style={{ fontFamily: 'Share Tech Mono', fontSize: 9, color: '#00d4ffcc', letterSpacing: '0.1em', flex: 1, textAlign: 'left' }}>
                  {group.title}
                </span>
                <span style={{ fontFamily: 'Share Tech Mono', fontSize: 8, color: '#00e676aa' }}>
                  {groupOk}/{group.items.length}
                </span>
                <span style={{ color: '#00d4ff66', fontSize: 10 }}>{isExp ? '▲' : '▼'}</span>
              </button>
              {isExp && (
                <div style={{ padding: '4px 0' }}>
                  {groupItems.map(item => (
                    <CheckRow key={item.id} item={item} onCycle={onCycle} onNote={onNote} />
                  ))}
                </div>
              )}
            </div>
          );
        })
      )}

      {/* Export */}
      <button
        onClick={onExport}
        style={{
          padding: '10px 16px', borderRadius: 8, cursor: 'pointer',
          background: 'rgba(255,107,0,0.08)',
          border: '1px solid #ff6b0033',
          color: '#ff6b00aa',
          fontFamily: 'Orbitron', fontSize: 9, letterSpacing: '0.2em',
          marginTop: 4,
        }}
      >
        ↓ EXPORTER RAPPORT JSON
      </button>
    </div>
  );
}

function CheckRow({ item, onCycle, onNote }: {
  item: CheckItem;
  onCycle: (id: string) => void;
  onNote: (id: string, note: string) => void;
}) {
  const [noteOpen, setNoteOpen] = useState(false);
  const statusCol: Record<CheckStatus, string> = {
    '✅': '#00e676', '⚠️': '#f39c12', '❌': '#ff3366', '☐': '#ffffff33',
  };

  return (
    <div style={{ borderBottom: '1px solid #00d4ff0a' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '7px 12px', cursor: 'pointer',
      }}>
        <button
          onClick={() => onCycle(item.id)}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 13, width: 20, flexShrink: 0,
            color: statusCol[item.status],
          }}
        >{item.status}</button>
        <span
          onClick={() => setNoteOpen(n => !n)}
          style={{
            flex: 1, fontFamily: 'Exo 2', fontSize: 10,
            color: item.status === '☐' ? '#ffffff55' : '#ffffffcc',
            cursor: 'pointer',
          }}
        >{item.label}</span>
        {(item.status === '⚠️' || item.status === '❌') && (
          <button
            onClick={() => setNoteOpen(n => !n)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 9, color: '#ffffff33',
            }}
          >📝</button>
        )}
      </div>
      {noteOpen && (
        <div style={{ padding: '0 12px 8px 40px' }}>
          <input
            value={item.note}
            onChange={e => onNote(item.id, e.target.value)}
            placeholder="Note sur ce point..."
            style={{
              width: '100%', background: 'rgba(255,255,255,0.04)',
              border: '1px solid #ffffff11', borderRadius: 6,
              padding: '5px 8px', color: '#ffffffcc',
              fontFamily: 'Exo 2', fontSize: 9, outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </div>
      )}
    </div>
  );
}

function HistoryTab({ history }: { history: HistoryEntry[] }) {
  const statusCol = { done: '#00e676', partial: '#f39c12', planned: '#00d4ff' };
  const statusLabel = { done: '✅ FAIT', partial: '⚠️ PARTIEL', planned: '📋 PRÉVU' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontFamily: 'Orbitron', fontSize: 9, color: '#00d4ff88', letterSpacing: '0.2em', marginBottom: 4 }}>
        JOURNAL DÉVELOPPEMENT
      </div>
      {history.map((entry, i) => (
        <div key={i} style={{
          padding: '10px 12px',
          background: 'rgba(0,212,255,0.03)',
          border: `1px solid ${statusCol[entry.status]}22`,
          borderLeft: `3px solid ${statusCol[entry.status]}66`,
          borderRadius: '0 8px 8px 0',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontFamily: 'Share Tech Mono', fontSize: 8, color: '#ffffff55' }}>{entry.date}</span>
            <span style={{ fontFamily: 'Share Tech Mono', fontSize: 8, color: statusCol[entry.status] }}>
              {statusLabel[entry.status]}
            </span>
          </div>
          <p style={{ fontFamily: 'Exo 2', fontSize: 10, color: '#ffffffcc', margin: 0, lineHeight: 1.5 }}>
            {entry.description}
          </p>
        </div>
      ))}
    </div>
  );
}

function Stat({ label, val, col }: { label: string; val: number; col: string }) {
  return (
    <span style={{ fontFamily: 'Share Tech Mono', fontSize: 8, color: col }}>
      {label} {val}
    </span>
  );
}

const labelStyle: React.CSSProperties = {
  fontFamily: 'Share Tech Mono', fontSize: 8, color: '#00d4ff88', letterSpacing: '0.2em',
  textTransform: 'uppercase',
};
