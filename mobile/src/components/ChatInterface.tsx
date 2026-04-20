import './ChatInterface.css';
import { useState, useEffect, useRef, useCallback } from 'react';
import {
  api, connectSocket, playBase64Audio, enqueueAudioChunk, flushAudioChunks,
  clearAudioQueue, unlockAudio, iosFallbackSpeak, getOrCreateSessionId, type IbrahimStatus,
} from '../services/api.js';

// ── Types ─────────────────────────────────────────────────────
type GlobeState = 'idle' | 'listen' | 'speak';

function toGlobe(s: IbrahimStatus): GlobeState {
  if (s === 'listening') return 'listen';
  if (s === 'speaking')  return 'speak';
  return 'idle';
}

// ── Globe constants (small for mobile performance) ─────────────
const TEX_W    = 512;
const TEX_H    = 256;
const SPHERE_PX = 280;   // canvas pixels (CSS scales to display size)
const TILT     = 23.5 * Math.PI / 180;
const sinT     = Math.sin(TILT);
const cosT     = Math.cos(TILT);

const THEMES = {
  idle:   { ocean:[18, 28, 40]  as const, land:[170,185,200] as const, border:[255,255,255,0.35] as const, grid:[120,145,170,0.18] as const },
  listen: { ocean:[5,  40, 25]  as const, land:[70, 210,130] as const, border:[220,255,235,0.55] as const, grid:[120,255,170,0.22] as const },
  speak:  { ocean:[50, 8,  18]  as const, land:[255,120,140] as const, border:[255,220,225,0.60] as const, grid:[255,160,170,0.26] as const },
} as const;

