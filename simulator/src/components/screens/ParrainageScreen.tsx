import { useState, useEffect, useCallback } from 'react';
import { business, type Referral } from '../../services/api.ts';
import { T, Screen, PageHeader, HeadBtn, Sheet, Field, inputStyle, Btn, Card, Badge, Empty, KpiGrid, Kpi, SectionTitle, Segmented, Chips, Avatar, tone } from '../ui/Kit.tsx';
import { SkeletonCards } from '../ui/Premium.tsx';


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

  const totalUses = list.reduce((s, r) => s + (r.uses || 0), 0);
  const best = [...list].sort((a, b) => (b.uses || 0) - (a.uses || 0))[0];

  return (
    <Screen toast={toast} header={<PageHeader eyebrow="Croissance" title="Parrainage" subtitle="La famille ramène la famille : un code par client, partagé sur WhatsApp" right={<HeadBtn icon="＋" label="Code" color={T.warn} onClick={() => setShow(true)} />} />}>
      <KpiGrid cols={3}>
        <Kpi value={list.length} label="Codes actifs" color={T.warn} />
        <Kpi value={totalUses} label="Clients amenés" color={T.ok} />
        <Kpi value={best && best.uses ? best.referrer_name?.split(' ')[0] || best.code : '—'} label="Meilleur parrain" color={T.violet} />
      </KpiGrid>

      <SectionTitle>Codes parrain</SectionTitle>
      {loading ? <SkeletonCards count={4} height={92} /> : list.length === 0 ? <Empty icon="🎁" title="Aucun code" text="Donne un code à tes meilleurs clients : chaque ami qui réserve avec, c'est une récompense pour eux." action={<Btn variant="primary" onClick={() => setShow(true)}>＋ Créer le premier</Btn>} /> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {list.map(r => (
            <Card key={r.id} accent={T.warn}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <Avatar name={r.referrer_name || 'P'} color={T.warn} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: T.warn, fontFamily: 'ui-monospace, monospace', letterSpacing: '0.06em' }}>{r.code}</div>
                  <div style={{ fontSize: 13, color: T.muted, marginTop: 2 }}>{r.referrer_name || 'Parrain'}{r.reward ? ` · ${r.reward}` : ''}</div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, padding: '8px 10px', borderRadius: 13, background: 'rgba(255,255,255,0.03)', border: `1px solid ${T.line}` }}>
                <span style={{ fontSize: 13.5, color: T.muted }}>Clients amenés</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Btn variant="ghost" onClick={() => void bump(r, -1)} disabled={busy === r.id} style={{ minHeight: 40, padding: '0 14px' }}>−</Btn>
                  <span style={{ minWidth: 26, textAlign: 'center', fontSize: 18, fontWeight: 800, color: T.ok }}>{r.uses}</span>
                  <Btn color={T.ok} onClick={() => void bump(r, 1)} disabled={busy === r.id} style={{ minHeight: 40, padding: '0 14px' }}>＋</Btn>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <Btn onClick={() => share(r)} style={{ flex: 2, background: '#25D366', color: '#04210f', border: 'none' }}>💬 Partager</Btn>
                <Btn variant="danger" onClick={() => { if (confirmDel === r.id) { void del(r); setConfirmDel(''); } else { setConfirmDel(r.id); setTimeout(() => setConfirmDel(c => c === r.id ? '' : c), 3000); } }} style={{ flex: 1, ...(confirmDel === r.id ? { background: T.bad, color: '#fff' } : {}) }}>{confirmDel === r.id ? 'Confirmer ?' : 'Supprimer'}</Btn>
              </div>
            </Card>
          ))}
        </div>
      )}
      <div style={{ fontSize: 13, color: T.muted, marginTop: 16, lineHeight: 1.5 }}>💡 Quand un client réserve avec un code, touche ＋ sur ce code pour le compter et penser à la récompense du parrain.</div>

      {show && (
        <Sheet title="Nouveau code parrain" subtitle="Le code est créé à partir du nom" accent={T.warn} onClose={() => setShow(false)}
          footer={<Btn variant="primary" disabled={busy === 'add' || !name.trim()} onClick={() => void create()} style={{ width: '100%' }}>{busy === 'add' ? 'Création…' : 'Créer le code'}</Btn>}>
          <Field label="Nom du parrain" hint="Un client existant"><input value={name} onChange={e => setName(e.target.value)} placeholder="Ex : Karim Benali" style={inputStyle} /></Field>
          <Field label="Téléphone (facultatif)"><input value={phone} onChange={e => setPhone(e.target.value)} inputMode="tel" style={inputStyle} /></Field>
          <Field label="Récompense"><input value={reward} onChange={e => setReward(e.target.value)} placeholder="Ex : 10 % de réduction, 1 jour offert" style={inputStyle} /></Field>
        </Sheet>
      )}
    </Screen>
  );
}
