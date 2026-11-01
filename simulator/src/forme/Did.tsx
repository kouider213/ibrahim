import { useRef, useState } from 'react';
import { forme, errText, compressImage, vibrate, type LibItem } from './api.ts';
import { F, card, btn, ghostBtn, input, Sheet, Spinner, Img } from './ui.tsx';
import { LibraryPicker, loadLib, MUSCLE_FR } from './Exercises.tsx';

// 🖼️ « CE QUE J'AI VRAIMENT FAIT » (Kouider 01/11) : il n'a pas suivi la séance prévue et ne connaît pas toujours le nom
// des exercices → il les choisit EN IMAGES (bibliothèque) ou prend la MACHINE en photo. Séries/kg facultatifs.
// POST /api/forme/did → historique de chaque exercice + séance du jour corrigée partout (journal, FORME, agenda, Dzaryx).
interface Row { id: string; name: string; img: string[]; p: string[]; sets: number; kg: string; reps: string }
const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
const yesterday = () => new Date(Date.now() - 86_400_000 - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 10);

export function DidButton({ toast, onDone }: { toast: (t: string) => void; onDone?: () => void }) {
  const [open, setOpen] = useState(false);
  return <>
    <button onClick={() => { vibrate(10); setOpen(true); }} style={{ ...card, width: '100%', display: 'flex', gap: 12, alignItems: 'center', border: 'none', cursor: 'pointer', textAlign: 'start', fontFamily: 'inherit', color: F.ink, marginTop: 12 }}>
      <span style={{ fontSize: 28 }}>🖼️</span>
      <span style={{ flex: 1 }}><span style={{ display: 'block', fontWeight: 700 }}>Ce que j'ai vraiment fait</span><span style={{ display: 'block', fontSize: 12.5, color: F.muted, marginTop: 2 }}>Pas suivi la séance ? Choisis tes exercices en images ou prends la machine en photo</span></span>
      <span style={{ color: F.muted, fontSize: 20 }}>›</span>
    </button>
    <DidSheet open={open} onClose={() => setOpen(false)} toast={toast} onDone={onDone} />
  </>;
}

