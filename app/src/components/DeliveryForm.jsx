import { useRef, useState } from 'react';
import Icon from '../lib/icons';
import { useStore } from '../state/store';
import { extractInvoiceItemsLocally } from '../lib/pdfParser';
import { matchAllItems } from '../lib/matcher';

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

function deduplicateItems(items) {
  const seen = new Map();
  const result = [];
  for (const item of items) {
    const key = item.supplierCode
      ? `code:${item.supplierCode.trim().toLowerCase()}`
      : `name:${(item.invoiceName || '').trim().toLowerCase()}`;
    if (seen.has(key)) {
      seen.get(key).qtyExpected += (item.qtyExpected || 1);
      seen.get(key).qtyReceived = seen.get(key).qtyExpected;
    } else {
      const copy = { ...item };
      seen.set(key, copy);
      result.push(copy);
    }
  }
  return result;
}

export default function DeliveryForm() {
  const {
    activeDelivery, supplierRecencyOrder, supplierUsageCounts, history,
    startDelivery, updateDeliveryStep, setDeliveryItems, setDeliveryNotes,
  } = useStore();

  const [supplier, setSupplier] = useState(activeDelivery?.supplier || '');
  const [customSupplier, setCustomSupplier] = useState('');
  const [date, setDate] = useState(
    activeDelivery?.date ? activeDelivery.date.slice(0, 10) : new Date().toISOString().slice(0, 10)
  );
  const [notes, setNotes] = useState(activeDelivery?.notes || '');
  const [invoiceFile, setInvoiceFile] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');

  const fileRef = useRef();

  const historySuppliers = [...new Set((history || []).map(h => h.supplier).filter(Boolean))];
  const uniqueSuppliers = [
    ...supplierRecencyOrder.filter(s => historySuppliers.includes(s)),
    ...historySuppliers.filter(s => !supplierRecencyOrder.includes(s)),
  ];

  const effectiveSupplier = supplier === '__other__' ? customSupplier.trim() : supplier;

  const handleProcess = async () => {
    if (!invoiceFile || processing) return;
    setError('');
    setProcessing(true);
    try {
      const extracted = await extractInvoiceItemsLocally(invoiceFile);
      if (!extracted || extracted.length === 0) {
        throw new Error('No line items found. The PDF may be image-based or in an unsupported format.');
      }

      const withIds = extracted.map(item => ({
        ...item,
        id: uid(),
        qtyReceived: item.qtyExpected,
        status: 'pending',
        damageNote: '',
        swappedForCode: null,
        isBonus: false,
      }));

      const deduped = deduplicateItems(withIds);
      const { posItems, learnedMappings, matchCorrections } = useStore.getState();

      const matched = matchAllItems(deduped, {
        posItems, learnedMappings, matchCorrections, supplierName: effectiveSupplier,
      });

      await startDelivery(effectiveSupplier);
      if (notes) await setDeliveryNotes(notes);
      await setDeliveryItems(matched);

      const hasReview = matched.some(i => i.status === 'review');
      await updateDeliveryStep(hasReview ? 'review' : 'checklist');
    } catch (err) {
      setError(err.message || 'Failed to process invoice.');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div style={{ paddingTop: 16 }}>
      <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <Icon name="truck" size={20} /> New Delivery
      </h2>

      {/* Supplier */}
      <div style={{ marginBottom: 14 }}>
        <label style={{ fontSize: 12, color: 'var(--text2)', display: 'block', marginBottom: 4 }}>Supplier</label>
        {uniqueSuppliers.length ? (
          <select className="input" style={{ appearance: 'auto' }} value={supplier}
            onChange={e => setSupplier(e.target.value)}>
            <option value="">Select supplier...</option>
            {uniqueSuppliers.map(s => {
              const count = supplierUsageCounts?.[s]?.useCount;
              return <option key={s} value={s}>{s}{count ? ` · ${count} order${count !== 1 ? 's' : ''}` : ''}</option>;
            })}
            <option value="__other__">Other...</option>
          </select>
        ) : (
          <input className="input" placeholder="Enter supplier name" value={supplier}
            onChange={e => setSupplier(e.target.value)} />
        )}
        {supplier === '__other__' && (
          <input className="input" style={{ marginTop: 8 }} placeholder="Type supplier name"
            value={customSupplier}
            onChange={e => setCustomSupplier(e.target.value)}
            autoFocus />
        )}
      </div>

      {/* Date */}
      <div style={{ marginBottom: 14 }}>
        <label style={{ fontSize: 12, color: 'var(--text2)', display: 'block', marginBottom: 4 }}>Delivery Date</label>
        <input type="date" className="input" value={date} onChange={e => setDate(e.target.value)} />
      </div>

      {/* Invoice upload */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <Icon name="file" size={16} />
          <span style={{ fontSize: 13, fontWeight: 600 }}>Delivery Invoice</span>
        </div>
        <p style={{ fontSize: 11, color: 'var(--text3)', margin: '0 0 10px' }}>Upload the supplier invoice PDF</p>
        <input ref={fileRef} type="file" accept="application/pdf" style={{ display: 'none' }}
          onChange={e => { setInvoiceFile(e.target.files[0] || null); fileRef.current.value = ''; }} />
        {invoiceFile ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: 'var(--bg3)', borderRadius: 6 }}>
            <span style={{ flex: 1, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{invoiceFile.name}</span>
            <button onClick={() => setInvoiceFile(null)}
              style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 16 }}>✕</button>
          </div>
        ) : (
          <button className="btn btn-ghost" style={{ width: '100%', padding: 12 }}
            onClick={() => fileRef.current?.click()}>
            <Icon name="upload" size={16} /> Choose PDF
          </button>
        )}
      </div>

      {/* Notes */}
      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 12, color: 'var(--text2)', display: 'block', marginBottom: 4 }}>Notes (optional)</label>
        <textarea className="input" rows={2} placeholder="e.g. Box 3 was wet, driver arrived late..."
          value={notes} onChange={e => setNotes(e.target.value)} />
      </div>

      {error && (
        <div style={{ fontSize: 12, color: 'var(--red)', marginBottom: 12, padding: '8px 10px', background: '#f4433612', borderRadius: 6 }}>
          {error}
        </div>
      )}

      <button
        className={`btn${invoiceFile && !processing ? ' btn-primary' : ''}`}
        style={{ width: '100%', padding: 16, fontSize: 16, fontWeight: 700,
          border: `2px solid ${invoiceFile ? 'var(--green-dark)' : 'var(--border)'}` }}
        disabled={!invoiceFile || processing}
        onClick={handleProcess}>
        {processing
          ? <><span className="spinner">⟳</span> Processing PDF...</>
          : <><Icon name="zap" size={20} /> Check Delivery</>}
      </button>
    </div>
  );
}
