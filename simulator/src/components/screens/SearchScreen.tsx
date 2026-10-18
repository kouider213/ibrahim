import { useState, useEffect, useRef } from 'react';
import { business } from '../../services/api.ts';
import { Hero } from '../ui/Premium.tsx';

const C = {
  bg: '#050a16', surface: '#0c1730', border: 'rgba(90,150,255,0.16)',
  accent: '#38d8f5', text: '#f5f5f7', muted: '#8ea3c8',
  font: '-apple-system, "Segoe UI", Roboto, sans-serif',
};
const TYPE_COL: Record<string, string> = {
  'Véhicule': '#00e676', 'Client/Résa': '#38d8f5', 'Bien': '#a78bfa', 'Dossier': '#8b5cf6', 'Import': '#06b6d4', 'Lead': '#f59e0b',
};
type R = { type: string; label: string; sub?: string; ref?: string };

const TYPE_PAGE: Record<string, string> = {
  'Véhicule': 'fleet', 'Client/Résa': 'clients', 'Bien': 'immo',
  'Dossier': 'leads', 'Import': 'leads', 'Lead': 'leads',
};

export default function SearchScreen({ onOpen }: { onOpen?: (p: string) => void }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<R[]>([]);
  const [loading, setLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (q.trim().length < 2) { setResults([]); return; }
    timer.current = setTimeout(async () => {
      setLoading(true);
      try { const r = await business.globalSearch(q.trim()); setResults(r.results ?? []); } catch { setResults([]); }
      finally { setLoading(false); }
    }, 350);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [q]);

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: C.bg, color: C.text, fontFamily: C.font, padding: '20px 16px 30px' }}>
      <div style={{ margin: '-20px -16px 4px' }}><Hero eyebrow="Dzaryx · Recherche" title="Tout chercher" /></div>

      <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Nom client, voiture, réf dossier/import, bien…"
        style={{ width: '100%', boxSizing: 'border-box', background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: '13px 15px', color: C.text, fontFamily: C.font, fontSize: 16, outline: 'none', marginBottom: 16 }} />

      {loading ? <div style={{ textAlign: 'center', padding: 20, color: C.muted, fontSize: 16 }}>Recherche…</div>
        : q.trim().length < 2 ? <div style={{ textAlign: 'center', padding: 20, color: C.muted, fontSize: 13 }}>Tape au moins 2 lettres</div>
        : results.length === 0 ? <div style={{ textAlign: 'center', padding: 20, color: C.muted, fontSize: 13 }}>Aucun résultat</div>
        : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {results.map((r, i) => {
              const col = TYPE_COL[r.type] ?? C.muted;
              const dest = TYPE_PAGE[r.type];
              return (
                <div key={i} onClick={() => dest && onOpen?.(dest)} style={{ display: 'flex', alignItems: 'center', gap: 10, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: '11px 13px', cursor: dest ? 'pointer' : 'default' }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: col, background: `${col}1f`, border: `1px solid ${col}44`, borderRadius: 7, padding: '3px 8px', flexShrink: 0 }}>{r.type}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.label}</div>
                    {(r.sub || r.ref) && <div style={{ fontSize: 11, color: C.muted }}>{r.ref ? `${r.ref} · ` : ''}{r.sub}</div>}
                  </div>
                  {dest && <span style={{ color: C.muted, fontSize: 16 }}>›</span>}
                </div>
              );
            })}
          </div>
        )}
    </div>
  );
}
