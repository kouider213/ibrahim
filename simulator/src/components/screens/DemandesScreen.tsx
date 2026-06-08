import { useState, useEffect, useCallback } from 'react';
import { BACKEND_URL, ACCESS_TOKEN } from '../../services/api.ts';

interface WaRequest {
  id:                string;
  phone:             string;
  lang:              string;
  client_name?:      string;
  start_date?:       string;
  end_date?:         string;
  vehicle_wanted?:   string;
  delivery_location?: string;
  return_location?:  string;
  num_persons?:      number;
  has_flight?:       boolean;
  flight_number?:    string;
  arrival_time?:     string;
  arrival_airport?:  string;
  notes?:            string;
  status:            string;
  daily_rate?:       number;
  deposit_amount?:   number;
  deposit_paid?:     boolean;
  created_at:        string;
}

type ModalState =
  | { type: 'approve'; req: WaRequest }
  | { type: 'reject';  req: WaRequest }
  | null;

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BACKEND_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ACCESS_TOKEN}`,
      ...(options.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  pending_info:      { label: 'En cours…',       color: '#888' },
  pending_approval:  { label: 'À valider',        color: '#f59e0b' },
  payment_requested: { label: 'Acompte demandé',  color: '#3b82f6' },
  docs_requested:    { label: 'Docs demandés',    color: '#8b5cf6' },
  confirmed:         { label: 'Confirmé',         color: '#22c55e' },
  cancelled:         { label: 'Annulé',           color: '#ef4444' },
};

export default function DemandesScreen() {
  const [requests, setRequests] = useState<WaRequest[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');
  const [modal,    setModal]    = useState<ModalState>(null);
  const [bankAccount, setBankAccount] = useState('');
  const [dailyRate,   setDailyRate]   = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [working, setWorking] = useState(false);
  const [toast,   setToast]   = useState('');

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  };

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await apiFetch<{ requests: WaRequest[] }>('/api/whatsapp/requests');
      setRequests(data.requests);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const approve = async () => {
    if (modal?.type !== 'approve') return;
    if (!bankAccount.trim() || !dailyRate) { showToast('Remplis compte bancaire + tarif'); return; }
    setWorking(true);
    try {
      await apiFetch(`/api/whatsapp/requests/${modal.req.id}/approve`, {
        method: 'POST',
        body:   JSON.stringify({ bank_account: bankAccount.trim(), daily_rate: Number(dailyRate) }),
      });
      showToast('Instructions paiement envoyées ✅');
      setModal(null);
      setBankAccount('');
      setDailyRate('');
      void load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setWorking(false);
    }
  };

  const reject = async () => {
    if (modal?.type !== 'reject') return;
    setWorking(true);
    try {
      await apiFetch(`/api/whatsapp/requests/${modal.req.id}/reject`, {
        method: 'POST',
        body:   JSON.stringify({ reason: rejectReason.trim() || undefined }),
      });
      showToast('Demande refusée — client notifié');
      setModal(null);
      setRejectReason('');
      void load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setWorking(false);
    }
  };

  const confirmPayment = async (id: string) => {
    setWorking(true);
    try {
      await apiFetch(`/api/whatsapp/requests/${id}/confirm-payment`, { method: 'POST' });
      showToast('Acompte confirmé — docs demandés ✅');
      void load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setWorking(false);
    }
  };

  const fmt = (d?: string) => d ? new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }) : '—';
  const days = (r: WaRequest) => {
    if (!r.start_date || !r.end_date) return null;
    return Math.max(1, Math.ceil((new Date(r.end_date).getTime() - new Date(r.start_date).getTime()) / 86_400_000));
  };

  return (
    <div style={{
      width: '100%', height: '100%',
      background: '#020810',
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
      fontFamily: 'Inter, sans-serif',
    }}>
      {/* Header */}
      <div style={{
        padding: '12px 16px 8px',
        borderBottom: '1px solid rgba(233,185,73,0.08)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div>
          <div style={{ fontFamily: 'Orbitron, monospace', fontSize: 11, fontWeight: 700, color: 'rgba(233,185,73,0.8)', letterSpacing: '0.2em' }}>
            DEMANDES WHATSAPP
          </div>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>
            {requests.length} demande{requests.length !== 1 ? 's' : ''} en cours
          </div>
        </div>
        <button
          onClick={() => { void load(); }}
          style={{
            background: 'rgba(233,185,73,0.07)', border: '1px solid rgba(233,185,73,0.2)',
            borderRadius: 10, padding: '7px 14px', cursor: 'pointer',
            fontSize: 11, fontWeight: 600, color: 'rgba(233,185,73,0.8)',
            fontFamily: 'Inter',
          }}
        >
          ↺ Actualiser
        </button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {loading && (
          <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 12, paddingTop: 40 }}>
            Chargement…
          </div>
        )}
        {error && !loading && (
          <div style={{ textAlign: 'center', color: '#ef4444', fontSize: 12, paddingTop: 40 }}>{error}</div>
        )}
        {!loading && !error && requests.length === 0 && (
          <div style={{ textAlign: 'center', paddingTop: 40 }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>💬</div>
            <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>Aucune demande en attente</div>
          </div>
        )}

        {requests.map(r => {
          const st = STATUS_LABEL[r.status] ?? { label: r.status, color: '#888' };
          const nb = days(r);
          const deposit = nb && r.daily_rate ? nb * r.daily_rate * 3 : null;

          return (
            <div key={r.id} style={{
              background: 'rgba(7,17,31,0.8)',
              border: '1px solid rgba(233,185,73,0.1)',
              borderRadius: 14,
              padding: '12px 14px',
              display: 'flex', flexDirection: 'column', gap: 8,
            }}>
              {/* Top row */}
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>
                    {r.client_name ?? 'Client inconnu'}
                  </div>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>
                    {r.phone} · {new Date(r.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
                <div style={{
                  fontSize: 9, fontWeight: 700, color: st.color,
                  background: `${st.color}18`, border: `1px solid ${st.color}40`,
                  borderRadius: 8, padding: '3px 8px', letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                }}>
                  {st.label}
                </div>
              </div>

              {/* Info grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 8px' }}>
                <InfoRow label="Arrivée"    value={fmt(r.start_date)} />
                <InfoRow label="Départ"     value={fmt(r.end_date)} />
                <InfoRow label="Durée"      value={nb ? `${nb}j` : '—'} />
                <InfoRow label="Voiture"    value={r.vehicle_wanted ?? '—'} />
                <InfoRow label="Livraison"  value={r.delivery_location ?? '—'} />
                <InfoRow label="Retour"     value={r.return_location ?? '—'} />
                {r.flight_number && <InfoRow label="Vol" value={`${r.flight_number} ${r.arrival_time ?? ''}`} />}
                {r.daily_rate    && <InfoRow label="Tarif/j" value={`${r.daily_rate} DZD`} />}
                {deposit         && <InfoRow label="Acompte 3j" value={`${deposit} DZD`} />}
              </div>

              {r.notes && (
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', fontStyle: 'italic', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 6 }}>
                  {r.notes}
                </div>
              )}

              {/* Actions */}
              <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
                {r.status === 'pending_approval' && (
                  <>
                    <ActionBtn color="#22c55e" onClick={() => setModal({ type: 'approve', req: r })}>
                      ✅ VALIDER
                    </ActionBtn>
                    <ActionBtn color="#ef4444" onClick={() => setModal({ type: 'reject', req: r })}>
                      ❌ REFUSER
                    </ActionBtn>
                  </>
                )}
                {r.status === 'payment_requested' && (
                  <>
                    <ActionBtn color="#22c55e" onClick={() => { void confirmPayment(r.id); }} disabled={working}>
                      💰 ACOMPTE REÇU
                    </ActionBtn>
                    <ActionBtn color="#ef4444" onClick={() => setModal({ type: 'reject', req: r })}>
                      ❌ ANNULER
                    </ActionBtn>
                  </>
                )}
                {r.status === 'docs_requested' && (
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', fontStyle: 'italic' }}>
                    En attente des documents client…
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'absolute', bottom: 70, left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(233,185,73,0.15)', border: '1px solid rgba(233,185,73,0.3)',
          borderRadius: 10, padding: '8px 16px',
          fontSize: 12, fontWeight: 600, color: '#e9b949',
          zIndex: 20, backdropFilter: 'blur(8px)',
          whiteSpace: 'nowrap',
        }}>
          {toast}
        </div>
      )}

      {/* Approve Modal */}
      {modal?.type === 'approve' && (
        <Modal title="Valider & envoyer instructions paiement" onClose={() => setModal(null)}>
          <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11, marginBottom: 12 }}>
            Client: <strong style={{ color: '#fff' }}>{modal.req.client_name}</strong> · {days(modal.req)}j
          </div>
          <Label>Compte bancaire / CCP</Label>
          <Input
            value={bankAccount}
            onChange={e => setBankAccount(e.target.value)}
            placeholder="CCP 00123456 / Clé 00 — Nom Prénom"
          />
          <Label>Tarif journalier (DZD)</Label>
          <Input
            type="number"
            value={dailyRate}
            onChange={e => setDailyRate(e.target.value)}
            placeholder="ex: 5000"
          />
          {dailyRate && days(modal.req) && (
            <div style={{ fontSize: 11, color: '#f59e0b', marginTop: 4 }}>
              Acompte 3j = {Number(dailyRate) * 3} DZD
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <ActionBtn color="#22c55e" onClick={() => { void approve(); }} disabled={working}>
              {working ? 'Envoi…' : '✅ ENVOYER'}
            </ActionBtn>
            <ActionBtn color="#666" onClick={() => setModal(null)}>
              Annuler
            </ActionBtn>
          </div>
        </Modal>
      )}

      {/* Reject Modal */}
      {modal?.type === 'reject' && (
        <Modal title="Refuser la demande" onClose={() => setModal(null)}>
          <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11, marginBottom: 12 }}>
            Le client recevra un message de refus automatique.
          </div>
          <Label>Motif (optionnel)</Label>
          <Input
            value={rejectReason}
            onChange={e => setRejectReason(e.target.value)}
            placeholder="ex: dates non disponibles, voiture réservée…"
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <ActionBtn color="#ef4444" onClick={() => { void reject(); }} disabled={working}>
              {working ? 'Envoi…' : '❌ CONFIRMER REFUS'}
            </ActionBtn>
            <ActionBtn color="#666" onClick={() => setModal(null)}>
              Annuler
            </ActionBtn>
          </div>
        </Modal>
      )}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 9, color: 'rgba(233,185,73,0.45)', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 1 }}>{label}</div>
      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.75)', fontWeight: 500 }}>{value}</div>
    </div>
  );
}

function ActionBtn({
  children, color, onClick, disabled = false,
}: { children: React.ReactNode; color: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        flex: 1, padding: '9px 6px',
        background: disabled ? 'rgba(255,255,255,0.04)' : `${color}18`,
        border: `1px solid ${disabled ? 'rgba(255,255,255,0.08)' : `${color}55`}`,
        borderRadius: 10, cursor: disabled ? 'default' : 'pointer',
        fontSize: 10, fontWeight: 700, color: disabled ? 'rgba(255,255,255,0.2)' : color,
        fontFamily: 'Inter',
        letterSpacing: '0.06em',
        transition: 'all 0.15s',
      }}
    >
      {children}
    </button>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 9, fontWeight: 600, color: 'rgba(233,185,73,0.5)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4, marginTop: 10 }}>
      {children}
    </div>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      style={{
        width: '100%', boxSizing: 'border-box',
        background: 'rgba(0,0,0,0.4)',
        border: '1px solid rgba(233,185,73,0.18)',
        borderRadius: 10, padding: '10px 12px',
        fontFamily: 'Inter', fontSize: 12, color: 'rgba(255,255,255,0.85)',
        outline: 'none',
        ...props.style,
      }}
    />
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <>
      <div
        onClick={onClose}
        style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 30, backdropFilter: 'blur(4px)' }}
      />
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 31,
        background: '#030d1e',
        border: '1px solid rgba(233,185,73,0.15)',
        borderTop: '1px solid rgba(233,185,73,0.25)',
        borderRadius: '18px 18px 0 0',
        padding: '20px 18px 32px',
      }}>
        <div style={{
          width: 32, height: 4, borderRadius: 2,
          background: 'rgba(255,255,255,0.12)',
          margin: '0 auto 16px',
        }} />
        <div style={{ fontFamily: 'Orbitron, monospace', fontSize: 11, fontWeight: 700, color: 'rgba(233,185,73,0.8)', letterSpacing: '0.15em', marginBottom: 14 }}>
          {title.toUpperCase()}
        </div>
        {children}
      </div>
    </>
  );
}
