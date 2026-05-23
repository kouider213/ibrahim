import { useState, useEffect, useRef, useCallback } from 'react';
import { business } from '../../services/api.ts';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ActionLog { time: string; cmd: string; result: string; ok: boolean; }

// ── Main screen ───────────────────────────────────────────────────────────────

export default function NexusScreen() {
  const [connected,   setConnected]   = useState<boolean | null>(null);
  const [hostname,    setHostname]    = useState('...');
  const [latency,     setLatency]     = useState<number | null>(null);
  const [screenImg,   setScreenImg]   = useState<string | null>(null);
  const [imgTs,       setImgTs]       = useState<string>('—');
  const [imgKb,       setImgKb]       = useState<number | null>(null);
  const [screenW,     setScreenW]     = useState(1920);
  const [screenH,     setScreenH]     = useState(1080);
  const [liveMode,    setLiveMode]    = useState(false);
  const [capturing,   setCapturing]   = useState(false);
  const [quality,     setQuality]     = useState(50);
  const [scale,       setScale]       = useState(0.5);
  const [fullscreen,  setFullscreen]  = useState(false);
  const [logs,        setLogs]        = useState<ActionLog[]>([]);
  const [cmd,         setCmd]         = useState('');
  const [cmdRunning,  setCmdRun]      = useState(false);
  const [kbText,      setKbText]      = useState('');
  const [secLock,     setSecLock]     = useState(false);
  const [clickMode,   setClickMode]   = useState<'left' | 'right' | 'double'>('left');

  const imgRef      = useRef<HTMLImageElement>(null);
  const liveTimer   = useRef<ReturnType<typeof setInterval> | null>(null);
  const statusTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Log helper ─────────────────────────────────────────────────────────────
  const addLog = useCallback((cmd: string, result: string, ok: boolean) => {
    const time = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setLogs(prev => [{ time, cmd, result, ok }, ...prev].slice(0, 20));
  }, []);

  // ── Status check ───────────────────────────────────────────────────────────
  const checkStatus = useCallback(async () => {
    try {
      const t0 = Date.now();
      const r = await business.nexus();
      const lat = Date.now() - t0;
      setConnected(r.nexus_online || r.connected || false);
      setHostname(r.hostname ?? 'PC-Kouider');
      setLatency(lat);
    } catch { setConnected(false); }
  }, []);

  useEffect(() => {
    void checkStatus();
    // Get screen size once
    business.nexusGetScreenSize().then(r => {
      if (r.ok && r.width) { setScreenW(r.width); setScreenH(r.height ?? 1080); }
    }).catch(() => {});
    statusTimer.current = setInterval(checkStatus, 15000);
    return () => { if (statusTimer.current) clearInterval(statusTimer.current); };
  }, [checkStatus]);

  // ── Screenshot capture ─────────────────────────────────────────────────────
  const capture = useCallback(async () => {
    if (capturing || !connected) return;
    setCapturing(true);
    try {
      const r = await business.nexusCapture(quality, scale);
      if (r.ok && r.image_base64) {
        setScreenImg(`data:image/jpeg;base64,${r.image_base64}`);
        setImgTs(r.timestamp ? new Date(r.timestamp).toLocaleTimeString('fr-FR') : new Date().toLocaleTimeString('fr-FR'));
        setImgKb(r.size_kb ?? null);
      }
    } catch { /* silent */ }
    finally { setCapturing(false); }
  }, [capturing, connected, quality, scale]);

  // ── Live mode ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (liveMode) {
      void capture();
      liveTimer.current = setInterval(() => { void capture(); }, 1800);
    } else {
      if (liveTimer.current) clearInterval(liveTimer.current);
    }
    return () => { if (liveTimer.current) clearInterval(liveTimer.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveMode]);

  // ── Click on live screen → mouse click on PC ──────────────────────────────
  const handleScreenClick = useCallback((e: React.MouseEvent<HTMLImageElement>) => {
    if (!connected || secLock) return;
    const rect   = imgRef.current!.getBoundingClientRect();
    const relX   = (e.clientX - rect.left) / rect.width;
    const relY   = (e.clientY - rect.top)  / rect.height;
    const pcX    = Math.round(relX * screenW);
    const pcY    = Math.round(relY * screenH);
    business.nexusMouseClick(pcX, pcY, clickMode).then(r => {
      addLog(`${clickMode === 'double' ? 'DblClic' : clickMode === 'right' ? 'R-Clic' : 'Clic'} (${pcX},${pcY})`, r.result ?? '✅', r.ok);
    }).catch(() => {});
  }, [connected, secLock, clickMode, screenW, screenH, addLog]);

  // ── Quick actions ─────────────────────────────────────────────────────────
  const quickAction = useCallback(async (label: string, fn: () => Promise<{ ok: boolean; result?: string; stdout?: string; stderr?: string }>) => {
    if (!connected) return;
    try {
      const r = await fn();
      addLog(label, r.result ?? r.stdout ?? '✅', r.ok);
    } catch (err) { addLog(label, String(err), false); }
  }, [connected, addLog]);

  // ── Run command ───────────────────────────────────────────────────────────
  const runCmd = async () => {
    if (!cmd.trim() || cmdRunning || !connected) return;
    setCmdRun(true);
    try {
      const r = await business.nexusRunCommand(cmd.trim());
      addLog(cmd.trim(), (r.stdout || r.stderr || '✅').slice(0, 80), r.ok);
      setCmd('');
    } catch (err) { addLog(cmd, String(err), false); }
    finally { setCmdRun(false); }
  };

  // ── Send keyboard text ────────────────────────────────────────────────────
  const sendText = async () => {
    if (!kbText.trim() || !connected) return;
    const r = await business.nexusTypeText(kbText);
    addLog(`Type: "${kbText}"`, r.result ?? '✅', r.ok);
    setKbText('');
  };

  const connCol = connected === null ? '#ffb347' : connected ? '#00e676' : '#ff3366';
  const connTxt = connected === null ? 'VÉRIFICATION…' : connected ? 'CONNECTÉ' : 'HORS LIGNE';

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#020810', color: '#fff', fontFamily: 'Share Tech Mono', overflow: 'hidden' }}>
      <Corner pos="tl" /><Corner pos="tr" /><Corner pos="bl" /><Corner pos="br" />

      {/* Header */}
      <div style={{ padding: '8px 12px 0', flexShrink: 0 }}>
        <div style={{ fontFamily: 'Orbitron', fontSize: 11, color: '#00d4ff', letterSpacing: '0.3em', fontWeight: 700, textAlign: 'center', textShadow: '0 0 12px #00d4ff55' }}>
          NEXUS PC
        </div>
        <div style={{ fontFamily: 'Orbitron', fontSize: 6, color: '#00d4ff44', letterSpacing: '0.25em', textAlign: 'center', marginBottom: 6 }}>
          CONTRÔLE DISTANT SÉCURISÉ
        </div>

        {/* Status bar */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
          <StatusChip label="ÉTAT NEXUS" val={connTxt} col={connCol} icon="🤖" />
          <StatusChip label="PC" val={hostname} col="#00d4ff" icon="💻" />
          <StatusChip label="LATENCE" val={latency !== null ? `${latency}ms` : '—'} col="#ffb347" icon="⚡" />
          <div
            onClick={() => { void checkStatus(); void capture(); }}
            style={{ flexShrink: 0, background: 'rgba(0,212,255,0.08)', border: '1px solid #00d4ff22', borderRadius: 6, padding: '4px 6px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}
          >
            <span style={{ fontSize: 8 }}>{capturing ? '⏳' : '🔄'}</span>
            <span style={{ fontFamily: 'Orbitron', fontSize: 4, color: '#00d4ff55', letterSpacing: '0.1em' }}>ACTU</span>
          </div>
        </div>
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 10px 8px' }}>

        {/* Live screen */}
        <div style={{ marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <div style={{ fontFamily: 'Orbitron', fontSize: 7, color: '#00d4ff66', letterSpacing: '0.2em' }}>
              📺 ÉCRAN DU PC EN DIRECT
            </div>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              {imgKb && <span style={{ fontSize: 7, color: '#ffffff22' }}>{imgKb}KB</span>}
              <span style={{ fontSize: 7, color: '#ffffff22' }}>{imgTs}</span>
              <button
                onClick={() => setFullscreen(f => !f)}
                style={{ ...miniBtn('#00d4ff') }}
              >{fullscreen ? '⊡' : '⊞'}</button>
              <button
                onClick={() => setLiveMode(l => !l)}
                style={{ ...miniBtn(liveMode ? '#00e676' : '#ffffff33'), fontSize: 6 }}
              >{liveMode ? '⏹ STOP' : '▶ LIVE'}</button>
              <button onClick={() => void capture()} style={{ ...miniBtn('#00d4ff') }}>📸</button>
            </div>
          </div>

          {/* Screen display */}
          <div style={{
            position: 'relative',
            background: '#000',
            borderRadius: 8,
            border: `1px solid ${connected ? '#00d4ff33' : '#ff336622'}`,
            overflow: 'hidden',
            height: fullscreen ? 220 : 150,
          }}>
            {screenImg ? (
              <img
                ref={imgRef}
                src={screenImg}
                alt="PC Screen"
                onClick={handleScreenClick}
                style={{
                  width: '100%', height: '100%', objectFit: 'contain',
                  cursor: secLock ? 'not-allowed' : clickMode === 'right' ? 'context-menu' : 'crosshair',
                  display: 'block',
                }}
              />
            ) : (
              <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 6 }}>
                <div style={{ fontFamily: 'Orbitron', fontSize: 8, color: '#00d4ff22', letterSpacing: '0.2em' }}>
                  {connected ? '📸 CLIQUER POUR CAPTURER' : '🔴 NEXUS HORS LIGNE'}
                </div>
                {connected && (
                  <button onClick={() => void capture()} style={{ ...btnStyle('#00d4ff'), fontSize: 7, padding: '4px 10px' }}>
                    CAPTURER L'ÉCRAN
                  </button>
                )}
              </div>
            )}
            {capturing && (
              <div style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(0,212,255,0.2)', borderRadius: 4, padding: '2px 5px', fontSize: 7, color: '#00d4ff' }}>
                ⏳
              </div>
            )}
            {secLock && (
              <div style={{ position: 'absolute', inset: 0, background: 'rgba(255,51,102,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontFamily: 'Orbitron', fontSize: 9, color: '#ff3366', letterSpacing: '0.2em' }}>🔒 VERROUILLÉ</span>
              </div>
            )}
          </div>

          {/* Click mode selector */}
          <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
            {(['left', 'right', 'double'] as const).map(m => (
              <button key={m} onClick={() => setClickMode(m)} style={{
                flex: 1, padding: '4px 0', fontFamily: 'Orbitron', fontSize: 5, letterSpacing: '0.1em',
                background: clickMode === m ? 'rgba(0,212,255,0.15)' : 'rgba(0,212,255,0.03)',
                border: `1px solid ${clickMode === m ? '#00d4ff88' : '#00d4ff18'}`,
                borderRadius: 6, color: clickMode === m ? '#00d4ff' : '#ffffff44', cursor: 'pointer',
              }}>
                {m === 'left' ? '👆 CLIC' : m === 'right' ? '👆 DROIT' : '👆 DBL'}
              </button>
            ))}
          </div>
        </div>

        {/* Touch control guide */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 8, flexWrap: 'wrap' }}>
          {[
            { icon: '☝️', label: 'TOUCHER', sub: '= CLIC GAUCHE' },
            { icon: '☝️☝️', label: 'DOUBLE TAP', sub: '= DOUBLE CLIC' },
            { icon: '✌️', label: 'APPUI LONG', sub: '= CLIC DROIT' },
            { icon: '🖐️', label: 'GLISSER', sub: '= CURSEUR' },
          ].map(g => (
            <div key={g.label} style={{ flex: '1 0 40%', background: 'rgba(0,212,255,0.03)', borderRadius: 6, padding: '4px 6px', border: '1px solid #00d4ff10', textAlign: 'center' }}>
              <div style={{ fontSize: 9 }}>{g.icon}</div>
              <div style={{ fontFamily: 'Orbitron', fontSize: 5, color: '#00d4ff66', letterSpacing: '0.1em' }}>{g.label}</div>
              <div style={{ fontSize: 5, color: '#ffffff33', marginTop: 1 }}>{g.sub}</div>
            </div>
          ))}
        </div>

        {/* Quick actions */}
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontFamily: 'Orbitron', fontSize: 6, color: '#00d4ff44', letterSpacing: '0.2em', marginBottom: 5 }}>ACTIONS RAPIDES</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 }}>
            {[
              { icon: '🌐', label: 'CHROME',   fn: () => business.nexusRunCommand('start chrome') },
              { icon: '📝', label: 'VS CODE',  fn: () => business.nexusRunCommand('code') },
              { icon: '🐙', label: 'GITHUB',   fn: () => business.nexusRunCommand('start https://github.com') },
              { icon: '🤖', label: 'CLAUDE',   fn: () => business.nexusRunCommand('claude') },
              { icon: '📸', label: 'CAPTURE',  fn: () => capture().then(() => ({ ok: true })) },
              { icon: '⌨️', label: 'TERMINAL', fn: () => business.nexusRunCommand('wt.exe') },
              { icon: '🔄', label: 'NEXUS', col: '#ff8800', fn: () => business.nexusRunCommand('taskkill /F /IM python.exe') },
              { icon: '🔒', label: 'VERROU', col: '#ff3366', fn: () => Promise.resolve({ ok: true, result: 'Contrôle verrouillé' }) },
            ].map((a, i) => (
              <button
                key={a.label}
                onClick={() => {
                  if (a.label === 'VERROU') { setSecLock(l => !l); addLog('Contrôle', secLock ? 'Déverrouillé' : 'Verrouillé', true); return; }
                  if (a.label === 'CAPTURE') { void capture(); return; }
                  void quickAction(a.label, a.fn as () => Promise<{ ok: boolean; result?: string; stdout?: string; stderr?: string }>);
                }}
                disabled={!connected && a.label !== 'VERROU'}
                style={{
                  background: i === 6 ? 'rgba(255,136,0,0.08)' : i === 7 ? (secLock ? 'rgba(255,51,102,0.15)' : 'rgba(255,51,102,0.06)') : 'rgba(0,212,255,0.06)',
                  border: `1px solid ${i === 6 ? '#ff880022' : i === 7 ? '#ff336633' : '#00d4ff18'}`,
                  borderRadius: 8, padding: '6px 2px',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                  cursor: connected ? 'pointer' : 'default', opacity: connected ? 1 : 0.4,
                }}
              >
                <span style={{ fontSize: 14 }}>{a.label === 'VERROU' && secLock ? '🔓' : a.icon}</span>
                <span style={{ fontFamily: 'Orbitron', fontSize: 4.5, color: i === 6 ? '#ff8800' : i === 7 ? '#ff3366' : '#00d4ff77', letterSpacing: '0.05em' }}>
                  {a.label === 'NEXUS' ? 'RESTART' : a.label}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Command input */}
        <div style={{ marginBottom: 8, background: 'rgba(0,212,255,0.02)', borderRadius: 10, padding: 10, border: '1px solid #00d4ff12' }}>
          <div style={{ fontFamily: 'Orbitron', fontSize: 6, color: '#00d4ff55', letterSpacing: '0.2em', marginBottom: 6 }}>COMMANDE RAPIDE</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              value={cmd}
              onChange={e => setCmd(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && void runCmd()}
              placeholder="Écrivez une commande…"
              disabled={!connected || secLock}
              style={{ ...inputSt, flex: 1 }}
            />
            <button onClick={() => void runCmd()} disabled={!connected || !cmd.trim() || cmdRunning || secLock} style={{ ...btnStyle('#00d4ff'), padding: '4px 10px', fontSize: 10 }}>
              {cmdRunning ? '⏳' : '▶'}
            </button>
          </div>
          {/* Quick chips */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
            {['ouvre Chrome', 'lance Claude Code', 'fais une capture', 'ouvre VS Code', 'exécute npm run build'].map(q => (
              <button key={q} onClick={() => setCmd(q)} style={{
                background: 'rgba(0,212,255,0.05)', border: '1px solid #00d4ff18', borderRadius: 12,
                padding: '3px 8px', fontSize: 7, color: '#00d4ff55', cursor: 'pointer', fontFamily: 'Share Tech Mono',
              }}>
                {q}
              </button>
            ))}
          </div>
        </div>

        {/* Mouse directional pad */}
        <div style={{ marginBottom: 8, background: 'rgba(0,212,255,0.02)', borderRadius: 10, padding: 10, border: '1px solid #00d4ff12' }}>
          <div style={{ fontFamily: 'Orbitron', fontSize: 6, color: '#00d4ff55', letterSpacing: '0.2em', marginBottom: 6, textAlign: 'center' }}>CONTRÔLE SOURIS</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4, maxWidth: 160, margin: '0 auto' }}>
            <div />
            <button onClick={() => business.nexusMouseScroll('up').then(r => addLog('Scroll ↑', r.result ?? '✅', r.ok))} style={padBtn}>↑</button>
            <div />
            <button onClick={() => {/* move left - would need position tracking */}} style={{ ...padBtn, opacity: 0.3 }}>←</button>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#00d4ff33', border: '1px solid #00d4ff55' }} />
            </div>
            <button onClick={() => {/* move right */}} style={{ ...padBtn, opacity: 0.3 }}>→</button>
            <div />
            <button onClick={() => business.nexusMouseScroll('down').then(r => addLog('Scroll ↓', r.result ?? '✅', r.ok))} style={padBtn}>↓</button>
            <div />
          </div>
          <div style={{ display: 'flex', gap: 4, marginTop: 6, justifyContent: 'center' }}>
            <button onClick={() => business.nexusMouseClick(0, 0, 'left').catch(() => {})} style={{ ...padBtn, padding: '4px 12px', fontSize: 7 }}>L-CLK</button>
            <button onClick={() => business.nexusMouseClick(0, 0, 'right').catch(() => {})} style={{ ...padBtn, padding: '4px 12px', fontSize: 7 }}>R-CLK</button>
          </div>
        </div>

        {/* Virtual keyboard — type text */}
        <div style={{ marginBottom: 8, background: 'rgba(0,212,255,0.02)', borderRadius: 10, padding: 10, border: '1px solid #00d4ff12' }}>
          <div style={{ fontFamily: 'Orbitron', fontSize: 6, color: '#00d4ff55', letterSpacing: '0.2em', marginBottom: 6 }}>CLAVIER VIRTUEL</div>

          {/* Text input row */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
            <input
              value={kbText}
              onChange={e => setKbText(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && void sendText()}
              placeholder="Texte à taper sur le PC…"
              disabled={!connected || secLock}
              style={{ ...inputSt, flex: 1 }}
            />
            <button onClick={() => void sendText()} disabled={!connected || !kbText || secLock} style={{ ...btnStyle('#00e676'), padding: '4px 8px', fontSize: 9 }}>⌤</button>
          </div>

          {/* AZERTY rows */}
          {[
            ['A','Z','E','R','T','Y','U','I','O','P'],
            ['Q','S','D','F','G','H','J','K','L','M'],
            ['W','X','C','V','B','N',',',';','!','_'],
          ].map((row, ri) => (
            <div key={ri} style={{ display: 'flex', gap: 2, marginBottom: 3, justifyContent: 'center' }}>
              {row.map(k => (
                <button
                  key={k}
                  onClick={() => connected && !secLock && business.nexusKeyPress(k).then(r => addLog(`Key: ${k}`, r.result ?? '✅', r.ok)).catch(() => {})}
                  style={{ width: 28, height: 24, background: 'rgba(0,212,255,0.06)', border: '1px solid #00d4ff15', borderRadius: 5, color: '#c8e8ff', fontSize: 9, cursor: connected && !secLock ? 'pointer' : 'not-allowed', fontFamily: 'Share Tech Mono' }}
                >
                  {k}
                </button>
              ))}
            </div>
          ))}

          {/* Special keys */}
          <div style={{ display: 'flex', gap: 3, justifyContent: 'center', marginTop: 3 }}>
            {[
              { label: '123', key: '' },
              { label: 'ESPACE', key: 'space' },
              { label: '⌫', key: 'backspace' },
              { label: '↵', key: 'enter' },
            ].map(k => (
              <button
                key={k.label}
                onClick={() => k.key && connected && !secLock && business.nexusKeyPress(k.key).then(r => addLog(`Key: ${k.label}`, r.result ?? '✅', r.ok)).catch(() => {})}
                style={{ flex: k.label === 'ESPACE' ? 3 : 1, height: 24, background: 'rgba(0,212,255,0.04)', border: '1px solid #00d4ff12', borderRadius: 5, color: '#ffffff55', fontSize: 8, cursor: k.key && connected && !secLock ? 'pointer' : 'default', fontFamily: 'Share Tech Mono' }}
              >
                {k.label}
              </button>
            ))}
          </div>

          {/* Hotkeys */}
          <div style={{ display: 'flex', gap: 3, marginTop: 5, flexWrap: 'wrap' }}>
            {[
              { label: 'Ctrl+C', keys: ['ctrl', 'c'] },
              { label: 'Ctrl+V', keys: ['ctrl', 'v'] },
              { label: 'Ctrl+Z', keys: ['ctrl', 'z'] },
              { label: 'Ctrl+A', keys: ['ctrl', 'a'] },
              { label: 'Alt+F4', keys: ['alt', 'f4'] },
              { label: 'Win',    keys: ['win'] },
              { label: 'Esc',    keys: ['esc'] },
              { label: 'Tab',    keys: ['tab'] },
            ].map(hk => (
              <button
                key={hk.label}
                onClick={() => connected && !secLock && business.nexusHotkey(hk.keys).then(r => addLog(hk.label, r.result ?? '✅', r.ok)).catch(() => {})}
                style={{ background: 'rgba(255,183,71,0.06)', border: '1px solid #ffb34718', borderRadius: 6, padding: '3px 7px', fontSize: 7, color: '#ffb34777', cursor: connected && !secLock ? 'pointer' : 'default', fontFamily: 'Orbitron', letterSpacing: '0.05em' }}
              >
                {hk.label}
              </button>
            ))}
          </div>
        </div>

        {/* Action history */}
        <div style={{ marginBottom: 8, background: 'rgba(0,212,255,0.02)', borderRadius: 10, padding: 10, border: '1px solid #00d4ff12' }}>
          <div style={{ fontFamily: 'Orbitron', fontSize: 6, color: '#00d4ff55', letterSpacing: '0.2em', marginBottom: 6 }}>HISTORIQUE DES ACTIONS</div>
          {logs.length === 0 ? (
            <div style={{ textAlign: 'center', fontSize: 8, color: '#ffffff18', padding: 8 }}>Aucune action</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {logs.slice(0, 8).map((l, i) => (
                <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'flex-start', padding: '3px 0', borderBottom: '1px solid #00d4ff08' }}>
                  <span style={{ fontSize: 7, color: '#ffffff22', flexShrink: 0, minWidth: 40 }}>{l.time}</span>
                  <span style={{ fontSize: 7, color: '#c8e8ff', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.cmd}</span>
                  <span style={{ fontSize: 7, color: l.ok ? '#00e676' : '#ff3366', flexShrink: 0 }}>{l.ok ? '✓' : '✗'}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Options affichage + sécurité */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 8 }}>
          {/* Display options */}
          <div style={{ background: 'rgba(0,212,255,0.02)', borderRadius: 10, padding: 8, border: '1px solid #00d4ff12' }}>
            <div style={{ fontFamily: 'Orbitron', fontSize: 6, color: '#00d4ff55', letterSpacing: '0.15em', marginBottom: 6 }}>OPTIONS AFFICHAGE</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <Row label="QUALITÉ" val={
                <select value={quality} onChange={e => setQuality(Number(e.target.value))} style={{ background: '#020810', border: '1px solid #00d4ff22', color: '#00d4ff', borderRadius: 4, fontSize: 7, padding: '1px 3px', fontFamily: 'Share Tech Mono' }}>
                  <option value={30}>Basse</option>
                  <option value={50}>Moy.</option>
                  <option value={70}>Haute</option>
                  <option value={90}>Max</option>
                </select>
              } />
              <Row label="ÉCHELLE" val={
                <select value={scale} onChange={e => setScale(Number(e.target.value))} style={{ background: '#020810', border: '1px solid #00d4ff22', color: '#00d4ff', borderRadius: 4, fontSize: 7, padding: '1px 3px', fontFamily: 'Share Tech Mono' }}>
                  <option value={0.3}>30%</option>
                  <option value={0.5}>50%</option>
                  <option value={0.75}>75%</option>
                  <option value={1}>100%</option>
                </select>
              } />
              <Row label="ÉCRAN" val={`${screenW}×${screenH}`} />
            </div>
          </div>

          {/* Security mode */}
          <div style={{ background: secLock ? 'rgba(255,51,102,0.04)' : 'rgba(0,212,255,0.02)', borderRadius: 10, padding: 8, border: `1px solid ${secLock ? '#ff336622' : '#00d4ff12'}` }}>
            <div style={{ fontFamily: 'Orbitron', fontSize: 6, color: secLock ? '#ff3366aa' : '#00d4ff55', letterSpacing: '0.15em', marginBottom: 6 }}>MODE SÉCURITÉ</div>
            <div style={{ fontSize: 7, color: '#ffffff33', lineHeight: 1.6, marginBottom: 6 }}>
              • Confirmation avant actions<br />
              • Suppressions bloquées<br />
              • Accès administrateur sécurisé<br />
              • Actions journalisées
            </div>
            <button onClick={() => setSecLock(l => !l)} style={{
              width: '100%', padding: '5px 0', fontFamily: 'Orbitron', fontSize: 6,
              background: secLock ? 'rgba(255,51,102,0.12)' : 'rgba(0,230,118,0.08)',
              border: `1px solid ${secLock ? '#ff336644' : '#00e67644'}`,
              borderRadius: 6, color: secLock ? '#ff3366' : '#00e676', cursor: 'pointer', letterSpacing: '0.15em',
            }}>
              {secLock ? '🔓 DÉVERROUILLER' : '🔒 VERROUILLER'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function StatusChip({ label, val, col, icon }: { label: string; val: string; col: string; icon: string }) {
  return (
    <div style={{ flex: 1, background: `${col}08`, borderRadius: 6, padding: '3px 5px', border: `1px solid ${col}18`, minWidth: 0 }}>
      <div style={{ fontSize: 5, color: `${col}55`, letterSpacing: '0.1em', fontFamily: 'Orbitron', marginBottom: 1 }}>{icon} {label}</div>
      <div style={{ fontSize: 7, color: col, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'Orbitron' }}>{val}</div>
    </div>
  );
}

function Row({ label, val }: { label: string; val: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <span style={{ fontSize: 6, color: '#ffffff22', fontFamily: 'Orbitron', letterSpacing: '0.08em' }}>{label}</span>
      <span style={{ fontSize: 7, color: '#00d4ffcc' }}>{val}</span>
    </div>
  );
}

function Corner({ pos }: { pos: 'tl' | 'tr' | 'bl' | 'br' }) {
  const s = 10, t = 1.5, col = '#00d4ff';
  const bT = pos.startsWith('t') ? `${t}px solid ${col}33` : 'none';
  const bB = pos.startsWith('b') ? `${t}px solid ${col}33` : 'none';
  const bL = pos.endsWith('l')   ? `${t}px solid ${col}33` : 'none';
  const bR = pos.endsWith('r')   ? `${t}px solid ${col}33` : 'none';
  const h  = pos.endsWith('l')   ? { left: 4 }  : { right: 4 };
  const v  = pos.startsWith('t') ? { top: 4 }   : { bottom: 4 };
  return <div style={{ position: 'absolute', zIndex: 1, width: s, height: s, borderTop: bT, borderBottom: bB, borderLeft: bL, borderRight: bR, ...h, ...v }} />;
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const inputSt: React.CSSProperties = {
  background: 'rgba(0,212,255,0.04)', border: '1px solid #00d4ff1a',
  borderRadius: 8, padding: '6px 8px', fontFamily: 'Share Tech Mono',
  fontSize: 9, color: '#c8e8ff', outline: 'none', boxSizing: 'border-box', width: '100%',
};

function btnStyle(col: string): React.CSSProperties {
  return {
    background: `${col}12`, border: `1px solid ${col}44`, borderRadius: 6,
    padding: '5px 10px', fontFamily: 'Orbitron', fontSize: 7, color: col,
    cursor: 'pointer', letterSpacing: '0.1em',
  };
}

function miniBtn(col: string): React.CSSProperties {
  return {
    background: `${col}10`, border: `1px solid ${col}33`, borderRadius: 5,
    padding: '2px 5px', fontFamily: 'Orbitron', fontSize: 7, color: col, cursor: 'pointer',
  };
}

const padBtn: React.CSSProperties = {
  background: 'rgba(0,212,255,0.08)', border: '1px solid #00d4ff22',
  borderRadius: 6, padding: '6px 0', fontFamily: 'Share Tech Mono',
  fontSize: 12, color: '#00d4ff', cursor: 'pointer', textAlign: 'center',
};

// Extend business type for nexus run command
declare module '../../services/api.ts' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface NexusRunResult { ok: boolean; stdout?: string; stderr?: string; result?: string; }
}
