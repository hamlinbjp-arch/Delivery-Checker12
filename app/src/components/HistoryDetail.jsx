import { useState } from 'react';
import Icon from '../lib/icons';
import { useStore } from '../state/store';

const fmt = d => new Date(d).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

const STATUS_COLORS = {
  confirmed: 'var(--green)',
  short: 'var(--amber)',
  damaged: 'var(--red)',
  'set-aside': 'var(--text3)',
  swapped: '#60a5fa',
  missing: 'var(--red)',
  pending: 'var(--text3)',
  unmatched: 'var(--amber)',
};

const MATCH_LEVEL_LABEL = { 1: 'L1 Master', 2: 'L2 Learned', 3: 'L3 Fuzzy' };

function exportCSV(record) {
  const headers = ['Invoice Name', 'Supplier Code', 'Page', 'POS Code', 'POS Description', 'Match Level', 'Match Source', 'Confidence', 'Qty Expected', 'Qty Received', 'Status', 'Damage Note', 'Swapped For'];
  const rows = (record.items || []).map(it => [
    it.invoiceName || '',
    it.supplierCode || '',
    it.pageNumber || '',
    it.posCode || '',
    it.posDescription || '',
    it.matchLevel ? MATCH_LEVEL_LABEL[it.matchLevel] || it.matchLevel : '',
    it.matchSource || '',
    it.matchConfidence || '',
    it.qtyExpected || '',
    it.qtyReceived ?? it.qtyExpected ?? '',
    it.status || '',
    it.damageNote || '',
    it.swappedForCode ? `${it.swappedForCode}${it.swappedForDescription ? ' – ' + it.swappedForDescription : ''}` : '',
  ]);
  const csv = [headers, ...rows].map(r => r.map(f => `"${String(f).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `delivery-${record.supplier || 'unknown'}-${(record.date || '').slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function ItemRow({ item }) {
  const [expanded, setExpanded] = useState(false);
  const name = item.posDescription || item.invoiceName || '(unknown)';
  const status = item.status || 'pending';
  const color = STATUS_COLORS[status] || 'var(--text3)';

  return (
    <div className="card" style={{ marginBottom: 6, borderLeft: `3px solid ${color}` }}>
      <div style={{ cursor: 'pointer' }} onClick={() => setExpanded(v => !v)}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
              {item.posCode && <span style={{ fontFamily: 'var(--font-mono)', marginRight: 8 }}>{item.posCode}</span>}
              Qty {item.qtyExpected}
            </div>
          </div>
          <span style={{ fontSize: 11, fontWeight: 600, color, flexShrink: 0, marginLeft: 8 }}>{status}</span>
        </div>
      </div>

      {expanded && (
        <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)', fontSize: 12, color: 'var(--text2)', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {item.invoiceName && item.invoiceName !== item.posDescription && (
            <div><span style={{ color: 'var(--text3)' }}>Invoice: </span>{item.invoiceName}</div>
          )}
          {item.supplierCode && (
            <div><span style={{ color: 'var(--text3)' }}>Supplier Code: </span><span style={{ fontFamily: 'var(--font-mono)' }}>{item.supplierCode}</span></div>
          )}
          {item.matchLevel && (
            <div><span style={{ color: 'var(--text3)' }}>Match: </span>{MATCH_LEVEL_LABEL[item.matchLevel] || item.matchSource} ({item.matchConfidence}%)</div>
          )}
          {item.qtyReceived !== undefined && item.qtyReceived !== item.qtyExpected && (
            <div style={{ color: 'var(--amber)' }}>Received: {item.qtyReceived} / {item.qtyExpected} expected</div>
          )}
          {item.damageNote && (
            <div style={{ color: 'var(--red)' }}>Damage: {item.damageNote}</div>
          )}
          {item.swappedForCode && (
            <div style={{ color: '#60a5fa' }}>
              Swapped for: {item.swappedForCode}{item.swappedForDescription ? ` – ${item.swappedForDescription}` : ''}
            </div>
          )}
          {item.isBonus && <div style={{ color: 'var(--green)' }}>Bonus item</div>}
          {item.posPrice != null && (
            <div><span style={{ color: 'var(--text3)' }}>Price: </span>${item.posPrice.toFixed(2)}</div>
          )}
        </div>
      )}
    </div>
  );
}

export default function HistoryDetail() {
  const { history, viewingHistoryId, set } = useStore();
  const record = history.find(h => h.id === viewingHistoryId);

  if (!record) {
    return (
      <div style={{ paddingTop: 16 }}>
        <button className="btn btn-ghost" style={{ marginBottom: 16 }} onClick={() => set({ viewingHistoryId: null })}>
          ← Back
        </button>
        <div style={{ color: 'var(--text3)', textAlign: 'center', padding: 40 }}>Record not found.</div>
      </div>
    );
  }

  const items = record.items || [];

  return (
    <div style={{ paddingTop: 16 }}>
      <button className="btn btn-ghost" style={{ marginBottom: 12, fontSize: 13 }}
        onClick={() => set({ viewingHistoryId: null })}>
        ← Back to History
      </button>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>{record.supplier || 'Unknown Supplier'}</div>
        <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>{fmt(record.date)}</div>
        {record.notes && <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 6, fontStyle: 'italic' }}>{record.notes}</div>}
        <div style={{ display: 'flex', gap: 12, marginTop: 8, fontSize: 12 }}>
          <span style={{ color: 'var(--text2)' }}>{items.length} items</span>
          {(record.issueCount || 0) > 0 && <span style={{ color: 'var(--amber)' }}>{record.issueCount} issues</span>}
        </div>
      </div>

      <button className="btn btn-ghost" style={{ marginBottom: 12, fontSize: 12 }}
        onClick={() => exportCSV(record)}>
        <Icon name="download" size={14} /> Export CSV
      </button>

      <div>
        {items.map(item => <ItemRow key={item.id} item={item} />)}
      </div>
    </div>
  );
}
