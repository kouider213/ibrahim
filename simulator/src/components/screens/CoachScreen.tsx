import { useState } from 'react';
import { PageHeader, Segmented, Screen } from '../ui/Kit.tsx';
import { Coach, Vie } from './JarvisScreen.tsx';

// Page COACH (Kouider 31/10) : « sur la page coach ça doit être le coach de vie, le sport sera sur l'app FORME ».
// = le Grand Coach (business + coach de vie + Coach +, grand-coach.ts) et la Vie (identités, votes, revue du dimanche,
// life-plus.ts), sortis de JARVIS. Le sport n'est plus ici : page FORME.
type Tab = 'coach' | 'vie';

export default function CoachScreen({ onAsk }: { onAsk: (prompt: string) => void }) {
  const [tab, setTab] = useState<Tab>(() => { try { return (localStorage.getItem('dz:coach_tab') as Tab) === 'vie' ? 'vie' : 'coach'; } catch { return 'coach'; } });
  const pick = (t: Tab) => { setTab(t); try { localStorage.setItem('dz:coach_tab', t); } catch { /* ignore */ } };
  return (
    <Screen header={<>
      <PageHeader eyebrow="Dzaryx · privé" title="🏆 Coach de vie" subtitle="Devenir un grand businessman, et une meilleure version de toi, chaque jour." />
      <div style={{ padding: '0 12px 8px' }}>
        <Segmented<Tab> items={[{ id: 'coach', label: '🏆 Grand Coach' }, { id: 'vie', label: '🧭 Ma vie' }]} value={tab} onChange={pick} />
      </div>
    </>}>
      {/* 31/10 : les boutons (texte sur une ligne) élargissaient la page → tout était décalé/coupé sur iPhone. Ici le texte passe à la ligne. */}
      <style>{'.coach-fit{min-width:0;overflow-x:hidden}.coach-fit button{white-space:normal!important;line-height:1.25;padding-top:8px!important;padding-bottom:8px!important;min-width:0;text-align:center}.coach-fit *{overflow-wrap:anywhere}'}</style>
      <div className="coach-fit">
        {tab === 'coach' && <Coach onAsk={onAsk} />}
        {tab === 'vie' && <Vie onAsk={onAsk} />}
      </div>
    </Screen>
  );
}
