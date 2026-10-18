import { useState, useEffect, useRef } from 'react';
import { business } from '../../services/api.ts';
import { T, Screen, PageHeader, Row, Avatar, Badge, Empty, inputStyle } from '../ui/Kit.tsx';

const TYPE_COL: Record<string, string> = {
  'Véhicule': '#00e676', 'Client/Résa': '#38d8f5', 'Bien': '#a78bfa', 'Dossier': '#8b5cf6', 'Import': '#06b6d4', 'Lead': '#f59e0b',
};
const TYPE_ICON: Record<string, string> = {
  'Véhicule': '🚗', 'Client/Résa': '👤', 'Bien': '🏠', 'Dossier': '📁', 'Import': '🚢', 'Lead': '📥',
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
    <Screen header={<>
      <PageHeader eyebrow="Recherche" title="Tout chercher" subtitle="Clients, réservations, voitures, biens, dossiers, demandes" />
      <div style={{ padding: '0 16px 8px', position: 'relative' }}>
        <span style={{ position: 'absolute', left: 30, top: 14, fontSize: 16, opacity: 0.7 }}>🔍</span>
        <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Nom, voiture, référence…" style={{ ...inputStyle, paddingLeft: 42 }} />
      </div>
    </>}>
      {loading ? <div style={{ textAlign: 'center', padding: 24, color: T.muted, fontSize: 15 }}>Recherche…</div>
        : q.trim().length < 2 ? <Empty icon="🔎" title="Que cherches-tu ?" text="Tape au moins 2 lettres : un nom de client, une voiture, une référence de dossier ou d'import, un bien…" />
        : results.length === 0 ? <Empty icon="🤷" title="Aucun résultat" text={`Rien ne correspond à « ${q.trim()} ».`} />
        : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 13, color: T.muted, margin: '2px 2px 2px' }}>{results.length} résultat{results.length > 1 ? 's' : ''}</div>
            {results.map((r, i) => {
              const col = TYPE_COL[r.type] ?? T.muted;
              const dest = TYPE_PAGE[r.type];
              return (
                <Row key={i} onClick={dest ? () => onOpen?.(dest) : undefined}
                  left={<Avatar icon={TYPE_ICON[r.type] ?? '•'} color={col} />}
                  title={r.label}
                  sub={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}><Badge color={col}>{r.type}</Badge>{(r.ref || r.sub) && <span>{r.ref ? `${r.ref} · ` : ''}{r.sub}</span>}</span>}
                  right={dest ? <span style={{ color: T.muted, fontSize: 20 }}>›</span> : undefined} />
              );
            })}
          </div>
        )}
    </Screen>
  );
}
