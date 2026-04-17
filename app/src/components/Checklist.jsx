import { useState, useRef, useMemo, useCallback } from 'react';
import Icon from '../lib/icons';
import { useStore } from '../state/store';
import { searchPosItems } from '../lib/matcher';
import ActionSheet from './ActionSheet';

function haptic(pattern) { try { navigator.vibrate(pattern); } catch {} }

function InlinePosSearch({ itemId, onSearch, results, onSelect }) {
  const [q, setQ] = useState('');
  return (
    <div style={{ padding: '0 12px 10px' }}>
      <input className="input" placeholder="Search stock list..." value={q}
        onChange={e => { setQ(e.target.value); onSearch(e.target.value); }}
        autoFocus style={{ fontSize: 16, marginBottom: 6 }} />
      {results.map(p => (
        <div key={p.code} onClick={() => onSelect(itemId, p)}
          style={{ padding: '8px 4px', borderBottom: '1px solid var(--border)', cursor: 'pointer', display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 13 }}>{p.description}</span>
          {p.price > 0 && <span style={{ fontSize: 12, color: 'var(--green)', fontFamily: 'var(--font-mono)' }}>${p.price.toFixed(2)}</span>}
        </div>
      ))}
      {q.length > 1 && results.length === 0 && (
        <div style={{ fontSize: 12, color: 'var(--text3)', padding: '8px 0' }}>No matches found</div>
      )}
    </div>
  );
}

