import { useEffect, useState } from 'react';
import { business } from '../../services/api.ts';

// Tableau de bord façon écran Nexus du PC : horloge, jauges CPU/RAM/disque, météo, réservations du jour,
// actions rapides (mêmes commandes que sur le PC) et widgets à afficher sur l'écran Nexus.

const C = {
  surface: '#0c1730', border: 'rgba(90,150,255,0.16)', accent: '#38d8f5', blue: '#3b82f6',
  green: '#34d399', red: '#f87171', amber: '#fbbf24', text: '#f5f5f7', muted: '#8ea3c8',
  font: '-apple-system, "Segoe UI", Roboto, sans-serif',
};

type Sys = { cpu_percent?: number; ram_percent?: number; disk_percent?: number; disk_free_gb?: number; uptime_s?: number };
type Weather = { temperature: number; condition: string; icon: string; wind_speed: number };

const ACTIONS: Array<[string, string, string]> = [
  ['Chrome', 'Ouvre Chrome', 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 6a4 4 0 1 1 0 8 4 4 0 0 1 0-8zM12 8h9M8.5 14 4 6.5M15.5 14 11 21.8'],
  ['VS Code', 'Ouvre VS Code', 'M16 3l5 2.5v13L16 21 6 12zM16 3 3 14l2 2 11-9M5 8l-2 2 13 11'],
  ['Capture', 'Fais une capture d\'écran et envoie-la sur Telegram', 'M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z'],
  ['Analyse', 'Analyse mon écran et dis-moi ce que tu vois', 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z'],
  ['Briefing', 'Fais-moi le briefing du jour', 'M4 4h16v12H5l-1 4zM8 9h8M8 12h5'],
  ['Musique', 'Mets de la musique', 'M9 18V5l12-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM21 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z'],
  ['Ménage', 'Fais le ménage du PC (fichiers temporaires, corbeille)', 'M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 10v6M14 10v6'],
  ['Verrouiller', 'Verrouille le PC', 'M6 11h12v10H6zM8 11V7a4 4 0 0 1 8 0v4'],
];

const WIDGETS: Array<['disk' | 'weather' | 'bookings' | 'railway', string]> = [
  ['weather', 'Météo'], ['bookings', 'Réservations'], ['disk', 'Disque'], ['railway', 'Serveur'],
];

export default function NexusDeck({ online, busy, onSay, flash }: {
  online: boolean; busy: boolean; onSay: (cmd: string) => void; flash: (m: string) => void;
}) {
  const [now, setNow] = useState(new Date());
  const [sys, setSys] = useState<Sys | null>(null);
  const [wx, setWx] = useState<Weather | null>(null);
  const [failed, setFailed] = useState({ wx: false, today: false });
  const [today, setToday] = useState<{ out: number; back: number; pending: number } | null>(null);

  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);

  useEffect(() => {
    let stop = false;
    const load = async () => {
      if (document.hidden) return;
      if (online) {
        try { const r = await business.nexusSysinfo(); if (!stop && r.ok) setSys(r); } catch { /* PC muet : on garde la dernière mesure */ }
      }
    };
    void load();
    const t = setInterval(load, 20_000);
    return () => { stop = true; clearInterval(t); };
  }, [online]);

  useEffect(() => {
    business.weather().then(setWx).catch(() => setFailed(f => ({ ...f, wx: true })));
    business.insightsToday()
      .then(r => setToday({ out: r.departures.length, back: r.returns.length, pending: r.pendingBookings }))
      .catch(() => setFailed(f => ({ ...f, today: true })));
  }, []);

  const pushWidget = async (w: typeof WIDGETS[number][0], label: string) => {
    try {
      const r = await business.nexusWidget(w);
      flash(r.ok ? `${label} affiché sur l'écran Nexus` : (r.error ?? 'Nexus ne répond pas'));
    } catch { flash('Nexus hors ligne'); }
  };

  const up = sys?.uptime_s ? `${Math.floor(sys.uptime_s / 3600)} h ${Math.floor((sys.uptime_s % 3600) / 60)} min` : '—';

  return (
    <div style={{
      position: 'relative', overflow: 'hidden', marginBottom: 12, borderRadius: 16, padding: 14,
      background: 'radial-gradient(120% 90% at 50% 0%, rgba(56,216,245,0.10), transparent 60%), linear-gradient(180deg, #0b1630, #071024)',
      border: `1px solid ${C.border}`, boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
    }}>
      {/* Coins façon HUD */}
      {(['tl', 'tr', 'bl', 'br'] as const).map(k => (
        <span key={k} style={{
          position: 'absolute', width: 12, height: 12, borderColor: `${C.accent}88`, borderStyle: 'solid', borderWidth: 0,
          ...(k[0] === 't' ? { top: 6, borderTopWidth: 1.5 } : { bottom: 6, borderBottomWidth: 1.5 }),
          ...(k[1] === 'l' ? { left: 6, borderLeftWidth: 1.5 } : { right: 6, borderRightWidth: 1.5 }),
        }} />
      ))}

      {/* Horloge + voyant */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          <div style={{ fontFamily: 'Orbitron', fontSize: 30, fontWeight: 700, color: '#fff', letterSpacing: '0.04em', lineHeight: 1, textShadow: '0 0 18px rgba(56,216,245,0.35)' }}>
            {now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
            <span style={{ fontSize: 14, color: C.accent, marginLeft: 3 }}>{String(now.getSeconds()).padStart(2, '0')}</span>
          </div>
          <div style={{ fontSize: 11, color: C.muted, marginTop: 5, textTransform: 'capitalize' }}>
            {now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'Orbitron', fontSize: 9, letterSpacing: '0.2em', color: online ? C.green : C.red }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: online ? C.green : C.red, boxShadow: `0 0 8px ${online ? C.green : C.red}` }} />
            {online ? 'NEXUS ACTIF' : 'NEXUS HORS LIGNE'}
          </div>
          <div style={{ fontSize: 10.5, color: C.muted, marginTop: 5 }}>Actif depuis {up}</div>
        </div>
      </div>

      {/* Jauges */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 10 }}>
        <Gauge label="CPU" pct={sys?.cpu_percent} />
        <Gauge label="RAM" pct={sys?.ram_percent} />
        <Gauge label="DISQUE" pct={sys?.disk_percent} sub={sys?.disk_free_gb != null ? `${sys.disk_free_gb} Go libres` : undefined} />
      </div>

      {/* Infos */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
        <Info label="MÉTÉO ORAN" value={wx ? `${wx.icon} ${Math.round(wx.temperature)}°` : '—'} sub={wx ? `${wx.condition} · vent ${Math.round(wx.wind_speed)} km/h` : failed.wx ? 'Indisponible' : 'Chargement…'} />
        <Info label="AUJOURD'HUI" value={today ? `${today.out} ↗ ${today.back} ↙` : '—'} sub={today ? `départs · retours${today.pending ? ` · ${today.pending} à confirmer` : ''}` : failed.today ? 'Indisponible' : 'Chargement…'} />
      </div>

      {/* Actions rapides */}
      <Label>Actions rapides</Label>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 7, marginBottom: 12 }}>
        {ACTIONS.map(([label, cmd, d]) => (
          <button key={label} disabled={!online || busy} onClick={() => onSay(cmd)} style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '11px 2px 9px', borderRadius: 12,
            border: `1px solid ${C.border}`, background: 'rgba(56,216,245,0.05)', color: C.text, cursor: online && !busy ? 'pointer' : 'default',
            opacity: online ? 1 : 0.4, fontFamily: C.font, fontSize: 10.5,
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={C.accent} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
            {label}
          </button>
        ))}
      </div>

      {/* Widgets sur l'écran Nexus */}
      <Label>Afficher sur l'écran Nexus</Label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {WIDGETS.map(([w, label]) => (
          <button key={w} disabled={!online} onClick={() => { void pushWidget(w, label); }} style={{
            padding: '7px 12px', borderRadius: 999, border: `1px solid ${C.accent}44`, background: 'rgba(56,216,245,0.08)',
            color: C.accent, fontSize: 12, fontFamily: C.font, cursor: online ? 'pointer' : 'default', opacity: online ? 1 : 0.4,
          }}>＋ {label}</button>
        ))}
      </div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <div style={{ fontFamily: 'Orbitron', fontSize: 9, letterSpacing: '0.24em', color: C.muted, textTransform: 'uppercase', marginBottom: 8 }}>{children}</div>;
}

