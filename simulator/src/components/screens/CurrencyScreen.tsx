import { useState, useEffect, useCallback } from 'react';
import { BACKEND_URL, ACCESS_TOKEN } from '../../services/api.ts';

interface Rates {
  eur_to_dzd_official: number;
  usd_to_dzd_official: number;
  eur_to_usd: number;
  updated_at: string;
}

interface ParallelRate {
  eur_to_dzd: number;
  usd_to_dzd: number | null;
  source: string;
  updated_at: string;
}

interface BackendRates {
  official: { eur_to_dzd: number; usd_to_dzd: number; eur_to_usd: number; updated_at: string };
  parallel: { eur_to_dzd: number; usd_to_dzd: number | null; source: string; updated_at: string } | null;
}

const LOCAL_KEY = 'dzaryx_rates_cache';

function saveCache(r: { rates: Rates; parallel: ParallelRate | null }) {
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(r)); } catch { /* */ }
}
function loadCache(): { rates: Rates; parallel: ParallelRate | null } | null {
  try { const s = localStorage.getItem(LOCAL_KEY); return s ? JSON.parse(s) as { rates: Rates; parallel: ParallelRate | null } : null; }
  catch { return null; }
}

export default function CurrencyScreen({ actor }: { actor: string }) {
  const cache = loadCache();
  const [rates, setRates]               = useState<Rates | null>(cache?.rates ?? null);
  const [parallel, setParallel]         = useState<ParallelRate | null>(cache?.parallel ?? null);
  const [loading, setLoading]           = useState(false);
  const [editParallel, setEditParallel] = useState(false);
  const [inputEur, setInputEur]         = useState('');
  const [inputUsd, setInputUsd]         = useState('');
  const [error, setError]               = useState('');
  const [parallelSource, setParallelSource] = useState('');

  const fetchRates = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const token = ACCESS_TOKEN;
      const res = await fetch(`${BACKEND_URL}/api/rates/exchange`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json() as BackendRates;
      const r: Rates = {
        eur_to_dzd_official: data.official.eur_to_dzd,
        usd_to_dzd_official: data.official.usd_to_dzd,
        eur_to_usd: data.official.eur_to_usd,
        updated_at: data.official.updated_at,
      };
      const p: ParallelRate | null = data.parallel ? {
        eur_to_dzd: data.parallel.eur_to_dzd,
        usd_to_dzd: data.parallel.usd_to_dzd ?? null,
        source: data.parallel.source,
        updated_at: data.parallel.updated_at,
      } : null;
      setRates(r);
      setParallel(p);
      if (p) setParallelSource(p.source);
      saveCache({ rates: r, parallel: p });
    } catch {
      setError('Connexion impossible — affichage du cache');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchRates(); }, [fetchRates]);

  const [saveError, setSaveError] = useState('');

  const saveManualParallel = async () => {
    const eur = parseFloat(inputEur.replace(',', '.'));
    const usd = parseFloat(inputUsd.replace(',', '.'));
    if (!eur || eur < 50 || eur > 2000) {
      setSaveError('Taux EUR invalide — entrez entre 50 et 2000 DZD (ex: 240)');
      return;
    }
    setSaveError('');
    const p: ParallelRate = {
      eur_to_dzd: eur,
      usd_to_dzd: usd || Math.round(eur / (rates?.eur_to_usd ?? 1.08)),
      source: 'Manuel',
      updated_at: new Date().toISOString(),
    };
    setParallel(p);
    setParallelSource('Manuel');
    saveCache({ rates: rates!, parallel: p });
    setEditParallel(false);
    setInputEur('');
    setInputUsd('');
    // Sync to backend (fire-and-forget)
    fetch(`${BACKEND_URL}/api/rates/parallel`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ eur_to_dzd: eur, usd_to_dzd: p.usd_to_dzd }),
    }).catch(() => {});
  };

  const fmtDate = (d: string) => {
    try { return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); }
    catch { return d.slice(0, 16); }
  };

  const actorCol = actor === 'houari' ? '#7c3aed' : '#00d4ff';

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#020810', color: '#fff', fontFamily: 'Share Tech Mono', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '12px 14px 10px', borderBottom: '1px solid #00d4ff12', flexShrink: 0, background: 'rgba(2,8,16,0.97)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontFamily: 'Orbitron', fontSize: 11, color: actorCol, letterSpacing: '0.3em', fontWeight: 700, textShadow: `0 0 12px ${actorCol}55` }}>
            SARF — صرف
          </div>
          <button
            onClick={() => void fetchRates()}
            disabled={loading}
            style={{ background: 'none', border: '1px solid #00d4ff22', borderRadius: 6, padding: '4px 10px', color: '#00d4ff66', cursor: 'pointer', fontSize: 11, fontFamily: 'Orbitron', letterSpacing: '0.1em' }}
          >
            {loading ? '…' : '↻'}
          </button>
        </div>
        {error && <div style={{ fontSize: 8, color: '#ffb34788', marginTop: 4, letterSpacing: '0.1em' }}>{error}</div>}
        {rates && (
          <div style={{ fontSize: 7, color: '#ffffff22', marginTop: 4 }}>
            Officiel · mis à jour {fmtDate(rates.updated_at)}
          </div>
        )}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>

        {/* ─── SECTION OFFICIEL ─── */}
        <SectionTitle label="MARCHÉ OFFICIEL" color="#00d4ff" icon="🏛" />

        <RateCard
          from="EUR" to="DZD"
          rate={rates?.eur_to_dzd_official}
          color="#00d4ff"
          example={`1 000 DZD = ${rates ? (1000 / rates.eur_to_dzd_official).toFixed(2) : '…'} EUR`}
        />
        <RateCard
          from="USD" to="DZD"
          rate={rates?.usd_to_dzd_official}
          color="#00e676"
          example={`1 000 DZD = ${rates ? (1000 / rates.usd_to_dzd_official).toFixed(2) : '…'} USD`}
        />
        <RateCard
          from="EUR" to="USD"
          rate={rates?.eur_to_usd}
          color="#ffb347"
          example={`100 EUR = ${rates ? (100 * rates.eur_to_usd).toFixed(2) : '…'} USD`}
        />

        {/* ─── SECTION PARALLÈLE ─── */}
        <SectionTitle label="MARCHÉ PARALLÈLE (NOIR)" color="#ff3366" icon="🔄" />

        {parallel ? (
          <>
            <RateCard
              from="EUR" to="DZD"
              rate={parallel.eur_to_dzd}
              color="#ff3366"
              badge="PARALLÈLE"
              example={`1 000 DZD = ${(1000 / parallel.eur_to_dzd).toFixed(2)} EUR`}
              note={`${parallelSource || parallel.source} · ${fmtDate(parallel.updated_at)}`}
            />
            {parallel.usd_to_dzd != null && (
            <RateCard
              from="USD" to="DZD"
              rate={parallel.usd_to_dzd}
              color="#ff7043"
              badge="PARALLÈLE"
              example={`1 000 DZD = ${(1000 / parallel.usd_to_dzd).toFixed(2)} USD`}
            />
            )}
            {rates && (
              <div style={{
                background: 'rgba(255,51,102,0.05)', border: '1px solid #ff336622', borderRadius: 10, padding: '8px 12px',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <div>
                  <div style={{ fontSize: 7, color: '#ff336688', fontFamily: 'Orbitron', letterSpacing: '0.15em' }}>ÉCART PARALLÈLE / OFFICIEL</div>
                  <div style={{ fontSize: 16, color: '#ff3366', fontWeight: 'bold', marginTop: 2 }}>
                    +{Math.round((parallel.eur_to_dzd / rates.eur_to_dzd_official - 1) * 100)}%
                  </div>
                </div>
                <div style={{ fontSize: 8, color: '#ffffff33', textAlign: 'right' }}>
                  <div>{rates.eur_to_dzd_official.toFixed(0)} officiel</div>
                  <div>{parallel.eur_to_dzd.toFixed(0)} parallèle</div>
                </div>
              </div>
            )}
          </>
        ) : (
          <div style={{
            background: 'rgba(255,51,102,0.05)', border: '1px solid #ff336622',
            borderRadius: 10, padding: '16px 14px', textAlign: 'center',
          }}>
            <div style={{ fontSize: 10, color: '#ff336688', fontFamily: 'Orbitron', letterSpacing: '0.15em', marginBottom: 6 }}>
              COURS NON DÉFINI
            </div>
            <div style={{ fontSize: 8, color: '#ffffff33', marginBottom: 10 }}>
              Entrez le taux du marché parallèle manuellement
            </div>
          </div>
        )}

        {/* Bouton mise à jour manuelle */}
        {!editParallel ? (
          <button
            onClick={() => {
              setEditParallel(true);
              setInputEur(parallel?.eur_to_dzd.toFixed(0) ?? '');
              setInputUsd(parallel?.usd_to_dzd?.toFixed(0) ?? '');
            }}
            style={{
              background: 'rgba(255,51,102,0.08)', border: '1px solid #ff336644',
              borderRadius: 10, padding: '12px', cursor: 'pointer',
              fontFamily: 'Orbitron', fontSize: 8, color: '#ff3366',
              letterSpacing: '0.15em', width: '100%',
            }}
          >
            ✏ METTRE À JOUR LE COURS PARALLÈLE
          </button>
        ) : (
          <div style={{ background: 'rgba(255,51,102,0.06)', border: '1px solid #ff336633', borderRadius: 12, padding: '14px' }}>
            <div style={{ fontFamily: 'Orbitron', fontSize: 8, color: '#ff336688', letterSpacing: '0.15em', marginBottom: 10 }}>
              COURS MARCHÉ NOIR
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div>
                <label style={{ fontSize: 7, color: '#ff336666', letterSpacing: '0.15em', display: 'block', marginBottom: 3 }}>1 EUR = ? DZD</label>
                <input
                  value={inputEur}
                  onChange={e => setInputEur(e.target.value)}
                  placeholder="ex: 240"
                  type="number"
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={{ fontSize: 7, color: '#ff336666', letterSpacing: '0.15em', display: 'block', marginBottom: 3 }}>1 USD = ? DZD (optionnel)</label>
                <input
                  value={inputUsd}
                  onChange={e => setInputUsd(e.target.value)}
                  placeholder="ex: 222"
                  type="number"
                  style={inputStyle}
                />
              </div>
              {saveError && (
                <div style={{ fontSize: 8, color: '#ff5566', background: 'rgba(255,51,102,0.1)', border: '1px solid #ff336633', borderRadius: 6, padding: '6px 10px', letterSpacing: '0.05em' }}>
                  ⚠ {saveError}
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <button
                  onClick={saveManualParallel}
                  style={{
                    flex: 1, background: '#ff336622', border: '1px solid #ff336655',
                    borderRadius: 8, padding: '10px', fontFamily: 'Orbitron', fontSize: 8,
                    color: '#ff3366', cursor: 'pointer', letterSpacing: '0.1em',
                  }}
                >
                  ENREGISTRER
                </button>
                <button
                  onClick={() => { setEditParallel(false); setSaveError(''); }}
                  style={{
                    flex: 1, background: '#ffffff08', border: '1px solid #ffffff22',
                    borderRadius: 8, padding: '10px', fontFamily: 'Orbitron', fontSize: 8,
                    color: '#ffffff44', cursor: 'pointer',
                  }}
                >
                  ANNULER
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ─── CONVERTISSEUR RAPIDE ─── */}
        <SectionTitle label="CONVERTISSEUR RAPIDE" color="#ffb347" icon="⚡" />
        <QuickConverter rates={rates} parallel={parallel} />

        <div style={{ height: 20 }} />
      </div>
    </div>
  );
}

function SectionTitle({ label, color, icon }: { label: string; color: string; icon: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 4 }}>
      <span style={{ fontSize: 12 }}>{icon}</span>
      <span style={{ fontFamily: 'Orbitron', fontSize: 7, color: `${color}88`, letterSpacing: '0.2em' }}>{label}</span>
      <div style={{ flex: 1, height: 1, background: `linear-gradient(90deg, ${color}33, transparent)` }} />
    </div>
  );
}

function RateCard({ from, to, rate, color, badge, example, note }: {
  from: string; to: string; rate?: number; color: string;
  badge?: string; example?: string; note?: string;
}) {
  return (
    <div style={{
      background: `${color}08`, border: `1px solid ${color}22`,
      borderRadius: 12, padding: '12px 14px',
      boxShadow: `0 0 15px ${color}08`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontFamily: 'Orbitron', fontSize: 10, color: '#ffffff88' }}>{from}</span>
          <span style={{ fontSize: 10, color: `${color}66` }}>→</span>
          <span style={{ fontFamily: 'Orbitron', fontSize: 10, color: '#ffffff88' }}>{to}</span>
          {badge && (
            <span style={{
              fontSize: 5, color, fontFamily: 'Orbitron', letterSpacing: '0.1em',
              background: `${color}18`, padding: '2px 5px', borderRadius: 4,
            }}>{badge}</span>
          )}
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontFamily: 'Orbitron', fontSize: 20, color, textShadow: `0 0 10px ${color}44`, lineHeight: 1 }}>
            {rate ? rate.toFixed(to === 'USD' || from === 'EUR' && to === 'USD' ? 4 : 0) : '…'}
          </div>
          <div style={{ fontSize: 7, color: `${color}55`, letterSpacing: '0.05em' }}>{to}</div>
        </div>
      </div>
      {example && (
        <div style={{ fontSize: 8, color: '#ffffff33', marginTop: 6, borderTop: `1px solid ${color}11`, paddingTop: 6 }}>
          {example}
        </div>
      )}
      {note && <div style={{ fontSize: 7, color: '#ffffff22', marginTop: 4 }}>{note}</div>}
    </div>
  );
}

