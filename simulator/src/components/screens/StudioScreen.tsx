import { useState, useEffect, useCallback } from 'react';
import { business, type StudioOptions, type StudioPlan, type StudioJob, type StudioShot } from '../../services/api.ts';
import { Hero, StatCard, SkeletonCards } from '../ui/Premium.tsx';

// « STUDIO VIDÉO » : vidéos virales 9:16 niveau Higgsfield. Dzaryx écrit le scénario, génère les plans IA
// (Kling 3.0, Veo 3.1, Seedance 2.0 via fal.ai) et fait le montage (voix off, sous-titres, musique, CTA).
// Le rendu tourne sur le serveur ; la vidéo arrive ici et sur Telegram.

const C = {
  surface: '#0c1730', border: 'rgba(90,150,255,0.16)',
  accent: '#f472b6', green: '#38d8f5', gold: '#fbbf24', red: '#f87171', text: '#f5f5f7', muted: '#8ea3c8',
  font: '-apple-system, "Segoe UI", Roboto, sans-serif',
};
const btn = (bg: string, color: string) => ({ background: bg, color, border: 'none', borderRadius: 10, padding: '10px 13px', fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: C.font } as const);
const chip = (on: boolean) => ({ background: on ? C.accent : 'rgba(255,255,255,0.06)', color: on ? '#050a16' : C.text, border: `1px solid ${on ? C.accent : C.border}`,
  borderRadius: 999, padding: '6px 11px', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: C.font, whiteSpace: 'nowrap' } as const);
const card = { background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: 12, marginBottom: 10 } as const;
const input = { width: '100%', boxSizing: 'border-box', background: '#081024', color: C.text, border: `1px solid ${C.border}`, borderRadius: 10,
  padding: 10, fontSize: 13, fontFamily: C.font, resize: 'vertical' } as const;
const label = { fontSize: 12.5, fontWeight: 600, color: C.muted, margin: '14px 0 7px' } as const;
const LANGS: Record<string, string> = { fr: '🇫🇷 Français', darija: '🇩🇿 Darija', ar: 'العربية', en: '🇬🇧 English' };
const RUNNING = ['queued', 'shots', 'audio', 'montage'];
const errText = (e: unknown) => {
  const m = e instanceof Error ? e.message : 'Erreur';
  try { return (JSON.parse(m.replace(/^API \d+: /, '')) as { error?: string }).error ?? m; } catch { return m; }
};

function snap(durations: number[], d: number): number {
  return durations.reduce((best, v) => (Math.abs(v - d) < Math.abs(best - d) ? v : best), durations[0] ?? d);
}