function Gauge({ label, pct, sub }: { label: string; pct?: number; sub?: string }) {
  const v = pct == null ? null : Math.max(0, Math.min(100, pct));
  const col = v == null ? C.muted : v >= 90 ? C.red : v >= 70 ? C.amber : C.accent;
  const R = 26, L = 2 * Math.PI * R;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '10px 4px 8px', borderRadius: 12, background: 'rgba(5,12,28,0.6)', border: `1px solid ${C.border}` }}>
      <svg width="64" height="64" viewBox="0 0 64 64">
        <circle cx="32" cy="32" r={R} fill="none" stroke="rgba(90,150,255,0.14)" strokeWidth="5" />
        <circle cx="32" cy="32" r={R} fill="none" stroke={col} strokeWidth="5" strokeLinecap="round"
          strokeDasharray={`${((v ?? 0) / 100) * L} ${L}`} transform="rotate(-90 32 32)"
          style={{ transition: 'stroke-dasharray 0.6s ease', filter: `drop-shadow(0 0 4px ${col})` }} />
        <text x="32" y="36" textAnchor="middle" fill="#fff" fontFamily="Orbitron" fontSize="13" fontWeight="700">{v == null ? '—' : `${Math.round(v)}%`}</text>
      </svg>
      <div style={{ fontFamily: 'Orbitron', fontSize: 8.5, letterSpacing: '0.2em', color: C.muted, marginTop: 4 }}>{label}</div>
      {sub && <div style={{ fontSize: 9.5, color: C.muted, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function Info({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div style={{ padding: '10px 11px', borderRadius: 12, background: 'rgba(5,12,28,0.6)', border: `1px solid ${C.border}`, minWidth: 0 }}>
      <div style={{ fontFamily: 'Orbitron', fontSize: 8.5, letterSpacing: '0.2em', color: C.muted, marginBottom: 6 }}>{label}</div>
      <div style={{ fontFamily: 'Orbitron', fontSize: 18, fontWeight: 700, color: '#fff' }}>{value}</div>
      <div style={{ fontSize: 10.5, color: C.muted, marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub}</div>
    </div>
  );
}
