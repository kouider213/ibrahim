// 16/11 : page Aujourd'hui — « Toi » (séance, protéines, Liberté, RDV médecin, nuit) + « Ta semaine » (7 j vs 7 j d'avant)
// + rappel de la prochaine vague diaspora (voitures libres → campagne dans Saison diaspora).
import { useEffect, useState } from 'react';
import { apiFetch } from '../../services/api.ts';
import { T, glass, SectionTitle, Badge } from '../ui/Kit.tsx';
import { Icon } from '../ui/Icon.tsx';

type Row = { id: string; label: string; now: number | null; prev: number | null; unit: string; better: 'up' | 'down'; note?: string };
type Me = {
  today: string;
  session: { label: string | null; done: boolean; skipped: boolean } | null;
  protein: { eaten: number; goal: number } | null;
  liberte: { taken: number; allowed: number; next: { time: string; n: number } | null } | null;
  doctor: { date: string; status: string } | null;
  sleep: number | null;
  week: Row[];
  ca: { month: string; gross: number } | null;
};
type Wave = { id: string; name: string; days: number; cars: number; booked: number; free: unknown[] };

const go = (p: string) => window.dispatchEvent(new CustomEvent('dz:go', { detail: p }));
const n = (v: number | null, u = '') => v == null ? '—' : `${String(v).replace('.', ',')}${u ? ` ${u}` : ''}`;
const ICON: Record<string, string> = { poids: 'scale', seances: 'dumbbell', sommeil: 'moon', proteines: 'utensils', demis: 'pill' };

function fmtDay(d: string) {
  const dt = new Date(d.slice(0, 10) + 'T12:00:00');
  const left = Math.round((dt.getTime() - new Date(new Date().toISOString().slice(0, 10) + 'T12:00:00').getTime()) / 86_400_000);
  return dt.toLocaleDateString('fr-BE', { weekday: 'short', day: 'numeric', month: 'short' }) + (left === 0 ? " · aujourd'hui" : left === 1 ? ' · demain' : left > 1 ? ` · dans ${left} j` : '');
}

