import { useRef, useState } from 'react';
import Icon from '../lib/icons';
import { useStore } from '../state/store';
import { callClaude } from '../lib/claude';
import { findBestPOSMatch, fuzzyScore } from '../lib/fuzzy';
import { resizeImage, fileToBase64 } from '../lib/imageUtils';
import { detectSupplierFromPDF } from '../lib/pdfParser';

async function doProcessDelivery(getState, set) {
  const { apiKey, reportFiles, itemPhotos, scannedBarcodes, selectedSupplier, deliveryNotes, posData, suppliers, uid } = getState();
  set({ processing: true, processStep: 'Reading files...' });
  try {
    const content = [];
    for (const f of reportFiles) {
      const isPdf = f.type.includes('pdf');
      const b64 = isPdf ? await fileToBase64(f) : await resizeImage(f);
      content.push(isPdf
        ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } }
        : { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64 } });
    }
    for (const f of itemPhotos) {
      const b64 = await resizeImage(f);
      content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64 } });
    }
    const supProfile = suppliers.find(s => s.name === selectedSupplier);
    const supContext = supProfile ? `Supplier: ${supProfile.name}. Notes: ${supProfile.notes || 'none'}.` : '';
    content.push({ type: 'text', text: `Analyze this delivery report/invoice.${itemPhotos.length ? ' The additional images are photos of the delivered items.' : ''}
${supContext}
${scannedBarcodes.length ? 'Scanned barcodes: ' + scannedBarcodes.join(', ') : ''}
Extract ALL line items from the delivery report. Preserve the original order.
Items often appear as "CODE - Product Name" (e.g. "225127 - Booty Cleanser") — separate the supplier code from the product name.
Return ONLY a JSON array for EVERY line item (no markdown, no explanation):
[{"name":"clean product name only","supplierCode":"supplier code or empty string","qtyExpected":number,"pageNumber":page number this item appears on}]
Include EVERY line item.` });

    set({ processStep: 'AI analyzing delivery...' });
    const data = await callClaude(apiKey, [{ role: 'user', content }],
      'You are a delivery reconciliation assistant. Analyze delivery documents carefully. Return only valid JSON.');
    const text = data.content.map(c => c.text || '').join('');
    const stripped = text.replace(/```[a-z]*\n?/g, '').replace(/```/g, '').trim();
    const s = stripped.indexOf('['), e = stripped.lastIndexOf(']');
    let items;
    try { items = s >= 0 && e > s ? JSON.parse(stripped.slice(s, e + 1)) : JSON.parse(stripped); }
    catch { throw new Error('Could not parse delivery data'); }

    set({ processStep: 'Matching POS stocklist...' });
    const mappings = supProfile?.mappings || {};
    const aliases = posData?.aliases || {};
    let allPosItems = posData?.items || [];
    let posItemsForMatch = allPosItems;
    if (selectedSupplier && allPosItems.some(p => p.supplier)) {
      const sf = allPosItems.filter(p => p.supplier && fuzzyScore(selectedSupplier, p.supplier) >= 50);
      if (sf.length >= 3) { posItemsForMatch = sf; set({ processStep: `Matching against ${sf.length} ${selectedSupplier} POS items...` }); }
    }

    const reconciled = items.map(item => {
      const cleanName = (item.name || '').replace(/^\d[\d\s]*[-–]\s*/, '').trim() || item.name || '';
      const supplierCode = item.supplierCode || '';
      const pageNumber = item.pageNumber || null;
      let bcMatch = null;
      if (scannedBarcodes.length && allPosItems.length) {
        for (const bc of scannedBarcodes) { const pm = allPosItems.find(p => p.code === bc); if (pm && fuzzyScore(cleanName, pm.description) > 40) { bcMatch = pm; break; } }
      }
      const posMatch = bcMatch ? { code: bcMatch.code, name: bcMatch.description, confidence: 99 } : findBestPOSMatch(cleanName, posItemsForMatch, mappings, aliases, supplierCode);
      const isNew = posMatch.confidence < 45;
      return {
        id: uid(), name: cleanName, supplierCode, pageNumber, qtyExpected: item.qtyExpected || 0,
        posCode: posMatch.code, posName: posMatch.name, confidence: posMatch.confidence,
        status: isNew ? 'NEW ITEM' : 'Matched', damaged: false, damageNote: '', manualNotes: '', qtyReceived: item.qtyExpected || 0,
        learned: posMatch.learned || false, aliased: posMatch.aliased || false, byCode: posMatch.byCode || false,
        posSupplier: posItemsForMatch.find(p => p.code === posMatch.code)?.supplier || '',
      };
    });

    set({ results: reconciled, deliveryStep: 'verify' });
  } catch (err) {
    alert('Error: ' + err.message);
  } finally {
    set({ processing: false, processStep: '' });
  }
}

