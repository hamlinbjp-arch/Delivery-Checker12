import { useRef } from 'react';
import Icon from '../lib/icons';
import { useStore } from '../state/store';
import { callClaude } from '../lib/claude';
import { resizeImage } from '../lib/imageUtils';
import { fuzzyScore } from '../lib/fuzzy';
import PhotoModal from './PhotoModal';

async function analyzePhotoItems(photoIdx, set, get) {
  const state = get();
  const file = state.itemPhotos[photoIdx];
  if (!file) return;
  const blobUrl = URL.createObjectURL(file);
  set({ photoAnalysisModal: { photoIdx, blobUrl, analyzing: true, results: null } });

  try {
    const items = state.results || [];
    const itemList = items.map((it, i) => `${i + 1}. ${it.name}${it.pageNumber ? ` (p.${it.pageNumber})` : ''}${it.qtyExpected ? ' ×' + it.qtyExpected : ''}`).join('\n');
    const b64 = await resizeImage(file);
    const data = await callClaude(state.apiKey, [{ role: 'user', content: [
      { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64 } },
      { type: 'text', text: `Delivery items list:\n${itemList}\n\nLook carefully at this photo of delivered stock. Read ALL text visible on packaging — brand names, product names, and model names printed on boxes, labels, and wrappers. Look for brands like Satisfyer, Share Satisfaction, Wet Stuff, System JO, and similar adult product brands. Use packaging color and shape as additional clues (e.g. bright pink/purple boxes are often Satisfyer; blue/white squeeze bottles are often Wet Stuff).\n\nFor EVERY item in the list, determine if it is likely visible. If you see a product but are unsure of the exact match, provide your best guess from the list — do NOT say "not visible" just because you are uncertain. Only mark visible:false if the item is clearly absent from the photo.\n\nOutput ONLY a raw JSON array, no markdown, no explanation outside JSON:\n[{"name":"item name from list","visible":true,"confidence":80,"reason":"text/brand/color seen on packaging"},...]` },
    ] }], 'You are a stock identification assistant. Study packaging text and branding carefully. Always provide your best guess from the provided list — never refuse to identify a product if anything is visible. Output only a raw JSON array with no markdown fences and no text outside the JSON.', 6000);
    const raw = data.content.map(c => c.text || '').join('');
    const stripped = raw.replace(/```[a-z]*\n?/g, '').replace(/```/g, '').trim();
    const s = stripped.indexOf('['), e = stripped.lastIndexOf(']');
    let results;
    try { results = s >= 0 && e > s ? JSON.parse(stripped.slice(s, e + 1)) : JSON.parse(stripped); }
    catch (pe) { throw new Error(`Parse failed: ${stripped.slice(0, 200)}`); }

    // Auto-confirm clearly visible items
    const map = { ...state.itemPhotoMap };
    for (const r of results) {
      if (r.visible && r.confidence >= 65) {
        const match = items.find(i => fuzzyScore(r.name, i.name) >= 70);
        if (match && !(map[match.id] || []).length) {
          if (!map[match.id]) map[match.id] = [];
          map[match.id].push(blobUrl);
        }
      }
    }
    const bulkPhotoResults = { ...get().bulkPhotoResults, [photoIdx]: results };
    set({ bulkPhotoResults, itemPhotoMap: map, photoAnalysisModal: { photoIdx, blobUrl, analyzing: false, results } });
  } catch (err) {
    set({ photoAnalysisModal: { ...get().photoAnalysisModal, analyzing: false, results: [{ name: 'Analysis failed', visible: false, confidence: 0, reason: err.message }] } });
  }
}

