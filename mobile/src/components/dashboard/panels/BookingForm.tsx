import { useState } from 'react';
import { motion } from 'framer-motion';
import { useFleet } from '../../../hooks/useDashboard.js';
import { api, getOrCreateSessionId } from '../../../services/api.js';

const inp = 'w-full bg-gray-900/60 border border-gray-700/50 rounded-lg px-3 py-2.5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-cyan-500/50';
const lbl = 'block text-[10px] text-gray-500 uppercase tracking-widest mb-1 font-mono';
const card = 'dash-card dash-glow p-4';

type Status = 'idle' | 'loading' | 'done' | 'error';

export default function BookingForm() {
  const { data: fleet } = useFleet();
  const sessionId = getOrCreateSessionId();

  const [car,        setCar]        = useState('');
  const [clientName, setClientName] = useState('');
  const [clientPhone,setClientPhone]= useState('');
  const [startDate,  setStartDate]  = useState('');
  const [endDate,    setEndDate]    = useState('');
  const [clientPpd,  setClientPpd]  = useState('');
  const [ownerPpd,   setOwnerPpd]   = useState('');
  const [notes,      setNotes]      = useState('');
  const [status,     setStatus]     = useState<Status>('idle');
  const [msg,        setMsg]        = useState('');

  const cars = fleet?.stats ?? [];

  const nbDays = startDate && endDate
    ? Math.max(1, Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / 86_400_000))
    : 0;

  const clientTotal = nbDays && clientPpd ? nbDays * Number(clientPpd) : 0;
  const ownerTotal  = nbDays && ownerPpd  ? nbDays * Number(ownerPpd)  : 0;
  const profit      = clientTotal && ownerTotal ? clientTotal - ownerTotal : null;

  const selectedCar = cars.find(c => c.car_id === car);

  const reset = () => {
    setCar(''); setClientName(''); setClientPhone('');
    setStartDate(''); setEndDate('');
    setClientPpd(''); setOwnerPpd(''); setNotes('');
  };

  const handleSubmit = async () => {
    if (!car || !clientName.trim() || !clientPhone.trim() || !startDate || !endDate || !clientPpd) {
      setMsg('Remplis les champs obligatoires (*).');
      setStatus('error');
      return;
    }
    if (new Date(endDate) <= new Date(startDate)) {
      setMsg('Date fin doit être après date début.');
      setStatus('error');
      return;
    }
    setStatus('loading');
    try {
      const parts = [
        `Crée une réservation`,
        `client: ${clientName.trim()}`,
        `téléphone: ${clientPhone.trim()}`,
        `voiture: ${selectedCar?.car_name ?? car}`,
        `du ${startDate} au ${endDate}`,
        `prix client: ${clientPpd} DA/j`,
        ownerPpd  ? `prix Houari: ${ownerPpd} DA/j` : '',
        notes.trim() ? `notes: ${notes.trim()}` : '',
      ].filter(Boolean).join(', ');

      await api.chat(parts, sessionId, true);
      setMsg(`✅ Réservation envoyée — Dzaryx confirme dans quelques secondes.`);
      setStatus('done');
      reset();
    } catch {
      setMsg('❌ Erreur connexion — réessaie.');
      setStatus('error');
    }
  };

  return (
    <motion.div
      className="space-y-4"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
    >
      <h2 className="text-cyan-400 font-mono text-lg font-bold tracking-widest uppercase">
        Nouvelle Réservation
      </h2>

      {/* Car */}
      <div className={card}>
        <h3 className="text-xs text-gray-500 uppercase tracking-widest mb-3">Véhicule *</h3>
        <select
          className={inp}
          value={car}
          onChange={e => setCar(e.target.value)}
        >
          <option value="">Sélectionner une voiture…</option>
          {cars.map(c => (
            <option key={c.car_id} value={c.car_id}>
              {c.car_name} {c.available_now ? '✅' : '🔴'}
            </option>
          ))}
        </select>
        {selectedCar && !selectedCar.available_now && (
          <p className="text-xs text-red-400 mt-1.5 font-mono">
            ⚠ Actuellement réservée — vérifie les dates
          </p>
        )}
      </div>

      {/* Client */}
      <div className={card}>
        <h3 className="text-xs text-gray-500 uppercase tracking-widest mb-3">Client</h3>
        <div className="space-y-3">
          <div>
            <label className={lbl}>Nom complet *</label>
            <input className={inp} placeholder="Ahmed Benali" value={clientName} onChange={e => setClientName(e.target.value)} />
          </div>
          <div>
            <label className={lbl}>Téléphone *</label>
            <input className={inp} placeholder="0555123456" type="tel" value={clientPhone} onChange={e => setClientPhone(e.target.value)} />
          </div>
        </div>
      </div>

      {/* Dates */}
      <div className={card}>
        <h3 className="text-xs text-gray-500 uppercase tracking-widest mb-3">Dates *</h3>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={lbl}>Début</label>
            <input className={inp} type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
          </div>
          <div>
            <label className={lbl}>Fin</label>
            <input className={inp} type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
          </div>
        </div>
        {nbDays > 0 && (
          <p className="text-xs text-cyan-400 font-mono mt-2">{nbDays} jour{nbDays > 1 ? 's' : ''}</p>
        )}
      </div>

      {/* Prix */}
      <div className={card}>
        <h3 className="text-xs text-gray-500 uppercase tracking-widest mb-3">Prix</h3>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={lbl}>Client DA/j *</label>
            <input className={inp} type="number" placeholder="3500" value={clientPpd} onChange={e => setClientPpd(e.target.value)} />
          </div>
          <div>
            <label className={lbl}>Houari DA/j</label>
            <input className={inp} type="number" placeholder="2000" value={ownerPpd} onChange={e => setOwnerPpd(e.target.value)} />
          </div>
        </div>

        {/* Calcul auto */}
        {clientTotal > 0 && (
          <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs border-t border-gray-800/50 pt-3">
            <div>
              <div className="font-mono text-emerald-400">{clientTotal.toLocaleString()} DA</div>
              <div className="text-gray-600">CA client</div>
            </div>
            <div>
              <div className="font-mono text-violet-400">{ownerTotal > 0 ? `${ownerTotal.toLocaleString()} DA` : '—'}</div>
              <div className="text-gray-600">Houari</div>
            </div>
            <div>
              <div className={`font-mono ${profit != null ? (profit > 0 ? 'text-amber-400' : 'text-red-400') : 'text-gray-600'}`}>
                {profit != null ? `${profit.toLocaleString()} DA` : '—'}
              </div>
              <div className="text-gray-600">Profit</div>
            </div>
          </div>
        )}
      </div>

      {/* Notes */}
      <div className={card}>
        <label className={lbl}>Notes (optionnel)</label>
        <textarea
          className={`${inp} resize-none h-16`}
          placeholder="Livraison, acompte, remarques…"
          value={notes}
          onChange={e => setNotes(e.target.value)}
        />
      </div>

      {/* Status */}
      {msg && (
        <motion.div
          className={`text-sm font-mono px-4 py-2.5 rounded-lg border ${
            status === 'done'  ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/5' :
            status === 'error' ? 'text-red-400 border-red-500/30 bg-red-500/5' : ''
          }`}
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
        >
          {msg}
        </motion.div>
      )}

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={status === 'loading'}
        className="w-full py-3 rounded-lg font-mono text-sm uppercase tracking-widest font-bold transition-all
          bg-cyan-500/20 border border-cyan-500/40 text-cyan-400
          hover:bg-cyan-500/30 hover:border-cyan-400/60
          disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {status === 'loading' ? '⟳ Envoi en cours…' : '+ Créer la réservation'}
      </button>
    </motion.div>
  );
}
