import { useState, useEffect } from 'react';
import { business, type TiktokGrowth } from '../../services/api.ts';
import { Ico } from '../ui/Icon.tsx';

// 24/11 : onglet 📈 TikTok de la page MONTAGE — l'équipe TikTok de FIK (vraies stats du compte + tendances + savoir de Dzaryx).
const C = {
  surface: 'var(--dz-surface)', border: 'rgba(var(--dz-ink-rgb),0.16)', text: 'var(--dz-text)', muted: 'var(--dz-muted)',
  pink: '#e8265e', green: '#1fa855', red: '#e0304f', font: '-apple-system, "Segoe UI", Roboto, sans-serif',
};
const card = { background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: 12, marginBottom: 10 } as const;
const btn = (bg: string, color: string) => ({ background: bg, color, border: 'none', borderRadius: 10, padding: '10px 13px', fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: C.font } as const);
const h = { fontSize: 14, fontWeight: 800, color: C.text, marginBottom: 8 } as const;
const fmt = (n?: number) => (n ?? 0).toLocaleString('fr-FR');

export default function TiktokTeam({ say }: { say: (t: string) => void }) {
  const [g, setG] = useState<TiktokGrowth | null | undefined>(undefined);
  const [busy, setBusy] = useState('');
  useEffect(() => { business.studioTiktok().then(r => setG(r.growth)).catch(() => setG(null)); }, []);

  const create = async (key: string, idea: string) => {
    setBusy(key);
    try { say((await business.studioPubTiktok(idea)).message); } catch { say('❌ Impossible de lancer la pub pour le moment'); } finally { setBusy(''); }
  };
  const meeting = async () => {
    setBusy('meet');
    try { say((await business.studioTiktokMeeting()).message); } catch { say('❌ Réunion impossible pour le moment'); } finally { setBusy(''); }
  };

  if (g === undefined) return <div style={{ ...card, color: C.muted, fontSize: 13 }}>Chargement de ton TikTok…</div>;
  if (!g) return (
    <div style={card}>
      <div style={h}>📈 Ton équipe TikTok</div>
      <div style={{ fontSize: 13, color: C.muted, marginBottom: 10 }}>Pas encore de données : lance une réunion, l'équipe lit ton TikTok (2-3 min).</div>
      <button style={{ ...btn(C.pink, '#fff'), width: '100%' }} disabled={!!busy} onClick={() => void meeting()}>📊 Réunion maintenant</button>
    </div>
  );
  const a = g.analysis ?? {};
  const max = Math.max(1, ...(g.hours ?? [1]));
  const age = Math.round((Date.now() - Date.parse(g.at)) / 3600_000);
  return (
    <div>
      <div style={card}>
        <div style={h}>📈 Ton TikTok <span style={{ fontSize: 12, fontWeight: 500, color: C.muted }}>· lu il y a {age < 1 ? 'moins d\'1 h' : age < 48 ? `${age} h` : `${Math.round(age / 24)} j`}</span></div>
        <div style={{ display: 'flex', gap: 8 }}>
          {[['Abonnés', fmt(g.followers), g.followers7 !== undefined ? `${g.followers7 >= 0 ? '+' : ''}${g.followers7} / 7 j` : ''], ['Vues 7 j', fmt(g.views7), ''], ['Poster à', g.bestHour ?? '—', 'heure d\'Oran']].map(([l, v, sub]) => (
            <div key={l} style={{ flex: 1, background: 'rgba(var(--dz-ink-rgb),0.045)', borderRadius: 10, padding: '8px 6px', textAlign: 'center' }}>
              <div style={{ fontSize: 11.5, color: C.muted }}>{l}</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: C.text }}>{v}</div>
              {sub && <div style={{ fontSize: 11, color: C.muted }}>{sub}</div>}
            </div>
          ))}
        </div>
        {g.hours && (
          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 11.5, color: C.muted, marginBottom: 4 }}>Quand tes abonnés sont sur TikTok (heure d'Oran)</div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 44 }}>
              {g.hours.map((v, i) => <div key={i} title={`${i}h`} style={{ flex: 1, height: `${Math.max(6, v / max * 100)}%`, background: v === max ? C.pink : 'rgba(232,38,94,0.35)', borderRadius: 2 }} />)}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: C.muted }}><span>0h</span><span>6h</span><span>12h</span><span>18h</span><span>23h</span></div>
          </div>
        )}
        {g.audience && <div style={{ fontSize: 12, color: C.muted, marginTop: 8, lineHeight: 1.45 }}>{g.audience}</div>}
        {a.summary && <div style={{ fontSize: 13, color: C.text, marginTop: 8, lineHeight: 1.45 }}>🧭 {a.summary}</div>}
        <button style={{ ...btn(C.pink, '#fff'), width: '100%', marginTop: 10, opacity: busy === 'meet' ? 0.6 : 1 }} disabled={!!busy} onClick={() => void meeting()}>📊 Réunion d'équipe maintenant (Telegram)</button>
      </div>

      {!!a.ideas?.length && (
        <div style={card}>
          <div style={h}>💡 Les vidéos que l'équipe te propose</div>
          {a.ideas.map((i, n) => (
            <div key={n} style={{ borderTop: n ? `1px solid ${C.border}` : 'none', padding: '9px 0' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{i.title}</div>
              <div style={{ fontSize: 13, color: C.pink, fontWeight: 700, marginTop: 2 }}>« {i.hook} »</div>
              <div style={{ fontSize: 12, color: C.muted, marginTop: 2, lineHeight: 1.4 }}>{i.format} — {i.why}</div>
              <button style={{ ...btn('rgba(232,38,94,0.12)', C.pink), marginTop: 6, opacity: busy === `i${n}` ? 0.6 : 1 }} disabled={!!busy}
                onClick={() => void create(`i${n}`, `${i.title}. Hook : « ${i.hook} ». Format : ${i.format}. ${i.why}`)}>
                <Ico e="🎬" />{busy === `i${n}` ? 'Lancement…' : 'Créer cette vidéo'}
              </button>
            </div>
          ))}
        </div>
      )}

      {!!g.videos.length && (
        <div style={card}>
          <div style={h}>🏆 Tes meilleures vidéos</div>
          {g.videos.map(v => (
            <a key={v.id} href={`https://www.tiktok.com/@fik_conciergerie/video/${v.id}`} target="_blank" rel="noreferrer" style={{ display: 'block', textDecoration: 'none', padding: '7px 0', borderTop: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 13, color: C.text, lineHeight: 1.35 }}>{v.desc || 'Vidéo'}</div>
              <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>▶ {fmt(v.plays)} vues · ❤ {fmt(v.likes)} · 🔖 {fmt(v.saves)} · ↗ {fmt(v.shares)}</div>
            </a>
          ))}
        </div>
      )}

      {(!!a.winning_patterns?.length || !!a.avoid?.length) && (
        <div style={card}>
          {!!a.winning_patterns?.length && <><div style={h}>✅ Ce qui marche chez toi</div>{a.winning_patterns.map((x, n) => <div key={n} style={{ fontSize: 12.5, color: C.text, marginBottom: 5, lineHeight: 1.4 }}>• {x}</div>)}</>}
          {!!a.avoid?.length && <><div style={{ ...h, marginTop: 10 }}>⛔ À arrêter</div>{a.avoid.map((x, n) => <div key={n} style={{ fontSize: 12.5, color: C.text, marginBottom: 5, lineHeight: 1.4 }}>• {x}</div>)}</>}
        </div>
      )}

      {(!!a.hooks_bank?.length || !!a.keywords?.length) && (
        <div style={card}>
          {!!a.hooks_bank?.length && <><div style={h}>🎣 Banque de hooks</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{a.hooks_bank.map((x, n) => (
              <button key={n} style={{ ...btn('rgba(var(--dz-ink-rgb),0.06)', C.text), fontWeight: 600, fontSize: 12.5, padding: '6px 10px' }}
                onClick={() => { void navigator.clipboard?.writeText(x).then(() => say('📋 Hook copié')).catch(() => say(x)); }}>{x}</button>))}</div></>}
          {!!a.keywords?.length && <><div style={{ ...h, marginTop: 10 }}>🔎 Mots à mettre dans tes légendes et à l'écran</div>
            <div style={{ fontSize: 12.5, color: C.text, lineHeight: 1.5 }}>{a.keywords.join(' · ')}</div></>}
          {!!a.hashtags?.length && <div style={{ fontSize: 12.5, color: C.muted, marginTop: 6 }}>{a.hashtags.join(' ')}</div>}
        </div>
      )}

      {!!a.client_questions?.length && (
        <div style={card}>
          <div style={h}>💬 Les vraies questions de tes clients (= vidéos-réponses)</div>
          {a.client_questions.map((q, n) => (
            <div key={n} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '5px 0' }}>
              <div style={{ flex: 1, fontSize: 12.5, color: C.text }}>{q}</div>
              <button style={{ ...btn('rgba(232,38,94,0.12)', C.pink), padding: '6px 9px', fontSize: 12 }} disabled={!!busy}
                onClick={() => void create(`q${n}`, `Vidéo-réponse à une vraie question de client : « ${q} ». Réponds avec nos conditions exactes, hook = la question.`)}>🎬</button>
            </div>
          ))}
        </div>
      )}

      {!!a.creators?.length && (
        <div style={card}>
          <div style={h}>🤝 Créateurs à contacter pour une collab</div>
          {a.creators.map((c, n) => (
            <a key={n} href={`https://www.tiktok.com/${c.handle.startsWith('@') ? c.handle : '@' + c.handle}`} target="_blank" rel="noreferrer" style={{ display: 'block', textDecoration: 'none', fontSize: 12.5, color: C.text, padding: '4px 0' }}>
              <b style={{ color: C.pink }}>{c.handle}</b> — {c.why}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
