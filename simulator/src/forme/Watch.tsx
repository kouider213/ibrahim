import { useEffect, useState } from 'react';
import { get } from './api.ts';
import { F, card, btn, Sheet, Ring } from './ui.tsx';

// ⌚ FORME DU JOUR (31/10, « comme Fitbit mais en mieux ») — façon Whoop / Fitbit / anneaux Apple :
// l'Apple Watch → Santé de l'iPhone → raccourci Santé (chaque soir) → Dzaryx (/api/jarvis/health) → score de
// récupération (VFC + cœur au repos vs ses habitudes), pas, sommeil. Gratuit : aucune appli montre payante.
// Et la montre PARLE à Dzaryx : « Dis Siri, Dzaryx » marche aussi au poignet (tout son cerveau, ses outils, le coach en direct).
interface HDay { date: string; sleep_h?: number; steps?: number; rhr?: number; hrv?: number; active_kcal?: number }
interface WatchData { ok: boolean; last: HDay | null; days: HDay[]; usual: { rhr: number | null; hrv: number | null; steps: number | null; sleep_h: number | null }; readiness: { score: number; line: string } | null; series: Array<{ date: string; score: number }> }

const col = (s: number) => s >= 67 ? F.green : s >= 34 ? F.gold : F.red;
const word = (s: number) => s >= 67 ? 'Feu vert' : s >= 34 ? 'Modéré' : 'Récupère';

