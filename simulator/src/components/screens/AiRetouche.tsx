import { useState, useEffect } from 'react';
import { business } from '../../services/api.ts';
import { uploadFile } from './MontageEditor.tsx';

// 🪄 Retouche IA : ta photo ou ta vidéo + une phrase (« remplace la voiture par une Ferrari Purosangue »)
// → Dzaryx la modifie en gardant tout le reste. Photo gratuite ; vidéo via Kling (devis affiché avant).

const C = { surface: '#0c1730', border: 'rgba(90,150,255,0.16)', accent: '#f472b6', green: '#38d8f5', gold: '#fbbf24', text: '#f5f5f7', muted: '#8ea3c8',
  font: '-apple-system, "Segoe UI", Roboto, sans-serif' };
const card = { background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: 12, marginBottom: 10 } as const;
const btn = (bg: string, color: string) => ({ background: bg, color, border: 'none', borderRadius: 10, padding: '11px 13px', fontSize: 13.5, fontWeight: 800, cursor: 'pointer', fontFamily: C.font } as const);
const chip = (on: boolean) => ({ background: on ? C.accent : 'rgba(255,255,255,0.06)', color: on ? '#050a16' : C.text, border: `1px solid ${on ? C.accent : C.border}`,
  borderRadius: 999, padding: '6px 11px', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: C.font, whiteSpace: 'nowrap' } as const);
const label = { fontSize: 12.5, fontWeight: 600, color: C.muted, margin: '14px 0 7px' } as const;
const IDEAS = ['Remplace la voiture par une Ferrari Purosangue noire', 'Mets la scène de nuit avec les lumières de la ville', 'Mets-nous sur la corniche d\'Oran au coucher du soleil', 'Enlève les gens en arrière-plan'];

export default function AiRetouche({ say, onLaunched }: { say: (t: string) => void; onLaunched: () => void }) {
  const [media, setMedia] = useState<{ url: string; type: 'image' | 'video'; local: string; seconds: number } | null>(null);
  const [pct, setPct] = useState<number | null>(null);
  const [prompt, setPrompt] = useState('');
  const [quality, setQuality] = useState<'gratuit' | 'max'>('gratuit');
  const [usd, setUsd] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!media) return;
    business.studioAiEditEstimate(media.type, media.seconds, quality).then(r => setUsd(r.usd)).catch(() => setUsd(0));
  }, [media, quality]);

  const pick = async (f: File | undefined) => {
    if (!f) return;
    const type = f.type.startsWith('video/') ? 'video' : 'image';
    const local = URL.createObjectURL(f);
    const seconds = type === 'video' ? await new Promise<number>(res => {
      const v = document.createElement('video'); v.preload = 'metadata'; v.src = local;
      v.onloadedmetadata = () => res(Number.isFinite(v.duration) ? v.duration : 10); v.onerror = () => res(10);
    }) : 0;
    setPct(0);
    try { const url = await uploadFile(f, setPct); setMedia({ url, type, local, seconds }); say(type === 'video' ? '🎥 Vidéo prête' : '📸 Photo prête'); }
    catch (e) { say(`❌ ${e instanceof Error ? e.message : 'envoi impossible'}`); }
    finally { setPct(null); }
  };

  const launch = async () => {
    if (!media || !prompt.trim()) return;
    if (media.type === 'video' && !window.confirm(`Retouche vidéo avec Kling : ≈ ${usd.toFixed(2)} $ sur ton crédit fal.ai. On lance ?`)) return;
    setBusy(true);
    try {
      await business.studioAiEdit({ url: media.url, type: media.type, prompt: prompt.trim(), quality, seconds: media.seconds || undefined });
      say(media.type === 'video' ? '🪄 Retouche vidéo lancée (5 à 10 min) — elle arrive en bas et sur Telegram' : '🪄 Retouche lancée (≈ 1 min) — elle arrive en bas et sur Telegram');
      onLaunched();
    } catch (e) {
      const m = e instanceof Error ? e.message : 'Erreur';
      try { say(`❌ ${(JSON.parse(m.replace(/^API \d+: /, '')) as { error?: string }).error ?? m}`); } catch { say(`❌ ${m}`); }
    } finally { setBusy(false); }
  };

  return (
    <div style={card}>
      <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.45 }}>
        Envoie ta photo ou ta vidéo et dis ce que tu veux changer. Dzaryx garde tout le reste (toi, Ibrahim, le décor, le cadrage).
      </div>

      <label style={{ ...btn('rgba(255,255,255,0.08)', C.text), display: 'block', textAlign: 'center', marginTop: 12 }}>
        {pct !== null ? `📤 Envoi… ${pct} %${pct >= 92 && pct < 100 ? ' (compression)' : ''}` : media ? '✅ Prête — changer de photo/vidéo' : '📸🎥 Choisir une photo ou une vidéo'}
        <input type="file" accept="image/*,video/*" style={{ display: 'none' }} disabled={pct !== null} onChange={e => { void pick(e.target.files?.[0]); e.target.value = ''; }} />
      </label>

      {media && (media.type === 'video'
        ? <video src={media.local} controls playsInline muted style={{ width: '100%', maxHeight: 320, borderRadius: 10, marginTop: 10, background: '#000' }} />
        : <img src={media.local} alt="" style={{ width: '100%', maxHeight: 320, objectFit: 'contain', borderRadius: 10, marginTop: 10, background: '#000' }} />)}

      <div style={label}>Qu'est-ce que je change ?</div>
      <textarea rows={3} value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="Ex. remplace la voiture par une Ferrari Purosangue"
        style={{ width: '100%', boxSizing: 'border-box', background: '#081024', color: C.text, border: `1px solid ${C.border}`, borderRadius: 10, padding: 10, fontSize: 14, fontFamily: C.font, resize: 'vertical' }} />
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
        {IDEAS.map(t => <button key={t} style={chip(prompt === t)} onClick={() => setPrompt(t)}>{t}</button>)}
      </div>

      {media?.type === 'image' && (<>
        <div style={label}>Qualité</div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button style={chip(quality === 'gratuit')} onClick={() => setQuality('gratuit')}>Gratuite (0 €)</button>
          <button style={chip(quality === 'max')} onClick={() => setQuality('max')}>Max (≈ 0,04 $)</button>
        </div>
      </>)}
      {media?.type === 'video' && (
        <div style={{ fontSize: 12.5, color: C.gold, marginTop: 12, lineHeight: 1.45 }}>
          🎥 {Math.round(media.seconds)} s{media.seconds > 30 ? ' (seules les 30 premières secondes seront retouchées)' : ''} — Kling refait la vidéo par morceaux de 10 s avec la même voiture partout, et garde ton son. Coût ≈ <b>{usd.toFixed(2)} $</b>.
        </div>
      )}

      <button style={{ ...btn(C.accent, '#050a16'), width: '100%', marginTop: 14, opacity: !media || !prompt.trim() || busy ? 0.5 : 1 }}
        disabled={!media || !prompt.trim() || busy} onClick={() => void launch()}>
        {busy ? '⏳ Lancement…' : media?.type === 'video' ? `🪄 Modifier ma vidéo (≈ ${usd.toFixed(2)} $)` : '🪄 Modifier ma photo'}
      </button>
    </div>
  );
}
