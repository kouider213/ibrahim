import { Router } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { env } from '../../config/env.js';
import { supabase } from '../../integrations/supabase.js';

const router = Router();
const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

// Simple in-memory rate limiter (IP → { count, resetAt })
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 20;        // requests per window
const RATE_WINDOW = 60_000;   // 1 minute

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW });
    return true;
  }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count++;
  return true;
}

// Cleanup stale entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitMap) {
    if (now > entry.resetAt) rateLimitMap.delete(ip);
  }
}, 300_000);

const WIDGET_BASE_PROMPT = `Tu es Ibrahim, l'assistant virtuel d'AutoLux Location — agence de location de véhicules premium à Oran, Algérie.

RÈGLES ABSOLUES:
- Tu réponds dans la langue utilisée par le client (français, arabe, anglais)
- Tu donnes uniquement des informations PUBLIQUES sur AutoLux
- Tu ne discutes JAMAIS des données internes, réservations d'autres clients, finances
- Si le client veut réserver → tu lui donnes WhatsApp: +32466311469
- Tu es chaleureux, professionnel, concis (2-3 phrases max)

INFORMATIONS AUTOLUX:
📍 Oran, Algérie
📱 WhatsApp: +32466311469 (pour réserver)
✈️ Livraison gratuite aéroport Es-Sénia
👤 Âge minimum: 35 ans
🪪 Documents requis: pièce d'identité + permis de conduire

Si on te pose une question hors contexte AutoLux → redirige poliment vers les véhicules ou le contact.`;

// Cache fleet + active bookings for 3 minutes to avoid hitting Supabase on every message
let fleetCache: { data: string; ts: number } | null = null;

async function getLiveFleetContext(): Promise<string> {
  if (fleetCache && Date.now() - fleetCache.ts < 3 * 60 * 1000) return fleetCache.data;

  try {
    const today = new Date().toISOString().slice(0, 10);

    const [{ data: cars }, { data: bookings }] = await Promise.all([
      supabase.from('cars').select('name, category, resale_price, available').order('name'),
      supabase.from('bookings')
        .select('car_id, start_date, end_date, status, cars(name)')
        .in('status', ['CONFIRMED', 'ACTIVE'])
        .lte('start_date', today)
        .gte('end_date', today),
    ]);

    const rentedCarIds = new Set((bookings ?? []).map((b: Record<string, unknown>) => b.car_id as string));

    const fleetLines = (cars ?? []).map((c: Record<string, unknown>) => {
      const rented = rentedCarIds.has(c.id as string) || !c.available;
      return `• ${c.name} [${c.category}] — ${c.resale_price}€/jour — ${rented ? 'NON DISPONIBLE ACTUELLEMENT' : 'DISPONIBLE'}`;
    });

    const ctx = `\nFLOTTE ACTUELLE (mise à jour en temps réel):\n${fleetLines.join('\n')}`;
    fleetCache = { data: ctx, ts: Date.now() };
    return ctx;
  } catch {
    // Fallback to static list if DB unavailable
    return `\nCATALOGUE VÉHICULES:\n• Hyundai i10 — 25€/jour\n• Clio 4 essence — 25€/jour\n• Dacia Sandero — 35€/jour\n• Fiat 500 — 35€/jour\n• Clio 4 diesel — 35€/jour\n• Clio 5 — 45€/jour\n• Renault Duster — 45€/jour\n• Hyundai Creta — 45€/jour\n• Fiat 500 XL — 45€/jour\n• Clio 5 Alpine — 50€/jour\n• Dacia Jogger — 50€/jour\n• Dacia Duster — 50€/jour\n• Citroën Berlingo — 55€/jour\n• Citroën Jumpy — 55€/jour`;
  }
}

// POST /api/widget/chat
router.post('/chat', async (req, res) => {
  const ip = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim()
           ?? req.socket.remoteAddress
           ?? 'unknown';

  if (!checkRateLimit(ip)) {
    res.status(429).json({ error: 'Trop de requêtes. Réessayez dans une minute.' });
    return;
  }

  const { message, history } = req.body as {
    message: string;
    history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  };

  if (!message?.trim()) {
    res.status(400).json({ error: 'Message requis' });
    return;
  }

  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [
    ...(history ?? []).slice(-6), // keep last 3 exchanges
    { role: 'user', content: message.trim().slice(0, 500) },
  ];

  try {
    const fleetContext = await getLiveFleetContext();
    const systemPrompt = WIDGET_BASE_PROMPT + fleetContext;

    const response = await anthropic.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 400,
      system:     systemPrompt,
      messages,
    });

    const text = response.content[0]?.type === 'text' ? response.content[0].text : '';
    res.json({ reply: text });
  } catch (err) {
    console.error('[widget] Claude error:', err);
    res.status(500).json({ error: 'Service temporairement indisponible.' });
  }
});

