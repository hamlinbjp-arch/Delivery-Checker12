import { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import Icon from '../lib/icons';
import { useStore } from '../state/store';
import { searchPosItems, findByBarcode } from '../lib/matcher';
import ActionSheet from './ActionSheet';
import BarcodeScanner from './BarcodeScanner';
import AIPhotoIdentifier from './AIPhotoIdentifier';

function haptic(pattern) { try { navigator.vibrate(pattern); } catch {} }

function InlinePosSearch({ itemId, onSearch, results, onSelect }) {
  const [q, setQ] = useState('');
  return (
    <div style={{ padding: '0 12px 10px' }}>
      <input className="input" placeholder="Search POS items..." value={q}
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
  const { activeDelivery, posItems, apiKey, updateDeliveryItem, updateDeliveryStep } = useStore(s => ({
    activeDelivery: s.activeDelivery,
    posItems: s.posItems,
    apiKey: s.apiKey,
    updateDeliveryItem: s.updateDeliveryItem,
    updateDeliveryStep: s.updateDeliveryStep,
  }));

  const items = activeDelivery?.items || [];
  const [searchQuery, setSearchQuery] = useState('');
  const [actionItem, setActionItem] = useState(null);
  const [showScanner, setShowScanner] = useState(false);
  const [showAIPhoto, setShowAIPhoto] = useState(null);
  const [openSearchId, setOpenSearchId] = useState(null);
  const [searchResults, setSearchResults] = useState([]);
  const [barcodeHighlight, setBarcodeHighlight] = useState(null);
  const firstUnmatchedRef = useRef(null);

  const counts = useMemo(() => ({
    confirmed: items.filter(i => ['confirmed', 'swapped', 'short', 'damaged'].includes(i.status)).length,
    pending: items.filter(i => i.status === 'pending').length,
    setAside: items.filter(i => i.status === 'set-aside').length,
    unmatched: items.filter(i => i.status === 'unmatched').length,
    total: items.length,
  }), [items]);

  const sortedItems = useMemo(() => {
    const order = { unmatched: 0, pending: 1, 'set-aside': 2, confirmed: 3, short: 3, damaged: 3, swapped: 3, missing: 3 };
    return [...items].sort((a, b) => {
      const ao = order[a.status] ?? 1;
      const bo = order[b.status] ?? 1;
      if (ao !== bo) return ao - bo;
      if (a.status === 'pending' && b.status === 'pending') {
        return (a.matchLevel || 0) - (b.matchLevel || 0);
      }
      return 0;
    });
  }, [items]);

  const displayItems = useMemo(() => {
    if (!searchQuery.trim()) return sortedItems;
    const q = searchQuery.trim().toLowerCase();
    return sortedItems.filter(i =>
      (i.posDescription || '').toLowerCase().includes(q) ||
      (i.invoiceName || '').toLowerCase().includes(q) ||
      (i.posCode || '').includes(searchQuery.trim())
    );
  }, [sortedItems, searchQuery]);

  const unmatchedItems = useMemo(() => items.filter(i => i.status === 'unmatched' || i.status === 'set-aside'), [items]);
  const allDone = items.every(i => !['pending', 'unmatched'].includes(i.status));

  const handleConfirm = useCallback((item) => {
    updateDeliveryItem(item.id, { status: 'confirmed', qtyReceived: item.qtyExpected });
    haptic(30);
  }, [updateDeliveryItem]);

  const handleLongPress = useCallback((item) => {
    setActionItem(item);
    haptic([10, 30, 10]);
  }, []);

  const handleOpenSearch = (itemId) => {
    setOpenSearchId(openSearchId === itemId ? null : itemId);
    setSearchResults([]);
  };

  const handlePosSearch = (query) => {
    if (!query.trim()) { setSearchResults([]); return; }
    setSearchResults(searchPosItems(query, posItems || []));
  };

  const handleSelectPosItem = (deliveryItemId, posItem) => {
    const deliveryItem = items.find(i => i.id === deliveryItemId);
    updateDeliveryItem(deliveryItemId, {
      posCode: posItem.code,
      posDescription: posItem.description,
      posPrice: posItem.price,
      matchLevel: null,
      matchSource: 'manual',
      matchConfidence: 100,
      status: 'confirmed',
      qtyReceived: deliveryItem?.qtyExpected || 1,
    });
    useStore.getState().addLearning({
      supplier: activeDelivery?.supplier,
      invoiceName: deliveryItem?.invoiceName || '',
      posCode: posItem.code,
      posDescription: posItem.description,
      confirmedAt: new Date().toISOString(),
    });
    setOpenSearchId(null);
    haptic(30);
  };

  // Clear barcode highlight after 2s, properly cleaned up on unmount
  useEffect(() => {
    if (barcodeHighlight) {
      const t = setTimeout(() => setBarcodeHighlight(null), 2000);
      return () => clearTimeout(t);
    }
  }, [barcodeHighlight]);

  const handleBarcodeResult = (barcode) => {
    setShowScanner(false);
    const posItem = findByBarcode(barcode, posItems || []);
    if (!posItem) {
      setSearchQuery(barcode);
      return;
    }
    const match = items.find(i =>
      ['pending', 'unmatched'].includes(i.status) &&
      (i.posCode === posItem.code || !i.posCode)
    );
    if (match) {
      setBarcodeHighlight(match.id);
      document.getElementById(`item-${match.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      setSearchQuery(posItem.description);
    }
  };

  const handleAIMatch = (posCode, posDescription) => {
    if (!showAIPhoto) return;
    updateDeliveryItem(showAIPhoto.id, {
      posCode,
      posDescription,
      matchLevel: null,
      matchSource: 'ai',
      matchConfidence: 100,
      status: 'confirmed',
      qtyReceived: showAIPhoto.qtyExpected,
    });
    useStore.getState().addLearning({
      supplier: activeDelivery?.supplier,
      invoiceName: showAIPhoto.invoiceName || '',
      posCode,
      posDescription,
      confirmedAt: new Date().toISOString(),
    });
    setShowAIPhoto(null);
    haptic(30);
  };

  const handleAcceptFuzzy = (item) => {
    updateDeliveryItem(item.id, { status: 'confirmed', qtyReceived: item.qtyExpected, matchSource: 'learned' });
    useStore.getState().addLearning({
      supplier: activeDelivery?.supplier,
      invoiceName: item.invoiceName || '',
      posCode: item.posCode,
      posDescription: item.posDescription,
      confirmedAt: new Date().toISOString(),
    });
    haptic(30);
  };

  // Partition display items into groups
  const pendingMasterLearned = displayItems.filter(i => i.status === 'pending' && i.matchLevel !== 3);
  const pendingFuzzy = displayItems.filter(i => i.status === 'pending' && i.matchLevel === 3);
  const unmatched = displayItems.filter(i => i.status === 'unmatched');
  const confirmedItems = displayItems.filter(i => ['confirmed', 'short', 'damaged', 'swapped', 'missing'].includes(i.status));
  const setAsideItems = displayItems.filter(i => i.status === 'set-aside');

  const [showConfirmed, setShowConfirmed] = useState(() => {
    try { return JSON.parse(localStorage.getItem('checklist-ui-prefs'))?.showConfirmed ?? false; } catch { return false; }
  });
  const [showSetAside, setShowSetAside] = useState(() => {
    try { return JSON.parse(localStorage.getItem('checklist-ui-prefs'))?.showSetAside ?? false; } catch { return false; }
  });

  const toggleConfirmed = () => {
    const v = !showConfirmed;
    setShowConfirmed(v);
    try { localStorage.setItem('checklist-ui-prefs', JSON.stringify({ showConfirmed: v, showSetAside })); } catch {}
  };
  const toggleSetAside = () => {
    const v = !showSetAside;
    setShowSetAside(v);
    try { localStorage.setItem('checklist-ui-prefs', JSON.stringify({ showConfirmed, showSetAside: v })); } catch {}
  };

  let firstUnmatchedSet = false;

  return (
    <div style={{ paddingTop: 16 }}>
      {/* Sticky top section */}
      <div style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg)', paddingTop: 4, paddingBottom: 8 }}>
        {/* Progress counts */}
        <div style={{ display: 'flex', gap: 12, fontSize: 12, marginBottom: 8, flexWrap: 'wrap' }}>
          <span style={{ color: 'var(--green)' }}>✓ {counts.confirmed}</span>
          <span style={{ color: 'var(--amber)' }}>● {counts.pending} pending</span>
          {counts.setAside > 0 && <span style={{ color: 'var(--text3)' }}>📦 {counts.setAside} set aside</span>}
          {counts.unmatched > 0 && <span style={{ color: 'var(--red)' }}>❌ {counts.unmatched} unmatched</span>}
          <span style={{ color: 'var(--text3)', marginLeft: 'auto' }}>{counts.total} total</span>
        </div>

        {/* Search bar + scan */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1 }}>
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
          <button className="btn btn-ghost" style={{ padding: '10px 12px', flexShrink: 0 }}
            onClick={() => setShowScanner(true)}>
            <Icon name="camera" size={18} />
          </button>
        </div>
      </div>

      {/* Unmatched items */}
      {unmatched.map((item, idx) => {
        const isFirst = !firstUnmatchedSet;
        if (isFirst) firstUnmatchedSet = true;
        return (
          <div key={item.id} id={`item-${item.id}`} className="result-row row-red"
            ref={isFirst ? firstUnmatchedRef : null}
            style={{ marginBottom: 8, borderLeft: '3px solid var(--red)', background: 'var(--bg2)', borderRadius: 8 }}>
            <div className="row-header" style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 12px 6px' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--red)' }}>{item.invoiceName}</div>
                <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>
                  {item.supplierCode && `Code: ${item.supplierCode} · `}Qty {item.qtyExpected}
                  {item.pageNumber && ` · Page ${item.pageNumber}`}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, padding: '0 12px 10px', flexWrap: 'wrap' }}>
              <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => handleOpenSearch(item.id)}>🔍 Find in POS</button>
              <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => setShowAIPhoto(item)}>📷 Photo ID</button>
              <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => setActionItem(item)}>⋯ More</button>
            </div>
            {openSearchId === item.id && <InlinePosSearch itemId={item.id} onSearch={handlePosSearch} results={searchResults} onSelect={handleSelectPosItem} />}
          </div>
        );
      })}

      {/* Pending fuzzy items */}
      {pendingFuzzy.map(item => (
        <div key={item.id} id={`item-${item.id}`}
          style={{ marginBottom: 8, borderLeft: '3px solid var(--amber)', background: 'var(--bg2)', borderRadius: 8, overflow: 'hidden',
            backgroundColor: barcodeHighlight === item.id ? '#e5a10022' : undefined }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 12px 6px' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{item.posDescription}</div>
              <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>
                {item.invoiceName} · Qty {item.qtyExpected}
                <span style={{ marginLeft: 6, background: 'var(--amber)', color: '#000', borderRadius: 4, padding: '1px 5px', fontSize: 10 }}>
                  FUZZY {item.matchConfidence}%
                </span>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, padding: '0 12px 10px' }}>
            <button className="btn btn-primary" style={{ flex: 1, fontSize: 12 }} onClick={() => handleAcceptFuzzy(item)}>✓ Yes, this is correct</button>
            <button className="btn btn-ghost" style={{ flex: 1, fontSize: 12 }} onClick={() => handleOpenSearch(item.id)}>✗ Find correct item</button>
          </div>
          {openSearchId === item.id && <InlinePosSearch itemId={item.id} onSearch={handlePosSearch} results={searchResults} onSelect={handleSelectPosItem} />}
        </div>
      ))}

      {/* Pending master/learned items */}
      {pendingMasterLearned.map(item => (
        <div key={item.id} id={`item-${item.id}`}
          style={{ marginBottom: 8, borderLeft: '3px solid var(--green)', background: 'var(--bg2)', borderRadius: 8, cursor: 'pointer', userSelect: 'none',
            backgroundColor: barcodeHighlight === item.id ? '#52b78822' : undefined }}
          onClick={() => handleConfirm(item)}
          onContextMenu={e => { e.preventDefault(); handleLongPress(item); }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {item.posDescription || item.invoiceName}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>
                {item.invoiceName} · Qty {item.qtyExpected}
                <span style={{ marginLeft: 6, background: 'var(--green-dark, #166534)', color: '#fff', borderRadius: 4, padding: '1px 5px', fontSize: 10 }}>
                  {item.matchSource === 'master' ? 'MASTER' : 'LEARNED'}
                </span>
              </div>
            </div>
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
            <div key={item.id} id={`item-${item.id}`}
              style={{ marginBottom: 6, borderLeft: '3px solid var(--green)', background: 'var(--bg2)', borderRadius: 8, opacity: 0.85, cursor: 'pointer' }}
              onClick={() => setActionItem(item)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px' }}>
                <span style={{ fontSize: 16, flexShrink: 0 }}>✅</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.posDescription}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text3)' }}>
                    Qty {item.qtyReceived ?? item.qtyExpected}
                    {item.status !== 'confirmed' && <span style={{ marginLeft: 6, color: 'var(--amber)' }}>{item.status}</span>}
                  </div>
                </div>
                {item.posPrice != null && item.posPrice > 0 && (
                  <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--green)', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>
                    ${item.posPrice.toFixed(2)}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Set aside section — collapsible */}
      {setAsideItems.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', cursor: 'pointer', userSelect: 'none' }}
            onClick={toggleSetAside}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text3)' }}>📦 Set Aside ({setAsideItems.length})</span>
            <span style={{ fontSize: 12, color: 'var(--text3)' }}>{showSetAside ? '▲' : '▼'}</span>
          </div>
          {showSetAside && setAsideItems.map(item => (
            <div key={item.id} id={`item-${item.id}`}
              style={{ marginBottom: 6, borderLeft: '3px solid var(--text3)', background: 'var(--bg2)', borderRadius: 8, cursor: 'pointer' }}
              onClick={() => setActionItem(item)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px' }}>
                <span style={{ fontSize: 16, flexShrink: 0 }}>📦</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.invoiceName}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text3)' }}>Qty {item.qtyExpected}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Floating jump to unmatched */}
      {counts.unmatched > 0 && !searchQuery && (
        <button
          style={{
            position: 'fixed', bottom: 80, right: 16, zIndex: 20,
            background: 'var(--red)', color: '#fff', border: 'none', borderRadius: 20,
            padding: '8px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
            boxShadow: '0 2px 8px #00000066',
          }}
          onClick={() => firstUnmatchedRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })}>
          ⬆ {counts.unmatched} unmatched
        </button>
      )}

      {/* Bottom buttons */}
      <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: 80 }}>
        <button className="btn btn-primary" style={{ width: '100%', padding: 14, fontSize: 15, fontWeight: 700 }}
          onClick={() => updateDeliveryStep(allDone ? 'summary' : 'resolve')}>
          {allDone ? 'Continue to Summary →' : 'Done — Resolve Issues →'}
        </button>
      </div>

      {/* Modals */}
      {showScanner && <BarcodeScanner onResult={handleBarcodeResult} onClose={() => setShowScanner(false)} />}
      {showAIPhoto && (
        <AIPhotoIdentifier
          unmatchedItems={unmatchedItems}
          apiKey={apiKey}
          currentItem={showAIPhoto}
          onMatch={handleAIMatch}
          onNone={() => { updateDeliveryItem(showAIPhoto.id, { status: 'set-aside' }); setShowAIPhoto(null); }}
          onClose={() => setShowAIPhoto(null)}
        />
      )}
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
