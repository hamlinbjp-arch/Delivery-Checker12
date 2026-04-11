import Icon from '../lib/icons';
import { useStore } from '../state/store';

const fmt = d => new Date(d).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' });

function exportCSV(delivery) {
  const headers = ['Item ID', 'Invoice Name', 'Supplier Code', 'Page', 'POS Code', 'POS Description', 'Match Level', 'Match Source', 'Confidence', 'Qty Expected', 'Qty Received', 'Status', 'Damage Note', 'Swapped For', 'Bonus'];
  const rows = (delivery.items || []).map(it => [
    it.id,
    it.invoiceName || '',
    it.supplierCode || '',
    it.pageNumber || '',
    it.posCode || '',
    it.posDescription || '',
    it.matchLevel || '',
    it.matchSource || '',
    it.matchConfidence || '',
    it.qtyExpected || '',
    it.qtyReceived ?? it.qtyExpected ?? '',
    it.status || '',
    it.damageNote || '',
    it.swappedForCode || '',
    it.isBonus ? 'Yes' : '',
  ]);
  const csv = [headers, ...rows].map(r => r.map(f => `"${String(f).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `delivery-${delivery.supplier || 'unknown'}-${(delivery.date || '').slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function exportNewItems(delivery) {
  // Export unmatched items as a simple list for manual POS entry
  const unmatched = (delivery.items || []).filter(i => !i.posCode || i.matchLevel === null);
  if (!unmatched.length) { alert('No unmatched items to export.'); return; }
  const rows = unmatched.map(it => [
    it.invoiceName || '',
    it.supplierCode || '',
    it.qtyExpected || '',
    it.posCode || '',
    it.posDescription || '',
  ]);
  const headers = ['Invoice Name', 'Supplier Code', 'Qty', 'Suggested POS Code', 'Suggested Description'];
  const csv = [headers, ...rows].map(r => r.map(f => `"${String(f).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `new-items-${delivery.supplier || 'unknown'}-${(delivery.date || '').slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function SummaryStep() {
  const { activeDelivery, finalizeDelivery, set } = useStore();

  if (!activeDelivery) return null;

  const items = activeDelivery.items || [];
  const counts = {
    total: items.length,
    confirmed: items.filter(i => i.status === 'confirmed').length,
    short: items.filter(i => i.status === 'short').length,
    damaged: items.filter(i => i.status === 'damaged').length,
    missing: items.filter(i => i.status === 'missing').length,
    setAside: items.filter(i => i.status === 'set-aside').length,
    swapped: items.filter(i => i.status === 'swapped').length,
    bonus: items.filter(i => i.isBonus).length,
    unmatched: items.filter(i => !i.posCode).length,
  };

  const handleDone = async () => {
    await finalizeDelivery();
    set({ page: 'history' });
  };

  return (
    <div style={{ paddingTop: 16 }}>
      <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <Icon name="check" size={20} /> Delivery Complete
      </h2>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)', marginBottom: 6 }}>
          {activeDelivery.supplier || 'Delivery'} · {fmt(activeDelivery.date)}
        </div>
        {activeDelivery.notes && (
          <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 8, fontStyle: 'italic' }}>{activeDelivery.notes}</div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <Stat label="Total" value={counts.total} />
          <Stat label="Confirmed" value={counts.confirmed} color="var(--green)" />
          {counts.short > 0 && <Stat label="Short" value={counts.short} color="var(--amber)" />}
          {counts.damaged > 0 && <Stat label="Damaged" value={counts.damaged} color="var(--red)" />}
          {counts.missing > 0 && <Stat label="Missing" value={counts.missing} color="var(--red)" />}
          {counts.setAside > 0 && <Stat label="Set Aside" value={counts.setAside} color="var(--text3)" />}
          {counts.swapped > 0 && <Stat label="Swapped" value={counts.swapped} color="#60a5fa" />}
          {counts.bonus > 0 && <Stat label="Bonus" value={counts.bonus} color="var(--green)" />}
          {counts.unmatched > 0 && <Stat label="Unmatched" value={counts.unmatched} color="var(--amber)" />}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
        <button className="btn btn-ghost" style={{ width: '100%', padding: 12 }}
          onClick={() => exportCSV(activeDelivery)}>
          <Icon name="download" size={16} /> Export CSV
        </button>
        {counts.unmatched > 0 && (
          <button className="btn btn-ghost" style={{ width: '100%', padding: 12 }}
            onClick={() => exportNewItems(activeDelivery)}>
            <Icon name="download" size={16} /> Export New Items ({counts.unmatched})
          </button>
        )}
      </div>

      <button className="btn btn-primary" style={{ width: '100%', padding: 14, fontSize: 15, fontWeight: 700 }}
        onClick={handleDone}>
        Done
      </button>
    </div>
  );
}

function Stat({ label, value, color }) {
  return (
    <div style={{ background: 'var(--bg3)', borderRadius: 8, padding: '8px 12px' }}>
      <div style={{ fontSize: 22, fontWeight: 800, color: color || 'var(--text1)' }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--text3)' }}>{label}</div>
    </div>
  );
}
