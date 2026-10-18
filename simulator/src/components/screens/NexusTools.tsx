import { useCallback, useEffect, useState } from 'react';
import { business } from '../../services/api.ts';

// Ce que Nexus sait faire et qui manquait dans l'app : fichiers du PC portable, fenêtres ouvertes, télécommande musique,
// journal de Nexus, agents spécialisés et outils de dev. Les commandes « parlées » passent par onSay (même cerveau que le PC).

const C = {
  surface: '#0c1730', inner: 'rgba(5,12,28,0.6)', border: 'rgba(90,150,255,0.16)', accent: '#38d8f5',
  red: '#f87171', gold: '#fbbf24', text: '#f5f5f7', muted: '#8ea3c8', font: '-apple-system, "Segoe UI", Roboto, sans-serif',
};

type Entry = { name: string; type: string; size?: number | null; modified?: string; path?: string };
type Win = { pid: number; process: string; title: string };

const FOLDERS: Array<[string, string]> = [
  ['Bureau', 'OneDrive/Bureau'], ['Téléchargements', 'Downloads'], ['Documents', 'Documents'], ['Images', 'Pictures'], ['Vidéos', 'Videos'],
];
const AGENTS: Array<[string, string, string]> = [
  ['Stratège', 'stratège : ', 'Ex. : comment doubler les locations cet hiver ?'],
  ['Marketing', 'agent marketing : ', 'Ex. : idées de posts pour cette semaine'],
  ['Concurrents', 'analyse les concurrents ', 'Ex. : location voiture Oran'],
  ['Claude Code', 'claude tâche : ', 'Ex. : corrige le bug du formulaire de réservation'],
  ['Installer', 'installe ', 'Ex. : VLC'],
];

const fmtSize = (n?: number | null) => n == null ? '' : n < 1024 ? `${n} o` : n < 1_048_576 ? `${Math.round(n / 1024)} Ko` : `${(n / 1_048_576).toFixed(1)} Mo`;
const joinPath = (dir: string, name: string) => `${dir}${dir.includes('\\') ? '\\' : '/'}${name}`;
const parent = (p: string) => { const i = Math.max(p.lastIndexOf('\\'), p.lastIndexOf('/')); return i > 2 ? p.slice(0, i) : p; };

