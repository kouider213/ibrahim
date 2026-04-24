import { useState, useEffect, useCallback } from 'react';
import { api, type FinanceDashboardData } from '../services/api.js';
import './FinanceDashboard.css';

const MONTHS_FR = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];

export default function FinanceDashboard() {
  const [data,    setData]    = useState<FinanceDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [pdfId,   setPdfId]   = useState('');
  const [pdfUrl,  setPdfUrl]  = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const d = await api.getFinanceDashboard();
      setData(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur réseau');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function handleGeneratePdf() {
    if (!pdfId.trim()) return;
    setPdfLoading(true); setPdfUrl(null);
    try {
      const r = await api.generateReceipt(pdfId.trim());
      setPdfUrl(r.url);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erreur PDF');
    } finally {
      setPdfLoading(false);
    }
  }

  if (loading) return <div className="fd-loading"><div className="fd-spinner" />Chargement...</div>;
  if (error)   return <div className="fd-error"><span>⚠️</span>{error}<button onClick={load}>Réessayer</button></div>;
  if (!data)   return null;

  const monthLabel = `${MONTHS_FR[data.month - 1]} ${data.year}`;
  const evolSign   = data.ca.evolution >= 0 ? '+' : '';
  const evolColor  = data.ca.evolution >= 0 ? 'var(--fd-green)' : 'var(--fd-red)';

  return (
    <div className="fd-root">
      <div className="fd-header">
        <h1>Finances</h1>
        <span className="fd-month">{monthLabel}</span>
        <button className="fd-refresh" onClick={load} title="Actualiser">↻</button>
      </div>

      {/* KPI cards */}
      <div className="fd-cards">
        <div className="fd-card fd-card--primary">
          <div className="fd-card__label">Chiffre d'affaires</div>
          <div className="fd-card__value">{data.ca.current.toLocaleString('fr-FR')} €</div>
          <div className="fd-card__sub" style={{ color: evolColor }}>
            {evolSign}{data.ca.evolution}% vs mois précédent ({data.ca.previous.toLocaleString('fr-FR')} €)
          </div>
        </div>

        <div className="fd-card fd-card--profit">
          <div className="fd-card__label">Bénéfice Kouider</div>
          <div className="fd-card__value">{data.profit.toLocaleString('fr-FR')} €</div>
          <div className="fd-card__sub">{data.bookingCount} réservation(s)</div>
        </div>
      </div>

      {/* Paiements */}
      <div className="fd-section">
        <h2>Paiements</h2>
        <div className="fd-row">
          <div className="fd-stat">
            <span className="fd-stat__label">Encaissé</span>
            <span className="fd-stat__val fd-stat__val--green">{data.payments.collected.toLocaleString('fr-FR')} €</span>
          </div>
          <div className="fd-divider" />
          <div className="fd-stat">
            <span className="fd-stat__label">À encaisser</span>
            <span className="fd-stat__val fd-stat__val--red">{data.payments.outstanding.toLocaleString('fr-FR')} €</span>
          </div>
        </div>
        <div className="fd-bar">
          <div
            className="fd-bar__fill"
            style={{ width: data.payments.collected + data.payments.outstanding > 0
              ? `${Math.round((data.payments.collected / (data.payments.collected + data.payments.outstanding)) * 100)}%`
              : '0%' }}
          />
        </div>
      </div>

      {/* Prévisions */}
      <div className="fd-section">
        <h2>Prévisions</h2>
        <div className="fd-row">
          <div className="fd-stat">
            <span className="fd-stat__label">Projection mois</span>
            <span className="fd-stat__val">{data.forecast.projected.toLocaleString('fr-FR')} €</span>
          </div>
          <div className="fd-divider" />
          <div className="fd-stat">
            <span className="fd-stat__label">Mois prochain</span>
            <span className="fd-stat__val">{data.forecast.nextMonth.toLocaleString('fr-FR')} €</span>
          </div>
          <div className="fd-divider" />
          <div className="fd-stat">
            <span className="fd-stat__label">Moy./jour</span>
            <span className="fd-stat__val">{data.forecast.dailyAvg.toLocaleString('fr-FR')} €</span>
          </div>
        </div>
      </div>

      {/* Véhicules */}
      {data.vehicles.length > 0 && (
        <div className="fd-section">
          <h2>Par véhicule</h2>
          <div className="fd-vehicles">
            {data.vehicles.map(v => {
              const pct = data.ca.current > 0 ? Math.round((v.ca / data.ca.current) * 100) : 0;
              return (
                <div key={v.name} className="fd-vehicle">
                  <div className="fd-vehicle__top">
                    <span className="fd-vehicle__name">{v.name}</span>
                    <span className="fd-vehicle__ca">{v.ca.toLocaleString('fr-FR')} €</span>
                  </div>
                  <div className="fd-bar fd-bar--sm">
                    <div className="fd-bar__fill" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="fd-vehicle__meta">{v.bookings} rés. · {pct}% du CA</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Impayés */}
      {data.unpaid.length > 0 && (
        <div className="fd-section fd-section--danger">
          <h2>Impayés ({data.unpaid.length})</h2>
          <div className="fd-unpaid-list">
            {data.unpaid.map(u => (
              <div key={u.id} className="fd-unpaid-item">
                <div className="fd-unpaid-item__main">
                  <span className="fd-unpaid-item__name">{u.name}</span>
                  <span className="fd-unpaid-item__amount">{u.amount.toLocaleString('fr-FR')} €</span>
                </div>
                <div className="fd-unpaid-item__sub">
                  {u.car}{u.phone ? ` · ${u.phone}` : ''}
                </div>
                <button
                  className="fd-unpaid-item__pdf"
                  onClick={() => setPdfId(u.id)}
                >
                  Générer reçu
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Générateur PDF */}
      <div className="fd-section">
        <h2>Facture PDF</h2>
        <div className="fd-pdf-form">
          <input
            className="fd-pdf-input"
            placeholder="ID réservation (UUID)"
            value={pdfId}
            onChange={e => setPdfId(e.target.value)}
          />
          <button
            className="fd-pdf-btn"
            onClick={handleGeneratePdf}
            disabled={pdfLoading || !pdfId.trim()}
          >
            {pdfLoading ? '...' : 'Générer'}
          </button>
        </div>
        {pdfUrl && (
          <a className="fd-pdf-link" href={pdfUrl} target="_blank" rel="noopener noreferrer">
            Ouvrir la facture PDF ↗
          </a>
        )}
      </div>
    </div>
  );
}
