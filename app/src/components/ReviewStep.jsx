import { useState } from 'react';
import Icon from '../lib/icons';
import { useStore } from '../state/store';
import { searchPosItems } from '../lib/matcher';

const LEVEL_LABELS = { 1: 'L1', 2: 'L2', 3: 'L3' };
const LEVEL_COLORS = { 1: 'var(--green)', 2: 'var(--green)', 3: 'var(--amber)' };
const SOURCE_LABELS = { master: 'Master', learned: 'Learned', fuzzy: 'Fuzzy', manual: 'Manual', barcode: 'Barcode', ai: 'AI' };

function MatchBadge({ level, source, confidence }) {
  if (!level) return <span style={{ fontSize: 11, color: 'var(--red)', fontWeight: 600 }}>Unmatched</span>;
  const color = LEVEL_COLORS[level] || 'var(--text3)';
  return (
    <span style={{ fontSize: 11, color, fontWeight: 600 }}>
      {LEVEL_LABELS[level] || source} · {confidence}%
    </span>
  );
}

function ItemRow({ item, posItems, onOverride }) {
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);

  const handleSearch = (q) => {
    setQuery(q);
    setResults(q.length >= 2 ? searchPosItems(q, posItems) : []);
  };

  return (
    <div className="card" style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{item.invoiceName || '(no name)'}</div>
          {item.supplierCode && (
            <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 2, fontFamily: 'var(--font-mono)' }}>
              Supplier: {item.supplierCode}
            </div>
          )}
          <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4 }}>
            Qty: {item.qtyExpected} · Page {item.pageNumber}
          </div>
          <MatchBadge level={item.matchLevel} source={item.matchSource} confidence={item.matchConfidence} />
          {item.posCode && (
            <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2, fontFamily: 'var(--font-mono)' }}>
              {item.posCode} – {item.posDescription}
              {item.posPrice != null && <span style={{ color: 'var(--text3)' }}> · ${item.posPrice.toFixed(2)}</span>}
            </div>
          )}
        </div>
        <button className="btn btn-ghost" style={{ fontSize: 11, padding: '4px 8px', flexShrink: 0 }}
          onClick={() => setSearching(v => !v)}>
          {searching ? 'Close' : 'Override'}
        </button>
      </div>

      {searching && (
        <div style={{ marginTop: 10, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
          <input className="input" placeholder="Search POS items..." value={query}
            onChange={e => handleSearch(e.target.value)} autoFocus />
          {results.length > 0 && (
            <div style={{ marginTop: 6 }}>
              {results.map(r => (
                <button key={r.code} className="btn btn-ghost"
                  style={{ display: 'block', width: '100%', textAlign: 'left', fontSize: 12, padding: '6px 8px', marginBottom: 2 }}
                  onClick={() => { onOverride(item.id, r); setSearching(false); setQuery(''); setResults([]); }}>
                  <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text3)', marginRight: 6 }}>{r.code}</span>
                  {r.description}
                  {r.price != null && <span style={{ color: 'var(--text3)', marginLeft: 6 }}>${r.price.toFixed(2)}</span>}
                </button>
              ))}
            </div>
          )}
          {query.length >= 2 && results.length === 0 && (
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6 }}>No matches found</div>
          )}
          <button className="btn btn-ghost" style={{ marginTop: 6, fontSize: 11, color: 'var(--red)' }}
            onClick={() => { onOverride(item.id, null); setSearching(false); }}>
            Clear match
          </button>
        </div>
      )}
    </div>
  );
}

export default function ReviewStep() {
  const { activeDelivery, posItems, updateDeliveryItem, updateDeliveryStep, cancelDelivery } = useStore();
  const items = activeDelivery?.items || [];

  const handleOverride = (id, posItem) => {
    if (!posItem) {
      updateDeliveryItem(id, { posCode: null, posDescription: null, posPrice: null, matchLevel: null, matchSource: 'manual', matchConfidence: 0, status: 'unmatched' });
    } else {
      updateDeliveryItem(id, {
        posCode: posItem.code,
        posDescription: posItem.description,
        posPrice: posItem.price ?? null,
        matchLevel: null,
        matchSource: 'manual',
        matchConfidence: 100,
        status: 'pending',
      });
    }
  };

  const unmatchedCount = items.filter(i => !i.posCode).length;

  return (
    <div style={{ paddingTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon name="check" size={20} /> Review Matches
        </h2>
        <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => cancelDelivery()}>
          ← Cancel
        </button>
      </div>

      <div style={{ marginBottom: 12, fontSize: 12, color: 'var(--text2)' }}>
        {items.length} items extracted
        {unmatchedCount > 0 && <span style={{ color: 'var(--amber)', marginLeft: 8 }}>{unmatchedCount} unmatched</span>}
      </div>

      {items.map(item => (
        <ItemRow key={item.id} item={item} posItems={posItems} onOverride={handleOverride} />
      ))}

      <button className="btn btn-primary" style={{ width: '100%', padding: 14, fontSize: 15, fontWeight: 700, marginTop: 8 }}
        onClick={() => updateDeliveryStep('checklist')}>
        Looks Good → Checklist
      </button>
    </div>
  );
}