function QuickConverter({ rates, parallel }: { rates: Rates | null; parallel: ParallelRate | null }) {
  const [amount, setAmount] = useState('');
  const [from, setFrom]     = useState<'EUR' | 'USD' | 'DZD_P' | 'DZD_O'>('EUR');

  const val = parseFloat(amount.replace(',', '.')) || 0;

  const convert = () => {
    if (!rates || !val) return null;
    const eur_dzd_off = rates.eur_to_dzd_official;
    const usd_dzd_off = rates.usd_to_dzd_official;
    const eur_dzd_par = parallel?.eur_to_dzd ?? null;

    if (from === 'EUR') return {
      'DZD officiel': Math.round(val * eur_dzd_off),
      'DZD parallèle': eur_dzd_par ? Math.round(val * eur_dzd_par) : null,
      'USD': (val * rates.eur_to_usd).toFixed(2),
    };
    if (from === 'USD') return {
      'DZD officiel': Math.round(val * usd_dzd_off),
      'EUR': (val / rates.eur_to_usd).toFixed(2),
    };
    if (from === 'DZD_O') return {
      'EUR': (val / eur_dzd_off).toFixed(2),
      'USD': (val / usd_dzd_off).toFixed(2),
      'DZD parallèle': eur_dzd_par ? Math.round(val * eur_dzd_par / eur_dzd_off) : null,
    };
    if (from === 'DZD_P' && eur_dzd_par) return {
      'EUR': (val / eur_dzd_par).toFixed(2),
      'USD': (val / (parallel?.usd_to_dzd ?? usd_dzd_off)).toFixed(2),
      'DZD officiel': Math.round(val * eur_dzd_off / eur_dzd_par),
    };
    return null;
  };

  const result = convert();

  return (
    <div style={{ background: 'rgba(255,179,71,0.05)', border: '1px solid #ffb34722', borderRadius: 12, padding: '12px 14px' }}>
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        <input
          value={amount}
          onChange={e => setAmount(e.target.value)}
          placeholder="Montant"
          type="number"
          style={{ ...inputStyle, flex: 1 }}
        />
        <select
          value={from}
          onChange={e => setFrom(e.target.value as typeof from)}
          style={{
            background: '#0a0f1a', border: '1px solid #ffb34733', borderRadius: 8,
            color: '#ffb347', fontFamily: 'Share Tech Mono', fontSize: 10, padding: '6px 8px',
          }}
        >
          <option value="EUR">EUR →</option>
          <option value="USD">USD →</option>
          <option value="DZD_O">DZD off. →</option>
          {parallel && <option value="DZD_P">DZD paral. →</option>}
        </select>
      </div>
      {result && val > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {Object.entries(result).map(([k, v]) =>
            v != null ? (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #ffffff08' }}>
                <span style={{ fontSize: 8, color: '#ffffff44', letterSpacing: '0.1em' }}>{k.toUpperCase()}</span>
                <span style={{ fontFamily: 'Orbitron', fontSize: 12, color: '#ffb347' }}>
                  {typeof v === 'number' ? v.toLocaleString('fr-FR') : v}
                </span>
              </div>
            ) : null
          )}
        </div>
      ) : (
        <div style={{ fontSize: 8, color: '#ffffff22', textAlign: 'center' }}>Entrez un montant pour convertir</div>
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  background: 'rgba(0,212,255,0.04)', border: '1px solid #00d4ff22',
  borderRadius: 8, padding: '8px 12px',
  fontFamily: 'Share Tech Mono', fontSize: 13, color: '#c8e8ff',
  outline: 'none', width: '100%', boxSizing: 'border-box',
};
