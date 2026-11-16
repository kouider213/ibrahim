// 16/11 : protéines en 1 geste (Kouider à 0/154 g en sèche) — aliments prêts + « refaire » un repas récent, sans IA ni photo.
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { get, postJson, errText, vibrate, type FoodBudget } from './api.ts';
import { F, card } from './ui.tsx';

type Preset = { id: string; label: string; p: number; kcal: number };
type Recent = { date: string; id: string; title: string; kcal: number; p: number };

export default function QuickProtein({ b, onBudget, toast }: { b: FoodBudget; onBudget: (b: FoodBudget) => void; toast: (t: string) => void }) {
  const [d, setD] = useState<{ presets: Preset[]; recent: Recent[] } | null>(null);
  const [busy, setBusy] = useState('');
  const load = () => get<{ presets: Preset[]; recent: Recent[] }>('/api/forme/food/quick').then(setD).catch(() => {});
  useEffect(() => { void load(); }, []);
  if (!d) return null;
  const left = Math.max(0, b.proteinGoal - b.eaten.p);
  const add = async (key: string, body: unknown, label: string) => {
    if (busy) return;
    setBusy(key); vibrate(15);
    try {
      const r = await postJson<{ budget: FoodBudget }>('/api/forme/food/quick', body);
      onBudget(r.budget); vibrate(50);
      const still = Math.max(0, r.budget.proteinGoal - r.budget.eaten.p);
      toast(`✅ ${label} noté · ${still > 0 ? `encore ${still} g de protéines` : 'protéines du jour atteintes'}`);
      void load();
    } catch (e) { toast(errText(e)); } finally { setBusy(''); }
  };
  const chip = (key: string, top: string, sub: string, onClick: () => void, strong = false) => (
    <motion.button key={key} whileTap={{ scale: 0.95 }} onClick={onClick} disabled={!!busy}
      style={{ border: `1px solid ${strong ? 'color-mix(in srgb, #7fb2ff 45%, transparent)' : F.line}`, background: strong ? 'color-mix(in srgb, #7fb2ff 12%, var(--f-card))' : 'var(--f-card)', color: F.ink, borderRadius: 14, padding: '9px 11px', textAlign: 'left', fontFamily: 'inherit', cursor: 'pointer', opacity: busy && busy !== key ? 0.5 : 1, minWidth: 0 }}>
      <div style={{ fontSize: 13.5, fontWeight: 650, lineHeight: 1.25, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', wordBreak: 'break-word' }}>{busy === key ? '…' : top}</div>
      <div style={{ fontSize: 11.5, color: F.muted, marginTop: 1 }}>{sub}</div>
    </motion.button>
  );
  return (
    <div style={{ ...card, marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
        <div style={{ fontWeight: 700, fontSize: 15.5 }}>Protéines en 1 geste</div>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: left > 0 ? '#7fb2ff' : F.green }}>{left > 0 ? `il manque ${left} g` : 'objectif atteint'}</div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 7 }}>
        {d.presets.map(p => chip(p.id, p.label, `+${p.p} g · ${p.kcal} kcal`, () => void add(p.id, { preset: p.id }, p.label), p.p >= 24))}
      </div>
      {d.recent.length > 0 && <>
        <div style={{ fontSize: 12, color: F.muted, fontWeight: 600, margin: '12px 2px 7px' }}>REFAIRE UN REPAS RÉCENT</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 7 }}>
          {d.recent.slice(0, 4).map(r => chip(r.id, r.title, `${r.p} g P · ${r.kcal} kcal`, () => void add(r.id, { from: { date: r.date, id: r.id } }, r.title)))}
        </div>
      </>}
    </div>
  );
}
