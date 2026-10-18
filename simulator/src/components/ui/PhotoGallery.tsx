// Galerie photos d'une annonce (voiture du parc, bien immobilier, voiture à vendre) — même écran partout.
// Voir en grand (glisser), ajouter plusieurs photos (publiées sur le site), choisir la photo principale,
// supprimer, enregistrer sur le téléphone, tout envoyer sur Telegram.
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { business } from '../../services/api.ts';
import { T, tone, Sheet, Btn, Empty } from './Kit.tsx';

export type GalleryKind = 'car' | 'property' | 'sale';

const readFiles = (files: File[]) => Promise.all(files.map(f => new Promise<string>((res, rej) => {
  const r = new FileReader(); r.onloadend = () => res(r.result as string); r.onerror = rej; r.readAsDataURL(f);
})));

/** Enregistre une photo : feuille de partage du téléphone (« Enregistrer l'image ») sinon téléchargement. */
async function savePhoto(url: string, name: string): Promise<void> {
  const file = `${name.replace(/[^\w-]+/g, '-').toLowerCase()}-${Date.now() % 100000}.jpg`;
  try {
    const blob = await (await fetch(url)).blob();
    const f = new File([blob], file, { type: blob.type || 'image/jpeg' });
    const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
    if (nav.canShare?.({ files: [f] })) { await nav.share({ files: [f], title: name }); return; }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = file; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  } catch {
    // Cloudinary : fl_attachment force le téléchargement
    window.open(url.includes('/upload/') ? url.replace('/upload/', '/upload/fl_attachment/') : url, '_blank');
  }
}

