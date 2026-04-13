import { useState } from 'react';
import Icon from '../lib/icons';
import { useStore } from '../state/store';
import ActionSheet from './ActionSheet';

const STATUS_COLORS = {
  confirmed: 'var(--green)',
  short: 'var(--amber)',
  damaged: 'var(--red)',
  'set-aside': 'var(--text3)',
  swapped: '#60a5fa',
  missing: 'var(--red)',
  pending: 'var(--amber)',
  unmatched: 'var(--red)',
};

const STATUS_LABELS = {
  confirmed: 'Confirmed',
  short: 'Short',
  damaged: 'Damaged',
  'set-aside': 'Set Aside',
  swapped: 'Swapped',
  missing: 'Missing',
  pending: 'Pending',
  unmatched: 'Unmatched',
};

const NEEDS_RESOLVE = ['short', 'damaged', 'set-aside', 'missing', 'unmatched', 'pending'];

export default function ResolveStep() {
  const { activeDelivery, updateDeliveryItem, updateDeliveryStep, finalizeDelivery, addLearning, set } = useStore();
  const items = activeDelivery?.items || [];
  const [actionItem, setActionItem] = useState(null);
  const [finishing, setFinishing] = useState(false);

  const issueItems = items.filter(i => NEEDS_RESOLVE.includes(i.status));
  const okItems = items.filter(i => !NEEDS_RESOLVE.includes(i.status));

  const handleAction = (id, patch) => {
    updateDeliveryItem(id, patch);
    // Learn from manual matches
    if (patch.matchSource === 'manual' && patch.posCode) {
      const item = items.find(i => i.id === id);
      if (item?.invoiceName) {
        addLearning({
          invoiceName: item.invoiceName,
          posCode: patch.posCode,
          supplier: activeDelivery?.supplier,
          posDescription: patch.posDescription,
          confirmedAt: new Date().toISOString(),
        });
      }
    }
    setActionItem(null);
  };

  const handleFinish = async () => {
    setFinishing(true);
    await finalizeDelivery();
    set({ page: 'history' });
  };

  return (
    <div style={{ paddingTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon name="check" size={20} /> Resolve Issues
        </h2>
        <span style={{ fontSize: 12, color: 'var(--text2)' }}>
          {issueItems.length} issue{issueItems.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Step bar */}
      <div className="step-bar" style={{ marginBottom: 16 }}>
        <span className="step done">1. Form</span>
        <span className="step done">2. Review</span>
        <span className="step done">3. Check</span>
        <span className="step active">4. Resolve</span>
      </div>

      {issueItems.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text2)', fontSize: 14 }}>
          All items resolved!
        </div>
      ) : (
        <>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 10 }}>Tap an item to update its status:</div>
          {issueItems.map(item => {
            const name = item.posDescription || item.invoiceName || '(unknown)';
            const status = item.status || 'pending';
            const color = STATUS_COLORS[status] || 'var(--text3)';
            return (
              <div key={item.id} className="card" style={{ marginBottom: 8, cursor: 'pointer', userSelect: 'none', borderLeft: `3px solid ${color}` }}
                onClick={() => setActionItem(item)}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text3)' }}>
                      {item.supplierCode && <span style={{ fontFamily: 'var(--font-mono)', marginRight: 6 }}>{item.supplierCode}</span>}
                      Qty {item.qtyExpected}
                    </div>
                    {item.damageNote && (
                      <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 2 }}>Damage: {item.damageNote}</div>
                    )}
                    {item.status === 'short' && item.qtyReceived !== undefined && (
                      <div style={{ fontSize: 11, color: 'var(--amber)', marginTop: 2 }}>
                        Received: {item.qtyReceived} / {item.qtyExpected}
                      </div>
                    )}
                    {item.status === 'swapped' && item.swappedForCode && (
                      <div style={{ fontSize: 11, color: '#60a5fa', marginTop: 2 }}>
                        Swapped for: {item.swappedForCode} {item.swappedForDescription && `– ${item.swappedForDescription}`}
                      </div>
                    )}
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 600, color, flexShrink: 0 }}>{STATUS_LABELS[status]}</span>
                </div>
              </div>
            );
          })}
        </>
      )}

      {okItems.length > 0 && (
        <details style={{ marginTop: 8 }}>
          <summary style={{ fontSize: 12, color: 'var(--text3)', cursor: 'pointer', userSelect: 'none', padding: '6px 0' }}>
            {okItems.length} confirmed items
          </summary>
          <div style={{ marginTop: 6 }}>
            {okItems.map(item => (
              <div key={item.id} style={{ fontSize: 12, color: 'var(--text2)', padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                {item.posDescription || item.invoiceName}
              </div>
            ))}
          </div>
        </details>
      )}

      <button
        className="btn btn-primary"
        style={{ width: '100%', padding: 14, fontSize: 15, fontWeight: 700, marginTop: 16 }}
        disabled={finishing}
        onClick={handleFinish}>
        {finishing ? <><span className="spinner">⟳</span> Saving...</> : 'Save & Finish →'}
      </button>

      {actionItem && (
        <ActionSheet item={actionItem} onAction={handleAction} onClose={() => setActionItem(null)} />
      )}
    </div>
  );
}
