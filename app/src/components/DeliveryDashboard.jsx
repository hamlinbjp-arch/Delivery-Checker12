import { useMemo, useState, useCallback } from 'react';
import { useStore, reviewCountSelector } from '../state/store';

function haptic(p) { try { navigator.vibrate(p); } catch {} }

// Colour logic — three states only
export const isGreen  = i => i.status === 'pending'  && i.matchLevel != null && i.matchLevel <= 2;
export const isYellow = i => i.status === 'flagged'  ||
                             i.status === 'unmatched' ||
                             (i.status === 'pending' && (i.matchLevel == null || i.matchLevel >= 3));
export const isGrey   = i => !isGreen(i) && !isYellow(i);

export default function DeliveryDashboard() {
  const {
    activeDelivery, processStep, extractionError,
    updateDeliveryItem, completeDelivery, set,
  } = useStore();

  const [search, setSearch] = useState('');
  const [completing, setCompleting] = useState(false);
  const [completeDismissed, setCompleteDismissed] = useState(false);

  const items = activeDelivery?.items || [];

  // Review queue count (X) — single source of truth via reviewCountSelector
  const reviewCount = useStore(reviewCountSelector);

  // Delivery complete: every item is grey (confirmed / new-item / short / etc.)
  const allDone = items.length > 0 && items.every(i => isGrey(i));

  // Sort: unconfirmed (green + yellow) preserve original order; confirmed after
  const sortedItems = useMemo(() => {
    const pending = [];
    const done = [];
    for (const item of items) {
      (isGrey(item) ? done : pending).push(item);
    }
    return [...pending, ...done];
  }, [items]);

  // Filtered by search
  const displayItems = useMemo(() => {
    if (!search.trim()) return sortedItems;
    const q = search.toLowerCase();
    return sortedItems.filter(i =>
      (i.posDescription || '').toLowerCase().includes(q) ||
      (i.invoiceName    || '').toLowerCase().includes(q) ||
      (i.posCode        || '').includes(search)
    );
  }, [sortedItems, search]);

  const handleTap = useCallback((item) => {
    if (isGreen(item)) {
      updateDeliveryItem(item.id, { status: 'confirmed', qtyReceived: item.qtyExpected });
      haptic(30);
    } else if (isYellow(item)) {
      if (item.status === 'flagged' || item.status === 'unmatched') return; // already in queue
      updateDeliveryItem(item.id, { status: 'flagged' });
      haptic([30, 50, 30]);
    }
    // Grey: no action on this screen
  }, [updateDeliveryItem]);

  const handleComplete = async () => {
    setCompleting(true);
    await completeDelivery();
    set({ page: 'history' });
  };

  const confirmedCount = items.filter(i => isGrey(i)).length;

  return (
    <div style={{ paddingTop: 8 }}>

      {/* Non-blocking extraction progress */}
      {processStep === 'extracting' && (
        <div style={{ background: 'var(--amber)', color: '#000', padding: '8px 14px', borderRadius: 8, marginBottom: 10, fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="spinner" style={{ fontSize: 16 }}>⟳</span>
          AI analyzing invoice… items loading
        </div>
      )}
      {extractionError && (
        <div style={{ background: '#f4433614', border: '1px solid var(--red)', color: 'var(--red)', padding: '8px 14px', borderRadius: 8, marginBottom: 10, fontSize: 13 }}>
          ⚠ Extraction failed: {extractionError}
          <button className="btn btn-ghost" style={{ marginLeft: 8, fontSize: 11, color: 'var(--red)' }}
            onClick={() => useStore.getState().set({ extractionError: null })}>Dismiss</button>
        </div>
      )}

      {/* Completion banner — non-blocking, appears only when allDone */}
      {allDone && !completeDismissed && (
        <div style={{ background: 'var(--green)', color: '#fff', padding: '14px', borderRadius: 10, marginBottom: 12 }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 10 }}>
            All items confirmed. Ready to complete delivery?
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={handleComplete}
              disabled={completing}
              style={{ flex: 1, background: '#fff', color: 'var(--green)', border: 'none', borderRadius: 8, padding: '10px', fontWeight: 800, fontSize: 14, cursor: 'pointer' }}>
              {completing ? 'Saving…' : 'Complete Delivery'}
            </button>
            <button
              onClick={() => setCompleteDismissed(true)}
              style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', borderRadius: 8, padding: '10px 14px', cursor: 'pointer', fontSize: 13 }}>
              Not yet
            </button>
          </div>
        </div>
      )}

      {/* Sticky search + counts */}
      <div style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg)', paddingBottom: 6, paddingTop: 2 }}>
        <input
          className="input"
          placeholder="Search items…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ fontSize: 16, marginBottom: 6 }}
        />
        {items.length > 0 && (
          <div style={{ display: 'flex', gap: 10, fontSize: 11, color: 'var(--text3)' }}>
            <span style={{ color: 'var(--green)' }}>✓ {confirmedCount}</span>
            {reviewCount > 0 && (
              <span
                style={{ color: 'var(--amber)', cursor: 'pointer', textDecoration: 'underline' }}
                onClick={() => set({ page: 'review' })}>
                ⚠ {reviewCount} need review
              </span>
            )}
            <span style={{ marginLeft: 'auto' }}>{items.length} total</span>
          </div>
        )}
      </div>

      {/* Item grid */}
      {displayItems.length === 0 && processStep !== 'extracting' && (
        <div style={{ textAlign: 'center', padding: 48, color: 'var(--text3)', fontSize: 14 }}>
          {items.length === 0 ? 'Waiting for invoice items…' : 'No items match your search.'}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, paddingBottom: 24 }}>
        {displayItems.map(item => {
          const green  = isGreen(item);
          const yellow = isYellow(item);
          const grey   = isGrey(item);
          const name   = item.posDescription || item.invoiceName || '(unknown)';
          const price  = item.posPrice;

          const bg      = green ? 'var(--green)' : yellow ? 'var(--amber)' : 'var(--bg3)';
          const fg      = green ? '#fff' : yellow ? '#000' : 'var(--text3)';
          const opacity = grey ? 0.65 : 1;

          return (
            <button
              key={item.id}
              onClick={() => handleTap(item)}
              style={{
                background: bg, color: fg, opacity,
                borderRadius: 10, border: 'none',
                cursor: grey ? 'default' : 'pointer',
                padding: '14px 12px', textAlign: 'left',
                minHeight: 90, display: 'flex',
                flexDirection: 'column', justifyContent: 'space-between',
                position: 'relative', userSelect: 'none',
              }}>
              <div style={{
                fontSize: 13, fontWeight: 700, lineHeight: 1.25, marginBottom: 6,
                overflow: 'hidden', display: '-webkit-box',
                WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
              }}>
                {name}
              </div>
              <div>
                <div style={{ fontSize: 11, opacity: 0.8 }}>Qty {item.qtyExpected}</div>
                {price != null && price > 0 && (
                  <div style={{ fontSize: 18, fontWeight: 800, fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                    ${price.toFixed(2)}
                  </div>
                )}
              </div>
              {grey && (
                <span style={{ position: 'absolute', top: 6, right: 8, fontSize: 16 }}>✓</span>
              )}
            </button>
          );
        })}
      </div>

    </div>
  );
}