function Spark({ pts }: { pts: number[] }) {
  if (pts.length < 2) return null;
  const W = 120, H = 34, max = Math.max(...pts, 100), min = Math.min(...pts, 0);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${(i * W / (pts.length - 1)).toFixed(1)},${(H - (p - min) / (max - min) * H).toFixed(1)}`).join(' ');
  return <svg width={W} height={H} style={{ display: 'block' }}><path d={d} fill="none" stroke={F.accent} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

export function WatchGuide({ open, onClose }: { open: boolean; onClose: () => void }) {
  const step = (n: number, t: string, sub?: string) => (
    <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
      <div style={{ width: 26, height: 26, borderRadius: 13, background: F.ink, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13, flexShrink: 0 }}>{n}</div>
      <div style={{ paddingTop: 3 }}><div style={{ fontSize: 14.5, fontWeight: 600, lineHeight: 1.35 }}>{t}</div>{sub && <div style={{ fontSize: 13, color: F.muted, marginTop: 2, lineHeight: 1.4 }}>{sub}</div>}</div>
    </div>
  );
  const say = (t: string) => <div style={{ background: F.bg, borderRadius: 12, padding: '9px 12px', fontSize: 14, marginBottom: 6 }}>« {t} »</div>;
  return (
    <Sheet open={open} onClose={onClose} title={<div style={{ fontSize: 20, fontWeight: 700, paddingTop: 6 }}>⌚ Dzaryx sur ta montre</div>}>
      <div style={{ fontSize: 14, color: F.muted, lineHeight: 1.45, marginBottom: 14 }}>Gratuit, sans appli à acheter : ta montre passe par ton iPhone, et Dzaryx a déjà accès à ses données (raccourci Santé du soir).</div>
      <div style={{ fontWeight: 700, marginBottom: 10 }}>Parler à Dzaryx depuis la montre</div>
      {step(1, 'Sur l\'iPhone : app Raccourcis → ton raccourci « Dzaryx » → appui long → Détails', 'Active « Afficher sur l\'Apple Watch ».')}
      {step(2, 'Sur la montre : « Dis Siri, Dzaryx »', 'C\'est le même cerveau que l\'appli : il connaît ta séance, ton agenda, ton business.')}
      <div style={{ fontWeight: 700, margin: '14px 0 8px' }}>À la salle, au poignet</div>
      {say('je commence ma séance')}{say('série faite, 80 kilos, 8 répétitions')}{say('exercice suivant')}{say('remplace, la machine est prise')}{say('comment je récupère aujourd\'hui ?')}
      <div style={{ fontWeight: 700, margin: '14px 0 8px' }}>Ce que la montre envoie à Dzaryx</div>
      <div style={{ fontSize: 14, lineHeight: 1.5 }}>Pas, cœur au repos, VFC (variabilité cardiaque), entraînements, poids — chaque soir par ton raccourci Santé. Dzaryx en fait ton score de récupération et allège ta séance tout seul si ton cœur est fatigué.</div>
      <div style={{ fontSize: 13, color: F.muted, marginTop: 10, lineHeight: 1.45 }}>Le sommeil n'arrive pas encore : dans le raccourci Santé, il manque l'action « Analyse du sommeil ». Dis-le à Dzaryx si tu veux qu'il te guide pour l'ajouter.</div>
      <button onClick={onClose} style={{ ...btn, width: '100%', marginTop: 16 }}>Compris</button>
    </Sheet>
  );
}

/** Carte du haut de l'onglet Séance : récupération + pas + cœur + sommeil, tendance 14 jours. */
export function TodayForm() {
  const [d, setD] = useState<WatchData | null>(null);
  const [guide, setGuide] = useState(false);
  useEffect(() => { get<WatchData>('/api/forme/watch').then(setD).catch(() => setD(null)); }, []);
  if (!d?.ok) return null;
  const r = d.readiness, l = d.last;
  const ago = l ? Math.round((Date.parse(new Date().toISOString().slice(0, 10)) - Date.parse(l.date)) / 86_400_000) : null;
  const mini = (v: string, lab: string, sub?: string, c?: string) => (
    <div style={{ background: F.bg, borderRadius: 14, padding: '10px 10px', minWidth: 0 }}>
      <div style={{ fontSize: 17, fontWeight: 700, color: c ?? F.ink }}>{v}</div>
      <div style={{ fontSize: 11.5, color: F.muted, fontWeight: 500 }}>{lab}</div>
      {sub && <div style={{ fontSize: 11, color: F.muted }}>{sub}</div>}
    </div>
  );
  return (
    <>
      <div style={{ ...card, marginTop: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <Ring value={r?.score ?? 0} max={100} size={92} stroke={10} color={col(r?.score ?? 0)} track={F.bg2}>
            <div style={{ fontSize: 24, fontWeight: 700, lineHeight: 1 }}>{r ? r.score : '—'}</div>
            <div style={{ fontSize: 10, color: F.muted, fontWeight: 600 }}>RÉCUP</div>
          </Ring>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: F.muted }}>FORME DU JOUR</div>
            <div style={{ fontSize: 19, fontWeight: 700, color: r ? col(r.score) : F.ink }}>{r ? word(r.score) : 'En attente de la montre'}</div>
            <div style={{ fontSize: 12.5, color: F.muted, marginTop: 2 }}>{ago == null ? 'Aucune donnée reçue' : ago === 0 ? 'Montre synchronisée aujourd\'hui' : `Dernière synchro il y a ${ago} j`}</div>
            {d.series.length > 1 && <div style={{ marginTop: 6 }}><Spark pts={d.series.map(x => x.score)} /></div>}
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 6, marginTop: 12 }}>
          {mini(l?.hrv ? String(l.hrv) : '—', 'VFC ms', d.usual.hrv ? `hab. ${Math.round(d.usual.hrv)}` : undefined, l?.hrv && d.usual.hrv ? (l.hrv >= d.usual.hrv ? F.green : F.red) : undefined)}
          {mini(l?.rhr ? String(l.rhr) : '—', 'Cœur repos', d.usual.rhr ? `hab. ${Math.round(d.usual.rhr)}` : undefined, l?.rhr && d.usual.rhr ? (l.rhr <= d.usual.rhr + 2 ? F.green : F.red) : undefined)}
          {mini(l?.steps ? `${Math.round(l.steps / 100) / 10}k` : '—', 'Pas', d.usual.steps ? `hab. ${Math.round(d.usual.steps / 100) / 10}k` : undefined)}
          {mini(l?.sleep_h ? `${l.sleep_h} h` : '—', 'Sommeil')}
        </div>
        {r?.line && <div style={{ fontSize: 13.5, lineHeight: 1.45, marginTop: 10 }}>{r.line.replace(/^🔋\s*/, '')}</div>}
        <button onClick={() => setGuide(true)} style={{ width: '100%', marginTop: 12, border: 'none', background: F.soft, color: F.accent, borderRadius: 12, padding: '11px', fontWeight: 600, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>⌚ Utiliser Dzaryx depuis ma montre</button>
      </div>
      <WatchGuide open={guide} onClose={() => setGuide(false)} />
    </>
  );
}
