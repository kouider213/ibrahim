import { useState } from 'react';
import { motion } from 'framer-motion';
import { useTikTok, useTikTokHook, type PostingWindow, type TikTokIdea } from '../../../hooks/useDashboard.js';

const card = 'dash-card dash-glow p-4';

function ScoreBar({ score }: { score: number }) {
  const color = score >= 80 ? 'from-emerald-500 to-cyan-500'
    : score >= 60          ? 'from-cyan-500 to-violet-500'
    : 'from-violet-500 to-gray-600';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
        <motion.div
          className={`h-full rounded-full bg-gradient-to-r ${color}`}
          initial={{ width: 0 }}
          animate={{ width: `${score}%` }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        />
      </div>
      <span className="font-mono text-xs text-gray-400 w-8 text-right">{score}</span>
    </div>
  );
}

function WindowCard({ w, i }: { w: PostingWindow; i: number }) {
  return (
    <motion.div
      className={card}
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: i * 0.06 }}
    >
      <div className="flex items-center justify-between mb-1">
        <div>
          <span className="text-sm text-gray-200 font-medium">{w.day}</span>
          <span className="text-cyan-400 font-mono text-xs ml-2">{w.time}</span>
        </div>
        <span className={`font-mono text-sm font-bold ${w.score >= 80 ? 'text-emerald-400' : 'text-amber-400'}`}>
          {w.score}
        </span>
      </div>
      <p className="text-[11px] text-gray-500">{w.reason}</p>
    </motion.div>
  );
}

function IdeaCard({ idea, i }: { idea: TikTokIdea; i: number }) {
  const [copied, setCopied] = useState(false);
  return (
    <motion.div
      className={card}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: i * 0.08 }}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <p className="text-sm text-gray-200 leading-snug flex-1">"{idea.hook}"</p>
        <button
          onClick={() => { navigator.clipboard.writeText(idea.hook); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
          className="text-[10px] text-cyan-400 border border-cyan-500/30 px-2 py-0.5 rounded-full shrink-0"
        >
          {copied ? '✓' : '📋'}
        </button>
      </div>
      <div className="flex items-center justify-between mt-1">
        <span className="text-[10px] text-violet-400 uppercase font-mono">{idea.style}</span>
        <ScoreBar score={idea.virality_score} />
      </div>
    </motion.div>
  );
}

export default function TikTokAI() {
  const { data, loading }               = useTikTok();
  const { hook, loading: hookLoading, generate } = useTikTokHook();
  const [carName, setCarName]           = useState('');
  const [style, setStyle]               = useState<'lifestyle' | 'prix' | 'temoignage'>('prix');
  const [hookCopied, setHookCopied]     = useState(false);

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-cyan-400 font-mono text-sm">
      <span className="data-tick">⟳ Chargement TikTok…</span>
    </div>
  );

  const d = data!;

  return (
    <motion.div
      className="space-y-4"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
    >
      <div className="flex items-center justify-between">
        <h2 className="text-cyan-400 font-mono text-lg font-bold tracking-widest uppercase">TikTok AI</h2>
        <div className="text-right">
          <div className="font-mono text-xl font-bold text-violet-400">{d.current_virality_score}</div>
          <div className="text-[10px] text-gray-600 uppercase">Virality Score</div>
        </div>
      </div>

      {/* Best windows */}
      <div>
        <h3 className="text-xs text-gray-500 uppercase tracking-widest mb-2">Meilleurs horaires de post</h3>
        <div className="space-y-2">
          {d.best_posting_windows.slice(0, 4).map((w, i) => (
            <WindowCard key={`${w.day}-${w.time}`} w={w} i={i} />
          ))}
        </div>
      </div>

      {/* Hook generator */}
      <div className={card}>
        <h3 className="text-xs text-gray-500 uppercase tracking-widest mb-3">Générateur de hook viral</h3>
        <div className="space-y-2">
          <input
            value={carName}
            onChange={e => setCarName(e.target.value)}
            placeholder="Nom du véhicule (ex: Mercedes C200)"
            className="w-full bg-gray-900/60 border border-gray-700/50 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-cyan-500/50"
          />
          <div className="flex gap-2">
            {(['prix', 'lifestyle', 'temoignage'] as const).map(s => (
              <button
                key={s}
                onClick={() => setStyle(s)}
                className={`flex-1 text-xs py-1.5 rounded-lg font-mono uppercase border transition-colors ${
                  style === s
                    ? 'bg-violet-500/20 border-violet-500/50 text-violet-400'
                    : 'border-gray-700/50 text-gray-500 hover:text-gray-300'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
          <button
            onClick={() => carName.trim() && generate(carName.trim(), style)}
            disabled={hookLoading || !carName.trim()}
            className="w-full bg-violet-500/20 border border-violet-500/40 text-violet-400 rounded-lg py-2 text-sm font-mono uppercase tracking-wider hover:bg-violet-500/30 transition-colors disabled:opacity-40"
          >
            {hookLoading ? '⟳ Génération…' : '⚡ Générer hook'}
          </button>
        </div>
        {hook && (
          <motion.div
            className="mt-3 bg-gray-900/60 rounded-lg p-3"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <p className="text-sm text-emerald-400 font-medium">"{hook}"</p>
            <button
              onClick={() => { navigator.clipboard.writeText(hook); setHookCopied(true); setTimeout(() => setHookCopied(false), 2000); }}
              className="mt-2 text-xs text-cyan-400 font-mono"
            >
              {hookCopied ? '✓ Copié !' : '📋 Copier'}
            </button>
          </motion.div>
        )}
      </div>

      {/* Generated ideas */}
      <div>
        <h3 className="text-xs text-gray-500 uppercase tracking-widest mb-2">Idées vidéos AI</h3>
        <div className="space-y-2">
          {d.ideas.map((idea, i) => (
            <IdeaCard key={i} idea={idea} i={i} />
          ))}
        </div>
      </div>
    </motion.div>
  );
}
