import { useState, useEffect } from 'react';
import Icon from '../lib/icons';
import { useStore } from '../state/store';

const fmt = d => new Date(d).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export default function History() {
  const { history, deleteHistoryRecord, set } = useStore();
  const [searchInput, setSearchInput] = useState('');
  const [q, setQ] = useState('');
  const [supplierFilter, setSupplierFilter] = useState('');
  const [pendingDel, setPendingDel] = useState(null);

  useEffect(() => {
    const t = setTimeout(() => setQ(searchInput), 150);
    return () => clearTimeout(t);
  }, [searchInput]);

  const suppliers = [...new Set(history.map(h => h.supplier).filter(Boolean))].sort();

  const filtered = history.filter(h => {
    if (supplierFilter && h.supplier !== supplierFilter) return false;
    if (q) {
      const lq = q.toLowerCase();
      const matchesHeader =
        (h.supplier || '').toLowerCase().includes(lq) ||
        fmt(h.date).toLowerCase().includes(lq);
      const matchesItem = (h.items || []).some(item =>
        (item.posDescription || '').toLowerCase().includes(lq) ||
        (item.invoiceName || '').toLowerCase().includes(lq) ||
        (item.posCode || '').includes(q) ||
        (item.scanCode || '').includes(q)
      );
      if (!matchesHeader && !matchesItem) return false;
    }
    return true;
  });

  return (
    <div style={{ paddingTop: 16 }}>
      <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <Icon name="clock" size={20} /> Delivery History
      </h2>

      {suppliers.length > 1 && (
        <select className="input" style={{ appearance: 'auto', marginBottom: 8, fontSize: 16 }}
          value={supplierFilter} onChange={e => { setSupplierFilter(e.target.value); setSearchInput(''); }}>
          <option value="">All suppliers</option>
          {suppliers.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      )}

      <input className="input" placeholder="Search by supplier or date..." style={{ marginBottom: 12, fontSize: 16 }}
        value={searchInput} onChange={e => setSearchInput(e.target.value)} />

      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text3)' }}>
          {history.length === 0 ? 'No deliveries recorded yet.' : 'No deliveries match your filter.'}
        </div>
      ) : filtered.map(h => (
        <div key={h.id} className="card hist-item">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}
            onClick={() => set({ viewingHistoryId: h.id, page: 'history' })}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{h.supplier || 'Unknown Supplier'}</div>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{fmt(h.date)}</div>
              <div style={{ display: 'flex', gap: 10, marginTop: 6, fontSize: 11 }}>
                <span style={{ color: 'var(--text2)' }}>{h.itemCount || h.items?.length || 0} items</span>
                {(h.issueCount || 0) > 0 && <span style={{ color: 'var(--amber)' }}>{h.issueCount} issues</span>}
              </div>
              {h.notes && <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4, fontStyle: 'italic' }}>📝 {h.notes}</div>}
            </div>
            <button className="btn" style={{ background: 'none', border: 'none', color: 'var(--text3)', padding: 4, flexShrink: 0 }}
              onClick={e => { e.stopPropagation(); setPendingDel(pendingDel === h.id ? null : h.id); }}>
              <Icon name="trash" size={16} />
            </button>
          </div>
          {pendingDel === h.id && (
            <div style={{ marginTop: 8, padding: '8px 10px', background: '#f4433612', border: '1px solid #f4433630', borderRadius: 6, fontSize: 12 }}>
              <div style={{ marginBottom: 8, color: 'var(--red)' }}>Delete this delivery record?</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-danger" style={{ fontSize: 11, padding: '5px 12px' }}
                  onClick={() => { deleteHistoryRecord(h.id); setPendingDel(null); }}>Yes, delete</button>
                <button className="btn btn-ghost" style={{ fontSize: 11, padding: '5px 12px' }}
                  onClick={() => setPendingDel(null)}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
