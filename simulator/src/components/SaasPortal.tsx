import { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';

const BACKEND = (import.meta as any).env?.VITE_BACKEND_URL ?? 'https://ibrahim-backend-production.up.railway.app';

// ── Types ─────────────────────────────────────────────────────────
type Mode = 'landing' | 'signup' | 'login' | 'chat';

interface OrgSession {
  token:         string;
  ai_name:       string;
  business_name: string;
  sector:        string;
  org_id:        string;
}

const SECTORS = [
  { key: 'car_rental',  label: 'Location de voitures', icon: '🚗' },
  { key: 'restaurant',  label: 'Restaurant',           icon: '🍽️' },
  { key: 'lawyer',      label: 'Avocat / Notaire',     icon: '⚖️' },
  { key: 'doctor',      label: 'Médecin / Clinique',   icon: '🏥' },
  { key: 'real_estate', label: 'Immobilier',           icon: '🏠' },
  { key: 'hotel',       label: 'Hôtel / Riad',         icon: '🏨' },
  { key: 'retail',      label: 'Commerce',             icon: '🛍️' },
  { key: 'custom',      label: 'Autre',                icon: '⚡' },
];

// ── Storage helpers ───────────────────────────────────────────────
function saveSession(s: OrgSession) { localStorage.setItem('saas_session', JSON.stringify(s)); }
function loadSession(): OrgSession | null {
  try { const r = localStorage.getItem('saas_session'); return r ? JSON.parse(r) as OrgSession : null; }
  catch { return null; }
}
function clearSession() { localStorage.removeItem('saas_session'); }

// ── Session ID ────────────────────────────────────────────────────
function getSessionId(orgId: string) {
  const k = `saas_sid_${orgId}`;
  let s = localStorage.getItem(k);
  if (!s) { s = `saas_${orgId.slice(0, 8)}_${Date.now()}`; localStorage.setItem(k, s); }
  return s;
}

// ═════════════════════════════════════════════════════════════════
// Main portal
// ═════════════════════════════════════════════════════════════════
export default function SaasPortal() {
  const existing = loadSession();
  const [mode, setMode]       = useState<Mode>(existing ? 'chat' : 'landing');
  const [session, setSession] = useState<OrgSession | null>(existing);

  const handleAuth = (s: OrgSession) => { saveSession(s); setSession(s); setMode('chat'); };
  const handleLogout = () => { clearSession(); setSession(null); setMode('landing'); };

  if (mode === 'landing') return <Landing onSignup={() => setMode('signup')} onLogin={() => setMode('login')} />;
  if (mode === 'signup')  return <SignupForm onAuth={handleAuth} onBack={() => setMode('landing')} />;
  if (mode === 'login')   return <LoginForm  onAuth={handleAuth} onBack={() => setMode('landing')} />;
  if (mode === 'chat' && session) return <SaasChat session={session} onLogout={handleLogout} />;
  return null;
}

// ── Landing ───────────────────────────────────────────────────────
function Landing({ onSignup, onLogin }: { onSignup: () => void; onLogin: () => void }) {
  return (
    <div style={S.page}>
      <div style={S.safeTop} />
      <div style={S.landingContent}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{ fontSize: 64, marginBottom: 12 }}>🤖</div>
          <div style={{ fontFamily: 'Orbitron', fontSize: 28, fontWeight: 900, color: '#00d4ff', letterSpacing: '0.3em' }}>
            DZARYX
          </div>
          <div style={{ fontFamily: 'Inter', fontSize: 13, color: 'rgba(255,255,255,0.4)', marginTop: 6, letterSpacing: '0.08em' }}>
            Assistant IA pour votre business
          </div>
        </div>

        {/* Value props */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 40 }}>
          {[
            { icon: '🌍', text: 'Parle votre langue — français, anglais, arabe, espagnol' },
            { icon: '🎯', text: 'Adapté à votre secteur — restaurant, avocat, médecin...' },
            { icon: '🎤', text: 'Interface vocale — parlez, Dzaryx répond' },
            { icon: '⚡', text: 'Prêt en 2 minutes — inscription rapide' },
          ].map(({ icon, text }) => (
            <div key={text} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: 'rgba(0,212,255,0.04)', border: '1px solid rgba(0,212,255,0.1)', borderRadius: 12 }}>
              <span style={{ fontSize: 20 }}>{icon}</span>
              <span style={{ fontFamily: 'Inter', fontSize: 13, color: 'rgba(255,255,255,0.7)', lineHeight: 1.4 }}>{text}</span>
            </div>
          ))}
        </div>

        {/* CTAs */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <button onClick={onSignup} style={S.btnPrimary}>Commencer gratuitement</button>
          <button onClick={onLogin}  style={S.btnSecondary}>J'ai déjà un compte</button>
        </div>
      </div>
    </div>
  );
}

