import { useState } from 'react';
import Icon from '../lib/icons';
import { useStore } from '../state/store';

const fmt = d => new Date(d).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export default function History() {
  const { history, deleteHistoryRecord, set } = useStore();
  const [q, setQ] = useState('');
  const filtered = q
    ? history.filter(h => (h.supplier || '').toLowerCase().includes(q.toLowerCase()) || fmt(h.date).toLowerCase().includes(q.toLowerCase()))
    : history;

  return (
    <div style={{ paddingTop: 16 }}>
      <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <Icon name="clock" size={20} /> Delivery History
      </h2>
      <input className="input" placeholder="Search by supplier or date..." style={{ marginBottom: 12, fontSize: 13 }}
        value={q} onChange={e => setQ(e.target.value)} />
      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text3)' }}>No deliveries recorded yet.</div>
      ) : filtered.map(h => (
        <div key={h.id} className="card hist-item"
          onClick={() => set({ viewingHistory: h, page: 'delivery', results: h.items })}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{h.supplier || 'Unknown Supplier'}</div>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{fmt(h.date)}</div>
              <div style={{ display: 'flex', gap: 10, marginTop: 6, fontSize: 11 }}>
                <span style={{ color: 'var(--text2)' }}>{h.itemCount || h.items?.length || 0} items</span>
                {(h.issueCount || 0) > 0 && <span style={{ color: 'var(--amber)' }}>{h.issueCount} issues</span>}
              </div>
              {h.notes && <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4, fontStyle: 'italic' }}>📝 {h.notes}</div>}
            </div>
            <button className="btn" style={{ background: 'none', border: 'none', color: 'var(--text3)', padding: 4 }}
              onClick={e => { e.stopPropagation(); if (confirm('Delete this record?')) deleteHistoryRecord(h.id); }}>
              <Icon name="trash" size={16} />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
