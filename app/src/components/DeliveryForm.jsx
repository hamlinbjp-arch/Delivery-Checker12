import { useRef, useState } from 'react';
import Icon from '../lib/icons';
import { useStore } from '../state/store';
import { extractInvoiceItemsWithRetry } from '../lib/claude';
import { matchAllItems } from '../lib/matcher';
import { detectSupplierFromPDF } from '../lib/pdfParser';

// Combine duplicate invoice lines (same supplier code or same name) by summing quantities.
// Suppliers sometimes list the same item on two lines instead of setting qty 2.
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
    apiKey, activeDelivery, supplierMappings, supplierRecencyOrder, supplierUsageCounts,
    startDelivery, updateDeliveryStep, setDeliveryItems, setDeliveryNotes,
    set,
  } = useStore();

  // Local form state
  const [supplier, setSupplier] = useState(activeDelivery?.supplier || '');
  const [date, setDate] = useState(activeDelivery?.date ? activeDelivery.date.slice(0, 10) : new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState(activeDelivery?.notes || '');
  const [customSupplier, setCustomSupplier] = useState('');
  const [invoiceFiles, setInvoiceFiles] = useState([]);
  const [detecting, setDetecting] = useState(false);
  const [error, setError] = useState('');

  const pdfRef = useRef();
  const imgRef = useRef();

  // Supplier list: recency-ordered first, then remaining alphabetically
  const allSuppliers = [...new Set((supplierMappings || []).map(m => m.supplier).filter(Boolean))];
  const recencyOrder = supplierRecencyOrder || [];
  const uniqueSuppliers = [
    ...recencyOrder.filter(s => allSuppliers.includes(s)),
    ...allSuppliers.filter(s => !recencyOrder.includes(s)).sort(),
  ];

  const handleInvoiceFiles = async (files) => {
    const arr = Array.from(files);
    setInvoiceFiles(prev => [...prev, ...arr]);
    // Auto-detect supplier from PDF if not set
    if (!supplier && uniqueSuppliers.length) {
      const pdfFile = arr.find(f => f.type.includes('pdf') || f.name.toLowerCase().endsWith('.pdf'));
      if (pdfFile) {
        setDetecting(true);
        const detected = await detectSupplierFromPDF(pdfFile, uniqueSuppliers);
        setDetecting(false);
        if (detected) setSupplier(detected);
      }
    }
  };

  const handleProcess = async () => {
    if (!invoiceFiles.length || !apiKey) return;
    setError('');

    const effectiveSupplier = supplier === '__other__' ? customSupplier.trim() : supplier;

    // Initialize delivery record
    await startDelivery(effectiveSupplier);
    if (notes) await setDeliveryNotes(notes);

    // Navigate to dashboard immediately — don't wait for extraction
    await updateDeliveryStep('dashboard');
    set({ processStep: 'extracting', extractionError: null });

    // Background extraction — fire and forget
    const filesSnapshot = [...invoiceFiles];
    extractInvoiceItemsWithRetry(apiKey, filesSnapshot, () => set({ processStep: 'extracting', extractionError: null, extractingRetry: true }))
      .then(extracted => {
        set({ processStep: 'matching', extractingRetry: false });
        const deduped = deduplicateItems(extracted);
        const { supplierMappings: sm, posItems: pi, learningLayer: ll, matchCorrections: mc } = useStore.getState();
        const matched = matchAllItems(deduped, {
          supplierMappings: sm, posItems: pi, learningLayer: ll,
          matchCorrections: mc, supplierName: effectiveSupplier,
        });
        return setDeliveryItems(matched);
      })
      .then(() => set({ processStep: 'idle' }))
      .catch(err => set({ processStep: 'idle', extractingRetry: false, extractionError: err.message }));
  };

  return (
    <div style={{ paddingTop: 16 }}>
      <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <Icon name="truck" size={20} /> New Delivery
      </h2>

      {/* Supplier */}
      <div style={{ marginBottom: 14 }}>
        <label style={{ fontSize: 12, color: 'var(--text2)', display: 'block', marginBottom: 4 }}>
          Supplier {detecting && <span style={{ color: 'var(--amber)', fontWeight: 400 }}>· scanning PDF...</span>}
        </label>
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
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <Icon name="file" size={16} />
          <span style={{ fontSize: 13, fontWeight: 600 }}>Delivery Invoice</span>
        </div>
        <p style={{ fontSize: 11, color: 'var(--text3)', margin: '0 0 10px' }}>PDF invoice or photo of the delivery docket</p>
        <input ref={pdfRef} type="file" accept="application/pdf,image/*" multiple style={{ display: 'none' }}
          onChange={e => { handleInvoiceFiles(e.target.files); pdfRef.current.value = ''; }} />
        <input ref={imgRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
          onChange={e => { handleInvoiceFiles(e.target.files); imgRef.current.value = ''; }} />
        <div className="upload-zone">
          <button className="upload-add" onClick={() => pdfRef.current?.click()}>📄 Upload</button>
          <button className="upload-add" onClick={() => imgRef.current?.click()}>📷 Camera</button>
          {invoiceFiles.map((f, i) => (
            <div key={i} className="upload-file">
              <span>{f.name}</span>
              <button onClick={() => setInvoiceFiles(prev => prev.filter((_, j) => j !== i))}><Icon name="x" size={12} /></button>
            </div>
          ))}
        </div>
      </div>

      {/* Notes */}
      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 12, color: 'var(--text2)', display: 'block', marginBottom: 4 }}>Notes (optional)</label>
        <textarea className="input" rows={2} placeholder="e.g. Box 3 was wet, driver arrived late..."
          value={notes} onChange={e => setNotes(e.target.value)} />
      </div>

      {error && <div style={{ fontSize: 12, color: 'var(--red)', marginBottom: 12, padding: '8px 10px', background: '#f4433612', borderRadius: 6 }}>{error}</div>}

      {/* Process button */}
      <button
        className={`btn${invoiceFiles.length && apiKey ? ' btn-primary' : ''}`}
        style={{ width: '100%', padding: 16, fontSize: 16, fontWeight: 700, border: `2px solid ${invoiceFiles.length ? 'var(--green-dark)' : 'var(--border)'}` }}
        disabled={!invoiceFiles.length || !apiKey}
        onClick={handleProcess}>
        <Icon name="zap" size={20} /> Check Delivery
      </button>
      {!apiKey && <p style={{ fontSize: 12, color: 'var(--amber)', marginTop: 8, textAlign: 'center' }}>Set your API key in Settings first</p>}
    </div>
  );
}
