import { useStore } from '../state/store';
import Icon from '../lib/icons';

export default function ReviewStep() {
  const { activeDelivery, updateDeliveryItem, updateDeliveryStep, cancelDelivery, addLearnedMapping } = useStore();
  const items = activeDelivery?.items || [];
  const reviewItems = items.filter(i => i.status === 'review');

  const handleAccept = async (item) => {
    updateDeliveryItem(item.id, { status: 'pending', matchSource: 'learned' });
    await addLearnedMapping({ supplierCode: item.supplierCode, invoiceName: item.invoiceName, posCode: item.posCode });
  };

  const handleReject = (item) => {
    updateDeliveryItem(item.id, {
      status: 'unmatched',
      posCode: null,
      posDescription: null,
      posPrice: null,
      matchLevel: null,
      matchSource: null,
      matchConfidence: 0,
    });
  };

  const handleContinue = () => updateDeliveryStep('checklist');

  if (reviewItems.length === 0) {
    handleContinue();
    return null;
  }

  return (
    <div style={{ paddingTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon name="flag" size={20} /> Review Matches
        </h2>
        <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => cancelDelivery()}>
          Cancel
        </button>
      </div>

      <p style={{ fontSize: 12, color: 'var(--text2)', margin: '0 0 14px' }}>
        These items were fuzzy-matched. Confirm each match is correct before continuing.
      </p>

      {reviewItems.map(item => (
        <div key={item.id} style={{
          marginBottom: 10, background: 'var(--bg2)', borderRadius: 8,
          border: '1px solid var(--border)', overflow: 'hidden',
        }}>
          <div style={{ padding: '10px 12px 6px' }}>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 2 }}>Invoice:</div>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>
              {item.invoiceName}
              {item.supplierCode && (
                <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--font-mono)', fontWeight: 400 }}>
                  #{item.supplierCode}
                </span>
              )}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 2 }}>Matched to:</div>
            <div style={{ fontSize: 13, color: 'var(--text1)', marginBottom: 4 }}>
              {item.posDescription}
              {item.posPrice != null && (
                <span style={{ marginLeft: 8, color: 'var(--green)', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                  ${item.posPrice.toFixed(2)}
                </span>
              )}
            </div>
            <div style={{ display: 'inline-block', fontSize: 10, fontWeight: 700, background: 'var(--amber)', color: '#000', borderRadius: 4, padding: '2px 6px' }}>
              FUZZY {item.matchConfidence}%
            </div>
            <span style={{ fontSize: 11, color: 'var(--text3)', marginLeft: 8 }}>Qty: {item.qtyExpected}</span>
          </div>
          <div style={{ display: 'flex', borderTop: '1px solid var(--border)' }}>
            <button
              className="btn"
              style={{ flex: 1, borderRadius: 0, background: 'var(--green)', color: '#fff', fontWeight: 700, fontSize: 13, padding: '10px 0' }}
              onClick={() => handleAccept(item)}>
              ✓ Accept
            </button>
            <button
              className="btn btn-ghost"
              style={{ flex: 1, borderRadius: 0, fontSize: 13, padding: '10px 0', borderLeft: '1px solid var(--border)' }}
              onClick={() => handleReject(item)}>
              ✗ Reject
            </button>
          </div>
        </div>
      ))}

      <button className="btn btn-primary"
        style={{ width: '100%', padding: 14, fontSize: 15, fontWeight: 700, marginTop: 8 }}
        onClick={handleContinue}>
        Continue to Checklist →
      </button>
    </div>
  );
}