// ── TopoJSON → GeoJSON ─────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function topoToGeo(topo: any, obj: any) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const arcs: any[][] = topo.arcs;
  const { scale:[sx,sy], translate:[tx,ty] } = topo.transform;
  function decodeArc(i: number) {
    const rev = i < 0, arc = arcs[rev ? ~i : i];
    let x = 0, y = 0; const pts: number[][] = [];
    for (const p of arc) { x += p[0]; y += p[1]; pts.push([x*sx+tx, y*sy+ty]); }
    return rev ? pts.reverse() : pts;
  }
  function ring(ids: number[]) {
    const out: number[][] = [];
    for (let k = 0; k < ids.length; k++) { const pts = decodeArc(ids[k]); if (k > 0) pts.shift(); out.push(...pts); }
    return out;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function geom(g: any) {
    if (g.type === 'Polygon')      return { type:'Polygon',      coordinates: (g.arcs as number[][]).map((ids: number[]) => ring(ids)) };
    if (g.type === 'MultiPolygon') return { type:'MultiPolygon', coordinates: (g.arcs as number[][][]).map(p => p.map((ids: number[]) => ring(ids))) };
    return null;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { type:'FeatureCollection', features: obj.geometries.map((g: any) => ({ type:'Feature', properties:g.properties??{}, geometry:geom(g) })) };
}

// ── Component ─────────────────────────────────────────────────
export default function ChatInterface() {
  const [globeState, setGlobeState] = useState<GlobeState>('idle');
  const [statusLbl,  setStatusLbl]  = useState('System · Idle');
  const [captionTxt, setCaptionTxt] = useState('Prêt à écouter');
  const [freq,       setFreq]       = useState('0.00 Hz');
  const [utcTime,    setUtcTime]    = useState('--:--:--');
  const [showText,      setShowText]      = useState(false);
  const [textInput,     setTextInput]     = useState('');
  const [streamingText, setStreamingText] = useState('');
  // Mode texte
  const [textMode,      setTextMode]      = useState(false);
  const textModeRef = useRef(false);
  const [chatHistory,   setChatHistory]   = useState<{role:'user'|'ai';text:string;id:number}[]>([]);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [markerLbl,  setMarkerLbl]  = useState('ORAN · DZ');
  const [latTxt,     setLatTxt]     = useState('35.6971° N');
  const [lonTxt,     setLonTxt]     = useState('0.6308° W');
  const [canvasOk,   setCanvasOk]   = useState(false);

  // DOM refs
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const globeElRef = useRef<HTMLDivElement>(null);
  const markerElRef= useRef<HTMLDivElement>(null);

  // Animation state (mutable — no re-render on change)
  const gsRef       = useRef<GlobeState>('idle');
  const texCanvas   = useRef<HTMLCanvasElement | null>(null);
  const texImg      = useRef<ImageData | null>(null);
  const countries   = useRef<ReturnType<typeof topoToGeo> | null>(null);
  const lonOff      = useRef(0);
  const lastT       = useRef(performance.now());
  const micAmp      = useRef(0);
  const micAnalyser = useRef<AnalyserNode | null>(null);
  const micBuf      = useRef<Uint8Array | null>(null);
  const micReady    = useRef(false);
  const scaleCur    = useRef(1);
  const animId      = useRef(0);
  const outBuf      = useRef<ImageData | null>(null);
  const freqTimer   = useRef<ReturnType<typeof setInterval> | null>(null);
  const frameN      = useRef(0);

  // App refs
  const sessionId = getOrCreateSessionId();
  const audioFallbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sending   = useRef(false);
  const userLat   = useRef(35.6971 * Math.PI / 180);
  const userLon   = useRef(-0.6308 * Math.PI / 180);

  // ── Texture ──────────────────────────────────────────────────
  const ll2xy = (lon: number, lat: number): [number,number] =>
    [(lon+180)/360*TEX_W, (90-lat)/180*TEX_H];

  function traceRing(ctx2: CanvasRenderingContext2D, ring: number[][]) {
    if (!ring?.length) return;
    let [px,py] = ll2xy(ring[0][0], ring[0][1]);
    ctx2.moveTo(px, py);
    for (let i = 1; i < ring.length; i++) {
      const [nx,ny] = ll2xy(ring[i][0], ring[i][1]);
      if (Math.abs(nx-px) > TEX_W*0.5) ctx2.moveTo(nx,ny); else ctx2.lineTo(nx,ny);
      px=nx; py=ny;
    }
    ctx2.closePath();
  }

  function drawTexture(gs: GlobeState) {
    const tc = texCanvas.current; if (!tc) return;
    const ctx2 = tc.getContext('2d'); if (!ctx2) return;
    const t = THEMES[gs];
    try {
      ctx2.fillStyle = `rgb(${t.ocean[0]},${t.ocean[1]},${t.ocean[2]})`;
      ctx2.fillRect(0,0,TEX_W,TEX_H);
      ctx2.strokeStyle = `rgba(${t.grid[0]},${t.grid[1]},${t.grid[2]},${t.grid[3]})`;
      ctx2.lineWidth = 1;
      for (let lat=-60; lat<=60; lat+=30) { const y=(90-lat)/180*TEX_H; ctx2.beginPath(); ctx2.moveTo(0,y); ctx2.lineTo(TEX_W,y); ctx2.stroke(); }
      for (let lon=-150; lon<=150; lon+=30) { const x=(lon+180)/360*TEX_W; ctx2.beginPath(); ctx2.moveTo(x,0); ctx2.lineTo(x,TEX_H); ctx2.stroke(); }
      if (countries.current) {
        ctx2.fillStyle   = `rgb(${t.land[0]},${t.land[1]},${t.land[2]})`;
        ctx2.strokeStyle = `rgba(${t.border[0]},${t.border[1]},${t.border[2]},${t.border[3]})`;
        ctx2.lineWidth = 0.7; ctx2.lineJoin = 'round';
        for (const f of countries.current.features) {
          const g = f.geometry; if (!g) continue;
          if (g.type === 'Polygon') {
            ctx2.beginPath();
            for (const r of (g as {type:'Polygon';coordinates:number[][][]}).coordinates) traceRing(ctx2,r);
            ctx2.fill('evenodd'); ctx2.stroke();
          } else if (g.type === 'MultiPolygon') {
            for (const poly of (g as {type:'MultiPolygon';coordinates:number[][][][]}).coordinates) {
              ctx2.beginPath(); for (const r of poly) traceRing(ctx2,r); ctx2.fill('evenodd'); ctx2.stroke();
            }
          }
        }
      }
      texImg.current = ctx2.getImageData(0,0,TEX_W,TEX_H);
    } catch(e) { console.warn('[globe] drawTexture:', e); }
  }

  // ── Sphere render ─────────────────────────────────────────────
  function renderSphere() {
    const cvs = canvasRef.current; if (!cvs || !texImg.current) return;
    const ctx = cvs.getContext('2d'); if (!ctx) return;
    const CW=cvs.width, CH=cvs.height, cx=CW/2, cy=CH/2;
    const radius = Math.min(CW,CH)*0.48, R2=radius*radius;
    if (!outBuf.current || outBuf.current.width!==CW || outBuf.current.height!==CH) {
      try { outBuf.current = ctx.createImageData(CW,CH); } catch { return; }
    }
    const od=outBuf.current.data, td=texImg.current.data;
    const lo=lonOff.current, cosL=Math.cos(-lo), sinL=Math.sin(-lo);
    const lx=-0.55, ly=-0.45, lz=0.70;
    try {
      for (let py=0; py<CH; py++) {
        for (let px2=0; px2<CW; px2++) {
          const dx=px2-cx, dy=py-cy, d2=dx*dx+dy*dy;
          const idx=(py*CW+px2)*4;
          if (d2>R2) { od[idx+3]=0; continue; }
          const z=Math.sqrt(R2-d2);
          const nx=dx/radius, ny=dy/radius, nz=z/radius;
          const ny2=ny*cosT+nz*sinT, nz2=-ny*sinT+nz*cosT;
          const nx2=nx*cosL+nz2*sinL, nz3=-nx*sinL+nz2*cosL;
          const lat=Math.asin(-ny2), lon=Math.atan2(nx2,nz3);
          let u=(lon+Math.PI)/(2*Math.PI); u-=Math.floor(u);
          const v=(Math.PI/2-lat)/Math.PI;
          const ttx=Math.min(TEX_W-1,Math.max(0,(u*TEX_W)|0));
          const tty=Math.min(TEX_H-1,Math.max(0,(v*TEX_H)|0));
          const ti=(tty*TEX_W+ttx)*4;
          let L=nx*lx+ny*ly+nz*lz; if(L<0)L=0;
          const k=(0.25+0.85*L)*(1-Math.pow(1-nz,3)*0.5);
          od[idx]=(td[ti]*k)|0; od[idx+1]=(td[ti+1]*k)|0; od[idx+2]=(td[ti+2]*k)|0; od[idx+3]=255;
        }
      }
      ctx.putImageData(outBuf.current,0,0);
      // rim glow
      ctx.save(); ctx.globalCompositeOperation='lighter';
      const t=THEMES[gsRef.current];
      const g=ctx.createRadialGradient(cx,cy,radius*.84,cx,cy,radius*1.06);
      g.addColorStop(0,`rgba(${t.land[0]},${t.land[1]},${t.land[2]},0)`);
      g.addColorStop(.7,`rgba(${t.land[0]},${t.land[1]},${t.land[2]},.28)`);
      g.addColorStop(1,`rgba(${t.land[0]},${t.land[1]},${t.land[2]},0)`);
      ctx.fillStyle=g; ctx.beginPath(); ctx.arc(cx,cy,radius*1.06,0,Math.PI*2); ctx.fill(); ctx.restore();
    } catch(e) { console.warn('[globe] renderSphere:', e); }
  }

  // ── Marker ────────────────────────────────────────────────────
  function updateMarker() {
    const el=markerElRef.current, ge=globeElRef.current; if(!el||!ge) return;
    const clat=Math.cos(userLat.current), slat=Math.sin(userLat.current);
    let nx=clat*Math.sin(userLon.current+lonOff.current), ny=-slat, nz=clat*Math.cos(userLon.current+lonOff.current);
    const ny2=ny*cosT-nz*sinT, nz2=ny*sinT+nz*cosT; ny=ny2; nz=nz2;
    const W=ge.clientWidth, H=ge.clientHeight, r=W*.48;
    el.style.left=(W/2+nx*r)+'px'; el.style.top=(H/2+ny*r)+'px';
    el.style.opacity=nz>.02?'1':'0';
  }

  // ── Mic ───────────────────────────────────────────────────────
  function sampleMic() {
    if (!micReady.current||!micAnalyser.current||!micBuf.current) return 0;
    try {
      micAnalyser.current.getByteTimeDomainData(micBuf.current as Uint8Array<ArrayBuffer>);
      let s=0; for (let i=0;i<micBuf.current.length;i++){const v=(micBuf.current[i]-128)/128;s+=v*v;}
      return Math.min(1,Math.sqrt(s/micBuf.current.length)*3.5);
    } catch { return 0; }
  }

  async function startMic() {
    if (micReady.current) return;
    try {
      const ACtx=window.AudioContext||(window as Window&{webkitAudioContext?:typeof AudioContext}).webkitAudioContext;
      if (!ACtx) return;
      const stream=await navigator.mediaDevices.getUserMedia({audio:true});
      const ac=new ACtx(), src=ac.createMediaStreamSource(stream);
      micAnalyser.current=ac.createAnalyser(); micAnalyser.current.fftSize=512; micAnalyser.current.smoothingTimeConstant=0.6;
      micBuf.current=new Uint8Array(micAnalyser.current.frequencyBinCount);
      src.connect(micAnalyser.current); micReady.current=true;
    } catch(_) { /* mic denied */ }
  }

  // ── Anim loop ─────────────────────────────────────────────────
  const loopFn = useRef<(t:number)=>void>(null!);
  loopFn.current = (t: number) => {
    const dt=Math.min((t-lastT.current)/1000,.1); lastT.current=t;
    const gs=gsRef.current;
    lonOff.current += (gs==='speak'?.28:gs==='listen'?.11:.06)*dt;
    frameN.current++;
    if (gs!=='idle'||frameN.current%2===0) renderSphere();
    updateMarker();
    let ts=1;
    if (gs==='listen'){const a=sampleMic();micAmp.current=micAmp.current*.7+a*.3;ts=1+micAmp.current*.25;}
    scaleCur.current+=(ts-scaleCur.current)*Math.min(1,dt*12);
    const ge=globeElRef.current;
    if (ge) ge.style.transform=`scale(${scaleCur.current.toFixed(3)})`;
    animId.current=requestAnimationFrame(t2=>loopFn.current(t2));
  };

  // ── State machine ─────────────────────────────────────────────
  const applyState = useCallback((gs: GlobeState) => {
    gsRef.current=gs; setGlobeState(gs); drawTexture(gs);
    if(gs==='listen') startMic();
    if(freqTimer.current){clearInterval(freqTimer.current);freqTimer.current=null;}
    if(gs==='idle'){setStatusLbl('System · Idle');setCaptionTxt('Prêt à écouter');setFreq('0.00 Hz');}
    else {
      setStatusLbl(gs==='listen'?'System · Listening':'System · Speaking');
      setCaptionTxt(gs==='listen'?'Ibrahim écoute':'Ibrahim parle');
      freqTimer.current=setInterval(()=>{
        const b=gs==='listen'?432:808;
        setFreq((b+(Math.random()-.5)*(gs==='listen'?18:46)).toFixed(2)+' Hz');
      },140);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  // Keep ref in sync with state so socket callbacks read current value
  useEffect(()=>{ textModeRef.current = textMode; },[textMode]);

  // ── Socket ────────────────────────────────────────────────────
  useEffect(()=>{
    const socket=connectSocket(sessionId,{
      onStatus:(s)=>{
        if(s==='thinking'){setStreamingText('');}
        applyState(toGlobe(s));
      },
      onAudio:(b64)=>{
        if(audioFallbackTimer.current){clearTimeout(audioFallbackTimer.current);audioFallbackTimer.current=null;}
        window.speechSynthesis?.cancel();
        clearAudioQueue();
        playBase64Audio(b64);
        applyState('speak');
      },
      onAudioChunk:(b64)=>{
        if(audioFallbackTimer.current){clearTimeout(audioFallbackTimer.current);audioFallbackTimer.current=null;}
        window.speechSynthesis?.cancel();
        enqueueAudioChunk(b64);
        applyState('speak');
      },
      onTextChunk:(chunk)=>{
        setStreamingText(prev=>prev+chunk);
        setCaptionTxt(prev=>{const n=prev+chunk;return n.length>120?'…'+n.slice(-120):n;});
        // En mode texte, mettre à jour la dernière bulle IA en cours
        setChatHistory(h=>{
          if(!h.length||h[h.length-1]?.role!=='ai') return [...h,{role:'ai' as const,text:chunk,id:Date.now()}];
          const last=h[h.length-1]; if(!last) return h;
          return [...h.slice(0,-1),{...last,text:last.text+chunk}];
        });
        setTimeout(()=>chatEndRef.current?.scrollIntoView({behavior:'smooth'}),30);
      },
      onTextComplete:(text)=>{
        setStreamingText(text);
        // Finalise la bulle IA en mode texte
        setChatHistory(h=>{
          if(!h.length||h[h.length-1]?.role!=='ai') return h;
          const last=h[h.length-1]; if(!last) return h;
          return [...h.slice(0,-1),{...last,text}];
        });
        setTimeout(()=>chatEndRef.current?.scrollIntoView({behavior:'smooth'}),50);
        if(!textModeRef.current){
          // Voice mode: flush MP3 chunks and schedule fallback TTS
          void flushAudioChunks();
          if(audioFallbackTimer.current){clearTimeout(audioFallbackTimer.current);audioFallbackTimer.current=null;}
          audioFallbackTimer.current=setTimeout(()=>{
            audioFallbackTimer.current=null;
            if(window.speechSynthesis&&!window.speechSynthesis.speaking){
              iosFallbackSpeak(text);
            }
            setTimeout(()=>{setStreamingText('');applyState('idle');},Math.max(2000,text.length*55));
          },3000);
        } else {
          // Text mode: just reset streaming overlay, no TTS
          setStreamingText('');
          applyState('idle');
        }
      },
      onResponse:(text,fallback)=>{
        if(fallback){
          if(audioFallbackTimer.current){clearTimeout(audioFallbackTimer.current);audioFallbackTimer.current=null;}
          iosFallbackSpeak(text);
          setTimeout(()=>applyState('idle'),Math.max(2000,text.length*55));
        }
      },
      onValidation:()=>{}, onTaskUpdate:()=>{},
    });
    return ()=>{socket.disconnect();};
  },[sessionId,applyState]);

  // ── Globe init ────────────────────────────────────────────────
  useEffect(()=>{
    // texture canvas (off-screen, never attached to DOM)
    const tc=document.createElement('canvas');
    tc.width=TEX_W; tc.height=TEX_H; texCanvas.current=tc;
    drawTexture('idle');
    setCanvasOk(true);

    // country borders (non-blocking)
    fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json')
      .then(r=>r.ok?r.json():null).then(topo=>{
        if(!topo) return;
        countries.current=topoToGeo(topo,topo.objects.countries);
        drawTexture(gsRef.current);
      }).catch(()=>{});

    // geolocation
    if('geolocation' in navigator){
      navigator.geolocation.getCurrentPosition(async pos=>{
        const{latitude:lat,longitude:lon}=pos.coords;
        userLat.current=lat*Math.PI/180; userLon.current=lon*Math.PI/180;
        setLatTxt(`${Math.abs(lat).toFixed(4)}°${lat>=0?' N':' S'}`);
        setLonTxt(`${Math.abs(lon).toFixed(4)}°${lon>=0?' E':' W'}`);
        setMarkerLbl('Localisation…');
        try{
          const r2=await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=10&accept-language=fr`);
          const j=await r2.json(); const a=j.address??{};
          const city=a.city||a.town||a.village||a.county||a.state||'';
          const cc=(a.country_code||'').toUpperCase();
          setMarkerLbl((city+(cc?` · ${cc}`:'')).trim().toUpperCase()||'VOUS');
        }catch(_){setMarkerLbl('VOUS');}
      },()=>{},{timeout:8000,maximumAge:300000});
    }

    // start loop after first paint
    const rafStart=setTimeout(()=>{
      animId.current=requestAnimationFrame(t=>{lastT.current=t;loopFn.current(t);});
    },60);

    // clock
    const clock=setInterval(()=>{
      const d=new Date();
      setUtcTime(`${String(d.getUTCHours()).padStart(2,'0')}:${String(d.getUTCMinutes()).padStart(2,'0')}:${String(d.getUTCSeconds()).padStart(2,'0')}`);
    },1000);

    return ()=>{
      clearTimeout(rafStart); cancelAnimationFrame(animId.current); clearInterval(clock);
      if(freqTimer.current)clearInterval(freqTimer.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  // ── Text / voice ──────────────────────────────────────────────
  const sendText=useCallback(async(msg:string,forceTextMode=textMode)=>{
    if(!msg.trim()||sending.current) return;
    unlockAudio(); // user gesture — unlock AudioContext before response arrives
    sending.current=true;
    setTextInput('');
    setStreamingText('');
    if(!forceTextMode) setShowText(false);
    if(forceTextMode){
      // Mode texte : ajouter message user et préparer la bulle IA
      setChatHistory(h=>[...h,{role:'user',text:msg,id:Date.now()}]);
      setTimeout(()=>chatEndRef.current?.scrollIntoView({behavior:'smooth'}),50);
    } else {
      applyState('listen');
    }
    try{
      await api.chat(msg,sessionId,forceTextMode);
    }catch(e){console.error('[chat]',e);if(!forceTextMode)applyState('idle');}
    finally{sending.current=false;}
  },[sessionId,applyState,textMode]);

  const startListening=useCallback(()=>{
    if(gsRef.current==='listen') return;
    unlockAudio(); // must happen in user gesture handler
    applyState('listen');
    const w=window as Window&{webkitSpeechRecognition?:new()=>SRL;SpeechRecognition?:new()=>SRL};
    const SR=w.webkitSpeechRecognition??w.SpeechRecognition;
    if(!SR){applyState('idle');return;}
    try{
      const rec=new SR(); rec.lang='fr-FR'; rec.interimResults=false; rec.maxAlternatives=1;
      rec.onresult=(e:SREvent)=>{const tr=e.results[0]?.[0]?.transcript??'';if(tr)sendText(tr);else applyState('idle');};
      rec.onerror=()=>applyState('idle');
      rec.start();
    }catch(_){applyState('idle');}
  },[applyState,sendText]);

  const stopAll=useCallback(()=>{
    if(audioFallbackTimer.current){clearTimeout(audioFallbackTimer.current);audioFallbackTimer.current=null;}
    try{window.speechSynthesis?.cancel();}catch(_){}
    applyState('idle');
  },[applyState]);

  useEffect(()=>{
    const onKey=(e:KeyboardEvent)=>{if(e.code==='Space'&&!showText){e.preventDefault();startListening();}if(e.code==='Escape')stopAll();};
    window.addEventListener('keydown',onKey);
    return ()=>window.removeEventListener('keydown',onKey);
  },[showText,startListening,stopAll]);

  // Auto-start micro quand ouvert depuis Siri (?auto=1 dans l'URL)
  useEffect(()=>{
    const params=new URLSearchParams(window.location.search);
    if(params.get('auto')==='1'||params.get('autostart')==='1'){
      // Nettoyer l'URL pour éviter la re-activation au refresh
      window.history.replaceState({},'',window.location.pathname);
      // Délai pour que le globe soit chargé
      const t=setTimeout(()=>startListening(),1200);
      return ()=>clearTimeout(t);
    }
  },[startListening]);

  // ── Render ─────────────────────────────────────────────────────
  const WAVE_N=24, RAY_N=32;

  return (
    <div className="ibr" data-state={globeState}>
      <div className="stars" />

      <div className="shell">

        {/* Header */}
        <header className="ibr-header">
          <div className="brand">
            <span className="tag">Voice Interface · v1.0</span>
            <h1>IBRAHIM</h1>
          </div>
          <div className="status-pill">
            <span className="status-dot" />
            <span>{statusLbl}</span>
          </div>
        </header>

        {/* Stage */}
        <section className="stage">
          <div className="ticks">
            <div className="tick tl"/><div className="tick tr"/>
            <div className="tick bl"/><div className="tick br"/>
          </div>
          <div className="guides">
            <div className="guide-ring"/><div className="guide-ring"/>
            <div className="guide-ring"/><div className="guide-ring"/>
          </div>

          <div className="globe-wrap">
            <div className="aura"/>
            <div className="sonar"><span/><span/><span/></div>
            <div className="rays">
              {Array.from({length:RAY_N},(_,i)=>(
                <div key={i} className="ray" style={{['--a' as string]:`${(i/RAY_N)*360}deg`,['--d' as string]:`${((i%6)*.07).toFixed(2)}s`}}/>
              ))}
            </div>

            <div className="globe" ref={globeElRef}>
              {!canvasOk && <div className="globe-fallback"/>}
              <canvas
                ref={canvasRef}
                className="sphere3d"
                width={SPHERE_PX}
                height={SPHERE_PX}
                style={{display:canvasOk?'block':'none'}}
              />
              <div className="marker" ref={markerElRef}>
                <span className="mpulse"/><span className="mpulse p2"/><span className="mpulse p3"/>
                <span className="pin"/>
                <span className="mlabel">{markerLbl}</span>
              </div>
              <div className="scanline"/>
            </div>
          </div>

          {streamingText&&(
            <div className="streaming-text-overlay">
              <p className="streaming-text">{streamingText}</p>
            </div>
          )}

          {!textMode&&showText&&(
            <div className="text-overlay">
              <input type="text" placeholder="Écrire à Ibrahim…" value={textInput}
                onChange={e=>setTextInput(e.target.value)}
                onKeyDown={e=>{if(e.key==='Enter')sendText(textInput);}}
                autoFocus/>
              <button className="send-btn" onClick={()=>sendText(textInput)}>↑</button>
            </div>
          )}
        </section>

        {/* Mode Texte — Chat bubbles */}
        {textMode&&(
          <div className="chat-view">
            <div className="chat-messages">
              {chatHistory.map(m=>(
                <div key={m.id} className={`chat-bubble ${m.role}`}>
                  <p>{m.text}</p>
                </div>
              ))}
              {!chatHistory.length&&(
                <p className="chat-empty">Écris ton message ci-dessous…</p>
              )}
              <div ref={chatEndRef}/>
            </div>
            <div className="chat-input-row">
              <input
                type="text"
                className="chat-input"
                placeholder="Message…"
                value={textInput}
                onChange={e=>setTextInput(e.target.value)}
                onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendText(textInput,true);}}}
                autoFocus
              />
              <button className="chat-send" onClick={()=>sendText(textInput,true)} disabled={!textInput.trim()}>↑</button>
            </div>
          </div>
        )}

        {/* Footer */}
        <footer className="ibr-footer">
          <div className="readout">
            <div><span className="k">STATE ·</span> <span className="v sv">{globeState.toUpperCase()}</span></div>
            <div><span className="k">FREQ  ·</span> <span className="v">{freq}</span></div>
            <div><span className="k">NODE  ·</span> <span className="v">IBR-01 · DZ</span></div>
          </div>

          <div className="controls">
            <div className="caption">
              <span>{captionTxt}</span>
              <span className="dot-trio"><i/><i/><i/></span>
            </div>
            <div className="waveform">
              {Array.from({length:WAVE_N},(_,i)=>(
                <i key={i} style={{animationDelay:`${(-(Math.sin(i*.7)*.5+.5)*.9).toFixed(2)}s`,animationDuration:`${(.7+(i%5)*.12).toFixed(2)}s`}}/>
              ))}
            </div>
            <div className="buttons">
              <button className={`btn${textMode?'':' primary'}`} onPointerDown={()=>{setTextMode(false);startListening();}}><span className="ico"/><span>Parler</span></button>
              <button className={`btn${textMode?' primary':' secondary'}`} onClick={()=>{setTextMode(p=>!p);stopAll();}}><span>Écrire</span></button>
              <button className="btn danger" onClick={stopAll}><span className="ico"/><span>Stop</span></button>
            </div>
          </div>

          <div className="readout meta-right">
            <div><span className="k">· LAT</span> <span className="v">{latTxt}</span></div>
            <div><span className="k">· LON</span> <span className="v">{lonTxt}</span></div>
            <div><span className="k">· UTC</span> <span className="v">{utcTime}</span></div>
          </div>
        </footer>

      </div>
    </div>
  );
}

// Speech API stubs
interface SREvent{results:{[k:number]:{[k:number]:{transcript:string}}}}
interface SRL{lang:string;interimResults:boolean;maxAlternatives:number;onresult:((e:SREvent)=>void)|null;onerror:(()=>void)|null;start():void;}