// ── Signup ────────────────────────────────────────────────────────
function SignupForm({ onAuth, onBack }: { onAuth: (s: OrgSession) => void; onBack: () => void }) {
  const [step, setStep]             = useState<'sector' | 'info'>('sector');
  const [sector, setSector]         = useState('');
  const [businessName, setBusiness] = useState('');
  const [city, setCity]             = useState('');
  const [country, setCountry]       = useState('Algeria');
  const [language, setLanguage]     = useState('fr');
  const [aiName, setAiName]         = useState('Dzaryx');
  const [email, setEmail]           = useState('');
  const [password, setPassword]     = useState('');
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState('');

  const submit = async () => {
    if (!businessName || !email || !password || !sector) { setError('Tous les champs sont requis'); return; }
    if (password.length < 8) { setError('Mot de passe minimum 8 caractères'); return; }
    setLoading(true); setError('');
    try {
      const r = await fetch(`${BACKEND}/api/saas/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, business_name: businessName, city, country, sector, language, ai_name: aiName }),
      });
      const data = await r.json() as any;
      if (!r.ok) { setError(data.error ?? 'Erreur inscription'); return; }
      onAuth({ token: data.token, ai_name: data.ai_name ?? aiName, business_name: data.business_name, sector: data.sector, org_id: data.org_id });
    } catch { setError('Erreur réseau — réessayez'); }
    finally { setLoading(false); }
  };

  return (
    <div style={S.page}>
      <div style={S.safeTop} />
      <div style={S.formHeader}>
        <button onClick={onBack} style={S.backBtn}>← Retour</button>
        <div style={S.formTitle}>Créer votre Dzaryx</div>
        <div style={{ width: 60 }} />
      </div>

      <div style={S.formScroll}>
        {step === 'sector' ? (
          <>
            <div style={S.sectionLabel}>Votre secteur d'activité</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 24 }}>
              {SECTORS.map(s => (
                <button
                  key={s.key}
                  onClick={() => setSector(s.key)}
                  style={{
                    padding: '14px 10px', borderRadius: 12, border: `1.5px solid ${sector === s.key ? '#00d4ff' : 'rgba(255,255,255,0.08)'}`,
                    background: sector === s.key ? 'rgba(0,212,255,0.1)' : 'rgba(255,255,255,0.03)',
                    cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                  }}
                >
                  <span style={{ fontSize: 24 }}>{s.icon}</span>
                  <span style={{ fontFamily: 'Inter', fontSize: 11, fontWeight: 500, color: sector === s.key ? '#00d4ff' : 'rgba(255,255,255,0.6)', textAlign: 'center', lineHeight: 1.2 }}>{s.label}</span>
                </button>
              ))}
            </div>
            <button
              onClick={() => sector && setStep('info')}
              disabled={!sector}
              style={!sector ? S.btnDisabled : S.btnPrimary}
            >
              Continuer →
            </button>
          </>
        ) : (
          <>
            <div style={S.sectionLabel}>Informations de votre business</div>
            {[
              { label: 'Nom du business', value: businessName, set: setBusiness, placeholder: 'Ex: Cabinet Benali, Restaurant Chez Mohamed' },
              { label: 'Ville', value: city, set: setCity, placeholder: 'Ex: Alger, Oran, Paris...' },
              { label: 'Pays', value: country, set: setCountry, placeholder: 'Ex: Algeria, France, Maroc' },
            ].map(f => (
              <div key={f.label} style={{ marginBottom: 14 }}>
                <div style={S.inputLabel}>{f.label}</div>
                <input value={f.value} onChange={e => f.set(e.target.value)} placeholder={f.placeholder} style={S.input} />
              </div>
            ))}

            <div style={{ marginBottom: 14 }}>
              <div style={S.inputLabel}>Nom de votre assistant IA</div>
              <input value={aiName} onChange={e => setAiName(e.target.value)} placeholder="Dzaryx, Sofia, Max..." style={S.input} />
            </div>

            <div style={{ marginBottom: 14 }}>
              <div style={S.inputLabel}>Langue principale</div>
              <select value={language} onChange={e => setLanguage(e.target.value)} style={{ ...S.input, WebkitAppearance: 'none' }}>
                <option value="fr">Français</option>
                <option value="ar">Arabe (Darija)</option>
                <option value="en">English</option>
                <option value="es">Español</option>
              </select>
            </div>

            <div style={S.divider} />
            <div style={S.sectionLabel}>Votre compte</div>

            {[
              { label: 'Email', value: email, set: setEmail, type: 'email', placeholder: 'vous@example.com' },
              { label: 'Mot de passe (min. 8 caractères)', value: password, set: setPassword, type: 'password', placeholder: '••••••••' },
            ].map(f => (
              <div key={f.label} style={{ marginBottom: 14 }}>
                <div style={S.inputLabel}>{f.label}</div>
                <input value={f.value} onChange={e => f.set(e.target.value)} type={f.type} placeholder={f.placeholder} style={S.input} />
              </div>
            ))}

            {error && <div style={S.errorText}>{error}</div>}

            <button onClick={submit} disabled={loading} style={loading ? S.btnDisabled : S.btnPrimary}>
              {loading ? 'Création en cours…' : `Créer mon ${aiName}`}
            </button>
            <button onClick={() => setStep('sector')} style={{ ...S.btnSecondary, marginTop: 8 }}>← Changer de secteur</button>
          </>
        )}
      </div>
    </div>
  );
}

// ── Login ─────────────────────────────────────────────────────────
function LoginForm({ onAuth, onBack }: { onAuth: (s: OrgSession) => void; onBack: () => void }) {
  const [email, setEmail]     = useState('');
  const [password, setPass]   = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  const submit = async () => {
    if (!email || !password) { setError('Email et mot de passe requis'); return; }
    setLoading(true); setError('');
    try {
      const r = await fetch(`${BACKEND}/api/saas/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await r.json() as any;
      if (!r.ok) { setError(data.error ?? 'Identifiants incorrects'); return; }
      onAuth({ token: data.token, ai_name: data.ai_name ?? 'Dzaryx', business_name: data.business_name, sector: '', org_id: data.org_id });
    } catch { setError('Erreur réseau — réessayez'); }
    finally { setLoading(false); }
  };

  return (
    <div style={S.page}>
      <div style={S.safeTop} />
      <div style={S.formHeader}>
        <button onClick={onBack} style={S.backBtn}>← Retour</button>
        <div style={S.formTitle}>Connexion</div>
        <div style={{ width: 60 }} />
      </div>
      <div style={S.formScroll}>
        <div style={{ marginBottom: 14 }}>
          <div style={S.inputLabel}>Email</div>
          <input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="vous@example.com" style={S.input} />
        </div>
        <div style={{ marginBottom: 14 }}>
          <div style={S.inputLabel}>Mot de passe</div>
          <input value={password} onChange={e => setPass(e.target.value)} type="password" placeholder="••••••••"
            onKeyDown={e => e.key === 'Enter' && submit()} style={S.input} />
        </div>
        {error && <div style={S.errorText}>{error}</div>}
        <button onClick={submit} disabled={loading} style={loading ? S.btnDisabled : S.btnPrimary}>
          {loading ? 'Connexion…' : 'Se connecter'}
        </button>
      </div>
    </div>
  );
}

// ── SaaS Chat ─────────────────────────────────────────────────────
interface ChatMessage { role: 'user' | 'ai'; text: string; ts: number; }

function SaasChat({ session, onLogout }: { session: OrgSession; onLogout: () => void }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput]       = useState('');
  const [thinking, setThinking] = useState(false);
  const [streaming, setStreaming] = useState('');
  const [wsOk, setWsOk]         = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const sessionId = getSessionId(session.org_id);

  // Socket.IO connection
  useEffect(() => {
    const sock = io(BACKEND, {
      auth: { token: session.token },
      query: { sessionId },
      transports: ['websocket', 'polling'],
    });

    sock.on('connect', () => setWsOk(true));
    sock.on('disconnect', () => setWsOk(false));

    sock.on('Dzaryx:text_chunk', (chunk: string) => {
      setStreaming(prev => prev + chunk);
    });

    sock.on('Dzaryx:text_complete', (text: string) => {
      setStreaming('');
      setThinking(false);
      setMessages(prev => [...prev, { role: 'ai', text, ts: Date.now() }]);
    });

    sock.on('Dzaryx:status', ({ status }: { status: string }) => {
      if (status === 'thinking') setThinking(true);
      if (status === 'idle') setThinking(false);
    });

    socketRef.current = sock;
    return () => { sock.disconnect(); };
  }, [session.token, sessionId]);

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streaming]);

  const send = async () => {
    const msg = input.trim();
    if (!msg || thinking) return;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: msg, ts: Date.now() }]);
    setThinking(true);
    setStreaming('');

    try {
      await fetch(`${BACKEND}/api/saas/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.token}` },
        body: JSON.stringify({ message: msg, sessionId, textOnly: true }),
      });
    } catch {
      setThinking(false);
      setMessages(prev => [...prev, { role: 'ai', text: 'Erreur de connexion. Réessayez.', ts: Date.now() }]);
    }
  };

  const aiName = session.ai_name ?? 'Dzaryx';

  return (
    <div style={{ ...S.page, display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ flexShrink: 0 }}>
        <div style={S.safeTop} />
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 16px', height: 44,
          background: 'rgba(2,5,14,0.97)', borderBottom: '1px solid rgba(0,212,255,0.08)',
        }}>
          <div>
            <div style={{ fontFamily: 'Orbitron', fontSize: 11, fontWeight: 700, color: '#00d4ff', letterSpacing: '0.2em' }}>{aiName.toUpperCase()}</div>
            <div style={{ fontFamily: 'Inter', fontSize: 9, color: 'rgba(255,255,255,0.25)', marginTop: 1 }}>{session.business_name}</div>
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '3px 10px', borderRadius: 20,
            background: wsOk ? 'rgba(0,212,255,0.06)' : 'rgba(255,51,102,0.06)',
            border: `1px solid ${wsOk ? 'rgba(0,212,255,0.18)' : 'rgba(255,51,102,0.2)'}`,
          }}>
            <div style={{ width: 5, height: 5, borderRadius: '50%', background: wsOk ? '#00d4ff' : '#ff3366' }} />
            <span style={{ fontFamily: 'Inter', fontSize: 10, color: wsOk ? 'rgba(0,212,255,0.85)' : '#ff3366' }}>
              {wsOk ? 'EN LIGNE' : 'HORS LIGNE'}
            </span>
          </div>
          <button onClick={onLogout} style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'Inter', fontSize: 11, color: 'rgba(255,255,255,0.3)', padding: '4px 8px' }}>
            ⏻
          </button>
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {messages.length === 0 && !thinking && (
          <div style={{ textAlign: 'center', paddingTop: 40 }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>👋</div>
            <div style={{ fontFamily: 'Inter', fontSize: 15, fontWeight: 600, color: 'rgba(255,255,255,0.8)', marginBottom: 6 }}>
              Bonjour ! Je suis {aiName}
            </div>
            <div style={{ fontFamily: 'Inter', fontSize: 13, color: 'rgba(255,255,255,0.35)', lineHeight: 1.5 }}>
              Votre assistant IA pour {session.business_name}.<br />Comment puis-je vous aider ?
            </div>
          </div>
        )}

        {messages.map(m => (
          <div key={m.ts} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
            <div style={{
              maxWidth: '80%', padding: '10px 14px', borderRadius: m.role === 'user' ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
              background: m.role === 'user' ? 'rgba(0,212,255,0.15)' : 'rgba(255,255,255,0.06)',
              border: m.role === 'user' ? '1px solid rgba(0,212,255,0.3)' : '1px solid rgba(255,255,255,0.08)',
              fontFamily: 'Inter', fontSize: 14, color: 'rgba(255,255,255,0.88)', lineHeight: 1.5,
            }}>
              {m.text}
            </div>
          </div>
        ))}

        {(thinking || streaming) && (
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <div style={{
              maxWidth: '80%', padding: '10px 14px', borderRadius: '18px 18px 18px 4px',
              background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)',
              fontFamily: 'Inter', fontSize: 14, color: 'rgba(255,255,255,0.88)', lineHeight: 1.5,
            }}>
              {streaming || <span style={{ color: 'rgba(0,212,255,0.5)' }}>···</span>}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{ flexShrink: 0, padding: '12px 16px', background: 'rgba(2,5,14,0.97)', borderTop: '1px solid rgba(0,212,255,0.08)' }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }}
            placeholder={`Message à ${aiName}…`}
            rows={1}
            style={{
              flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 14, padding: '10px 14px', fontFamily: 'Inter', fontSize: 14,
              color: 'rgba(255,255,255,0.88)', resize: 'none', outline: 'none',
              maxHeight: 120, overflowY: 'auto',
            }}
          />
          <button
            onClick={send}
            disabled={!input.trim() || thinking}
            style={{
              width: 40, height: 40, borderRadius: '50%', border: 'none', cursor: !input.trim() || thinking ? 'default' : 'pointer',
              background: !input.trim() || thinking ? 'rgba(0,212,255,0.1)' : '#00d4ff',
              color: !input.trim() || thinking ? 'rgba(0,212,255,0.3)' : '#000',
              fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}
          >
            ↑
          </button>
        </div>
        <div style={{ height: 'env(safe-area-inset-bottom, 0px)' }} />
      </div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────
const S = {
  page: {
    width: '100%', height: '100%',
    background: 'radial-gradient(ellipse at 50% 20%, #040d1e 0%, #020810 50%, #000 100%)',
    overflowY: 'auto' as const,
  } as React.CSSProperties,
  safeTop: {
    height: 'env(safe-area-inset-top, 0px)',
  } as React.CSSProperties,
  landingContent: {
    padding: '32px 24px',
    maxWidth: 480,
    margin: '0 auto',
  } as React.CSSProperties,
  formHeader: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '12px 16px', borderBottom: '1px solid rgba(0,212,255,0.07)',
  } as React.CSSProperties,
  formTitle: {
    fontFamily: 'Orbitron', fontSize: 13, fontWeight: 700,
    color: 'rgba(255,255,255,0.8)', letterSpacing: '0.1em',
  } as React.CSSProperties,
  backBtn: {
    background: 'none', border: 'none', cursor: 'pointer',
    fontFamily: 'Inter', fontSize: 13, color: 'rgba(0,212,255,0.7)',
    padding: '4px 0', width: 60,
  } as React.CSSProperties,
  formScroll: {
    padding: '20px 20px',
    overflowY: 'auto' as const,
    maxWidth: 480,
    margin: '0 auto',
  } as React.CSSProperties,
  sectionLabel: {
    fontFamily: 'Inter', fontSize: 11, fontWeight: 600,
    color: 'rgba(0,212,255,0.5)', letterSpacing: '0.12em',
    textTransform: 'uppercase' as const, marginBottom: 12,
  },
  inputLabel: {
    fontFamily: 'Inter', fontSize: 10, fontWeight: 600,
    color: 'rgba(255,255,255,0.35)', letterSpacing: '0.08em',
    marginBottom: 6, textTransform: 'uppercase' as const,
  },
  input: {
    width: '100%', boxSizing: 'border-box' as const,
    background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 12, padding: '12px 14px',
    fontFamily: 'Inter', fontSize: 14, color: 'rgba(255,255,255,0.88)', outline: 'none',
  } as React.CSSProperties,
  btnPrimary: {
    width: '100%', padding: '15px',
    background: 'linear-gradient(135deg, rgba(0,212,255,0.2) 0%, rgba(0,180,220,0.15) 100%)',
    border: '1.5px solid rgba(0,212,255,0.45)', borderRadius: 14,
    fontFamily: 'Orbitron', fontSize: 11, fontWeight: 700, color: '#00d4ff',
    cursor: 'pointer', letterSpacing: '0.15em',
    boxShadow: '0 0 20px rgba(0,212,255,0.15)',
  } as React.CSSProperties,
  btnSecondary: {
    width: '100%', padding: '14px',
    background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 14,
    fontFamily: 'Inter', fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,0.5)',
    cursor: 'pointer',
  } as React.CSSProperties,
  btnDisabled: {
    width: '100%', padding: '15px',
    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14,
    fontFamily: 'Inter', fontSize: 13, color: 'rgba(255,255,255,0.2)', cursor: 'default',
  } as React.CSSProperties,
  errorText: {
    fontFamily: 'Inter', fontSize: 12, color: '#ff3366',
    textAlign: 'center' as const, marginBottom: 12,
  },
  divider: {
    height: 1, background: 'rgba(255,255,255,0.06)', margin: '16px 0',
  },
};