export default function NexusTools({ online, busy, onSay, flash }: {
  online: boolean; busy: boolean; onSay: (cmd: string) => void; flash: (m: string) => void;
}) {
  // ── Fichiers ──
  const [dir, setDir] = useState<string | null>(null);
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<string | null>(null);
  const [loading, setLoading] = useState('');

  const openDir = useCallback(async (path: string) => {
    setLoading('files'); setPicked(null);
    try {
      const r = await business.pcFiles(path);
      if (!r.ok) { flash(r.error ?? 'Dossier inaccessible'); return; }
      setDir(r.path ?? path);
      setEntries((r.entries ?? []).filter(e => !e.name.startsWith('.') && e.name !== 'desktop.ini')
        .sort((a, b) => a.type === b.type ? (b.modified ?? '').localeCompare(a.modified ?? '') : a.type === 'dir' ? -1 : 1));
    } catch { flash('PC injoignable'); } finally { setLoading(''); }
  }, [flash]);

  const search = async () => {
    if (!q.trim()) return;
    setLoading('files'); setPicked(null);
    try {
      const r = await business.pcFileSearch(q.trim(), dir ?? undefined);
      if (!r.ok) { flash(r.error ?? 'Recherche impossible'); return; }
      setEntries((r.results ?? []).map(x => ({ name: x.name, type: x.type, path: x.path })));
    } catch { flash('PC injoignable'); } finally { setLoading(''); }
  };

  const fileAct = async (action: 'open' | 'send', path: string) => {
    try {
      const r = await business.pcFileAction(action, path);
      flash(r.ok ? (action === 'open' ? 'Ouvert sur le PC' : 'Envoi sur Telegram en cours…') : (r.error ?? 'Échec'));
    } catch { flash('PC injoignable'); }
  };

  // ── Fenêtres ──
  const [wins, setWins] = useState<Win[] | null>(null);
  const loadWins = useCallback(async () => {
    setLoading('wins');
    try { const r = await business.pcWindows(); setWins(r.ok ? (r.windows ?? []).filter(w => w.title) : []); if (!r.ok) flash(r.error ?? 'Liste impossible'); }
    catch { flash('PC injoignable'); } finally { setLoading(''); }
  }, [flash]);
  const winAct = async (action: 'focus' | 'close', title: string) => {
    try {
      const r = await business.pcWindowAction(action, title);
      flash(r.ok ? (action === 'focus' ? 'Fenêtre au premier plan' : 'Fenêtre fermée') : (r.error ?? 'Échec'));
      if (r.ok && action === 'close') void loadWins();
    } catch { flash('PC injoignable'); }
  };

  // ── Journal ──
  const [journal, setJournal] = useState<Array<{ at: string; text: string }> | null>(null);
  useEffect(() => {
    let stop = false;
    const load = () => business.nexusJournal().then(r => { if (!stop) setJournal(r.items ?? []); }).catch(() => {});
    load();
    const t = setInterval(load, 30_000);
    return () => { stop = true; clearInterval(t); };
  }, []);

  // ── Musique / agents ──
  const [song, setSong] = useState('');
  const [agent, setAgent] = useState(0);
  const [task, setTask] = useState('');

  const off = !online;

  return (
    <>
      {/* Fichiers du PC */}
      <Card title="Fichiers du PC">
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 9 }}>
          {FOLDERS.map(([l, p]) => <Chip key={p} label={l} disabled={off} on={!!dir && dir.replace(/\\/g, '/').endsWith(p)} onClick={() => { void openDir(p); }} />)}
        </div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
          <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void search(); }} disabled={off}
            placeholder={dir ? 'Chercher dans ce dossier…' : 'Chercher sur le Bureau…'} style={inp} />
          <Btn label="Chercher" onClick={() => { void search(); }} disabled={off || !q.trim()} />
        </div>
        {dir && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, color: C.muted, margin: '2px 0 6px' }}>
            <button onClick={() => { void openDir(parent(dir)); }} style={{ ...ghost, padding: '3px 8px' }}>↑</button>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', direction: 'rtl', textAlign: 'left' }}>{dir}</span>
          </div>
        )}
        {loading === 'files' && <Muted>Chargement…</Muted>}
        {entries && loading !== 'files' && (
          <div style={{ maxHeight: 300, overflowY: 'auto', borderRadius: 10, background: C.inner, border: `1px solid ${C.border}` }}>
            {entries.length === 0 && <Muted pad>Rien ici.</Muted>}
            {entries.slice(0, 200).map(e => {
              const full = e.path ?? (dir ? joinPath(dir, e.name) : e.name);
              const isDir = e.type === 'dir';
              return (
                <div key={full} style={{ borderBottom: `1px solid ${C.border}` }}>
                  <button onClick={() => { if (isDir) void openDir(full); else setPicked(picked === full ? null : full); }} style={{
                    display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '9px 11px', background: picked === full ? 'rgba(56,216,245,0.08)' : 'transparent',
                    border: 'none', color: C.text, fontFamily: C.font, fontSize: 13, textAlign: 'left', cursor: 'pointer',
                  }}>
                    <span style={{ width: 18, textAlign: 'center', color: isDir ? C.gold : C.accent }}>{isDir ? '▸' : '•'}</span>
                    <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.name}</span>
                    <span style={{ fontSize: 13.5, color: C.muted, flexShrink: 0 }}>{isDir ? '' : fmtSize(e.size)}</span>
                  </button>
                  {picked === full && (
                    <div style={{ display: 'flex', gap: 6, padding: '0 11px 10px 39px' }}>
                      <Btn label="Ouvrir sur le PC" onClick={() => { void fileAct('open', full); }} />
                      <Btn label="Recevoir sur Telegram" onClick={() => { void fileAct('send', full); }} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {!entries && loading !== 'files' && <Muted>Choisis un dossier. Les fichiers jusqu'à 20 Mo peuvent t'être envoyés sur Telegram.</Muted>}
      </Card>

      {/* Fenêtres ouvertes */}
      <Card title="Fenêtres ouvertes" right={<Btn label={wins ? 'Actualiser' : 'Afficher'} onClick={() => { void loadWins(); }} disabled={off || loading === 'wins'} />}>
        {loading === 'wins' && <Muted>Chargement…</Muted>}
        {wins && loading !== 'wins' && (wins.length === 0 ? <Muted>Aucune fenêtre ouverte.</Muted> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {wins.map(w => (
              <div key={`${w.pid}-${w.title}`} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 10, background: C.inner, border: `1px solid ${C.border}` }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.title}</div>
                  <div style={{ fontSize: 13.5, color: C.muted }}>{w.process}</div>
                </div>
                <Btn label="Afficher" onClick={() => { void winAct('focus', w.title); }} />
                <Btn label="Fermer" color={C.red} onClick={() => { void winAct('close', w.title); }} />
              </div>
            ))}
          </div>
        ))}
        {!wins && loading !== 'wins' && <Muted>Voir ce qui est ouvert sur le PC, le mettre devant ou le fermer.</Muted>}
      </Card>

      {/* Musique */}
      <Card title="Musique sur le PC">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 7, marginBottom: 9 }}>
          <Big label="⏮" sub="Précédent" disabled={off || busy} onClick={() => onSay('chanson précédente')} />
          <Big label="⏯" sub="Pause / lecture" disabled={off || busy} onClick={() => onSay('pause')} />
          <Big label="⏭" sub="Suivant" disabled={off || busy} onClick={() => onSay('chanson suivante')} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 6, marginBottom: 9 }}>
          {[20, 40, 60, 80].map(v => <Chip key={v} label={`🔊 ${v} %`} disabled={off || busy} onClick={() => onSay(`volume ${v}`)} />)}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <input value={song} onChange={e => setSong(e.target.value)} disabled={off} placeholder="Artiste, titre, playlist…" style={inp} />
          <Btn label="Spotify" disabled={off || busy || !song.trim()} onClick={() => { onSay(`mets ${song.trim()} sur spotify`); setSong(''); }} />
          <Btn label="YouTube" disabled={off || busy || !song.trim()} onClick={() => { onSay(`mets ${song.trim()} sur youtube`); setSong(''); }} />
        </div>
      </Card>

      {/* Agents & dev */}
      <Card title="Agents et développement">
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 9 }}>
          {AGENTS.map(([l], i) => <Chip key={l} label={l} on={agent === i} onClick={() => setAgent(i)} />)}
        </div>
        <textarea value={task} onChange={e => setTask(e.target.value)} disabled={off} rows={2} placeholder={AGENTS[agent]![2]}
          style={{ ...inp, width: '100%', resize: 'vertical', minHeight: 54, marginBottom: 8 }} />
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <Btn label={`Lancer ${AGENTS[agent]![0]}`} disabled={off || busy || !task.trim()} onClick={() => { onSay(`${AGENTS[agent]![1]}${task.trim()}`); setTask(''); }} />
          <Btn label="Git : état" disabled={off || busy} onClick={() => onSay('git status')} />
          <Btn label="Revue du code" disabled={off || busy} onClick={() => onSay('review le code')} />
        </div>
      </Card>

      {/* Journal */}
      <Card title="Journal de Nexus">
        {!journal && <Muted>Chargement…</Muted>}
        {journal && journal.length === 0 && <Muted>Rien depuis le dernier redémarrage du serveur.</Muted>}
        {journal && journal.length > 0 && (
          <div style={{ maxHeight: 260, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
            {journal.slice(0, 60).map((j, i) => (
              <div key={`${j.at}-${i}`} style={{ display: 'flex', gap: 10, fontSize: 12.5, lineHeight: 1.4, padding: '6px 2px', borderBottom: `1px solid ${C.border}` }}>
                <span style={{ fontFamily: 'Orbitron', fontSize: 13.5, color: C.accent, flexShrink: 0, paddingTop: 2 }}>
                  {new Date(j.at).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                </span>
                <span style={{ color: C.text, wordBreak: 'break-word' }}>{j.text}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}

const inp: React.CSSProperties = {
  flex: 1, minWidth: 0, padding: '10px 12px', borderRadius: 10, border: `1px solid ${C.border}`, background: 'rgba(255,255,255,0.04)',
  color: C.text, fontFamily: C.font, fontSize: 16, outline: 'none',
};
const ghost: React.CSSProperties = { borderRadius: 8, border: `1px solid ${C.border}`, background: 'transparent', color: C.muted, fontFamily: C.font, cursor: 'pointer' };

function Card({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: 13, marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10, minHeight: 20 }}>
        <div style={{ flex: 1, fontSize: 12, fontWeight: 700, color: C.muted, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{title}</div>
        {right}
      </div>
      {children}
    </div>
  );
}
function Muted({ children, pad }: { children: React.ReactNode; pad?: boolean }) {
  return <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.45, padding: pad ? 12 : 0 }}>{children}</div>;
}
function Chip({ label, onClick, on, disabled }: { label: string; onClick: () => void; on?: boolean; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      padding: '7px 11px', borderRadius: 999, border: `1px solid ${on ? C.accent : C.border}`, background: on ? 'rgba(56,216,245,0.16)' : 'rgba(255,255,255,0.04)',
      color: on ? C.accent : C.text, fontSize: 12, fontFamily: C.font, cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.4 : 1, whiteSpace: 'nowrap',
    }}>{label}</button>
  );
}
function Btn({ label, onClick, disabled, color = C.accent }: { label: string; onClick: () => void; disabled?: boolean; color?: string }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      padding: '9px 12px', borderRadius: 10, border: `1px solid ${color}55`, background: `${color}1a`, color, fontSize: 12.5, fontWeight: 600,
      fontFamily: C.font, cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.4 : 1, flexShrink: 0, whiteSpace: 'nowrap',
    }}>{label}</button>
  );
}
function Big({ label, sub, onClick, disabled }: { label: string; sub: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '12px 4px 9px', borderRadius: 12, border: `1px solid ${C.border}`,
      background: 'rgba(56,216,245,0.05)', color: C.text, fontFamily: C.font, cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.4 : 1,
    }}>
      <span style={{ fontSize: 20, color: C.accent }}>{label}</span>
      <span style={{ fontSize: 13.5, color: C.muted }}>{sub}</span>
    </button>
  );
}
