import { useEffect, useState, useCallback } from 'react';
import { api } from '../services/api.js';

interface Validation {
  id:       string;
  type:     'client_reply' | 'financial' | 'other';
  context:  { description?: string; action?: string };
  proposed: Record<string, unknown>;
  created_at: string;
}

const TYPE_LABEL: Record<string, string> = {
  client_reply: 'Réponse client',
  financial:    'Engagement financier',
  other:        'Autre',
};

const TYPE_COLOR: Record<string, string> = {
  client_reply: '#4a90e2',
  financial:    '#f5a623',
  other:        '#aaa',
};

export default function ValidationQueue() {
  const [validations, setValidations] = useState<Validation[]>([]);
  const [processing, setProcessing]   = useState<Set<string>>(new Set());
  const [note, setNote]               = useState<Record<string, string>>({});

  const fetchValidations = useCallback(async () => {
    try {
      const res = await api.getValidations();
      setValidations(res.validations as Validation[]);
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    fetchValidations();
    const interval = setInterval(fetchValidations, 3_000);
    return () => clearInterval(interval);
  }, [fetchValidations]);

  const decide = useCallback(async (id: string, decision: 'approved' | 'rejected') => {
    setProcessing(p => new Set(p).add(id));
    try {
      await api.decide(id, decision, note[id]);
      setValidations(v => v.filter(x => x.id !== id));
    } catch (err) {
      console.error(err);
    } finally {
      setProcessing(p => { const n = new Set(p); n.delete(id); return n; });
    }
  }, [note]);

  if (validations.length === 0) {
    return (
      <div style={{
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        height:         '100%',
        color:          'rgba(255,255,255,0.2)',
        fontSize:       14,
        fontFamily:     '-apple-system, sans-serif',
      }}>
        Aucune validation en attente
      </div>
    );
  }

  return (
    <div style={{
      width:      '100%',
      height:     '100%',
      overflow:   'auto',
      padding:    '16px',
      fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
    }}>
      <h2 style={{
        color:         'rgba(255,255,255,0.7)',
        fontSize:       16,
        fontWeight:     400,
        marginBottom:   16,
        letterSpacing:  2,
        textTransform:  'uppercase',
      }}>
        Validations ({validations.length})
      </h2>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {validations.map(v => (
          <div key={v.id} style={{
            background:   'rgba(255,255,255,0.04)',
            border:       `1px solid ${TYPE_COLOR[v.type] ?? '#444'}33`,
            borderTop:    `3px solid ${TYPE_COLOR[v.type] ?? '#444'}`,
            borderRadius: 14,
            padding:      '14px 16px',
          }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <span style={{
                background:   `${TYPE_COLOR[v.type]}22`,
                color:        TYPE_COLOR[v.type] ?? '#aaa',
                fontSize:     11,
                padding:      '3px 8px',
                borderRadius: 6,
                fontWeight:   600,
                letterSpacing: 0.5,
              }}>
                {TYPE_LABEL[v.type] ?? v.type}
              </span>
              <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: 11, marginLeft: 'auto' }}>
                {new Date(v.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>

            {/* Description */}
            {v.context.description && (
              <p style={{
                color:        'rgba(255,255,255,0.75)',
                fontSize:     14,
                lineHeight:   1.5,
                marginBottom: 12,
              }}>
                {v.context.description}
              </p>
            )}

            {/* Note input */}
            <textarea
              placeholder="Note optionnelle..."
              value={note[v.id] ?? ''}
              onChange={e => setNote(n => ({ ...n, [v.id]: e.target.value }))}
              style={{
                width:        '100%',
                background:   'rgba(255,255,255,0.05)',
                border:       '1px solid rgba(255,255,255,0.1)',
                borderRadius: 8,
                color:        '#fff',
                fontSize:     13,
                padding:      '8px 12px',
                resize:       'none',
                outline:      'none',
                marginBottom: 12,
                fontFamily:   'inherit',
                height:       56,
              }}
            />

            {/* Actions */}
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => decide(v.id, 'approved')}
                disabled={processing.has(v.id)}
                style={{
                  flex:         1,
                  padding:      '12px',
                  background:   processing.has(v.id) ? 'rgba(76,175,80,0.2)' : 'rgba(76,175,80,0.15)',
                  border:       '1px solid rgba(76,175,80,0.4)',
                  borderRadius: 10,
                  color:        '#4caf50',
                  fontSize:     14,
                  fontWeight:   600,
                  cursor:       processing.has(v.id) ? 'not-allowed' : 'pointer',
                  transition:   'all 0.15s',
                }}
              >
                ✓ Approuver
              </button>
              <button
                onClick={() => decide(v.id, 'rejected')}
                disabled={processing.has(v.id)}
                style={{
                  flex:         1,
                  padding:      '12px',
                  background:   'rgba(244,67,54,0.1)',
                  border:       '1px solid rgba(244,67,54,0.3)',
                  borderRadius: 10,
                  color:        '#f44336',
                  fontSize:     14,
                  fontWeight:   600,
                  cursor:       processing.has(v.id) ? 'not-allowed' : 'pointer',
                  transition:   'all 0.15s',
                }}
              >
                ✗ Refuser
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