function ItemRow({ item }) {
  const { itemPhotoMap, addItemPhotos, set } = useStore();
  const camRef = useRef(); const fileRef = useRef();
  const photos = itemPhotoMap[item.id] || [];
  const hasPhoto = photos.length > 0;
  const rowCls = hasPhoto ? 'row-green' : 'row-red';
  const meta = [];
  if (item.pageNumber) meta.push(`p.${item.pageNumber}`);
  meta.push(`Qty: ${item.qtyExpected}`);

  return (
    <div className={`result-row ${rowCls}`}>
      <input ref={camRef} type="file" accept="image/*" capture="environment" multiple style={{ display: 'none' }}
        onChange={e => { addItemPhotos(item.id, e.target.files); e.target.value = ''; }} />
      <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: 'none' }}
        onChange={e => { addItemPhotos(item.id, e.target.files); e.target.value = ''; }} />
      <div className="row-header" style={{ padding: '10px 12px' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {hasPhoto ? '✅ ' : ''}{item.name}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 3, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {meta.join(' · ')}
            {hasPhoto && <span style={{ color: 'var(--green)' }}>📷{photos.length}</span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 4, flexShrink: 0, marginLeft: 8 }}>
          <button className="btn-camera" disabled={photos.length >= 10} onClick={() => camRef.current?.click()}><Icon name="camera" size={16} /></button>
          <button className="btn-camera" disabled={photos.length >= 10} style={{ background: '#1e4d38', padding: '8px 10px', fontSize: 13 }} onClick={() => fileRef.current?.click()}>📎</button>
        </div>
      </div>
      {photos.length > 0 && (
        <div className="photo-strip">
          {photos.map((url, i) => <img key={i} className="photo-thumb" src={url} alt="" onClick={() => set({ viewingPhoto: url })} />)}
        </div>
      )}
    </div>
  );
}

