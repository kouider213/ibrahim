import { useState, useEffect, useCallback } from 'react';
import { business, type Referral } from '../../services/api.ts';
import { Hero, StatCard } from '../ui/Premium.tsx';

const C = {
  bg: '#0a0a0c', surface: '#16161c', border: 'rgba(255,255,255,0.08)',
  accent: '#10b981', gold: '#fbbf24', red: '#ef4444', text: '#f5f5f7', muted: '#9b9ba6',
  font: '-apple-system, "Segoe UI", Roboto, sans-serif',
};

export default function ParrainageScreen() {
  const [list, setList] = useState<Referral[]>([]);
  const [loading, setLoading] = useState(true);
  const [show, setShow] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [reward, setReward] = useState('10% de réduction');
  const [busy, setBusy] = useState('');
  const [confirmDel, setConfirmDel] = useState('');
  const [toast, setToast] = useState('');
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(''), 2500); };

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await business.referralsList(); setList(r.referrals ?? []); } catch { setList([]); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const create = async () => {
    setBusy('add');
    try { await business.referralCreate({ referrer_name: name, referrer_phone: phone, reward }); flash('✅ Code créé'); setShow(false); setName(''); setPhone(''); await load(); }
    catch (e) { flash(e instanceof Error ? e.message : 'Erreur'); } finally { setBusy(''); }
  };
  const bump = async (r: Referral, delta: number) => {
    setBusy(r.id);
    try { const u = await business.referralUpdate(r.id, { uses: Math.max(0, r.uses + delta) }); setList(xs => xs.map(x => x.id === r.id ? u.referral : x)); }
    catch { flash('Erreur'); } finally { setBusy(''); }
  };
  const del = async (r: Referral) => { setBusy(r.id); try { await business.referralDelete(r.id); setList(xs => xs.filter(x => x.id !== r.id)); } catch { flash('Erreur'); } finally { setBusy(''); } };

  const share = (r: Referral) => {
    const msg = `🎁 Profitez de mon code parrainage Fik Conciergerie : *${r.code}*\n${r.reward ? `→ ${r.reward} sur votre location/séjour à Oran !\n` : ''}Réservez et donnez ce code. wa.me / fikconciergerie.com 🙏`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
  };

  const inp: React.CSSProperties = { width: '100%', boxSizing: 'border-box', background: C.surface, border: `1px solid ${C.border}`, borderRadius: 11, padding: '11px 13px', color: C.text, fontFamily: C.font, fontSize: 14, outline: 'none' };
  const totalUses = list.reduce((s, r) => s + (r.uses || 0), 0);

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: C.bg, color: C.text, fontFamily: C.font, padding: '20px 16px 30px', position: 'relative' }}>
      <div style={{ margin: '-20px -16px 4px' }}><Hero eyebrow="Dzaryx · Croissance" title="Parrainage" accent={C.gold} subtitle="La famille ramène la famille — codes parrain partageables" /></div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10, marginBottom: 14 }}>
        <StatCard icon="🎁" value={String(list.length)} label="CODES" color={C.gold} />
        <StatCard icon="🤝" value={String(totalUses)} label="PARRAINAGES" color={C.accent} />
      </div>

      <button onClick={() => setShow(s => !s)} style={{ width: '100%', marginBottom: 12, padding: '12px', borderRadius: 12, border: 'none', background: C.gold, color: '#1a1300', fontFamily: C.font, fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>{show ? '✕ Fermer' : '＋ Nouveau code parrain'}</button>

      {show && (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: 12, marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 9 }}>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Nom du parrain (client existant)" style={inp} />
          <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Téléphone (optionnel)" style={inp} />
          <input value={reward} onChange={e => setReward(e.target.value)} placeholder="Récompense (ex: 10% de réduction)" style={inp} />
          <button disabled={busy === 'add'} onClick={() => void create()} style={{ padding: '11px', borderRadius: 11, border: 'none', background: C.accent, color: '#06210f', fontFamily: C.font, fontSize: 12.5, fontWeight: 800, cursor: 'pointer' }}>{busy === 'add' ? 'Création…' : 'Créer le code'}</button>
        </div>
      )}

      {loading ? <div style={{ textAlign: 'center', padding: 24, color: C.muted, fontSize: 13 }}>Chargement…</div> : list.length === 0 ? <div style={{ textAlign: 'center', padding: 24, color: C.muted, fontSize: 13 }}>Aucun code. Crée le premier ☝️</div> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          {list.map(r => (
            <div key={r.id} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 13, padding: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 16, fontWeight: 800, color: C.gold, fontFamily: 'monospace', letterSpacing: '0.05em' }}>{r.code}</div>
                  <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{r.referrer_name || 'Parrain'}{r.reward ? ` · ${r.reward}` : ''}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <button onClick={() => void bump(r, -1)} disabled={busy === r.id} style={{ width: 26, height: 26, borderRadius: 8, border: `1px solid ${C.border}`, background: 'transparent', color: C.muted, cursor: 'pointer', fontSize: 14 }}>−</button>
                  <span style={{ minWidth: 20, textAlign: 'center', fontWeight: 800, color: C.accent }}>{r.uses}</span>
                  <button onClick={() => void bump(r, 1)} disabled={busy === r.id} style={{ width: 26, height: 26, borderRadius: 8, border: `1px solid ${C.accent}55`, background: `${C.accent}14`, color: C.accent, cursor: 'pointer', fontSize: 14 }}>+</button>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button onClick={() => share(r)} style={{ flex: 2, padding: '8px', borderRadius: 9, border: 'none', background: '#25D366', color: '#06210f', fontFamily: C.font, fontSize: 11.5, fontWeight: 800, cursor: 'pointer' }}>💬 Partager le code</button>
                <button onClick={() => { if (confirmDel === r.id) { void del(r); setConfirmDel(''); } else { setConfirmDel(r.id); setTimeout(() => setConfirmDel(c => c === r.id ? '' : c), 3000); } }} style={{ flex: 1, padding: '8px', borderRadius: 9, border: `1px solid ${C.red}${confirmDel === r.id ? '' : '44'}`, background: confirmDel === r.id ? C.red : `${C.red}12`, color: confirmDel === r.id ? '#fff' : C.red, fontFamily: C.font, fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}>{confirmDel === r.id ? 'Confirmer ?' : 'Suppr.'}</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ fontSize: 10.5, color: C.muted, marginTop: 16, lineHeight: 1.5 }}>💡 Le client utilise le code → tu cliques + pour compter le parrainage et appliquer la récompense.</div>

      {toast && <div style={{ position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)', background: 'rgba(251,191,36,0.15)', border: `1px solid ${C.gold}40`, borderRadius: 10, padding: '8px 16px', fontSize: 12, fontWeight: 600, color: C.gold, whiteSpace: 'nowrap' }}>{toast}</div>}
    </div>
  );
}