// GET /api/widget/embed.js — serves the widget script
router.get('/embed.js', (_req, res) => {
  const backendUrl = env.BACKEND_URL;
  res.setHeader('Content-Type', 'application/javascript');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.send(buildWidgetScript(backendUrl));
});

function buildWidgetScript(backendUrl: string): string {
  return `
(function() {
  'use strict';
  if (window.__IbrahimWidget) return;
  window.__IbrahimWidget = true;

  var BACKEND = '${backendUrl}';
  var WA_URL  = 'https://wa.me/32466311469';
  var history = [];
  var isOpen  = false;

  // ── Styles ─────────────────────────────────────────────────
  var style = document.createElement('style');
  style.textContent = [
    '#ibr-btn{position:fixed;bottom:24px;right:24px;z-index:99998;width:60px;height:60px;border-radius:50%;background:linear-gradient(135deg,#c9a227,#f0d060);border:none;cursor:pointer;box-shadow:0 4px 20px rgba(201,162,39,0.5);display:flex;align-items:center;justify-content:center;transition:transform .2s,box-shadow .2s;}',
    '#ibr-btn:hover{transform:scale(1.08);box-shadow:0 6px 28px rgba(201,162,39,0.7);}',
    '#ibr-btn svg{width:28px;height:28px;}',
    '#ibr-win{position:fixed;bottom:96px;right:24px;z-index:99999;width:340px;max-width:calc(100vw - 48px);height:480px;max-height:calc(100vh - 120px);background:#0a0a0a;border:1px solid #c9a227;border-radius:16px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 8px 40px rgba(0,0,0,0.8);transition:opacity .2s,transform .2s;opacity:0;transform:translateY(12px) scale(.97);pointer-events:none;}',
    '#ibr-win.open{opacity:1;transform:translateY(0) scale(1);pointer-events:all;}',
    '#ibr-head{background:linear-gradient(90deg,#111,#1a1500);padding:14px 16px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #2a2000;}',
    '#ibr-head-left{display:flex;align-items:center;gap:10px;}',
    '#ibr-avatar{width:34px;height:34px;border-radius:50%;background:linear-gradient(135deg,#c9a227,#f0d060);display:flex;align-items:center;justify-content:center;font-size:16px;}',
    '#ibr-head-info h3{margin:0;font-size:13px;font-weight:700;color:#f0d060;font-family:system-ui,sans-serif;letter-spacing:.05em;}',
    '#ibr-head-info p{margin:0;font-size:11px;color:#888;font-family:system-ui,sans-serif;}',
    '#ibr-close{background:none;border:none;color:#666;cursor:pointer;font-size:20px;line-height:1;padding:0 4px;}#ibr-close:hover{color:#f0d060;}',
    '#ibr-msgs{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:10px;scroll-behavior:smooth;}',
    '#ibr-msgs::-webkit-scrollbar{width:4px;}#ibr-msgs::-webkit-scrollbar-track{background:transparent;}#ibr-msgs::-webkit-scrollbar-thumb{background:#2a2000;border-radius:2px;}',
    '.ibr-bubble{max-width:85%;padding:10px 13px;border-radius:12px;font-size:13px;line-height:1.5;font-family:system-ui,sans-serif;word-break:break-word;}',
    '.ibr-bubble.bot{background:#111;border:1px solid #2a2000;color:#ddd;align-self:flex-start;border-bottom-left-radius:3px;}',
    '.ibr-bubble.usr{background:linear-gradient(135deg,#c9a227,#a07a10);color:#000;font-weight:500;align-self:flex-end;border-bottom-right-radius:3px;}',
    '.ibr-bubble.typing{color:#666;}',
    '#ibr-wa{margin:0 16px 8px;padding:10px;background:rgba(37,211,102,0.1);border:1px solid rgba(37,211,102,0.3);border-radius:10px;display:flex;align-items:center;gap:8px;cursor:pointer;text-decoration:none;}',
    '#ibr-wa:hover{background:rgba(37,211,102,0.18);}',
    '#ibr-wa span{font-size:12px;color:#25d366;font-family:system-ui,sans-serif;font-weight:600;}',
    '#ibr-form{display:flex;gap:8px;padding:12px;border-top:1px solid #1a1500;}',
    '#ibr-input{flex:1;background:#111;border:1px solid #2a2000;border-radius:8px;padding:9px 12px;color:#f0f0f0;font-size:13px;outline:none;font-family:system-ui,sans-serif;}',
    '#ibr-input:focus{border-color:#c9a227;}',
    '#ibr-input::placeholder{color:#444;}',
    '#ibr-send{width:36px;height:36px;border-radius:8px;background:linear-gradient(135deg,#c9a227,#f0d060);border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;}',
    '#ibr-send:hover{filter:brightness(1.1);}',
    '#ibr-send svg{width:16px;height:16px;}',
  ].join('');
  document.head.appendChild(style);

  // ── HTML ───────────────────────────────────────────────────
  var btn = document.createElement('button');
  btn.id = 'ibr-btn';
  btn.title = 'Ibrahim — Assistant AutoLux';
  btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="#0a0a0a" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';

  var win = document.createElement('div');
  win.id = 'ibr-win';
  win.innerHTML = [
    '<div id="ibr-head">',
      '<div id="ibr-head-left">',
        '<div id="ibr-avatar">🤖</div>',
        '<div id="ibr-head-info"><h3>Ibrahim</h3><p>Assistant AutoLux • En ligne</p></div>',
      '</div>',
      '<button id="ibr-close">×</button>',
    '</div>',
    '<div id="ibr-msgs"></div>',
    '<a id="ibr-wa" href="' + WA_URL + '" target="_blank" rel="noopener">',
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="#25d366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/></svg>',
      '<span>Réserver sur WhatsApp</span>',
    '</a>',
    '<div id="ibr-form">',
      '<input id="ibr-input" type="text" placeholder="Posez votre question…" autocomplete="off"/>',
      '<button id="ibr-send"><svg viewBox="0 0 24 24" fill="none" stroke="#0a0a0a" stroke-width="2.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg></button>',
    '</div>',
  ].join('');

  document.body.appendChild(btn);
  document.body.appendChild(win);

  var msgs  = document.getElementById('ibr-msgs');
  var input = document.getElementById('ibr-input');
  var send  = document.getElementById('ibr-send');
  var close = document.getElementById('ibr-close');

  function addBubble(text, role) {
    var b = document.createElement('div');
    b.className = 'ibr-bubble ' + role;
    b.textContent = text;
    msgs.appendChild(b);
    msgs.scrollTop = msgs.scrollHeight;
    return b;
  }

  function greet() {
    var hour = new Date().getHours();
    var g = hour < 12 ? 'Bonjour' : hour < 18 ? 'Bon après-midi' : 'Bonsoir';
    addBubble(g + ' ! Je suis Ibrahim, l\'assistant AutoLux. Comment puis-je vous aider ? 🚗', 'bot');
  }

  async function sendMsg() {
    var text = input.value.trim();
    if (!text) return;
    input.value = '';
    addBubble(text, 'usr');
    history.push({ role: 'user', content: text });

    var typing = addBubble('…', 'bot typing');

    try {
      var res = await fetch(BACKEND + '/api/widget/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, history: history.slice(-6) }),
      });
      var data = await res.json();
      var reply = data.reply || 'Désolé, une erreur est survenue.';
      typing.textContent = reply;
      typing.classList.remove('typing');
      history.push({ role: 'assistant', content: reply });
    } catch(e) {
      typing.textContent = 'Erreur de connexion. Contactez-nous sur WhatsApp.';
      typing.classList.remove('typing');
    }
    msgs.scrollTop = msgs.scrollHeight;
  }

  btn.addEventListener('click', function() {
    isOpen = !isOpen;
    win.classList.toggle('open', isOpen);
    if (isOpen && msgs.children.length === 0) greet();
    if (isOpen) setTimeout(function(){ input.focus(); }, 300);
  });

  close.addEventListener('click', function() { isOpen = false; win.classList.remove('open'); });
  send.addEventListener('click', sendMsg);
  input.addEventListener('keydown', function(e) { if (e.key === 'Enter') sendMsg(); });

})();
`.trim();
}

export default router;
