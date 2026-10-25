import { useEffect, useState } from 'react';
import { forme, errText, type AgendaDay, fmtLong } from './api.ts';
import { F, card, btn, Spinner } from './ui.tsx';
import { isAr } from './i18n.ts';

// AGENDA dans l'app : les 7 prochains jours (séance — y compris celle refaite sur mesure —, repas, injection, rappels,
// jours de repos). Pour sa femme qui n'a pas Google Agenda ; et un bouton pour tout ajouter au calendrier de l'iPhone.
const ics = (days: AgendaDay[]) => {
  const ev: string[] = [];
  const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
  const add = (date: string, time: string, min: number, title: string, desc = '') => {
    const [h, m] = time.split(':').map(Number);
    const s = `${date.replace(/-/g, '')}T${String(h).padStart(2, '0')}${String(m).padStart(2, '0')}00`;
    const e = new Date(Date.UTC(0, 0, 1, h!, m! + min)); const end = `${date.replace(/-/g, '')}T${String(e.getUTCHours()).padStart(2, '0')}${String(e.getUTCMinutes()).padStart(2, '0')}00`;
    ev.push(['BEGIN:VEVENT', `UID:forme-${date}-${time}-${ev.length}@dzaryx`, `DTSTAMP:${stamp}`, `DTSTART;TZID=Europe/Brussels:${s}`, `DTEND;TZID=Europe/Brussels:${end}`, `SUMMARY:${title.replace(/[,;]/g, ' ')}`, desc ? `DESCRIPTION:${desc.replace(/\n/g, '\\n').replace(/[,;]/g, ' ')}` : '', 'BEGIN:VALARM', 'TRIGGER:-PT15M', 'ACTION:DISPLAY', `DESCRIPTION:${title.replace(/[,;]/g, ' ')}`, 'END:VALARM', 'END:VEVENT'].filter(Boolean).join('\r\n'));
  };
  const slotTime: Record<string, string> = { 'petit-déj': '08:00', 'déjeuner': '12:30', 'collation': '16:30', 'dîner': '19:30' };
  for (const d of days) {
    if (d.sport) add(d.date, d.sport.time ?? '18:00', 60, `💪 ${d.sport.label}`, d.sport.custom ?? '');
    for (const m of d.meals) add(d.date, slotTime[m.slot] ?? '12:30', 30, `🍽️ ${m.title}`);
    if (d.injection) add(d.date, d.injection.hour, 10, '💉 Injection', d.injection.site);
    for (const r of d.reminders) add(d.date, r.time, 5, `⏰ ${r.label}`);
  }
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Dzaryx//FORME//FR', 'CALSCALE:GREGORIAN', ...ev, 'END:VCALENDAR'].join('\r\n');
};

export default function Agenda({ toast }: { toast: (t: string) => void }) {
  const [days, setDays] = useState<AgendaDay[] | null>(null);
  useEffect(() => { void forme.agenda().then(r => setDays(r.days)).catch(e => toast(errText(e))); }, [toast]);
  if (!days) return <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spinner /></div>;
  const exportIcs = () => {
    const blob = new Blob([ics(days)], { type: 'text/calendar' });
    const file = new File([blob], 'forme-semaine.ics', { type: 'text/calendar' });
    const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
    if (nav.canShare?.({ files: [file] })) void nav.share({ files: [file], title: 'FORME' }).catch(() => {});
    else { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'forme-semaine.ics'; a.click(); }
  };
  return (
    <div>
      {days.map((d, i) => (
        <div key={d.date} style={{ ...card, marginBottom: 10, padding: 14, borderInlineStart: `6px solid ${d.rest ? F.violet : d.sport ? F.accent : F.line}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <b style={{ fontSize: 16, textTransform: 'capitalize' }}>{i === 0 ? (isAr() ? 'اليوم' : "Aujourd'hui") : fmtLong(d.date)}</b>
            {d.rest && <span style={{ fontSize: 12.5, fontWeight: 800, color: F.violet }}>🛌 Repos</span>}
            {d.fasting && <span style={{ fontSize: 12.5, fontWeight: 800, color: F.violet }}>🌙 Jeûne</span>}
          </div>
          {d.sport && <div style={{ marginTop: 8, fontSize: 14.5 }}>{d.sport.done ? '✅' : '🏋️'} <b>{d.sport.time ? `${d.sport.time} · ` : ''}{d.sport.label}</b>{d.sport.custom && <div style={{ fontSize: 12.5, color: F.accent, marginTop: 2 }}>🎯 Sur mesure : {d.sport.custom}</div>}</div>}
          {d.injection && <div style={{ marginTop: 6, fontSize: 14.5 }}>{d.injection.done ? '✅' : '💉'} {d.injection.hour} · Injection ({d.injection.site})</div>}
          {d.meals.map(m => <div key={m.key} style={{ marginTop: 6, fontSize: 14, color: m.eaten ? F.muted : F.ink, textDecoration: m.eaten ? 'line-through' : 'none' }}>🍽️ <span style={{ fontWeight: 700 }}>{m.slot}</span> · {m.title}</div>)}
          {d.reminders.map(r => <div key={r.label + r.time} style={{ marginTop: 6, fontSize: 14 }}>⏰ {r.time} · {r.label}</div>)}
        </div>
      ))}
      <button onClick={exportIcs} style={{ ...btn, width: '100%', marginTop: 4 }}>📆 Ajouter au calendrier de l'iPhone</button>
      <div style={{ fontSize: 12.5, color: F.muted, marginTop: 8, lineHeight: 1.4 }}>Le fichier ajoute la semaine (séances, repas, injection, rappels, alerte 15 min avant) dans l'app Calendrier. À refaire quand la semaine change.</div>
    </div>
  );
}