function DidSheet({ open, onClose, toast, onDone }: { open: boolean; onClose: () => void; toast: (t: string) => void; onDone?: () => void }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [pick, setPick] = useState(false);
  const [date, setDate] = useState(today());
  const [busy, setBusy] = useState('');
  const [done, setDone] = useState('');
  const cam = useRef<HTMLInputElement>(null);
  const add = (items: Array<{ id: string; name: string; img: string[]; p: string[] }>) =>
    setRows(r => [...r, ...items.filter(x => !r.some(y => y.id === x.id)).map(x => ({ ...x, sets: 3, kg: '', reps: '' }))]);
  const fromLib = (items: LibItem[]) => add(items.map(x => ({ id: x.id, name: x.fr || x.name, img: x.img, p: x.p })));
  const fromPhoto = async (f?: File | null) => {
    if (!f) return;
    setBusy('Je reconnais la machine…');
    try {
      const [image, thumb] = await Promise.all([compressImage(f, 1280, 0.82), compressImage(f, 220, 0.6)]);
      const { scan } = await forme.machine(image, thumb);
      const lib = await loadLib().catch(() => [] as LibItem[]);
      const found = scan.exercises.filter(e => e.id).map(e => { const l = lib.find(x => x.id === e.id); return { id: e.id!, name: e.name, img: e.img, p: l?.p ?? [] }; });
      if (!found.length) toast('Machine pas reconnue : choisis en images');
      else { add(found.slice(0, 1)); toast(`📷 ${scan.machine} → ${found[0]!.name}${found.length > 1 ? ` (touche « Images » pour les autres variantes)` : ''}`); }
    } catch (e) { toast(errText(e)); } finally { setBusy(''); if (cam.current) cam.current.value = ''; }
  };
  const set = (i: number, patch: Partial<Row>) => setRows(r => r.map((x, k) => k === i ? { ...x, ...patch } : x));
  const save = async () => {
    setBusy('J\'enregistre…');
    try {
      const r = await forme.did(date, rows.map(x => ({ id: x.id, name: x.name, p: x.p, sets: x.sets, kg: Number(x.kg.replace(',', '.')) || undefined, reps: Number(x.reps) || undefined })));
      vibrate(60); setDone(r.message); setRows([]); onDone?.();
    } catch (e) { toast(errText(e)); } finally { setBusy(''); }
  };
  const close = () => { setDone(''); onClose(); };
  const chip = (on: boolean) => ({ flex: 1, padding: '9px 0', borderRadius: 999, border: 'none', background: on ? F.ink : F.tile, color: on ? '#fff' : F.ink, fontWeight: 600, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' });

  return (
    <Sheet open={open} onClose={close} z={60} title={<div style={{ fontSize: 20, fontWeight: 700, paddingTop: 6 }}>Ce que j'ai vraiment fait</div>}>
      {done ? <div style={{ padding: '6px 2px 20px' }}>
        <div style={{ ...card, background: '#e9f8ef', whiteSpace: 'pre-line', fontSize: 14.5, lineHeight: 1.45 }}>{done}</div>
        <button onClick={close} style={{ ...btn, width: '100%', marginTop: 12 }}>OK</button>
      </div> : <>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <button onClick={() => setDate(today())} style={chip(date === today())}>Aujourd'hui</button>
          <button onClick={() => setDate(yesterday())} style={chip(date === yesterday())}>Hier</button>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setPick(true)} style={{ ...ghostBtn, flex: 1 }}>🖼️ Images</button>
          <button onClick={() => cam.current?.click()} style={{ ...ghostBtn, flex: 1 }}>📷 Photo machine</button>
          <input ref={cam} type="file" accept="image/*" capture="environment" hidden onChange={e => void fromPhoto(e.target.files?.[0])} />
        </div>
        {busy && <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'center', padding: 14, color: F.muted }}><Spinner size={18} />{busy}</div>}
        {!rows.length && !busy && <div style={{ fontSize: 13.5, color: F.muted, textAlign: 'center', padding: '22px 10px', lineHeight: 1.45 }}>Touche « Images » et choisis les exercices que tu as faits en regardant les photos — pas besoin de connaître leur nom.</div>}
        <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
          {rows.map((x, i) => (
            <div key={x.id} style={{ ...card, padding: 10 }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <div style={{ width: 56, height: 56, borderRadius: 12, background: F.tile, flexShrink: 0, padding: 3, boxSizing: 'border-box' }}><Img src={x.img[0]} style={{ width: '100%', height: '100%', objectFit: 'contain', background: 'transparent' }} /></div>
                <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 600, fontSize: 14.5 }}>{x.name}</div><div style={{ fontSize: 12, color: F.muted }}>{x.p.map(m => MUSCLE_FR[m] ?? m).join(', ')}</div></div>
                <button onClick={() => setRows(r => r.filter((_, k) => k !== i))} aria-label="Retirer" style={{ border: 'none', background: 'none', fontSize: 18, color: F.muted, cursor: 'pointer' }}>✕</button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr 1fr', gap: 8, marginTop: 8, alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <button onClick={() => set(i, { sets: Math.max(1, x.sets - 1) })} style={{ ...ghostBtn, width: 34, height: 34, padding: 0 }}>−</button>
                  <div style={{ minWidth: 52, textAlign: 'center', fontWeight: 700, fontSize: 14 }}>{x.sets} série{x.sets > 1 ? 's' : ''}</div>
                  <button onClick={() => set(i, { sets: Math.min(10, x.sets + 1) })} style={{ ...ghostBtn, width: 34, height: 34, padding: 0 }}>+</button>
                </div>
                <input value={x.kg} onChange={e => set(i, { kg: e.target.value })} inputMode="decimal" placeholder="kg" style={{ ...input, padding: '9px 10px' }} />
                <input value={x.reps} onChange={e => set(i, { reps: e.target.value })} inputMode="numeric" placeholder="reps" style={{ ...input, padding: '9px 10px' }} />
              </div>
            </div>
          ))}
        </div>
        {!!rows.length && <div style={{ position: 'sticky', bottom: 0, paddingTop: 10, background: F.bg }}>
          <div style={{ fontSize: 12, color: F.muted, textAlign: 'center', marginBottom: 6 }}>kg et reps facultatifs · ta séance prévue reste pour la prochaine fois</div>
          <button disabled={!!busy} onClick={() => void save()} style={{ ...btn, width: '100%' }}>✅ Enregistrer ({rows.length} exercice{rows.length > 1 ? 's' : ''})</button>
        </div>}
      </>}
      <LibraryPicker open={pick} onClose={() => setPick(false)} onPick={fromLib} multi title="Choisis ce que tu as fait" />
    </Sheet>
  );
}
