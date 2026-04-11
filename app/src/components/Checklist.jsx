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
  pending: 'var(--text3)',
  unmatched: 'var(--amber)',
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

function haptic(pattern) {
  try { navigator.vibrate(pattern); } catch {}
}

export default function Checklist() {
  const { activeDelivery, updateDeliveryStep, updateDeliveryItem } = useStore();
  const items = activeDelivery?.items || [];
  const [actionItem, setActionItem] = useState(null);

  const confirmed = items.filter(i => i.status === 'confirmed' || i.status === 'swapped').length;
  const total = items.length;
  const allActioned = items.every(i => i.status !== 'pending' && i.status !== 'unmatched');

  const handleAction = (id, patch) => {
    updateDeliveryItem(id, patch);
    if (patch.status === 'confirmed') haptic(30);
    else if (patch.status === 'short' || patch.status === 'damaged') haptic([30, 50, 30]);
    setActionItem(null);
  };

  return (
    <div style={{ paddingTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon name="check" size={20} /> Checklist
        </h2>
        <span style={{ fontSize: 12, color: 'var(--text2)' }}>{confirmed}/{total}</span>
      </div>

      {/* Progress bar */}
      <div style={{ height: 4, background: 'var(--bg3)', borderRadius: 2, marginBottom: 16, overflow: 'hidden' }}>
        <div style={{ height: '100%', background: 'var(--green)', borderRadius: 2, width: `${total ? (confirmed / total) * 100 : 0}%`, transition: 'width 0.3s' }} />
      </div>

      {/* Step bar */}
      <div className="step-bar" style={{ marginBottom: 12 }}>
        <span className="step done">1. Form</span>
        <span className="step done">2. Review</span>
        <span className="step active">3. Check</span>
        <span className="step">4. Resolve</span>
      </div>

      {items.map(item => {
        const name = item.posDescription || item.invoiceName || '(unknown)';
        const status = item.status || 'pending';
        const color = STATUS_COLORS[status] || 'var(--text3)';
        return (
          <div key={item.id} className="card" style={{ marginBottom: 8, cursor: 'pointer', userSelect: 'none' }}
            onClick={() => setActionItem(item)}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%', border: `2px solid ${color}`,
                background: status === 'confirmed' || status === 'swapped' ? color : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                {(status === 'confirmed' || status === 'swapped') && <Icon name="check" size={14} color="#fff" />}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
                <div style={{ fontSize: 11, color: 'var(--text3)' }}>
                  Qty {item.qtyExpected}
                  {item.posCode && <span style={{ marginLeft: 6, fontFamily: 'var(--font-mono)' }}>{item.posCode}</span>}
                </div>
              </div>
              <div style={{ fontSize: 11, fontWeight: 600, color, flexShrink: 0 }}>{STATUS_LABELS[status]}</div>
            </div>
          </div>
        );
      })}

      <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button className="btn btn-primary" style={{ width: '100%', padding: 14, fontSize: 15, fontWeight: 700 }}
          onClick={() => updateDeliveryStep('resolve')}>
          {allActioned ? 'Resolve Issues →' : 'Skip to Resolve →'}
        </button>
      </div>

      {actionItem && (
        <ActionSheet item={actionItem} onAction={handleAction} onClose={() => setActionItem(null)} />
      )}
    </div>
  );
}