export default function PhotoGallery({ kind, id, name, onClose, onChanged, fixed }: {
  kind: GalleryKind; id: string; name: string; onClose: () => void; onChanged?: () => void; fixed?: boolean;
}) {
  const [photos, setPhotos] = useState<string[]>([]);
  const [cover, setCover] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [note, setNote] = useState('');
  const [view, setView] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const touchX = useRef<number | null>(null);

  const flash = (m: string) => { setNote(m); setTimeout(() => setNote(''), 3200); };

  const load = async () => {
    setLoading(true);
    try {
      if (kind === 'car') { const r = await business.carPhotos(id); setPhotos(r.photos.map(p => p.url)); setCover(r.cover ?? r.photos[0]?.url ?? null); }
      else if (kind === 'property') { const r = await business.propertyPhotos(id); setPhotos(r.photos.map(p => p.url)); setCover(r.photos[0]?.url ?? null); }
      else { const r = await business.vehiclePhotos(id); setPhotos(r.photos.map(p => p.url)); setCover(r.photos[0]?.url ?? null); }
    } catch { flash('❌ Photos indisponibles, réessaie'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, [kind, id]);  // eslint-disable-line react-hooks/exhaustive-deps

  const add = async (files: File[]) => {
    if (!files.length) return;
    setBusy('add');
    try {
      const imgs = await readFiles(files.slice(0, 15));
      if (kind === 'car') await business.addCarPhotos(name, imgs);
      else if (kind === 'property') await business.addPropertyPhotos(id, imgs);
      else await business.addVehicleSalePhotos(id, imgs);
      flash(`✅ ${imgs.length} photo${imgs.length > 1 ? 's' : ''} ajoutée${imgs.length > 1 ? 's' : ''} — en ligne sur le site`);
      await load(); onChanged?.();
    } catch { flash('❌ Échec de l\'envoi des photos'); }
    finally { setBusy(''); }
  };

  const remove = async (url: string) => {
    if (!confirm('Supprimer cette photo du site et de l\'app ?')) return;
    setBusy(url);
    try {
      if (kind === 'car') await business.carPhotoDelete(id, url);
      else if (kind === 'property') await business.propertyPhotoDelete(id, url);
      else await business.vehiclePhotoDelete(id, url);
      setView(null); await load(); onChanged?.(); flash('🗑️ Photo supprimée');
    } catch { flash('❌ Suppression impossible'); }
    finally { setBusy(''); }
  };

  const makeCover = async (url: string) => {
    setBusy(url);
    try {
      if (kind === 'car') await business.carPhotoCover(id, url);
      else if (kind === 'property') await business.propertyPhotoCover(id, url);
      else await business.vehiclePhotoCover(id, url);
      await load(); onChanged?.(); setView(0); flash('⭐ Photo principale du site changée');
    } catch { flash('❌ Impossible de changer la photo principale'); }
    finally { setBusy(''); }
  };

  const toTelegram = async () => {
    setBusy('tg');
    try { const r = await business.sendPhotosTelegram(kind, id); flash(r.text); }
    catch { flash('❌ Envoi Telegram impossible'); }
    finally { setBusy(''); }
  };

  const go = (d: number) => setView(v => v == null || !photos.length ? v : (v + d + photos.length) % photos.length);

  return (
    <Sheet
      fixed={fixed} z={fixed ? 1300 : 70}
      title={`Photos · ${name}`}
      subtitle={loading ? 'Chargement…' : `${photos.length} photo${photos.length > 1 ? 's' : ''} · ⭐ = photo principale sur le site`}
      onClose={onClose}
      footer={<>
        <Btn onClick={() => void toTelegram()} disabled={!photos.length || busy === 'tg'} style={{ flex: 1 }}>{busy === 'tg' ? 'Envoi…' : '✈️ Telegram'}</Btn>
        <Btn variant="primary" onClick={() => fileRef.current?.click()} disabled={busy === 'add'} style={{ flex: 1.4 }}>{busy === 'add' ? 'Envoi…' : '＋ Ajouter des photos'}</Btn>
      </>}
    >
      <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: 'none' }}
        onChange={e => { const arr = Array.from(e.target.files ?? []); e.target.value = ''; void add(arr); }} />

      {note && <div style={{ marginBottom: 12, padding: '11px 13px', borderRadius: 13, fontSize: 14, fontWeight: 600, color: T.text, background: tone(note.startsWith('❌') ? T.bad : T.ok, 0.12), border: `1px solid ${tone(note.startsWith('❌') ? T.bad : T.ok, 0.35)}` }}>{note}</div>}

      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
          {Array.from({ length: 6 }).map((_, i) => <div key={i} style={{ paddingTop: '100%', borderRadius: 12, background: T.surface2, opacity: 0.6 }} />)}
        </div>
      ) : photos.length === 0 ? (
        <Empty icon="📷" title="Aucune photo" text="Ajoute plusieurs photos d'un coup : elles apparaissent tout de suite sur le site." />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
          {photos.map((url, i) => (
            <button key={url} onClick={() => setView(i)} style={{ position: 'relative', aspectRatio: '1', borderRadius: 13, overflow: 'hidden', border: url === cover ? `2px solid ${T.warn}` : `1px solid ${T.line}`, background: `${T.surface2} url(${url}) center/cover`, cursor: 'pointer', padding: 0 }}>
              {url === cover && <span style={{ position: 'absolute', top: 5, left: 5, fontSize: 11, fontWeight: 800, padding: '2px 7px', borderRadius: 8, background: T.warn, color: '#1a1300' }}>⭐ Site</span>}
              {busy === url && <span style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>⏳</span>}
            </button>
          ))}
        </div>
      )}

      {/* Visionneuse plein écran — portail : le flou de la feuille piégerait position:fixed */}
      {view != null && photos[view] && createPortal(
        <div onClick={() => setView(null)}
          onTouchStart={e => { touchX.current = e.touches[0].clientX; }}
          onTouchEnd={e => { if (touchX.current == null) return; const dx = e.changedTouches[0].clientX - touchX.current; if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1); touchX.current = null; }}
          style={{ position: 'fixed', inset: 0, zIndex: 2000, background: '#000', display: 'flex', flexDirection: 'column', fontFamily: T.font }}>
          <div onClick={e => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 'calc(12px + env(safe-area-inset-top)) 14px 10px' }}>
            <div style={{ flex: 1, color: '#fff', fontSize: 15, fontWeight: 700 }}>{view + 1} / {photos.length}{photos[view] === cover ? ' · ⭐ photo du site' : ''}</div>
            <button onClick={() => setView(null)} aria-label="Fermer" style={{ width: 40, height: 40, borderRadius: 12, border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.08)', color: '#fff', fontSize: 17, cursor: 'pointer' }}>✕</button>
          </div>
          <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 0 }}>
            <img src={photos[view]} alt={`${name} ${view + 1}`} onClick={e => e.stopPropagation()} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
            {photos.length > 1 && <>
              <button onClick={e => { e.stopPropagation(); go(-1); }} aria-label="Précédente" style={navBtn('left')}>‹</button>
              <button onClick={e => { e.stopPropagation(); go(1); }} aria-label="Suivante" style={navBtn('right')}>›</button>
            </>}
          </div>
          <div onClick={e => e.stopPropagation()} style={{ display: 'flex', gap: 8, padding: '12px 14px calc(16px + env(safe-area-inset-bottom))' }}>
            <Btn onClick={() => void savePhoto(photos[view], name)} style={{ flex: 1 }}>⬇️ Enregistrer</Btn>
            {photos[view] !== cover && <Btn onClick={() => void makeCover(photos[view])} color={T.warn} disabled={!!busy} style={{ flex: 1 }}>⭐ Principale</Btn>}
            <Btn variant="danger" onClick={() => void remove(photos[view])} disabled={!!busy} style={{ flex: 1 }}>🗑️ Supprimer</Btn>
          </div>
        </div>,
        document.body,
      )}
    </Sheet>
  );
}

const navBtn = (side: 'left' | 'right') => ({
  position: 'absolute' as const, [side]: 10, top: '50%', transform: 'translateY(-50%)', width: 46, height: 46, borderRadius: '50%',
  border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(0,0,0,0.5)', color: '#fff', fontSize: 26, cursor: 'pointer',
});