function AnalysisModal() {
  const { photoAnalysisModal, set } = useStore();
  if (!photoAnalysisModal) return null;
  const { blobUrl, analyzing, results } = photoAnalysisModal;
  return (
    <div className="analysis-modal" onClick={e => { if (e.target === e.currentTarget) set({ photoAnalysisModal: null }); }}>
      <button className="photo-modal-close" style={{ position: 'fixed' }} onClick={() => set({ photoAnalysisModal: null })}>✕</button>
      <div className="analysis-modal-inner">
        <img src={blobUrl} alt="" style={{ maxWidth: '100%', maxHeight: 220, borderRadius: 10, objectFit: 'contain' }} />
        {analyzing && (
          <div style={{ color: 'var(--text2)', padding: 20, textAlign: 'center' }}>
            <span className="spinner" style={{ fontSize: 24 }}>⟳</span>
            <div style={{ fontSize: 13, marginTop: 8 }}>Analyzing items in photo...</div>
          </div>
        )}
        {results && (
          <div style={{ width: '100%' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>Items in this photo:</div>
            {results.map((r, i) => (
              <div key={i} className="analysis-result-row" style={{ background: r.visible ? '#52b78815' : '#ffffff08', marginBottom: 4 }}>
                <span style={{ flexShrink: 0, fontSize: 15 }}>{r.visible ? '✅' : '❓'}</span>
                <div>
                  <div style={{ fontWeight: 600, color: r.visible ? 'var(--green)' : 'var(--text2)' }}>
                    {r.name} <span style={{ fontWeight: 400, color: 'var(--text3)' }}>{r.confidence}%</span>
                  </div>
                  <div style={{ color: 'var(--text3)', marginTop: 2, fontSize: 11 }}>{r.reason}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function VerifyStep() {
  const store = useStore();
  const { results, itemPhotoMap, itemPhotos, bulkPhotoResults, selectedSupplier, set, resetDelivery } = store;
  const bulkRef = useRef();
  const items = results || [];
  const confirmed = items.filter(i => (itemPhotoMap[i.id] || []).length > 0).length;
  const sorted = [...items].sort((a, b) => {
    const aH = (itemPhotoMap[a.id] || []).length > 0;
    const bH = (itemPhotoMap[b.id] || []).length > 0;
    return (bH ? 1 : 0) - (aH ? 1 : 0);
  });

  const handleAnalyze = (idx) => {
    if (bulkPhotoResults[idx]) {
      const url = URL.createObjectURL(itemPhotos[idx]);
      set({ photoAnalysisModal: { photoIdx: idx, blobUrl: url, analyzing: false, results: bulkPhotoResults[idx] } });
    } else {
      analyzePhotoItems(idx, set, useStore.getState);
    }
  };

  return (
    <div style={{ paddingTop: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 600, letterSpacing: '.5px' }}>STEP 1 OF 2</div>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>📷 Photo Verification</h2>
          {selectedSupplier && <p style={{ fontSize: 12, color: 'var(--text3)', margin: '2px 0 0' }}>{selectedSupplier}</p>}
        </div>
        <button className="btn btn-ghost" style={{ padding: '6px 12px', fontSize: 12 }} onClick={resetDelivery}>New</button>
      </div>
      <div className="step-bar"><div className="step-pill active" /><div className="step-pill" /></div>

      <div className="stats" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
        <div className="stat"><div className="stat-val">{items.length}</div><div className="stat-label">Total</div></div>
        <div className="stat"><div className="stat-val" style={{ color: 'var(--green)' }}>{confirmed}</div><div className="stat-label">Confirmed</div></div>
        <div className="stat"><div className="stat-val" style={{ color: 'var(--red)' }}>{items.length - confirmed}</div><div className="stat-label">Remaining</div></div>
      </div>

      {/* Bulk photos */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>📦 Overview Photos</span>
          <button className="btn btn-ghost" style={{ fontSize: 11, padding: '5px 10px' }} onClick={() => bulkRef.current?.click()}>
            <Icon name="camera" size={13} /> Add
          </button>
        </div>
        <p style={{ fontSize: 11, color: 'var(--text3)', margin: '0 0 8px' }}>Tap a photo to identify which items are visible in it</p>
        <input ref={bulkRef} type="file" accept="image/*" multiple style={{ display: 'none' }}
          onChange={e => { set({ itemPhotos: [...itemPhotos, ...Array.from(e.target.files)] }); e.target.value = ''; }} />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {itemPhotos.length ? itemPhotos.map((f, i) => {
            const url = URL.createObjectURL(f);
            const res = bulkPhotoResults[i];
            const foundCount = res ? res.filter(r => r.visible).length : null;
            return (
              <div key={i} style={{ position: 'relative', cursor: 'pointer', flexShrink: 0 }} onClick={() => handleAnalyze(i)}>
                <img src={url} alt="" style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 8, border: `2px solid ${res ? 'var(--green)' : 'var(--border)'}` }} />
                {foundCount !== null
                  ? <span style={{ position: 'absolute', bottom: 3, left: 3, right: 3, background: '#000000bb', color: '#fff', fontSize: 9, padding: '1px 4px', borderRadius: 4, textAlign: 'center' }}>{foundCount} found</span>
                  : <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#00000055', borderRadius: 6, fontSize: 9, color: '#fff', textAlign: 'center', lineHeight: 1.3, padding: 4 }}>Tap to<br />analyze</span>}
              </div>
            );
          }) : <div style={{ color: 'var(--text3)', fontSize: 12, padding: '8px 0' }}>No overview photos yet.</div>}
        </div>
      </div>

      <div style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 600, letterSpacing: '.5px', marginBottom: 8 }}>DELIVERY ITEMS ({items.length})</div>
      {sorted.map(item => <ItemRow key={item.id} item={item} />)}

      <button className="btn btn-primary" style={{ width: '100%', padding: 16, fontSize: 15, fontWeight: 700, marginTop: 12 }}
        onClick={() => set({ deliveryStep: 'pos', resultsSearch: '' })}>
        Continue to POS Check →
      </button>

      <PhotoModal />
      <AnalysisModal />
    </div>
  );
}