export default function MeCard() {
  const [me, setMe] = useState<Me | null>(null);
  const [wave, setWave] = useState<Wave | null>(null);
  useEffect(() => {
    apiFetch<Me>('/api/insights/me').then(setMe).catch(() => {});
    apiFetch<{ waves: Wave[] }>('/api/insights/waves').then(r => setWave(r.waves.find(w => w.days >= 0 && w.days <= 75) ?? null)).catch(() => {});
  }, []);
  if (!me) return null;

  const tiles: Array<{ k: string; icon: string; c: string; top: string; sub: string; ok?: boolean; page: string }> = [];
  if (me.session?.label) tiles.push({ k: 's', icon: 'dumbbell', c: '#ff5a1f', top: me.session.done ? 'Séance faite' : me.session.skipped ? 'Repos' : me.session.label.charAt(0) + me.session.label.slice(1).toLowerCase(), sub: me.session.done ? me.session.label.charAt(0) + me.session.label.slice(1).toLowerCase() : "Séance du jour", ok: me.session.done, page: 'sport' });
  if (me.protein) { const left = Math.max(0, me.protein.goal - me.protein.eaten); tiles.push({ k: 'p', icon: 'utensils', c: '#7fb2ff', top: `${me.protein.eaten} / ${me.protein.goal} g`, sub: left ? `protéines · encore ${left} g` : 'protéines atteintes', ok: !left, page: 'sport' }); }
  if (me.liberte) tiles.push({ k: 'l', icon: 'leaf', c: '#3d6bff', top: `${me.liberte.taken} / ${me.liberte.allowed} demis`, sub: me.liberte.next ? `prochaine à ${me.liberte.next.time}` : 'plus rien aujourd\'hui', ok: me.liberte.taken <= me.liberte.allowed, page: 'liberte' });
  if (me.sleep != null) tiles.push({ k: 'z', icon: 'moon', c: '#8b5cf6', top: `${n(me.sleep, 'h')}`, sub: 'cette nuit', ok: me.sleep >= 7, page: 'sport' });

  const rows = me.week.filter(r => r.now != null || r.prev != null);
  return (
    <div style={{ marginBottom: 18 }}>
      <SectionTitle><Icon name="user" size={17} style={{ marginRight: 7, verticalAlign: '-3px' }} />Toi aujourd'hui</SectionTitle>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 8 }}>
        {tiles.map(t => (
          <button key={t.k} onClick={() => go(t.page)} className="dz-press" style={{ ...glass(t.c), borderRadius: 18, padding: '12px 13px', textAlign: 'left', color: T.text, fontFamily: T.font, cursor: 'pointer', minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, color: t.c }}><Icon name={t.icon} size={16} stroke={2} />{t.ok && <span style={{ marginLeft: 'auto', color: T.ok }}><Icon name="check" size={15} stroke={2.6} /></span>}</div>
            <div style={{ fontSize: 15.5, fontWeight: 700, marginTop: 8, letterSpacing: '-0.015em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.top}</div>
            <div style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>{t.sub}</div>
          </button>
        ))}
      </div>
      {me.doctor && (
        <button onClick={() => go('liberte')} className="dz-press" style={{ ...glass(T.warn), width: '100%', marginTop: 8, borderRadius: 16, padding: '11px 13px', display: 'flex', alignItems: 'center', gap: 10, color: T.text, fontFamily: T.font, cursor: 'pointer', textAlign: 'left' }}>
          <span style={{ color: T.warn, display: 'flex' }}><Icon name="stethoscope" size={17} /></span>
          <span style={{ fontSize: 14, fontWeight: 600 }}>RDV médecin</span>
          <span style={{ marginLeft: 'auto', fontSize: 13, color: T.muted }}>{fmtDay(me.doctor.date)}</span>
        </button>
      )}

      {rows.length > 0 && (
        <div style={{ ...glass(), borderRadius: 20, padding: '14px 15px', marginTop: 12 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
            <div style={{ fontSize: 15.5, fontWeight: 700, letterSpacing: '-0.015em' }}>Ta semaine</div>
            <div style={{ fontSize: 11.5, color: T.faint }}>7 derniers jours · avant</div>
          </div>
          {rows.map((r, i) => {
            const diff = r.now != null && r.prev != null && r.now !== r.prev ? r.now - r.prev : null;
            const good = diff == null ? null : (diff > 0) === (r.better === 'up');
            const col = good == null ? T.faint : good ? T.ok : T.bad;
            return (
              <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: i ? '1px solid var(--dz-line)' : 'none' }}>
                <span style={{ color: T.muted, display: 'flex' }}><Icon name={ICON[r.id] ?? 'chart'} size={16} /></span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 550 }}>{r.label}</div>
                  {r.note && <div style={{ fontSize: 11.5, color: T.faint }}>{r.note}</div>}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 15, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{n(r.now, r.unit)}</div>
                  <div style={{ fontSize: 11.5, color: col, fontWeight: 600 }}>{diff == null ? (r.prev != null ? `= ${n(r.prev, r.unit)}` : '') : `${diff > 0 ? '▲' : '▼'} ${n(Math.round(Math.abs(diff) * 10) / 10, r.unit)}`}</div>
                </div>
              </div>
            );
          })}
          {me.ca && <div style={{ fontSize: 12.5, color: T.muted, marginTop: 6 }}>CA de {me.ca.month} : <b style={{ color: T.text }}>{me.ca.gross} €</b></div>}
        </div>
      )}

      {wave && wave.free.length > 0 && (
        <button onClick={() => go('forecast')} className="dz-press" style={{ ...glass('#f59e0b'), width: '100%', marginTop: 12, borderRadius: 18, padding: '13px 14px', display: 'flex', alignItems: 'center', gap: 12, color: T.text, fontFamily: T.font, cursor: 'pointer', textAlign: 'left' }}>
          <span style={{ width: 38, height: 38, borderRadius: 12, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', background: 'linear-gradient(145deg,#f59e0b,#b45309)' }}><Icon name="plane" size={18} /></span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14.5, fontWeight: 700 }}>{wave.name} dans {wave.days} j</div>
            <div style={{ fontSize: 12.5, color: T.muted }}>{wave.free.length} voiture{wave.free.length > 1 ? 's' : ''} libre{wave.free.length > 1 ? 's' : ''} sur {wave.cars} · préparer la campagne</div>
          </div>
          <Badge color="#f59e0b">Remplir</Badge>
        </button>
      )}
    </div>
  );
}
