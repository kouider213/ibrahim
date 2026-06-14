import { useState, useEffect } from 'react';
import { business } from '../../services/api.ts';
import { Hero } from '../ui/Premium.tsx';

const C = {
  bg: '#0a0a0c', surface: '#16161c', border: 'rgba(255,255,255,0.08)',
  accent: '#10b981', gold: '#fbbf24', text: '#f5f5f7', muted: '#9b9ba6',
  font: '-apple-system, "Segoe UI", Roboto, sans-serif',
};
type F = { byMonth: Array<{ month: string; count: number; pct: number }>; peaks: string[]; next3: string[]; summerSoon: boolean; total: number };

export default function ForecastScreen() {
  const [f, setF] = useState<F | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => { business.insightsForecast().then(setF).catch(() => setF(null)).finally(() => setLoading(false)); }, []);

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: C.bg, color: C.text, fontFamily: C.font, padding: '20px 16px 30px' }}>
      <div style={{ margin: '-20px -16px 0' }}><Hero eyebrow="Dzaryx · Prévision" title="Saison diaspora" /></div>
      <div style={{ fontSize: 12, color: C.muted, marginBottom: 16 }}>Quand prévoir la flotte, anticiper les pics</div>

      {loading ? <div style={{ textAlign: 'center', padding: 30, color: C.muted, fontSize: 13 }}>Chargement…</div> : !f ? <div style={{ textAlign: 'center', padding: 30, color: C.muted, fontSize: 13 }}>Indisponible</div> : (
        <>
          {f.summerSoon && (
            <div style={{ background: `${C.gold}14`, border: `1px solid ${C.gold}44`, borderRadius: 14, padding: 14, marginBottom: 14, fontSize: 13, color: C.gold, lineHeight: 1.5 }}>
              ☀️ <b>L'été approche</b> — pic diaspora juillet/août. Prépare ta flotte, bloque les véhicules clés, monte les prix sur les périodes fortes.
            </div>
          )}
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: 14, marginBottom: 14 }}>
            <div style={{ fontSize: 12, color: C.muted, marginBottom: 4 }}>Mois les plus chargés (historique)</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: C.gold }}>{f.peaks.length ? f.peaks.join(' · ') : '—'}</div>
          </div>

          <div style={{ fontSize: 10, color: C.muted, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>Réservations par mois</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {f.byMonth.map(m => (
              <div key={m.month} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ width: 34, fontSize: 11, color: C.muted }}>{m.month}</span>
                <div style={{ flex: 1, height: 18, background: '#ffffff0a', borderRadius: 6, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${Math.max(2, m.pct)}%`, background: `linear-gradient(90deg, ${C.accent}66, ${C.accent})`, borderRadius: 6 }} />
                </div>
                <span style={{ width: 24, fontSize: 11, color: C.text, textAlign: 'right' }}>{m.count}</span>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 11, color: C.muted, marginTop: 14 }}>Total analysé : {f.total} réservations.</div>
        </>
      )}
    </div>
  );
}
