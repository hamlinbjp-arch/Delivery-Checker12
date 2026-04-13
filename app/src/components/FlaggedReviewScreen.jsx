import { useState, useMemo } from 'react';
import Icon from '../lib/icons';
import { useStore } from '../state/store';
import { searchPosItems } from '../lib/matcher';

function MatchBadge({ item }) {
  if (item.status === 'unmatched' || !item.matchLevel) {
    return <span style={{ fontSize: 11, color: 'var(--red)', fontWeight: 600 }}>Unmatched</span>;
  }
  const color = item.matchLevel <= 2 ? 'var(--green)' : 'var(--amber)';
  const label = { 1: 'L1', 2: 'L2', 3: 'L3' }[item.matchLevel] || `L${item.matchLevel}`;
  return (
    <span style={{ fontSize: 11, color, fontWeight: 600 }}>
      {label} · {item.matchConfidence}%
      {item.posDescription && (
        <span style={{ color: 'var(--text3)', fontWeight: 400 }}> · {item.posDescription}</span>
      )}
    </span>
  );
}

function ReviewItem({ item, posItems, supplier, addMatchCorrection, resolveItemWithPOS, markItemAsNewItem, addSplitToItem }) {
  const [mode, setMode] = useState(null); // 'link' | 'split' | null

  // Link POS state
  const [linkQuery, setLinkQuery] = useState('');
  const [linkResults, setLinkResults] = useState([]);

  // Split state
  const [splits, setSplits] = useState([{ posCode: '', posDescription: '', qty: 1, query: '', results: [] }]);

  const handleQuickConfirm = () => {
    addMatchCorrection({
      supplier,
      invoiceName: item.invoiceName,
      invoiceCode: item.supplierCode,
      posCode: item.posCode,
      posDescription: item.posDescription,
    });
    resolveItemWithPOS(item.id, { code: item.posCode, description: item.posDescription, price: item.posPrice });
  };

  const handleLinkSearch = (q) => {
    setLinkQuery(q);
    setLinkResults(q.length >= 2 ? searchPosItems(q, posItems) : []);
  };

  const handleLinkSelect = (p) => {
    addMatchCorrection({
      supplier,
      invoiceName: item.invoiceName,
      invoiceCode: item.supplierCode,
      posCode: p.code,
      posDescription: p.description,
    });
    resolveItemWithPOS(item.id, p);
  };

  const handleSplitSearch = (idx, q) => {
    const next = [...splits];
    next[idx] = { ...next[idx], query: q, results: q.length >= 2 ? searchPosItems(q, posItems) : [] };
    setSplits(next);
  };

  const handleSplitSelect = (idx, p) => {
    const next = [...splits];
    next[idx] = { ...next[idx], posCode: p.code, posDescription: p.description, query: p.description, results: [] };
    setSplits(next);
  };

  const handleSplitQty = (idx, val) => {
    const next = [...splits];
    next[idx] = { ...next[idx], qty: Number(val) || 0 };
    setSplits(next);
  };

  const handleSaveSplit = () => {
    const valid = splits.filter(s => s.posCode);
    if (!valid.length) return;
    addSplitToItem(item.id, valid.map(({ posCode, posDescription, qty }) => ({ posCode, posDescription, qty })));
  };

  const splitQtySum = splits.reduce((sum, s) => sum + (Number(s.qty) || 0), 0);
  const splitQtyMismatch = splitQtySum > 0 && splitQtySum !== item.qtyExpected;
  const name = item.invoiceName || item.posDescription || '(unknown)';

  return (
    <div className="card" style={{ marginBottom: 10 }}>
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>{name}</div>
        <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
          {item.supplierCode && (
            <span style={{ fontFamily: 'var(--font-mono)', marginRight: 8 }}>{item.supplierCode}</span>
          )}
          Qty {item.qtyExpected}
        </div>
        <div style={{ marginTop: 4 }}>
          <MatchBadge item={item} />
        </div>
      </div>

      {/* Action buttons */}
      {mode === null && (
        <div>
          {item.matchLevel === 3 && item.posCode && (
            <button
              className="btn btn-primary"
              style={{ width: '100%', fontSize: 13, padding: '9px 12px', marginBottom: 8, textAlign: 'left' }}
              onClick={handleQuickConfirm}>
              ✓ Confirm: {item.posDescription}
            </button>
          )}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button className="btn btn-primary" style={{ fontSize: 12, padding: '6px 12px' }}
              onClick={() => setMode('link')}>
              <Icon name="search" size={14} /> Link POS Item
            </button>
            <button className="btn btn-ghost" style={{ fontSize: 12, padding: '6px 12px' }}
              onClick={() => markItemAsNewItem(item.id)}>
              New Item
            </button>
            <button className="btn btn-ghost" style={{ fontSize: 12, padding: '6px 12px' }}
              onClick={() => setMode('split')}>
              Split
            </button>
          </div>
        </div>
      )}

      {/* Link POS panel */}
      {mode === 'link' && (
        <div>
          <input
            className="input"
            placeholder="Search POS items..."
            value={linkQuery}
            onChange={e => handleLinkSearch(e.target.value)}
            autoFocus
            style={{ marginBottom: 6, fontSize: 14 }}
          />
          {linkResults.length > 0 && (
            <div style={{ border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden', marginBottom: 8 }}>
              {linkResults.map(p => (
                <button key={p.code} onClick={() => handleLinkSelect(p)}
                  style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', background: 'var(--bg2)', border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer', fontSize: 13 }}>
                  <span style={{ fontWeight: 600 }}>{p.description}</span>
                  <span style={{ fontSize: 11, color: 'var(--text3)', marginLeft: 8, fontFamily: 'var(--font-mono)' }}>{p.code}</span>
                  {p.price != null && (
                    <span style={{ fontSize: 11, color: 'var(--text2)', marginLeft: 8 }}>${p.price.toFixed(2)}</span>
                  )}
                </button>
              ))}
            </div>
          )}
          <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => { setMode(null); setLinkQuery(''); setLinkResults([]); }}>Cancel</button>
        </div>
      )}

      {/* Split panel */}
      {mode === 'split' && (
        <div>
          <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 8 }}>
            Split invoice qty {item.qtyExpected} across multiple POS items:
          </div>
          {splits.map((s, idx) => (
            <div key={idx} style={{ background: 'var(--bg3)', borderRadius: 8, padding: '8px 10px', marginBottom: 6 }}>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }}>
                <input
                  className="input"
                  placeholder="Search POS..."
                  value={s.query}
                  onChange={e => handleSplitSearch(idx, e.target.value)}
                  style={{ flex: 1, fontSize: 13, padding: '6px 8px' }}
                />
                <input
                  type="number"
                  className="input"
                  value={s.qty}
                  onChange={e => handleSplitQty(idx, e.target.value)}
                  min={0}
                  style={{ width: 64, fontSize: 13, padding: '6px 8px', textAlign: 'center' }}
                />
                {splits.length > 1 && (
                  <button onClick={() => setSplits(prev => prev.filter((_, i) => i !== idx))}
                    style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', padding: 4, flexShrink: 0 }}>
                    <Icon name="x" size={14} />
                  </button>
                )}
              </div>
              {s.results.length > 0 && (
                <div style={{ border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
                  {s.results.map(p => (
                    <button key={p.code} onClick={() => handleSplitSelect(idx, p)}
                      style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 10px', background: 'var(--bg2)', border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer', fontSize: 12 }}>
                      {p.description}
                      <span style={{ fontSize: 11, color: 'var(--text3)', marginLeft: 6, fontFamily: 'var(--font-mono)' }}>{p.code}</span>
                    </button>
                  ))}
                </div>
              )}
              {s.posCode && (
                <div style={{ fontSize: 11, color: 'var(--green)', marginTop: 4 }}>
                  ✓ {s.posDescription} ({s.posCode})
                </div>
              )}
            </div>
          ))}

          {splitQtyMismatch && (
            <div style={{ fontSize: 12, color: 'var(--amber)', marginBottom: 8, padding: '6px 10px', background: '#e5a10014', borderRadius: 6 }}>
              Warning: split quantities ({splitQtySum}) don't match invoice qty ({item.qtyExpected})
            </div>
          )}

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <button className="btn btn-ghost" style={{ fontSize: 12 }}
              onClick={() => setSplits(prev => [...prev, { posCode: '', posDescription: '', qty: 1, query: '', results: [] }])}>
              + Add row
            </button>
            <button className="btn btn-primary" style={{ fontSize: 12 }}
              disabled={splits.every(s => !s.posCode)}
              onClick={handleSaveSplit}>
              Save Split
            </button>
            <button className="btn btn-ghost" style={{ fontSize: 12 }}
              onClick={() => { setMode(null); setSplits([{ posCode: '', posDescription: '', qty: 1, query: '', results: [] }]); }}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function FlaggedReviewScreen() {
  const {
    activeDelivery, posItems,
    addMatchCorrection, resolveItemWithPOS, markItemAsNewItem, addSplitToItem,
    set,
  } = useStore();

  const items = activeDelivery?.items || [];

  // Show only items explicitly in the review queue: no match found, or user flagged for review
  const yellowItems = useMemo(() =>
    items.filter(i => i.status === 'flagged' || i.status === 'unmatched'),
    [items]
  );

  if (!activeDelivery) {
    return (
      <div style={{ padding: '40px 12px', textAlign: 'center', color: 'var(--text3)' }}>
        No active delivery.
      </div>
    );
  }

  return (
    <div style={{ paddingTop: 8 }}>
      <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 12 }}>
        Review Queue{yellowItems.length > 0 ? ` (${yellowItems.length})` : ''}
      </div>

      {yellowItems.length === 0 ? (
        <div style={{ background: 'var(--bg3)', borderRadius: 10, padding: '24px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6, color: 'var(--green)' }}>
            All items resolved
          </div>
          <div style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 16 }}>
            Return to delivery to complete.
          </div>
          <button className="btn btn-primary" onClick={() => set({ page: 'delivery' })}>
            ← Back to Delivery
          </button>
        </div>
      ) : (
        <div style={{ paddingBottom: 24 }}>
          {yellowItems.map(item => (
            <ReviewItem
              key={item.id}
              item={item}
              posItems={posItems}
              supplier={activeDelivery.supplier}
              addMatchCorrection={addMatchCorrection}
              resolveItemWithPOS={resolveItemWithPOS}
              markItemAsNewItem={markItemAsNewItem}
              addSplitToItem={addSplitToItem}
            />
          ))}
        </div>
      )}
    </div>
  );
}
