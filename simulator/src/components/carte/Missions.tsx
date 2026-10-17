// Missions du jour : la journée devient une liste de quêtes (clés à remettre, retours, argent à encaisser,
// urgences, demandes du site, voiture qui dort). Chaque mission réussie = XP + pluie de pièces sur la carte.
// Une mission qui disparaît toute seule des données (paiement reçu, urgence réglée) compte comme réussie.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { World } from './data.ts';
import type { Pick } from './scene.ts';

export interface Quest { id: string; icon: string; title: string; sub?: string; xp: number; pick?: Pick; ask?: string; gain?: string }

const fmt = (n: number) => n.toLocaleString('fr-FR');
export function buildQuests(w: World, opts: { asleep?: string[] } = {}): Quest[] {
  const q: Quest[] = [];
  for (const m of w.cars) {
    const b = m.booking;
    if (m.status === 'depart' && b) q.push({ id: `dep:${b.id}`, icon: '🔑', title: `Remettre la ${m.name}`, sub: `à ${b.client_name ?? 'client'}`, xp: 20, pick: { kind: 'car', id: m.id }, gain: '+20 XP 🔑' });
    if (m.status === 'retour' && b) q.push({ id: `ret:${b.id}`, icon: '↩️', title: `Récupérer la ${m.name}`, sub: `${b.client_name ?? 'client'} · 📸 état des lieux`, xp: 20, pick: { kind: 'car', id: m.id }, gain: '+20 XP ↩️' });
    if (m.due > 0 && b) q.push({ id: `pay:${b.id}`, icon: '💰', title: `Encaisser ${fmt(m.due)} €`, sub: `${b.client_name ?? ''} · ${m.name}`, xp: 30, pick: { kind: 'car', id: m.id }, gain: `+${fmt(m.due)} € 💰` });
    for (const a of m.alerts.filter(x => x.priority === 'HIGH').slice(0, 1)) q.push({ id: `alert:${a.id}`, icon: '⚠️', title: a.message, sub: m.name, xp: 25, pick: { kind: 'car', id: m.id }, gain: '+25 XP ⚠️' });
  }
  if (w.pending > 0) q.push({ id: 'dem', icon: '📥', title: `Répondre à ${w.pending} demande${w.pending > 1 ? 's' : ''} du site`, sub: 'Agence', xp: 15, pick: { kind: 'zone', zone: 'agence' }, gain: '+15 XP 📥' });
  const sleeper = (opts.asleep ?? [])[0];
  const sc = sleeper ? w.cars.find(c => c.id === sleeper && c.status === 'dispo') : undefined;
  if (sc) q.push({ id: `push:${sc.id}`, icon: '📣', title: `Faire rouler la ${sc.name}`, sub: '0 jour loué ce mois — Dzaryx t\'aide', xp: 10, pick: { kind: 'car', id: sc.id }, ask: `La ${sc.name} n'a aucun jour loué ce mois. Donne-moi 3 actions concrètes pour la louer cette semaine (prix, message WhatsApp prêt à envoyer, clients à relancer).`, gain: '+10 XP 📣' });
  return q;
}

const TITLES = ['Apprenti', 'Loueur', 'Chef d\'agence', 'Pro de la location', 'Boss d\'Oran', 'Magnat', 'Légende FIK'];
export const levelOf = (xp: number) => {
  const lv = Math.floor(Math.sqrt(xp / 60)) + 1, a = (lv - 1) ** 2 * 60, b = lv ** 2 * 60;
  return { lv, title: TITLES[Math.min(TITLES.length - 1, lv - 1)]!, pct: (xp - a) / (b - a), left: b - xp };
};
const get = <T,>(k: string, d: T): T => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) as T : d; } catch { return d; } };
const put = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } };

// État des missions (sur l'appareil) : faites aujourd'hui, XP total, série de journées parfaites
export function useQuests(quests: Quest[], date: string, live: boolean, onWin: (q: Quest, perfect: boolean) => void) {
  const key = `dz:carte:q:${date}`;
  const [done, setDone] = useState<string[]>(() => get<{ done: string[] }>(key, { done: [] }).done);
  const [xp, setXp] = useState(() => get('dz:carte:xp', 0));
  const [streak, setStreak] = useState(() => get<{ last: string; n: number }>('dz:carte:streak', { last: '', n: 0 }));
  const win = useRef(onWin); win.current = onWin;
  // Toutes les missions vues aujourd'hui (pour garder celles réussies dans la liste)
  const [seen, setSeen] = useState<Quest[]>(() => get<{ seen?: Quest[] }>(key, {}).seen ?? []);

  const all = useMemo(() => {
    const m = new Map(seen.map(q => [q.id, q]));
    quests.forEach(q => m.set(q.id, q));
    return [...m.values()];
  }, [quests, seen]);

  const doneRef = useRef(done); doneRef.current = done;
  const complete = (q: Quest, auto = false) => {
    const d = doneRef.current;
    if (d.includes(q.id)) return;
    const nd = [...d, q.id]; doneRef.current = nd; setDone(nd);
    const nx = get('dz:carte:xp', 0) + q.xp; put('dz:carte:xp', nx); setXp(nx);
    const perfect = all.every(x => nd.includes(x.id));
    if (perfect) {
      const s = get<{ last: string; n: number }>('dz:carte:streak', { last: '', n: 0 });
      if (s.last !== date) { const y = new Date(date + 'T12:00:00'); y.setDate(y.getDate() - 1); const ns = { last: date, n: s.last === y.toISOString().slice(0, 10) ? s.n + 1 : 1 }; put('dz:carte:streak', ns); setStreak(ns); }
    }
    put(key, { done: nd, seen: all });
    win.current({ ...q, sub: auto ? `${q.sub ?? ''} · réglé ✓` : q.sub }, perfect);
  };
  // Missions réglées toutes seules depuis la dernière fois (ex. paiement reçu) → réussies
  useEffect(() => {
    if (!live) return;
    const now = new Set(quests.map(q => q.id));
    const gone = seen.filter(q => !now.has(q.id) && !done.includes(q.id) && (q.id.startsWith('pay:') || q.id.startsWith('alert:') || q.id === 'dem'));
    gone.forEach(q => complete(q, true));
    const merged = all;
    if (merged.length !== seen.length || merged.some((q, i) => q.id !== seen[i]?.id)) { setSeen(merged); put(key, { done: doneRef.current, seen: merged }); }
  }, [live, quests]); // eslint-disable-line react-hooks/exhaustive-deps

  const undo = (id: string) => { const nd = doneRef.current.filter(x => x !== id); doneRef.current = nd; setDone(nd); put(key, { done: nd, seen: all }); };
  return { all, done, xp, streak, complete, undo };
}