export default function DeliveryForm() {
  const { suppliers, selectedSupplier, deliveryNotes, reportFiles, itemPhotos, scannedBarcodes, processing, processStep, apiKey, posData, set } = useStore();
  const pdfRef = useRef();
  const imgRef = useRef();
  const photoCamRef = useRef();
  const photoFileRef = useRef();
  const bcRef = useRef();
  const [detecting, setDetecting] = useState(false);

  const addBc = () => { const v = bcRef.current?.value?.trim(); if (v && !scannedBarcodes.includes(v)) { set({ scannedBarcodes: [...scannedBarcodes, v] }); bcRef.current.value = ''; } };

  const handlePDFUpload = async (files) => {
    const arr = Array.from(files);
    set({ reportFiles: [...reportFiles, ...arr] });
    pdfRef.current.value = '';
    // Auto-detect supplier from the PDF if none selected
    if (!selectedSupplier) {
      const knownNames = suppliers.length
        ? suppliers.map(s => s.name)
        : [...new Set((posData?.items || []).map(p => p.supplier).filter(Boolean))];
      if (knownNames.length) {
        const pdfFile = arr.find(f => f.type.includes('pdf') || f.name.toLowerCase().endsWith('.pdf'));
        if (pdfFile) {
          setDetecting(true);
          const detected = await detectSupplierFromPDF(pdfFile, knownNames);
          setDetecting(false);
          if (detected) set({ selectedSupplier: detected });
        }
      }
    }
  };

  return (
    <div style={{ paddingTop: 16 }}>
      <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: 8 }}><Icon name="truck" size={20} /> New Delivery</h2>

      <div style={{ marginBottom: 14 }}>
        <label style={{ fontSize: 12, color: 'var(--text2)', display: 'block', marginBottom: 4 }}>
          Supplier {detecting && <span style={{ color: 'var(--amber)', fontWeight: 400 }}>· scanning PDF...</span>}
        </label>
        {suppliers.length ? (
          <select className="input" style={{ appearance: 'auto' }} value={selectedSupplier}
            onChange={e => set({ selectedSupplier: e.target.value })}>
            <option value="">Select supplier...</option>
            {suppliers.map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
          </select>
        ) : (
          <input className="input" placeholder="Enter supplier name" value={selectedSupplier}
            onChange={e => set({ selectedSupplier: e.target.value })} />
        )}
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 12, color: 'var(--text2)', display: 'block', marginBottom: 4 }}>Delivery Notes</label>
        <textarea className="input" rows={2} placeholder="e.g. Box 3 was wet, driver arrived late..."
          value={deliveryNotes} onChange={e => set({ deliveryNotes: e.target.value })} />
      </div>

      {/* Report upload — separate PDF and photo buttons */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}><Icon name="file" size={16} /><span style={{ fontSize: 13, fontWeight: 600 }}>Delivery Report / Invoice</span></div>
        <p style={{ fontSize: 11, color: 'var(--text3)', margin: '0 0 10px' }}>PDF invoice or photo of the delivery docket</p>
        <input ref={pdfRef} type="file" accept="application/pdf" multiple style={{ display: 'none' }}
          onChange={e => { handlePDFUpload(e.target.files); }} />
        <input ref={imgRef} type="file" accept="image/*" multiple style={{ display: 'none' }}
          onChange={e => { set({ reportFiles: [...reportFiles, ...Array.from(e.target.files)] }); e.target.value = ''; }} />
        <div className="upload-zone">
          <button className="upload-add" onClick={() => pdfRef.current?.click()}>📄 Upload PDF</button>
          <button className="upload-add" onClick={() => imgRef.current?.click()}>📷 Photo</button>
          {reportFiles.map((f, i) => (
            <div key={i} className="upload-file">
              <span>{f.name}</span>
              <button onClick={() => set({ reportFiles: reportFiles.filter((_, j) => j !== i) })}><Icon name="x" size={12} /></button>
            </div>
          ))}
        </div>
      </div>

      {/* Item photos */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <Icon name="camera" size={16} />
          <span style={{ fontSize: 13, fontWeight: 600 }}>Delivery Item Photos <span style={{ fontWeight: 400, color: 'var(--text3)' }}>(optional)</span></span>
        </div>
        <p style={{ fontSize: 11, color: 'var(--text3)', margin: '0 0 10px' }}>Upload overview photos now — add more per item after processing</p>
        <input ref={photoCamRef} type="file" accept="image/*" capture="environment" multiple style={{ display: 'none' }}
          onChange={e => { set({ itemPhotos: [...itemPhotos, ...Array.from(e.target.files)] }); e.target.value = ''; }} />
        <input ref={photoFileRef} type="file" accept="image/*" multiple style={{ display: 'none' }}
          onChange={e => { set({ itemPhotos: [...itemPhotos, ...Array.from(e.target.files)] }); e.target.value = ''; }} />
        <div className="upload-zone">
          <button className="upload-add" onClick={() => photoCamRef.current?.click()}><Icon name="camera" size={14} /> Camera</button>
          <button className="upload-add" style={{ borderStyle: 'solid' }} onClick={() => photoFileRef.current?.click()}><Icon name="plus" size={14} /> Gallery</button>
          {itemPhotos.map((f, i) => (
            <div key={i} className="upload-file">
              <span>{f.name}</span>
              <button onClick={() => set({ itemPhotos: itemPhotos.filter((_, j) => j !== i) })}><Icon name="x" size={12} /></button>
            </div>
          ))}
        </div>
      </div>

      {/* Manual barcode */}
      <div style={{ marginBottom: 16, display: 'flex', gap: 8 }}>
        <input ref={bcRef} className="input" placeholder="Enter barcode manually"
          style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: 13, padding: '10px 12px' }}
          onKeyDown={e => { if (e.key === 'Enter') addBc(); }} />
        <button className="btn btn-primary" style={{ padding: '10px 14px', fontSize: 12 }} onClick={addBc}>Add</button>
      </div>
      {scannedBarcodes.length > 0 && (
        <div style={{ marginBottom: 12, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {scannedBarcodes.map((bc, i) => (
            <div key={i} className="bc-chip">{bc}
              <button onClick={() => set({ scannedBarcodes: scannedBarcodes.filter((_, j) => j !== i) })}><Icon name="x" size={12} /></button>
            </div>
          ))}
        </div>
      )}

      {/* Process button */}
      <button
        className={`btn${!processing && reportFiles.length && apiKey ? ' btn-primary' : ''}`}
        style={{ width: '100%', padding: 16, fontSize: 16, fontWeight: 700, border: `2px solid ${reportFiles.length ? 'var(--green-dark)' : 'var(--border)'}` }}
        disabled={processing || !reportFiles.length || !apiKey}
        onClick={() => doProcessDelivery(useStore.getState, set)}>
        {processing ? <><span className="spinner">⟳</span> {processStep}</> : <><Icon name="zap" size={20} /> Check Delivery</>}
      </button>
      {!apiKey && <p style={{ fontSize: 12, color: 'var(--amber)', marginTop: 8, textAlign: 'center' }}>Set your API key in Settings first</p>}
    </div>
  );
}
