import { useState } from 'react';
import Icon from '../lib/icons';
import { useStore } from '../state/store';

const fmt = d => new Date(d).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' });

function exportDeliveryCSV(delivery, invoiceNumber) {
  const date = new Date().toLocaleDateString('en-AU', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const header1 = `${invoiceNumber},${date},,,,`;
  const header2 = 'Qty,Code,Description,Cost,Barcode,Category';
  const esc = v => String(v).includes(',') ? `"${String(v).replace(/"/g, '""')}"` : String(v);
  const receivedStatuses = ['confirmed', 'short', 'damaged', 'swapped', 'bonus'];
  const rows = [];
  for (const item of (delivery.items || [])) {
    if (!receivedStatuses.includes(item.status)) continue;
    if (item.splits?.length) {
      for (const split of item.splits) {
        rows.push([split.qty, split.posCode || '', esc(split.posDescription || ''), '', '', ''].join(','));
      }
    } else {
      const code = item.status === 'swapped' ? (item.swappedForCode || item.posCode) : item.posCode;
      const qty = item.qtyReceived ?? item.qtyExpected ?? 1;
      const cost = item.posPrice != null ? item.posPrice.toFixed(2) : '';
      rows.push([qty, code || '', esc(item.posDescription || ''), cost, '', ''].join(','));
    }
  }
  const csv = [header1, header2, ...rows].join('\n');
  const supplierName = (delivery.supplier || 'SUPPLIER').toUpperCase();
  const filename = `${supplierName}*INV ${invoiceNumber}.CSV`;
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function exportUnmatchedItems(delivery) {
  const unmatched = (delivery.items || []).filter(i => !i.posCode || i.status === 'unmatched');
  if (!unmatched.length) return;
  const headers = ['Invoice Name', 'Supplier Code', 'Qty', 'Suggested Code', 'Suggested Description'];
  const rows = unmatched.map(it => [it.invoiceName || '', it.supplierCode || '', it.qtyExpected || '', it.posCode || '', it.posDescription || '']);
  const csv = [headers, ...rows].map(r => r.map(f => `"${String(f).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `unmatched-${delivery.supplier || 'unknown'}-${(delivery.date || '').slice(0, 10)}.csv`; a.click();
  URL.revokeObjectURL(url);
}

function exportShortageReport(delivery) {
  const issues = (delivery.items || []).filter(i => ['short', 'damaged', 'missing'].includes(i.status));
  if (!issues.length) return;
  const lines = [
    'SHORTAGE REPORT',
    `Supplier: ${delivery.supplier || 'Unknown'}`,
    `Date: ${new Date(delivery.date).toLocaleDateString('en-AU')}`,
    '',
    ...issues.map(i => {
      let line = `${i.posDescription || i.invoiceName} [${i.posCode || ''}]`;
      if (i.status === 'short') line += ` — SHORT: ${i.qtyReceived ?? 0} of ${i.qtyExpected} received`;
      else if (i.status === 'damaged') line += ` — DAMAGED${i.damageNote ? ': ' + i.damageNote : ''}`;
      else if (i.status === 'missing') line += ` — MISSING (${i.qtyExpected} units)`;
      return line;
    }),
  ];
  const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `shortage-${delivery.supplier || 'unknown'}-${(delivery.date || '').slice(0, 10)}.txt`; a.click();
  URL.revokeObjectURL(url);
}

export default function SummaryStep() {
  const { activeDelivery, finalizeDelivery, set } = useStore();
  const [invoiceNumber, setInvoiceNumber] = useState('');

  if (!activeDelivery) return null;

  const items = activeDelivery.items || [];
  const counts = {
    total: items.length,
    confirmed: items.filter(i => i.status === 'confirmed').length,
    short: items.filter(i => i.status === 'short').length,
    damaged: items.filter(i => i.status === 'damaged').length,
    missing: items.filter(i => i.status === 'missing').length,
    swapped: items.filter(i => i.status === 'swapped').length,
    unmatched: items.filter(i => !i.posCode || i.status === 'unmatched').length,
    hasIssues: items.some(i => ['short', 'damaged', 'missing'].includes(i.status)),
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
          {counts.swapped > 0 && <Stat label="Swapped" value={counts.swapped} color="#60a5fa" />}
          {counts.unmatched > 0 && <Stat label="Unmatched" value={counts.unmatched} color="var(--amber)" />}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <div className="card-label">Idealpos Import</div>
        <label style={{ fontSize: 12, color: 'var(--text2)', display: 'block', marginBottom: 4 }}>
          Invoice Number (from delivery docket)
        </label>
        <input className="input" placeholder="e.g. 23456" value={invoiceNumber}
          onChange={e => setInvoiceNumber(e.target.value)} style={{ fontSize: 16, marginBottom: 8 }} />
        <button className="btn btn-primary" style={{ width: '100%', padding: 12 }}
          disabled={!invoiceNumber.trim()}
          onClick={() => exportDeliveryCSV(activeDelivery, invoiceNumber.trim())}>
          <Icon name="download" size={16} /> Export for Idealpos (Generic 2)
        </button>
        <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6 }}>
          Filename must match your Idealpos supplier name exactly for auto-import.
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
        {counts.unmatched > 0 && (
          <button className="btn btn-ghost" style={{ width: '100%', padding: 12 }}
            onClick={() => exportUnmatchedItems(activeDelivery)}>
            <Icon name="download" size={16} /> Export Unmatched Items ({counts.unmatched})
          </button>
        )}
        {counts.hasIssues && (
          <button className="btn btn-ghost" style={{ width: '100%', padding: 12 }}
            onClick={() => exportShortageReport(activeDelivery)}>
            <Icon name="download" size={16} /> Export Shortage Report
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