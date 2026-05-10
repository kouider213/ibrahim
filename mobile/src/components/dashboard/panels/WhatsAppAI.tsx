import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useWhatsAppAnalyze } from '../../../hooks/useDashboard.js';

const card = 'dash-card dash-glow p-4';

function InfoRow({ label, value }: { label: string; value: string | number | undefined | null }) {
  if (!value && value !== 0) return null;
  return (
    <div className="flex items-start gap-2 text-xs">
      <span className="text-gray-600 uppercase tracking-wider min-w-24">{label}</span>
      <span className="text-gray-200 font-mono">{String(value)}</span>
    </div>
  );
}

export default function WhatsAppAI() {
  const { result, loading, error, analyze, generateResponse } = useWhatsAppAnalyze();
  const [text, setText]       = useState('');
  const [age, setAge]         = useState('');
  const [response, setResponse] = useState<string | null>(null);
  const [copied, setCopied]   = useState(false);

  const handleAnalyze = () => {
    if (!text.trim()) return;
    analyze(text.trim(), age ? parseInt(age, 10) : undefined);
    setResponse(null);
  };

  const handleGenerateResponse = async () => {
    if (!result?.extracted) return;
    const msg = await generateResponse({
      client_name: result.extracted.client_name ?? 'Client',
      car_name:    result.extracted.car_preference ?? 'véhicule',
      start_date:  result.extracted.start_date,
      end_date:    result.extracted.end_date,
      final_price: result.extracted.budget,
    });
    setResponse(msg);
  };

  const copyToClipboard = (t: string) => {
    navigator.clipboard.writeText(t);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const intentColor = result?.is_booking_request ? 'text-emerald-400'
    : result?.is_complaint                       ? 'text-red-400'
    : 'text-gray-400';

  return (
    <motion.div
      className="space-y-4"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
    >
      <h2 className="text-cyan-400 font-mono text-lg font-bold tracking-widest uppercase">WhatsApp AI</h2>

      {/* Input area */}
      <div className={card}>
        <h3 className="text-xs text-gray-500 uppercase tracking-widest mb-3">Analyser un message</h3>
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Colle le message WhatsApp ici…"
          className="w-full bg-gray-900/60 border border-gray-700/50 rounded-lg p-3 text-sm text-gray-200 placeholder-gray-600 resize-none focus:outline-none focus:border-cyan-500/50 min-h-24"
        />
        <div className="flex gap-2 mt-3">
          <input
            type="number"
            value={age}
            onChange={e => setAge(e.target.value)}
            placeholder="Âge client (opt.)"
            className="w-32 bg-gray-900/60 border border-gray-700/50 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-cyan-500/50"
          />
          <button
            onClick={handleAnalyze}
            disabled={loading || !text.trim()}
            className="flex-1 bg-cyan-500/20 border border-cyan-500/40 text-cyan-400 rounded-lg py-2 text-sm font-mono uppercase tracking-wider hover:bg-cyan-500/30 transition-colors disabled:opacity-40"
          >
            {loading ? '⟳ Analyse…' : '⚡ Analyser'}
          </button>
        </div>
        {error && <p className="text-red-400 text-xs mt-2 font-mono">{error}</p>}
      </div>

      {/* Results */}
      <AnimatePresence>
        {result && (
          <motion.div
            className="space-y-3"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            {/* Age decline warning */}
            {result.age_check.should_decline && (
              <div className="dash-card border border-red-500/30 p-3">
                <p className="text-red-400 text-sm font-mono">
                  🔞 REFUS AUTOMATIQUE — {result.age_check.reason ?? 'client < 35 ans'}
                </p>
              </div>
            )}

            {/* Extracted info */}
            <div className={card}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs text-gray-500 uppercase tracking-widest">Extraction AI</h3>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-gray-600 font-mono">{result.language.toUpperCase()}</span>
                  <span className={`text-xs font-mono ${intentColor}`}>
                    {result.is_booking_request ? '📋 Réservation' : result.is_complaint ? '⚠ Plainte' : '💬 Info'}
                  </span>
                </div>
              </div>
              <div className="space-y-1.5">
                <InfoRow label="Client"     value={result.extracted.client_name} />
                <InfoRow label="Arrivée"    value={result.extracted.start_date} />
                <InfoRow label="Départ"     value={result.extracted.end_date} />
                <InfoRow label="Budget"     value={result.extracted.budget ? `${result.extracted.budget} DA` : null} />
                <InfoRow label="Âge"        value={result.extracted.age} />
                <InfoRow label="Véhicule"   value={result.extracted.car_preference} />
              </div>
            </div>

            {/* Suggested response */}
            <div className={card}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs text-gray-500 uppercase tracking-widest">Réponse suggérée</h3>
                <button
                  onClick={handleGenerateResponse}
                  disabled={loading}
                  className="text-xs text-violet-400 border border-violet-500/30 px-3 py-1 rounded-full hover:bg-violet-500/10 transition-colors"
                >
                  Personnaliser
                </button>
              </div>
              <p className="text-sm text-gray-300 leading-relaxed bg-gray-900/60 rounded-lg p-3">
                {response ?? result.suggested_response}
              </p>
              <button
                onClick={() => copyToClipboard(response ?? result.suggested_response)}
                className="mt-3 w-full text-xs text-cyan-400 border border-cyan-500/30 py-2 rounded-lg hover:bg-cyan-500/10 transition-colors font-mono"
              >
                {copied ? '✓ Copié !' : '📋 Copier la réponse'}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Quick age test */}
      <div className={`${card} border border-gray-800/50`}>
        <h3 className="text-xs text-gray-500 uppercase tracking-widest mb-2">Exemple rapide</h3>
        <button
          onClick={() => {
            setText("Bonjour, je voudrais louer une Mercedes pour le weekend. Je suis libre vendredi. Mon budget c'est 15000 DA.");
            setAge('28');
          }}
          className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
        >
          Charger message test (28 ans → refus)
        </button>
      </div>
    </motion.div>
  );
}
