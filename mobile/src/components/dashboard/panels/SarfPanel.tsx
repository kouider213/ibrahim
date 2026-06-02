import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// ── Types ─────────────────────────────────────────────────────────
interface ExchangeRate {
  official: number;   // Taux officiel BNA
  parallel: number;   // Taux parallèle (marché noir / Square Port Said)
  updated:  string;
}

type Direction = 'EUR_TO_DZD' | 'DZD_TO_EUR';
type Market    = 'official' | 'parallel';

// ── Taux de change statiques (mis à jour manuellement)
// En production: à connecter à une API (exchangerate-api / openexchangerates)
const FALLBACK_RATES: ExchangeRate = {
  official: 147,    // ~147 DA pour 1 EUR (BNA)
  parallel: 238,    // ~238 DA pour 1 EUR (Square / parallèle)
  updated:  'Mise à jour manuelle',
};

// ── Tentative de fetch depuis une API gratuite ─────────────────────
async function fetchLiveRate(): Promise<ExchangeRate | null> {
  try {
    // API ouverte sans clé: frankfurter.app (BCE / officiel)
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5000);
    const res = await fetch('https://api.frankfurter.app/latest?from=EUR&to=DZD', {
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (!res.ok) return null;
    const data = await res.json() as { rates?: { DZD?: number }; date?: string };
    const officialRate = data?.rates?.DZD ?? null;
    if (!officialRate) return null;
    return {
      official: Math.round(officialRate * 10) / 10,
      parallel: FALLBACK_RATES.parallel, // Taux parallèle toujours manuel
      updated: data?.date ?? new Date().toLocaleDateString('fr-FR'),
    };
  } catch {
    return null;
  }
}

// ── Formatters ────────────────────────────────────────────────────
function fmtDZD(n: number): string {
  return n.toLocaleString('fr-DZ', { maximumFractionDigits: 0 }) + ' DA';
}
function fmtEUR(n: number): string {
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}
function fmtNum(n: number, dir: Direction): string {
  return dir === 'EUR_TO_DZD' ? fmtDZD(n) : fmtEUR(n);
}

// ── Rate badge ────────────────────────────────────────────────────
function RateBadge({ label, rate, active, onClick }: {
  label: string; rate: number; active: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 rounded-xl border px-3 py-3 text-center transition-all duration-200 ${
        active
          ? 'border-cyan-400/60 bg-cyan-500/15 shadow-[0_0_16px_rgba(6,182,212,0.2)]'
          : 'border-gray-700/40 bg-gray-900/40 hover:border-gray-600/60'
      }`}
    >
      <div className={`text-[10px] font-mono uppercase tracking-widest mb-1 ${active ? 'text-cyan-400' : 'text-gray-500'}`}>
        {label}
      </div>
      <div className={`text-xl font-bold font-mono ${active ? 'text-cyan-300' : 'text-gray-400'}`}>
        {rate}
      </div>
      <div className="text-[10px] text-gray-600 mt-0.5">DA / €</div>
    </button>
  );
}

// ── Preset buttons ─────────────────────────────────────────────────
const EUR_PRESETS = [50, 100, 200, 500, 1000];
const DZD_PRESETS = [5000, 10000, 20000, 50000, 100000];

// ── Main Component ────────────────────────────────────────────────
export default function SarfPanel() {
  const [rates,     setRates]     = useState<ExchangeRate>(FALLBACK_RATES);
  const [rateStatus, setRateStatus] = useState<'loading' | 'live' | 'fallback'>('loading');
  const [market,    setMarket]    = useState<Market>('parallel');
  const [direction, setDirection] = useState<Direction>('EUR_TO_DZD');
  const [inputVal,  setInputVal]  = useState('');
  const [result,    setResult]    = useState<number | null>(null);
  const [history,   setHistory]   = useState<Array<{ from: string; to: string; rate: number; market: string; ts: string }>>([]);
  const [copied,    setCopied]    = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // ── Fetch live rate on mount ──────────────────────────────────
  useEffect(() => {
    fetchLiveRate().then(live => {
      if (live) {
        setRates(live);
        setRateStatus('live');
      } else {
        setRates(FALLBACK_RATES);
        setRateStatus('fallback');
      }
    });
  }, []);

  // ── Calculate result ──────────────────────────────────────────
  const currentRate = rates[market];

  const calculate = useCallback((val: string) => {
    const num = parseFloat(val.replace(',', '.'));
    if (!val || isNaN(num) || num <= 0) { setResult(null); return; }
    if (direction === 'EUR_TO_DZD') {
      setResult(Math.round(num * currentRate));
    } else {
      setResult(Math.round((num / currentRate) * 100) / 100);
    }
  }, [direction, currentRate]);

  useEffect(() => {
    calculate(inputVal);
  }, [inputVal, direction, market, calculate]);

  // ── Handlers ──────────────────────────────────────────────────
  const handlePreset = (val: number) => {
    setInputVal(String(val));
    inputRef.current?.focus();
  };

  const handleSwap = () => {
    setDirection(d => d === 'EUR_TO_DZD' ? 'DZD_TO_EUR' : 'EUR_TO_DZD');
    setInputVal('');
    setResult(null);
  };

  const handleCopy = () => {
    if (result === null) return;
    const text = direction === 'EUR_TO_DZD' ? fmtDZD(result) : fmtEUR(result);
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleSave = () => {
    if (result === null || !inputVal) return;
    const num = parseFloat(inputVal.replace(',', '.'));
    const entry = {
      from: direction === 'EUR_TO_DZD' ? fmtEUR(num) : fmtDZD(num),
      to:   direction === 'EUR_TO_DZD' ? fmtDZD(result) : fmtEUR(result),
      rate: currentRate,
      market: market === 'official' ? 'BNA' : 'Parallèle',
      ts: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
    };
    setHistory(h => [entry, ...h].slice(0, 8));
  };

  const inputLabel = direction === 'EUR_TO_DZD' ? 'EUR €' : 'DA (Dinars)';
  const presets = direction === 'EUR_TO_DZD' ? EUR_PRESETS : DZD_PRESETS;
  const placeholderTxt = direction === 'EUR_TO_DZD' ? 'Ex: 100' : 'Ex: 20000';

  return (
    <motion.div
      className="space-y-4 pb-4"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
    >
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-cyan-400 font-mono text-lg font-bold tracking-widest uppercase">
            💱 Sarf
          </h2>
          <p className="text-[10px] text-gray-600 font-mono mt-0.5">Calculateur EUR ↔ DZD</p>
        </div>
        <div className="text-right">
          <div className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
            rateStatus === 'live'
              ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/8'
              : rateStatus === 'loading'
              ? 'text-amber-400 border-amber-500/30 bg-amber-500/8'
              : 'text-gray-500 border-gray-700/30 bg-gray-800/30'
          }`}>
            {rateStatus === 'live' ? '● LIVE' : rateStatus === 'loading' ? '⟳ SYNC…' : '○ MANUEL'}
          </div>
          <div className="text-[9px] text-gray-700 font-mono mt-1">{rates.updated}</div>
        </div>
      </div>

      {/* ── Market selector ── */}
      <div className="flex gap-3">
        <RateBadge
          label="Officiel (BNA)"
          rate={rates.official}
          active={market === 'official'}
          onClick={() => setMarket('official')}
        />
        <RateBadge
          label="Parallèle"
          rate={rates.parallel}
          active={market === 'parallel'}
          onClick={() => setMarket('parallel')}
        />
      </div>

      {/* ── Direction toggle + Swap ── */}
      <div className="dash-card dash-glow p-4">
        <div className="flex items-center gap-3">
          {/* From */}
          <div className={`flex-1 rounded-lg border px-3 py-2 text-center text-xs font-mono transition-colors ${
            'border-cyan-500/40 bg-cyan-500/8 text-cyan-300'
          }`}>
            {direction === 'EUR_TO_DZD' ? '🇪🇺 EUR' : '🇩🇿 DZD'}
          </div>

          {/* Swap button */}
          <motion.button
            onClick={handleSwap}
            whileTap={{ rotate: 180, scale: 0.9 }}
            transition={{ duration: 0.25 }}
            className="w-10 h-10 rounded-full border border-gray-600/50 bg-gray-800/60 flex items-center justify-center text-gray-400 hover:text-cyan-400 hover:border-cyan-500/40 transition-colors flex-shrink-0"
            title="Inverser"
          >
            ⇄
          </motion.button>

          {/* To */}
          <div className="flex-1 rounded-lg border px-3 py-2 text-center text-xs font-mono border-gray-700/40 bg-gray-900/40 text-gray-400">
            {direction === 'EUR_TO_DZD' ? '🇩🇿 DZD' : '🇪🇺 EUR'}
          </div>
        </div>
      </div>

      {/* ── Input ── */}
      <div className="dash-card dash-glow p-4 space-y-3">
        <label className="block text-[10px] text-gray-500 uppercase tracking-widest font-mono">
          Montant en {inputLabel}
        </label>

        <div className="relative">
          <input
            ref={inputRef}
            type="number"
            inputMode="decimal"
            placeholder={placeholderTxt}
            value={inputVal}
            onChange={e => setInputVal(e.target.value)}
            className="w-full bg-gray-950/80 border border-gray-700/60 rounded-xl px-4 py-3.5 text-2xl font-mono text-white placeholder-gray-700 focus:outline-none focus:border-cyan-500/60 focus:bg-gray-950 transition-colors pr-16"
          />
          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-600 font-mono text-sm">
            {direction === 'EUR_TO_DZD' ? '€' : 'DA'}
          </span>
        </div>

        {/* Presets */}
        <div className="flex gap-1.5 flex-wrap">
          {presets.map(p => (
            <button
              key={p}
              onClick={() => handlePreset(p)}
              className={`px-2.5 py-1 rounded-lg text-[10px] font-mono border transition-colors ${
                inputVal === String(p)
                  ? 'border-cyan-500/60 bg-cyan-500/15 text-cyan-400'
                  : 'border-gray-700/40 bg-gray-900/40 text-gray-500 hover:text-gray-300 hover:border-gray-600/60'
              }`}
            >
              {p.toLocaleString('fr-FR')}
            </button>
          ))}
        </div>
      </div>

      {/* ── Result ── */}
      <AnimatePresence mode="wait">
        {result !== null && (
          <motion.div
            key={`${result}-${direction}-${market}`}
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -8 }}
            transition={{ duration: 0.25 }}
            className="dash-card p-4 border-cyan-500/25 bg-gradient-to-br from-cyan-500/6 to-transparent"
            style={{ boxShadow: '0 0 30px rgba(6,182,212,0.12)' }}
          >
            {/* Rate info */}
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] text-gray-600 font-mono uppercase tracking-widest">
                Résultat — taux {market === 'official' ? 'BNA' : 'parallèle'}
              </span>
              <span className="text-[10px] text-gray-700 font-mono">1€ = {currentRate} DA</span>
            </div>

            {/* Big result */}
            <div className="text-center py-2">
              <div className="text-4xl font-bold font-mono text-cyan-300 tracking-tight">
                {fmtNum(result, direction)}
              </div>
              <div className="text-xs text-gray-600 mt-1.5 font-mono">
                {direction === 'EUR_TO_DZD'
                  ? `${fmtEUR(parseFloat(inputVal) || 0)} → ${fmtDZD(result)}`
                  : `${fmtDZD(parseFloat(inputVal) || 0)} → ${fmtEUR(result)}`
                }
              </div>
            </div>

            {/* Comparison (si marché parallèle actif, montrer aussi officiel, et vice versa) */}
            {market === 'parallel' && (
              <div className="mt-3 pt-3 border-t border-gray-800/50 flex items-center justify-between text-xs">
                <span className="text-gray-600 font-mono">Officiel BNA ≈</span>
                <span className="text-gray-500 font-mono">
                  {direction === 'EUR_TO_DZD'
                    ? fmtDZD(Math.round((parseFloat(inputVal) || 0) * rates.official))
                    : fmtEUR(Math.round(((parseFloat(inputVal) || 0) / rates.official) * 100) / 100)
                  }
                </span>
              </div>
            )}
            {market === 'official' && (
              <div className="mt-3 pt-3 border-t border-gray-800/50 flex items-center justify-between text-xs">
                <span className="text-gray-600 font-mono">Parallèle ≈</span>
                <span className="text-amber-400/80 font-mono">
                  {direction === 'EUR_TO_DZD'
                    ? fmtDZD(Math.round((parseFloat(inputVal) || 0) * rates.parallel))
                    : fmtEUR(Math.round(((parseFloat(inputVal) || 0) / rates.parallel) * 100) / 100)
                  }
                </span>
              </div>
            )}

            {/* Action buttons */}
            <div className="flex gap-2 mt-4">
              <button
                onClick={handleCopy}
                className="flex-1 py-2 rounded-lg border border-gray-700/50 bg-gray-900/40 text-xs font-mono text-gray-400 hover:text-gray-200 hover:border-gray-600/60 transition-colors"
              >
                {copied ? '✅ Copié !' : '📋 Copier'}
              </button>
              <button
                onClick={handleSave}
                className="flex-1 py-2 rounded-lg border border-cyan-500/30 bg-cyan-500/8 text-xs font-mono text-cyan-400 hover:bg-cyan-500/15 transition-colors"
              >
                💾 Sauvegarder
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Quick info ── */}
      <div className="dash-card p-4 space-y-2">
        <h3 className="text-[10px] text-gray-500 uppercase tracking-widest font-mono mb-3">
          Taux du jour
        </h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-gray-800/60 bg-gray-950/40 px-3 py-2.5 text-center">
            <div className="text-[9px] text-gray-600 font-mono uppercase tracking-wider mb-1">BNA Officiel</div>
            <div className="text-lg font-bold font-mono text-gray-300">1€ = {rates.official} DA</div>
          </div>
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2.5 text-center">
            <div className="text-[9px] text-amber-500/70 font-mono uppercase tracking-wider mb-1">Parallèle</div>
            <div className="text-lg font-bold font-mono text-amber-400/90">1€ = {rates.parallel} DA</div>
          </div>
        </div>
        <p className="text-[9px] text-gray-700 font-mono text-center pt-1">
          Taux officiel via BCE · Parallèle mis à jour manuellement
        </p>
      </div>

      {/* ── Conversion history ── */}
      <AnimatePresence>
        {history.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="dash-card p-4"
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[10px] text-gray-500 uppercase tracking-widest font-mono">
                Historique
              </h3>
              <button
                onClick={() => setHistory([])}
                className="text-[9px] text-gray-700 hover:text-gray-500 font-mono transition-colors"
              >
                Effacer
              </button>
            </div>
            <div className="space-y-1.5">
              {history.map((h, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.04 }}
                  className="flex items-center justify-between py-1.5 border-b border-gray-800/40 last:border-0"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] text-gray-700 font-mono">{h.ts}</span>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded font-mono ${
                      h.market === 'BNA'
                        ? 'bg-gray-800 text-gray-500'
                        : 'bg-amber-500/10 text-amber-500/70'
                    }`}>{h.market}</span>
                  </div>
                  <div className="text-xs font-mono text-gray-400">
                    <span className="text-gray-600">{h.from}</span>
                    <span className="text-gray-700 mx-1.5">→</span>
                    <span className="text-cyan-400">{h.to}</span>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Update rate manually ── */}
      <ParallelRateEditor
        currentRate={rates.parallel}
        onUpdate={newRate => setRates(r => ({ ...r, parallel: newRate, updated: 'Mis à jour maintenant' }))}
      />
    </motion.div>
  );
}

// ── Manual parallel rate editor ───────────────────────────────────
function ParallelRateEditor({ currentRate, onUpdate }: { currentRate: number; onUpdate: (r: number) => void }) {
  const [open,     setOpen]     = useState(false);
  const [editVal,  setEditVal]  = useState(String(currentRate));
  const [saved,    setSaved]    = useState(false);

  const handleSave = () => {
    const num = parseFloat(editVal);
    if (isNaN(num) || num < 100 || num > 1000) return;
    onUpdate(num);
    setSaved(true);
    setTimeout(() => { setSaved(false); setOpen(false); }, 1500);
  };

  return (
    <div className="dash-card p-4">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between text-left"
      >
        <span className="text-[10px] text-gray-600 font-mono uppercase tracking-widest">
          ✏ Modifier taux parallèle
        </span>
        <span className="text-gray-700 text-xs">{open ? '▲' : '▼'}</span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="pt-3 space-y-3">
              <p className="text-[10px] text-gray-600 font-mono">
                Entrez le taux parallèle actuel (DA pour 1 €)
              </p>
              <div className="flex gap-2">
                <input
                  type="number"
                  value={editVal}
                  onChange={e => setEditVal(e.target.value)}
                  placeholder="Ex: 238"
                  className="flex-1 bg-gray-950/80 border border-gray-700/60 rounded-lg px-3 py-2 text-sm font-mono text-white placeholder-gray-700 focus:outline-none focus:border-cyan-500/60 transition-colors"
                />
                <button
                  onClick={handleSave}
                  className={`px-4 py-2 rounded-lg font-mono text-xs font-bold transition-colors ${
                    saved
                      ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-400'
                      : 'bg-cyan-500/15 border border-cyan-500/40 text-cyan-400 hover:bg-cyan-500/25'
                  }`}
                >
                  {saved ? '✅' : 'OK'}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
