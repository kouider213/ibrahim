import { useEffect, useState } from 'react';
import { forme, errText, vibrate, type Overview } from './api.ts';
import { F, input, btn, ghostBtn } from './ui.tsx';

// 17/11 Kouider : « je dois pouvoir remodifier le poids si je me suis trompé (76,9 au lieu de 76) »
// → liste de ses dernières pesées : toucher une ligne = corriger le chiffre ou supprimer la pesée.
const fmt = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });

export default function WeighIns({ weights, onChanged, toast }: { weights?: Array<{ date: string; kg: number }>; onChanged: (o: Overview) => void | Promise<void>; toast: (t: string) => void }) {
  const [list, setList] = useState(weights ?? []);
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<string | null>(null);
  const [val, setVal] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (weights) setList(weights); }, [weights]);
  useEffect(() => { if (open && !weights) forme.overview().then(o => setList(o.weights)).catch(() => {}); }, [open, weights]);

  const done = async (o: Overview, msg: string) => { setList(o.weights); setEdit(null); vibrate(40); toast(msg); await onChanged(o); };
  const save = async (date: string) => {
    const v = Number(val.replace(',', '.')); if (!(v > 30 && v < 250)) return toast('Poids invalide');
    setBusy(true); try { await done(await forme.log('weight', { kg: v, date }), `⚖️ Pesée du ${fmt(date)} corrigée : ${String(v).replace('.', ',')} kg`); } catch (e) { toast(errText(e)); } finally { setBusy(false); }
  };
  const del = async (date: string) => {
    if (!confirm(`Supprimer la pesée du ${fmt(date)} ?`)) return;
    setBusy(true); try { await done(await forme.log('weight-del', { date }), `🗑️ Pesée du ${fmt(date)} supprimée`); } catch (e) { toast(errText(e)); } finally { setBusy(false); }
  };

  const rows = [...list].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10);
  return (
    <div style={{ marginTop: 10 }}>
      <button onClick={() => setOpen(!open)} style={{ background: 'none', border: 'none', padding: 0, color: F.accent, fontWeight: 700, fontSize: 13.5, cursor: 'pointer' }}>
        ✏️ {open ? 'Fermer mes pesées' : 'Mes pesées — corriger une erreur'}
      </button>
      {open && <div style={{ marginTop: 8 }}>
        {!rows.length && <div style={{ fontSize: 13, color: F.muted }}>Aucune pesée notée.</div>}
        {rows.map(w => edit === w.date ? (
          <div key={w.date} style={{ padding: '8px 0', borderTop: `1px solid ${F.line}` }}>
            <div style={{ fontSize: 13, color: F.muted, marginBottom: 6 }}>{fmt(w.date)} — le bon poids :</div>
            <div style={{ display: 'flex', gap: 6 }}>
              <input autoFocus inputMode="decimal" value={val} onChange={e => setVal(e.target.value)} style={{ ...input, flex: 1 }} />
              <button disabled={busy} onClick={() => void save(w.date)} style={{ ...btn, padding: '0 14px' }}>OK</button>
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
              <button disabled={busy} onClick={() => void del(w.date)} style={{ ...ghostBtn, flex: 1, color: '#d33' }}>🗑️ Supprimer</button>
              <button disabled={busy} onClick={() => setEdit(null)} style={{ ...ghostBtn, flex: 1 }}>Annuler</button>
            </div>
          </div>
        ) : (
          <button key={w.date} onClick={() => { setEdit(w.date); setVal(String(w.kg).replace('.', ',')); }} style={{ display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', background: 'none', border: 'none', borderTop: `1px solid ${F.line}`, color: F.ink, fontSize: 14.5, cursor: 'pointer', textAlign: 'left' }}>
            <span style={{ textTransform: 'capitalize' }}>{fmt(w.date)}</span>
            <span><b>{String(w.kg).replace('.', ',')} kg</b> <span style={{ color: F.muted, fontSize: 12 }}>✏️</span></span>
          </button>
        ))}
      </div>}
    </div>
  );
}
