import { useState, useEffect } from 'react';
import { business, type ClientSummary, type ClientIntelligence } from '../../services/api.ts';

const SCORE_COL: Record<string, string> = {
  VIP: '#ffd700', FREQUENT: '#00d4ff', FRÉQUENT: '#00d4ff',
  REGULAR: '#00e676', RÉGULIER: '#00e676', NEW: '#ffffff88', NOUVEAU: '#ffffff88',
};
const SCORE_BG: Record<string, string> = {
  VIP: '#ffd70022', FREQUENT: '#00d4ff22', FRÉQUENT: '#00d4ff22',
  REGULAR: '#00e67622', RÉGULIER: '#00e67622', NEW: '#ffffff11', NOUVEAU: '#ffffff11',
};

export default function ClientsScreen() {
  const [clients, setClients]   = useState<ClientSummary[]>([]);
  const [intel, setIntel]       = useState<Map<string, ClientIntelligence>>(new Map());
  const [loading, setLoad]      = useState(true);
  const [search, setSearch]     = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = async () => {
    setLoad(true);
    try {
      const [clientRes, intelRes] = await Promise.all([
        business.fetchClients().catch(() => ({ clients: [] as ClientSummary[] })),
        business.fetchClientIntel().catch(() => ({ clients: [] as ClientIntelligence[] })),
      ]);
      setClients(clientRes.clients ?? []);
      const map = new Map<string, ClientIntelligence>();
      (intelRes.clients ?? []).forEach(c => map.set(c.client_name, c));
      setIntel(map);
    } finally { setLoad(false); }
  };

  useEffect(() => { void load(); }, []);

  const filtered = clients.filter(c =>
    !search || c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.phone?.includes(search) ?? false)
  );

  const getScore = (name: string, def = 'NOUVEAU') => {
    const ci = intel.get(name);
    return ci?.score?.toUpperCase() ?? def;
  };

  const fmt = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k€` : `${Math.round(n)}€`;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#020810', color: '#fff', fontFamily: 'Share Tech Mono' }}>
      {/* Header */}
      <div style={{ padding: '8px 12px', borderBottom: '1px solid #00d4ff15', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <span style={{ fontFamily: 'Orbitron', fontSize: 9, color: '#00d4ff', letterSpacing: '0.3em' }}>CLIENTS</span>
          <span style={{ marginLeft: 'auto', fontFamily: 'Orbitron', fontSize: 8, color: '#00d4ff66' }}>{clients.length}</span>
        </div>
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Chercher nom / téléphone…"
          style={inputStyle}
        />
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
        {loading ? (
          <Loader />
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 20, fontSize: 9, color: '#ffffff22' }}>Aucun client</div>
        ) : filtered.map(c => {
          const score = getScore(c.name);
          const scCol = SCORE_COL[score] ?? '#ffffff66';
          const scBg  = SCORE_BG[score] ?? '#ffffff0a';
          const ci    = intel.get(c.name);
          const isExp = expanded === c.name;

          return (
            <div key={c.name} style={{ borderBottom: '1px solid #ffffff08' }}>
              <div
                onClick={() => setExpanded(e => e === c.name ? null : c.name)}
                style={{ padding: '8px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
              >
                {/* Score badge */}
                <div style={{
                  padding: '2px 6px', borderRadius: 4, fontSize: 7,
                  background: scBg, color: scCol, flexShrink: 0,
                  fontFamily: 'Orbitron', letterSpacing: '0.1em',
                }}>
                  {score.slice(0, 4)}
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 10, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.name}
                  </div>
                  <div style={{ fontSize: 8, color: '#ffffff55' }}>
                    {c.bookingCount} résa · {fmt(c.totalSpent)}
                  </div>
                </div>

                {/* Phone link */}
                {c.phone && (
                  <a
                    href={`tel:${c.phone}`}
                    onClick={e => e.stopPropagation()}
                    style={{ fontSize: 14, textDecoration: 'none', flexShrink: 0 }}
                    title={c.phone}
                  >📞</a>
                )}
              </div>

              {/* Intelligence detail */}
              {isExp && ci && (
                <div style={{ padding: '4px 12px 8px 20px', background: '#030f1a' }}>
                  <Row label="Voitures préférées" val={(ci.preferred_cars ?? []).join(', ') || '—'} />
                  <Row label="Durée typique" val={ci.typical_duration_days ? `${ci.typical_duration_days}j` : '—'} />
                  <Row label="Style négociation" val={ci.negotiation_style ?? '—'} />
                  <Row label="Fiabilité paiement" val={ci.payment_reliability ?? '—'} />
                  <Row label="Dépenses total" val={fmt(ci.total_spent)} col="#ffd700" />
                  {ci.notes && (
                    <div style={{ marginTop: 4, padding: '4px 6px', background: '#0a1520', borderRadius: 4, fontSize: 8, color: '#ffffff88', lineHeight: 1.5 }}>
                      {ci.notes}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Row({ label, val, col }: { label: string; val: string; col?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
      <span style={{ fontSize: 8, color: '#ffffff44' }}>{label}</span>
      <span style={{ fontSize: 8, color: col ?? '#ffffff88', maxWidth: '55%', textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{val}</span>
    </div>
  );
}
function Loader() {
  return <div style={{ textAlign: 'center', padding: 20, fontSize: 9, color: '#00d4ff44', fontFamily: 'Orbitron', letterSpacing: '0.2em' }}>CHARGEMENT…</div>;
}
const inputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box',
  background: '#0a1520', border: '1px solid #00d4ff22', borderRadius: 6,
  padding: '5px 8px', fontFamily: 'Share Tech Mono', fontSize: 10, color: '#fff', outline: 'none',
};