const S = { surface: '#0c1730', border: 'rgba(90,150,255,0.16)', muted: '#8ea3c8', gold: '#fbbf24', accent: '#38d8f5', text: '#f5f5f7' };

export function Missions({ all, done, xp, streak, onGo, onDone, onUndo, compact }: {
  all: Quest[]; done: string[]; xp: number; streak: { last: string; n: number };
  onGo: (q: Quest) => void; onDone: (q: Quest) => void; onUndo: (id: string) => void; compact?: boolean;
}) {
  const L = levelOf(xp);
  const left = all.filter(q => !done.includes(q.id)), won = all.filter(q => done.includes(q.id));
  const pct = all.length ? won.length / all.length : 1;
  return (
    <div style={{ background: compact ? '#0f172aee' : `linear-gradient(135deg, #312e8130, ${S.surface})`, border: `1px solid ${compact ? '#334155' : '#818cf855'}`, borderRadius: 14, padding: '11px 12px', marginBottom: compact ? 0 : 12, color: S.text }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ position: 'relative', width: 44, height: 44, flexShrink: 0 }}>
          <svg viewBox="0 0 36 36" width="44" height="44" style={{ transform: 'rotate(-90deg)' }}>
            <circle cx="18" cy="18" r="15.5" fill="none" stroke="#27272a" strokeWidth="4" />
            <circle cx="18" cy="18" r="15.5" fill="none" stroke={pct === 1 ? S.gold : '#818cf8'} strokeWidth="4" strokeLinecap="round" strokeDasharray={`${pct * 97.4} 97.4`} style={{ transition: 'stroke-dasharray .6s' }} />
          </svg>
          <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 900 }}>{won.length}/{all.length}</div>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 800 }}>{all.length === 0 ? '😎 Rien à faire aujourd\'hui' : left.length === 0 ? '🏆 Journée parfaite !' : `🎯 Missions du jour · ${left.length} à faire`}</div>
          <div style={{ fontSize: 11, color: S.muted, marginTop: 2 }}>
            Niv. <b style={{ color: S.gold }}>{L.lv}</b> · {L.title} · {xp} XP{streak.n > 1 ? ` · 🔥 ${streak.n} jours parfaits` : ''}
          </div>
          <div style={{ height: 5, borderRadius: 3, background: '#27272a', marginTop: 5, overflow: 'hidden' }}>
            <div style={{ width: `${Math.round(L.pct * 100)}%`, height: '100%', background: `linear-gradient(90deg, #818cf8, ${S.gold})`, transition: 'width .6s' }} />
          </div>
        </div>
      </div>
      {left.map(q => (
        <div key={q.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0 0', marginTop: 8, borderTop: `1px solid ${S.border}` }}>
          <button onClick={() => onGo(q)} style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', color: S.text, cursor: 'pointer', textAlign: 'left', padding: 0 }}>
            <span style={{ fontSize: 20 }}>{q.icon}</span>
            <span style={{ minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 12.5, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.title}</span>
              {q.sub && <span style={{ display: 'block', fontSize: 11, color: S.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.sub}</span>}
            </span>
          </button>
          <span style={{ fontSize: 10, fontWeight: 800, color: S.gold, whiteSpace: 'nowrap' }}>+{q.xp}</span>
          <button onClick={() => onDone(q)} aria-label="Mission faite" style={{ width: 34, height: 34, borderRadius: 10, border: `2px solid ${S.accent}`, background: `${S.accent}22`, color: S.accent, fontSize: 16, fontWeight: 900, cursor: 'pointer', flexShrink: 0 }}>✓</button>
        </div>
      ))}
      {won.length > 0 && <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 9 }}>
        {won.map(q => <button key={q.id} onClick={() => onUndo(q.id)} title="Annuler" style={{ fontSize: 11, borderRadius: 12, padding: '3px 8px', border: `1px solid ${S.border}`, background: 'transparent', color: S.muted, cursor: 'pointer', textDecoration: 'line-through' }}>{q.icon} {q.title.slice(0, 28)}</button>)}
      </div>}
    </div>
  );
}