export default function Checklist() {
  const { activeDelivery, posItems, updateDeliveryItem, updateDeliveryStep } = useStore(s => ({
    activeDelivery: s.activeDelivery,
    posItems: s.posItems,
    updateDeliveryItem: s.updateDeliveryItem,
    updateDeliveryStep: s.updateDeliveryStep,
  }));

  const items = activeDelivery?.items || [];
  const [searchQuery, setSearchQuery] = useState('');
  const [actionItem, setActionItem] = useState(null);
  const [openSearchId, setOpenSearchId] = useState(null);
  const [searchResults, setSearchResults] = useState([]);

  const counts = useMemo(() => ({
    confirmed: items.filter(i => ['confirmed', 'swapped', 'short', 'damaged', 'missing'].includes(i.status)).length,
    pending: items.filter(i => i.status === 'pending').length,
    unmatched: items.filter(i => i.status === 'unmatched').length,
    na: items.filter(i => i.status === 'na').length,
    total: items.length,
  }), [items]);

  const sortedItems = useMemo(() => {
    const order = { unmatched: 0, pending: 1, confirmed: 2, short: 2, damaged: 2, swapped: 2, missing: 2, 'new-item': 2, na: 3 };
    return [...items].sort((a, b) => (order[a.status] ?? 1) - (order[b.status] ?? 1));
  }, [items]);

  const displayItems = useMemo(() => {
    if (!searchQuery.trim()) return sortedItems;
    const q = searchQuery.trim().toLowerCase();
    return sortedItems.filter(i =>
      (i.posDescription || '').toLowerCase().includes(q) ||
      (i.invoiceName || '').toLowerCase().includes(q) ||
      (i.posCode || '').toLowerCase().includes(q) ||
      (i.supplierCode || '').includes(searchQuery.trim())
    );
  }, [sortedItems, searchQuery]);

  const pendingItems = displayItems.filter(i => i.status === 'pending');
  const unmatchedItems = displayItems.filter(i => i.status === 'unmatched');
  const confirmedItems = displayItems.filter(i => ['confirmed', 'short', 'damaged', 'swapped', 'missing', 'new-item'].includes(i.status));
  const naItems = displayItems.filter(i => i.status === 'na');

  const allDone = items.every(i => !['pending', 'unmatched'].includes(i.status));

  const [showConfirmed, setShowConfirmed] = useState(() => {
    try { return JSON.parse(localStorage.getItem('checklist-ui-prefs'))?.showConfirmed ?? false; } catch { return false; }
  });

  const toggleConfirmed = () => {
    const v = !showConfirmed;
    setShowConfirmed(v);
    try { localStorage.setItem('checklist-ui-prefs', JSON.stringify({ showConfirmed: v })); } catch {}
  };

  const handleConfirm = useCallback((item) => {
    updateDeliveryItem(item.id, { status: 'confirmed', qtyReceived: item.qtyExpected });
    haptic(30);
  }, [updateDeliveryItem]);

  const handleOpenSearch = (itemId) => {
    setOpenSearchId(openSearchId === itemId ? null : itemId);
    setSearchResults([]);
  };

  const handlePosSearch = (query) => {
    setSearchResults(query.trim() ? searchPosItems(query, posItems || []) : []);
  };

  const handleSelectPosItem = async (deliveryItemId, posItem) => {
    const deliveryItem = items.find(i => i.id === deliveryItemId);
    updateDeliveryItem(deliveryItemId, {
      posCode: posItem.code,
      posDescription: posItem.description,
      posPrice: posItem.price,
      matchLevel: 1,
      matchSource: 'manual',
      matchConfidence: 100,
      status: 'confirmed',
      qtyReceived: deliveryItem?.qtyExpected || 1,
    });
    await useStore.getState().addLearnedMapping({
      supplierCode: deliveryItem?.supplierCode,
      invoiceName: deliveryItem?.invoiceName || '',
      posCode: posItem.code,
    });
    setOpenSearchId(null);
    haptic(30);
  };

  return (
    <div style={{ paddingTop: 16 }}>
      {/* Sticky top */}
      <div style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg)', paddingTop: 4, paddingBottom: 8 }}>
        <div style={{ display: 'flex', gap: 12, fontSize: 12, marginBottom: 8, flexWrap: 'wrap' }}>
          <span style={{ color: 'var(--green)' }}>✓ {counts.confirmed}</span>
          <span style={{ color: 'var(--amber)' }}>● {counts.pending} pending</span>
          {counts.unmatched > 0 && <span style={{ color: 'var(--red)' }}>❌ {counts.unmatched} unmatched</span>}
          {counts.na > 0 && <span style={{ color: 'var(--text3)' }}>— {counts.na} n/a</span>}
          <span style={{ color: 'var(--text3)', marginLeft: 'auto' }}>{counts.total} total</span>
        </div>
        <div style={{ position: 'relative' }}>
          <input
            className="input"
            placeholder="Search items..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{ paddingLeft: 32, fontSize: 16 }}
          />
          <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', opacity: 0.4 }}>
            <Icon name="search" size={14} />
          </span>
          {searchQuery && (
            <button onClick={() => setSearchQuery('')}
              style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 16 }}>✕</button>
          )}
        </div>
      </div>

      {/* Unmatched items */}
      {unmatchedItems.map(item => (
        <div key={item.id} id={`item-${item.id}`}
          style={{ marginBottom: 8, borderLeft: '3px solid var(--red)', background: 'var(--bg2)', borderRadius: 8 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 12px 6px' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--red)' }}>{item.invoiceName}</div>
              <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>
                {item.supplierCode && `Code: ${item.supplierCode} · `}Qty {item.qtyExpected}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, padding: '0 12px 10px', flexWrap: 'wrap' }}>
            <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => handleOpenSearch(item.id)}>
              🔍 Find in Stock List
            </button>
            <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => setActionItem(item)}>
              ⋯ More
            </button>
          </div>
          {openSearchId === item.id && (
            <InlinePosSearch itemId={item.id} onSearch={handlePosSearch} results={searchResults} onSelect={handleSelectPosItem} />
          )}
        </div>
      ))}

      {/* Pending matched items */}
      {pendingItems.map(item => (
        <div key={item.id} id={`item-${item.id}`}
          style={{ marginBottom: 8, borderLeft: '3px solid var(--green)', background: 'var(--bg2)', borderRadius: 8, cursor: 'pointer', userSelect: 'none' }}
          onClick={() => handleConfirm(item)}
          onContextMenu={e => { e.preventDefault(); setActionItem(item); haptic([10, 30, 10]); }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {item.posDescription || item.invoiceName}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>
                {item.invoiceName} · Qty {item.qtyExpected}
                <span style={{
                  marginLeft: 6, borderRadius: 4, padding: '1px 5px', fontSize: 10, fontWeight: 700,
                  background: item.matchSource === 'fuzzy' ? 'var(--amber)' : 'var(--green-dark, #166534)',
                  color: item.matchSource === 'fuzzy' ? '#000' : '#fff',
                }}>
                  {item.matchSource === 'code' ? 'CODE' :
                   item.matchSource === 'learned' ? 'LEARNED' :
                   item.matchSource === 'correction' ? 'CORRECTION' :
                   item.matchSource === 'fuzzy' ? `FUZZY ${item.matchConfidence}%` : 'MATCHED'}
                </span>
              </div>
            </div>
            {item.posPrice != null && item.posPrice > 0 && (
              <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--green)', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>
                ${item.posPrice.toFixed(2)}
              </div>
            )}
            <div style={{ fontSize: 11, color: 'var(--text3)', flexShrink: 0 }}>Tap ✓</div>
          </div>
        </div>
      ))}

      {/* Confirmed section — collapsible */}
      {confirmedItems.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', cursor: 'pointer', userSelect: 'none' }}
            onClick={toggleConfirmed}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--green)' }}>✅ Confirmed ({confirmedItems.length})</span>
            <span style={{ fontSize: 12, color: 'var(--text3)' }}>{showConfirmed ? '▲' : '▼'}</span>
          </div>
          {showConfirmed && confirmedItems.map(item => (
            <div key={item.id}
              style={{ marginBottom: 6, borderLeft: '3px solid var(--green)', background: 'var(--bg2)', borderRadius: 8, opacity: 0.85, cursor: 'pointer' }}
              onClick={() => setActionItem(item)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px' }}>
                <span style={{ fontSize: 16, flexShrink: 0 }}>
                  {item.status === 'new-item' ? '🆕' : '✅'}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.posDescription || item.invoiceName}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text3)' }}>
                    Qty {item.qtyReceived ?? item.qtyExpected}
                    {item.status !== 'confirmed' && item.status !== 'new-item' && (
                      <span style={{ marginLeft: 6, color: 'var(--amber)', textTransform: 'capitalize' }}>{item.status}</span>
                    )}
                  </div>
                </div>
                {item.posPrice != null && item.posPrice > 0 && (
                  <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--green)', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>
                    ${item.posPrice.toFixed(2)}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* N/A items */}
      {naItems.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 12, color: 'var(--text3)', padding: '4px 0 8px', fontWeight: 600 }}>
            — {naItems.length} Not Delivered (qty 0)
          </div>
          {naItems.map(item => (
            <div key={item.id}
              style={{ marginBottom: 4, padding: '6px 12px', background: 'var(--bg2)', borderRadius: 6, opacity: 0.5 }}>
              <div style={{ fontSize: 12, color: 'var(--text3)' }}>{item.invoiceName}</div>
            </div>
          ))}
        </div>
      )}

      {/* Jump to unmatched */}
      {counts.unmatched > 0 && !searchQuery && (
        <button
          style={{
            position: 'fixed', bottom: 80, right: 16, zIndex: 20,
            background: 'var(--red)', color: '#fff', border: 'none', borderRadius: 20,
            padding: '8px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
            boxShadow: '0 2px 8px #00000066',
          }}
          onClick={() => document.querySelector('[id^="item-"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}>
          ⬆ {counts.unmatched} unmatched
        </button>
      )}

      <div style={{ marginTop: 16, paddingBottom: 80 }}>
        <button className="btn btn-primary" style={{ width: '100%', padding: 14, fontSize: 15, fontWeight: 700 }}
          onClick={() => updateDeliveryStep('summary')}>
          {allDone ? 'Continue to Summary →' : `Done — ${counts.unmatched + counts.pending} remaining →`}
        </button>
      </div>

      {actionItem && (
        <ActionSheet
          item={actionItem}
          onAction={(id, patch) => { updateDeliveryItem(id, patch); setActionItem(null); haptic(patch.status === 'confirmed' ? 30 : [30, 50, 30]); }}
          onClose={() => setActionItem(null)}
        />
      )}
    </div>
  );
}