export default function StudioScreen() {
  const [opts, setOpts] = useState<StudioOptions | null>(null);
  const [jobs, setJobs] = useState<StudioJob[]>([]);
  const [spent, setSpent] = useState(0);
  const [toast, setToast] = useState('');
  const [busy, setBusy] = useState(false);

  // Création
  const [mode, setMode] = useState<'viral' | 'single'>('viral');
  const [idea, setIdea] = useState('');
  const [template, setTemplate] = useState('autolux');
  const [lang, setLang] = useState('fr');
  const [seconds, setSeconds] = useState(20);
  const [camera, setCamera] = useState('drone');
  const [single, setSingle] = useState(5);
  const [car, setCar] = useState<{ name: string; image_url: string } | null>(null);
  const [imageUrl, setImageUrl] = useState('');

  // Plan + rendu
  const [plan, setPlan] = useState<StudioPlan | null>(null);
  const [model, setModel] = useState('gratuit');
  const [nativeAudio, setNativeAudio] = useState(false);
  const [voice, setVoice] = useState(true);
  const [music, setMusic] = useState(true);
  const [subtitles, setSubtitles] = useState(true);

  const say = (t: string) => { setToast(t); setTimeout(() => setToast(''), 4000); };
  const loadJobs = useCallback(async () => {
    try { const r = await business.studioJobs(); setJobs(r.jobs); setSpent(r.spentUsd); } catch { /* garde l'affichage */ }
  }, []);
  useEffect(() => {
    business.studioOptions().then(o => { setOpts(o); setSpent(o.spentUsd); }).catch(e => say(`❌ ${errText(e)}`));
    void loadJobs();
  }, [loadJobs]);
  const anyRunning = jobs.some(j => RUNNING.includes(j.status));
  useEffect(() => {
    if (!anyRunning) return;
    const t = setInterval(() => void loadJobs(), 8000);
    return () => clearInterval(t);
  }, [anyRunning, loadJobs]);

  const startImage = imageUrl.trim() || car?.image_url || undefined;
  const makePlan = async () => {
    setBusy(true);
    try {
      const p = mode === 'viral'
        ? await business.studioPlan({ idea, template, lang, seconds, ...(startImage ? { imageUrl: startImage } : {}), ...(car && !imageUrl.trim() ? { carName: car.name } : {}) })
        : await business.studioPlan({ manual: { prompt: idea, camera, duration: single, ...(startImage ? { imageUrl: startImage } : {}) } });
      setPlan(p); setVoice(!!p.voiceover); setMusic(!!p.voiceover);
    } catch (e) { say(`❌ ${errText(e)}`); }
    finally { setBusy(false); }
  };

  const m = opts?.models.find(x => x.id === model);
  const costOf = (id: string) => {
    const md = opts?.models.find(x => x.id === id);
    if (!md || !plan) return 0;
    const rate = nativeAudio ? md.perSecAudio : md.perSec;
    return plan.shots.reduce((s, sh) => s + snap(md.durations, sh.duration) * rate, 0) + (music && id !== 'gratuit' ? 0.02 : 0);
  };
  const cost = costOf(model);

  const render = async () => {
    if (!plan) return;
    if (model !== 'gratuit' && !window.confirm(`Lancer le rendu PAYANT avec ${m?.label ?? model} ?\nCoût estimé ≈ ${cost.toFixed(2)} $ sur ton crédit fal.ai.`)) return;
    setBusy(true);
    try {
      await business.studioRender(plan, { model, nativeAudio, voice, music: model === 'gratuit' ? false : music, subtitles });
      say(model === 'gratuit' ? `🎬 Rendu gratuit lancé : ≈ ${plan.shots.length + 2} min. La vidéo arrivera ici et sur Telegram.` : '🎬 Rendu lancé : 5 à 15 min. La vidéo arrivera ici et sur Telegram.');
      setPlan(null); setIdea('');
      await loadJobs();
    } catch (e) { say(`❌ ${errText(e)}`); }
    finally { setBusy(false); }
  };

  const setShot = (i: number, patch: Partial<StudioShot>) => plan && setPlan({ ...plan, shots: plan.shots.map((s, k) => (k === i ? { ...s, ...patch } : s)) });
  const done = jobs.filter(j => j.status === 'done').length;

  return (
    <div style={{ height: '100%', overflowY: 'auto', WebkitOverflowScrolling: 'touch', background: '#050a16', color: C.text, fontFamily: C.font, paddingBottom: 110 }}>
      <Hero eyebrow="Dzaryx · Vidéo IA" title="Montage" subtitle="Dis ce que tu veux, Dzaryx fait la vidéo — gratuit par défaut" accent={C.accent} />
      <div style={{ padding: '0 14px' }}>
        {!opts ? <SkeletonCards /> : (<>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 7, marginBottom: 14 }}>
            <StatCard icon="🎬" value={String(done)} label="VIDÉOS" color={C.accent} />
            <StatCard icon="⏳" value={String(jobs.filter(j => RUNNING.includes(j.status)).length)} label="EN COURS" color={C.gold} />
            <StatCard icon="💸" value={`${spent.toFixed(2)} $`} label="DÉPENSÉ FAL.AI" color={C.green} />
          </div>

          {!plan && (
            <div style={card}>
              <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                <button style={chip(mode === 'viral')} onClick={() => setMode('viral')}>🔥 Vidéo virale complète</button>
                <button style={chip(mode === 'single')} onClick={() => setMode('single')}>🎥 Plan unique</button>
              </div>
              <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.45 }}>
                {mode === 'viral'
                  ? 'Dzaryx écrit le scénario, génère 3 à 6 plans IA et fait le montage : voix off, sous-titres animés, musique, accroche et appel à l\'action.'
                  : 'Un seul plan IA façon Higgsfield (5 à 10 s) avec un mouvement de caméra. Idéal pour animer une photo de voiture.'}
              </div>

              <div style={label}>{mode === 'viral' ? 'Ton idée' : 'Ce que tu veux voir'}</div>
              <textarea style={input} rows={3} value={idea} onChange={e => setIdea(e.target.value)}
                placeholder={mode === 'viral' ? 'Ex. 3 raisons de louer chez Autolux cet été, pour la diaspora qui arrive à Oran' : 'Ex. la Clio blanche qui roule sur la corniche d\'Oran au coucher du soleil'} />

              {mode === 'viral' ? (<>
                <div style={label}>Type de vidéo</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {opts.templates.map(t => <button key={t.id} style={chip(template === t.id)} onClick={() => setTemplate(t.id)}>{t.label}</button>)}
                </div>
                <div style={label}>Langue de la voix</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {opts.langs.map(l => <button key={l} style={chip(lang === l)} onClick={() => setLang(l)}>{LANGS[l] ?? l}</button>)}
                </div>
                <div style={label}>Durée</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {[15, 20, 30, 45].map(s => <button key={s} style={chip(seconds === s)} onClick={() => setSeconds(s)}>{s} s</button>)}
                </div>
              </>) : (<>
                <div style={label}>Mouvement de caméra</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {opts.cameras.map(c => <button key={c.id} style={chip(camera === c.id)} onClick={() => setCamera(c.id)}>{c.label}</button>)}
                </div>
                <div style={label}>Durée</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {[5, 8, 10].map(s => <button key={s} style={chip(single === s)} onClick={() => setSingle(s)}>{s} s</button>)}
                </div>
              </>)}

              <div style={label}>Photo de départ (facultatif)</div>
              <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
                {opts.cars.map(c => (
                  <button key={c.id} onClick={() => setCar(car?.name === c.name ? null : c)}
                    style={{ flex: '0 0 auto', width: 86, background: 'none', border: `2px solid ${car?.name === c.name ? C.accent : C.border}`, borderRadius: 10, padding: 0, cursor: 'pointer', overflow: 'hidden' }}>
                    <img src={c.image_url} alt={c.name} style={{ width: '100%', height: 54, objectFit: 'cover', display: 'block' }} />
                    <div style={{ fontSize: 13.5, color: C.text, padding: '3px 4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</div>
                  </button>
                ))}
              </div>
              <input style={{ ...input, marginTop: 6 }} value={imageUrl} onChange={e => setImageUrl(e.target.value)} placeholder="…ou colle le lien d'une photo" />

              <button style={{ ...btn(C.accent, '#050a16'), width: '100%', marginTop: 12, opacity: busy || !idea.trim() ? 0.5 : 1 }} disabled={busy || !idea.trim()} onClick={() => void makePlan()}>
                {busy ? '✍️ Dzaryx prépare…' : mode === 'viral' ? '✍️ Écrire le scénario (gratuit)' : '✍️ Préparer le plan (gratuit)'}
              </button>
            </div>
          )}

          {plan && (<>
            <div style={card}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input style={{ ...input, fontWeight: 800, fontSize: 15 }} value={plan.title} onChange={e => setPlan({ ...plan, title: e.target.value })} />
                <button style={btn('rgba(255,255,255,0.08)', C.text)} onClick={() => setPlan(null)}>✕</button>
              </div>
              {plan.template !== 'manuel' && (<>
                <div style={label}>Accroche (2 premières secondes)</div>
                <input style={input} value={plan.hook} onChange={e => setPlan({ ...plan, hook: e.target.value })} />
                <div style={label}>Voix off</div>
                <textarea style={input} rows={4} value={plan.voiceover} onChange={e => setPlan({ ...plan, voiceover: e.target.value })} />
                <div style={label}>Appel à l'action (fin)</div>
                <input style={input} value={plan.cta} onChange={e => setPlan({ ...plan, cta: e.target.value })} />
              </>)}
            </div>

            {plan.shots.map((s, i) => (
              <div key={i} style={card}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <div style={{ fontWeight: 800, fontSize: 13, flex: 1 }}>🎥 Plan {i + 1}</div>
                  <select value={s.camera} onChange={e => setShot(i, { camera: e.target.value })} style={{ ...input, width: 'auto', padding: '6px 8px', fontSize: 12 }}>
                    {opts.cameras.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </select>
                  <select value={s.duration} onChange={e => setShot(i, { duration: Number(e.target.value) })} style={{ ...input, width: 'auto', padding: '6px 8px', fontSize: 12 }}>
                    {[3, 4, 5, 6, 7, 8, 10].map(d => <option key={d} value={d}>{d} s</option>)}
                  </select>
                  {plan.shots.length > 1 && <button style={btn('rgba(248,113,113,0.15)', C.red)} onClick={() => setPlan({ ...plan, shots: plan.shots.filter((_, k) => k !== i) })}>🗑</button>}
                </div>
                <textarea style={{ ...input, fontSize: 12 }} rows={3} value={s.prompt} onChange={e => setShot(i, { prompt: e.target.value })} />
                {plan.image_url && (
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: C.muted, marginTop: 6 }}>
                    <input type="checkbox" checked={!!s.use_image} onChange={e => setShot(i, { use_image: e.target.checked })} /> Partir de la photo
                  </label>
                )}
              </div>
            ))}

            <div style={card}>
              <div style={{ ...label, marginTop: 0 }}>MODÈLE IA</div>
              {opts.models.map(md => (
                <button key={md.id} onClick={() => setModel(md.id)}
                  style={{ display: 'block', width: '100%', textAlign: 'left', background: model === md.id ? 'rgba(244,114,182,0.12)' : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${model === md.id ? C.accent : C.border}`, borderRadius: 10, padding: 10, marginBottom: 6, color: C.text, cursor: 'pointer', fontFamily: C.font }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: 13 }}>
                    <span>{model === md.id ? '◉' : '○'} {md.label}</span><span style={{ color: md.id === 'gratuit' ? C.green : C.gold }}>{md.id === 'gratuit' ? '0 €' : `≈ ${costOf(md.id).toFixed(2)} $`}</span>
                  </div>
                  <div style={{ fontSize: 11.5, color: C.muted, marginTop: 2 }}>{md.note}</div>
                </button>
              ))}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                {plan.voiceover && <button style={chip(voice)} onClick={() => setVoice(!voice)}>🎙 Voix off</button>}
                {model !== 'gratuit' && <button style={chip(music)} onClick={() => setMusic(!music)}>🎵 Musique IA</button>}
                {plan.voiceover && <button style={chip(subtitles)} onClick={() => setSubtitles(!subtitles)}>💬 Sous-titres</button>}
                {model !== 'gratuit' && <button style={chip(nativeAudio)} onClick={() => setNativeAudio(!nativeAudio)}>🔊 Son natif du modèle</button>}
              </div>
              <button style={{ ...btn(C.accent, '#050a16'), width: '100%', marginTop: 12, opacity: busy ? 0.5 : 1 }} disabled={busy} onClick={() => void render()}>
                🎬 Lancer le rendu · {model === 'gratuit' ? '0 €' : `≈ ${cost.toFixed(2)} $`}
              </button>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 6, lineHeight: 1.4 }}>
                {model === 'gratuit' ? 'Gratuit : une image IA par plan, animée au montage. Rendu ≈ 1 min par plan, la vidéo arrive ici et sur Telegram.' : 'Payant : le coût est prélevé sur ton crédit fal.ai (prix publics, peuvent bouger). Rendu : 5 à 15 min.'}
              </div>
            </div>
          </>)}

          {jobs.length > 0 && <div style={{ ...label, marginTop: 16 }}>MES VIDÉOS</div>}
          {jobs.map(j => (
            <div key={j.id} style={card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13 }}>
                <b style={{ flex: 1 }}>{j.title}</b>
                <span style={{ color: C.muted, fontSize: 11 }}>{new Date(j.createdAt).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
              </div>
              <div style={{ fontSize: 11.5, color: C.muted, marginTop: 2 }}>
                {opts.models.find(x => x.id === j.model)?.label ?? j.model} · {j.status === 'done' ? `coût ${j.costUsd.toFixed(2)} $` : `≈ ${j.estimateUsd.toFixed(2)} $`}
              </div>
              {RUNNING.includes(j.status) && (<>
                <div style={{ height: 6, background: 'rgba(255,255,255,0.08)', borderRadius: 3, marginTop: 8, overflow: 'hidden' }}>
                  <div style={{ width: `${j.progress}%`, height: '100%', background: C.accent, transition: 'width .5s' }} />
                </div>
                <div style={{ fontSize: 12, color: C.gold, marginTop: 5 }}>⏳ {j.step}</div>
              </>)}
              {j.status === 'error' && <div style={{ fontSize: 12, color: C.red, marginTop: 6 }}>❌ {j.error}</div>}
              {j.status === 'done' && j.url && (<>
                <video src={j.url} controls playsInline preload="metadata" style={{ width: '100%', maxHeight: 480, borderRadius: 10, marginTop: 8, background: '#000' }} />
                <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                  <a href={j.url} target="_blank" rel="noreferrer" download style={{ ...btn(C.green, '#050a16'), textDecoration: 'none', flex: 1, textAlign: 'center' }}>⬇️ Télécharger</a>
                  {j.caption && <button style={{ ...btn('rgba(255,255,255,0.08)', C.text), flex: 1 }}
                    onClick={() => { void navigator.clipboard?.writeText(j.caption ?? '').then(() => say('📋 Légende copiée')).catch(() => say(j.caption ?? '')); }}>📋 Copier la légende</button>}
                </div>
              </>)}
            </div>
          ))}
        </>)}
      </div>
      {toast && (
        <div style={{ position: 'fixed', left: 16, right: 16, bottom: 96, background: '#222230', border: `1px solid ${C.border}`, borderRadius: 12, padding: 12, fontSize: 13, zIndex: 50, textAlign: 'center' }}>{toast}</div>
      )}
    </div>
  );
}
