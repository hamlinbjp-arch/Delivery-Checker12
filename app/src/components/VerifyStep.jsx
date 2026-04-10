import { useRef, useState, useEffect } from 'react';
import Icon from '../lib/icons';
import { useStore } from '../state/store';
import { callClaude } from '../lib/claude';
import { resizeImage } from '../lib/imageUtils';
import { fuzzyScore } from '../lib/fuzzy';
import PhotoModal from './PhotoModal';

const MAX_ITEMS_PER_ANALYSIS = 30;

function getRemainingItems(results, itemPhotoMap) {
  return (results || []).filter(i => !(itemPhotoMap[i.id] || []).length);
}

const SYSTEM_PROMPT = `You are a strict stock verification assistant.

ABSOLUTE RULES — violating these is worse than saying nothing:
1. FOREGROUND ONLY: Identify ONLY items physically on the counter/table in the immediate foreground. Never identify items visible through glass cabinets, reflections, or background shelves.
2. READ THE PACKAGING: Only name an item if you can directly read its brand/product name from the packaging in the photo.
3. NO GUESSING: If packaging text is unclear or confidence is below 85%, use exactly the string "UNIDENTIFIED" as the name and describe what you see in the reason field.
4. COUNT PHYSICAL UNITS: Count distinct boxes/packages. Never count reflections.
5. BOUNDING BOX: Estimate each item's position as a percentage of the image (x=left%, y=top%, w=width%, h=height%).

Output ONLY a raw JSON array. No markdown. No text outside the JSON.`;

async function analyzePhotoItems(photoIdx, set, get, { autoOpen = true } = {}) {
  const state = get();
  const file = state.itemPhotos[photoIdx];
  if (!file) return;
  const blobUrl = URL.createObjectURL(file);

  const allRemaining = getRemainingItems(state.results, state.itemPhotoMap);
  // Limit to first MAX_ITEMS_PER_ANALYSIS to keep prompt fast
  const remainingItems = allRemaining.slice(0, MAX_ITEMS_PER_ANALYSIS);
  const hiddenCount = allRemaining.length - remainingItems.length;

  if (autoOpen) {
    set({ photoAnalysisModal: { photoIdx, blobUrl, analyzing: true, results: null, remainingItems, allRemaining } });
  }

  if (!allRemaining.length) {
    set({ photoAnalysisModal: { photoIdx, blobUrl, analyzing: false, results: [], remainingItems: [], allRemaining: [], allDone: true } });
    return;
  }

  try {
    const itemList = remainingItems
      .map((it, i) => `${i + 1}. ${it.name} ×${it.qtyExpected || 1}`)
      .join('\n');
    const suffix = hiddenCount > 0 ? `\n(${hiddenCount} more items not shown — analyze another photo for them)` : '';

    // Use 1200px for speed — still enough to read packaging text
    const b64 = await resizeImage(file, 1200, 0.80);
    const data = await callClaude(state.apiKey, [{ role: 'user', content: [
      { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64 } },
      { type: 'text', text: `Delivery items to find in this photo's foreground:\n${itemList}${suffix}\n\nForeground only — ignore anything through glass, in cabinets, or on background shelves.\n\nFor each distinct foreground item:\n- If you can read packaging text clearly (≥85% confident): use the exact name from the list above\n- If you CANNOT read it clearly: use name="UNIDENTIFIED" AND also provide suggestedName with your best guess from the list (based on shape, color, size)\n\nAlways include a bounding box and describe exactly what you physically see.\n\n[{"name":"item name from list OR UNIDENTIFIED","suggestedName":"best guess name from list if UNIDENTIFIED, else omit","visible":true,"foundCount":1,"expectedCount":1,"confidence":55,"reason":"describe color, shape, packaging exactly as you see it","bbox":{"x":10,"y":20,"w":30,"h":25}},...]` },
    ] }], SYSTEM_PROMPT, 2000);

    const raw = data.content.map(c => c.text || '').join('');
    const stripped = raw.replace(/```[a-z]*\n?/g, '').replace(/```/g, '').trim();
    const s = stripped.indexOf('['), e = stripped.lastIndexOf(']');
    let results;
    try { results = s >= 0 && e > s ? JSON.parse(stripped.slice(s, e + 1)) : JSON.parse(stripped); }
    catch { throw new Error(`Parse failed: ${stripped.slice(0, 150)}`); }

    // Re-read current state to avoid race with user edits
    const current = get();
    const map = { ...current.itemPhotoMap };
    const stillRemaining = getRemainingItems(current.results, map);

    // Auto-assign only ≥90% confident, non-UNIDENTIFIED items
    for (const r of results) {
      if (!r.visible || r.name === 'UNIDENTIFIED' || r.confidence < 90) continue;
      const match = stillRemaining.find(i => fuzzyScore(r.name, i.name) >= 70);
      if (match) {
        if (!map[match.id]) map[match.id] = [];
        map[match.id].push(blobUrl);
      }
    }

    const bulkPhotoResults = { ...get().bulkPhotoResults, [photoIdx]: results };
    set({ bulkPhotoResults, itemPhotoMap: map });
    if (autoOpen || get().photoAnalysisModal?.photoIdx === photoIdx) {
      set({ photoAnalysisModal: { photoIdx, blobUrl, analyzing: false, results, remainingItems, allRemaining, hiddenCount } });
    }
  } catch (err) {
    if (autoOpen || get().photoAnalysisModal?.photoIdx === photoIdx) {
      set({ photoAnalysisModal: { ...get().photoAnalysisModal, analyzing: false, results: [{ name: 'Analysis failed', visible: false, confidence: 0, reason: err.message }] } });
    }
  }
}

// Crops the source photo to a bounding box so the user sees exactly which item is being referenced
function CroppedThumbnail({ blobUrl, bbox }) {
  const [cropUrl, setCropUrl] = useState(null);
  useEffect(() => {
    if (!blobUrl || !bbox) return;
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      const pad = Math.min(img.width, img.height) * 0.05;
      const sx = Math.max(0, img.width * bbox.x / 100 - pad);
      const sy = Math.max(0, img.height * bbox.y / 100 - pad);
      const sw = Math.min(img.width * bbox.w / 100 + pad * 2, img.width - sx);
      const sh = Math.min(img.height * bbox.h / 100 + pad * 2, img.height - sy);
      const canvas = document.createElement('canvas');
      canvas.width = sw; canvas.height = sh;
      canvas.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
      if (!cancelled) setCropUrl(canvas.toDataURL('image/jpeg', 0.9));
    };
    img.src = blobUrl;
    return () => { cancelled = true; };
  }, [blobUrl, bbox?.x, bbox?.y, bbox?.w, bbox?.h]);

  if (!cropUrl) return (
    <div style={{ width: 76, height: 76, flexShrink: 0, borderRadius: 8, border: '2px dashed var(--amber)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, background: 'var(--bg)' }}>❓</div>
  );
  return <img src={cropUrl} alt="item crop" style={{ width: 76, height: 76, flexShrink: 0, objectFit: 'cover', borderRadius: 8, border: '2px solid var(--amber)' }} />;
}

// Searchable picker used inside the analysis modal
function ItemPicker({ searchHint, remainingItems, onSelect, onDismiss }) {
  const [q, setQ] = useState(searchHint || '');
  const rows = [...remainingItems]
    .map(item => ({ item, score: q ? fuzzyScore(q, item.name) : 100 }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);

  return (
    <div style={{ background: 'var(--bg)', border: '1px solid var(--amber)', borderRadius: 10, marginTop: 4, overflow: 'hidden' }}>
      <div style={{ padding: '6px 8px', borderBottom: '1px solid var(--border)' }}>
        <input className="input" placeholder="Search items..." value={q} onChange={e => setQ(e.target.value)}
          style={{ fontSize: 12, padding: '6px 10px' }} autoFocus />
      </div>
      <div style={{ maxHeight: 200, overflowY: 'auto' }}>
        {rows.map(({ item, score }) => (
          <div key={item.id} onClick={() => onSelect(item)}
            style={{ padding: '9px 12px', borderBottom: '1px solid #2f333622', fontSize: 12, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</span>
            <span style={{ color: 'var(--text3)', flexShrink: 0, fontSize: 10 }}>×{item.qtyExpected}{q ? ` · ${score}%` : ''}</span>
          </div>
        ))}
        {!rows.length && <div style={{ padding: 12, color: 'var(--text3)', fontSize: 12 }}>No matches.</div>}
      </div>
      <button onClick={onDismiss} style={{ width: '100%', padding: '8px 12px', background: 'none', border: 'none', borderTop: '1px solid var(--border)', color: 'var(--text3)', fontSize: 12, cursor: 'pointer', textAlign: 'left' }}>
        ✕ Not a delivery item — skip
      </button>
    </div>
  );
}

function AnalysisModal() {
  const { photoAnalysisModal, results: allResults, set } = useStore();
  const [openPicker, setOpenPicker] = useState(null);

  if (!photoAnalysisModal) return null;
  const { blobUrl, analyzing, results: ar, remainingItems = [], allRemaining = [], allDone, hiddenCount = 0 } = photoAnalysisModal;

  const handleAssign = (targetItem) => {
    const map = { ...useStore.getState().itemPhotoMap };
    if (!map[targetItem.id]) map[targetItem.id] = [];
    map[targetItem.id].push(blobUrl);
    set({ itemPhotoMap: map, photoAnalysisModal: null });
  };

  const visibleItems = (ar || []).filter(r => r.visible);
  const autoOk = visibleItems.filter(r => r.name !== 'UNIDENTIFIED' && r.confidence >= 90);
  const needsReview = visibleItems.filter(r => r.name === 'UNIDENTIFIED' || r.confidence < 90);

  return (
    <div className="analysis-modal" onClick={e => { if (e.target === e.currentTarget) set({ photoAnalysisModal: null }); }}>
      <button className="photo-modal-close" style={{ position: 'fixed' }} onClick={() => set({ photoAnalysisModal: null })}>✕</button>
      <div className="analysis-modal-inner">

        {/* Photo with bounding box overlay */}
        <div style={{ position: 'relative', width: '100%', borderRadius: 10, overflow: 'hidden', background: '#000' }}>
          <img src={blobUrl} alt="" style={{ width: '100%', display: 'block', maxHeight: 260, objectFit: 'contain' }} />

          {analyzing && (
            <div style={{ position: 'absolute', inset: 0, background: '#000000bb', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <span className="spinner" style={{ fontSize: 28, color: '#fff' }}>⟳</span>
              <div style={{ color: '#fff', fontSize: 13, fontWeight: 600 }}>Reading packaging text...</div>
              <div style={{ color: '#ffffff88', fontSize: 11 }}>Foreground only · ignoring glass/background</div>
            </div>
          )}

          {/* Bounding boxes */}
          {!analyzing && visibleItems.map((r, i) => {
            if (!r.bbox) return null;
            const uncertain = r.name === 'UNIDENTIFIED' || r.confidence < 90;
            const color = uncertain ? '#e5a100' : '#52b788';
            const pk = `bbox-${i}`;
            return (
              <div key={i} onClick={() => setOpenPicker(openPicker === pk ? null : pk)}
                style={{
                  position: 'absolute',
                  left: `${Math.max(0, r.bbox.x)}%`, top: `${Math.max(0, r.bbox.y)}%`,
                  width: `${Math.min(r.bbox.w, 100 - r.bbox.x)}%`, height: `${Math.min(r.bbox.h, 100 - r.bbox.y)}%`,
                  border: `2px solid ${color}`,
                  borderRadius: 4, cursor: uncertain ? 'pointer' : 'default',
                  boxSizing: 'border-box',
                }}>
                <div style={{ position: 'absolute', top: 0, left: 0, background: color, color: '#000', fontSize: 10, fontWeight: 800, padding: '1px 5px', lineHeight: 1.6, borderRadius: '0 0 4px 0', whiteSpace: 'nowrap' }}>
                  {i + 1}{uncertain ? ' ❓' : ' ✓'}
                </div>
              </div>
            );
          })}
        </div>

        {analyzing && (
          <div style={{ fontSize: 11, color: 'var(--text3)', textAlign: 'center' }}>
            Checking {remainingItems.length} of {allRemaining.length} remaining items
            {hiddenCount > 0 && ` · ${hiddenCount} items in next photo`}
          </div>
        )}

        {allDone && (
          <div style={{ padding: 16, textAlign: 'center', color: 'var(--green)' }}>
            <div style={{ fontSize: 22 }}>✅</div>
            <div style={{ fontSize: 13, marginTop: 8 }}>All items already confirmed!</div>
          </div>
        )}

        {ar && !allDone && (
          <div style={{ width: '100%' }}>
            <div style={{ fontSize: 11, color: 'var(--text3)', textAlign: 'center', marginBottom: 8 }}>
              {allRemaining.length} remaining · showing first {remainingItems.length}
              {hiddenCount > 0 && <span style={{ color: 'var(--amber)' }}> · upload another photo for {hiddenCount} more</span>}
            </div>

            {/* Auto-confirmed */}
            {autoOk.length > 0 && (
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--green)', marginBottom: 4, letterSpacing: '.5px' }}>✅ AUTO-CONFIRMED ({autoOk.length})</div>
                {autoOk.map((r, i) => {
                  const idx = visibleItems.indexOf(r);
                  const qtyOk = !r.foundCount || !r.expectedCount || r.foundCount >= r.expectedCount;
                  return (
                    <div key={i} className="analysis-result-row" style={{ background: '#52b78815', marginBottom: 4 }}>
                      <span style={{ flexShrink: 0, fontSize: 13, fontWeight: 800, color: 'var(--green)', minWidth: 18 }}>{idx + 1}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, color: 'var(--green)', fontSize: 13 }}>
                          {r.name}
                          <span style={{ fontWeight: 400, color: 'var(--text3)', fontSize: 11, marginLeft: 5 }}>{r.confidence}%</span>
                          {r.foundCount > 1 && <span style={{ fontSize: 10, marginLeft: 5, fontWeight: 700, color: qtyOk ? 'var(--green)' : 'var(--amber)' }}>×{r.foundCount}{r.expectedCount ? `/${r.expectedCount}` : ''}</span>}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text3)', lineHeight: 1.4 }}>{r.reason}</div>
                        {!qtyOk && <div style={{ fontSize: 10, color: 'var(--amber)', marginTop: 2 }}>⚠ Only {r.foundCount} of {r.expectedCount} expected units visible</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Needs manual assignment */}
            {needsReview.length > 0 && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--amber)', marginBottom: 6, letterSpacing: '.5px' }}>❓ NEEDS MANUAL ASSIGNMENT ({needsReview.length})</div>
                {needsReview.map((r, i) => {
                  const idx = visibleItems.indexOf(r);
                  const pk = `list-${i}`;
                  const isOpen = openPicker === pk || openPicker === `bbox-${idx}`;
                  const isUnidentified = r.name === 'UNIDENTIFIED';

                  // Find the suggested item from remaining list if AI provided one
                  const suggestedItem = r.suggestedName
                    ? allRemaining.reduce((best, item) => {
                        const s = fuzzyScore(r.suggestedName, item.name);
                        return s > (best?.score || 0) ? { item, score: s } : best;
                      }, null)
                    : null;

                  return (
                    <div key={i} style={{ marginBottom: 10, background: '#e5a10010', border: '1px solid #e5a10033', borderRadius: 10, overflow: 'hidden' }}>
                      {/* Crop + description */}
                      <div style={{ display: 'flex', gap: 10, padding: '10px 12px', alignItems: 'flex-start' }}>
                        <CroppedThumbnail blobUrl={blobUrl} bbox={r.bbox} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--amber)', marginBottom: 3 }}>
                            Item {idx + 1} — {isUnidentified ? 'Cannot read packaging' : `Low confidence (${r.confidence}%)`}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--text2)', lineHeight: 1.4 }}>{r.reason}</div>
                        </div>
                      </div>

                      {/* AI suggestion (if provided) */}
                      {suggestedItem && suggestedItem.score >= 40 && (
                        <div style={{ padding: '8px 12px', borderTop: '1px solid #e5a10022' }}>
                          <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 5 }}>AI best guess:</div>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <div style={{ flex: 1, fontSize: 12, fontWeight: 600 }}>
                              {suggestedItem.item.name}
                              <span style={{ fontWeight: 400, color: 'var(--text3)', marginLeft: 6, fontSize: 11 }}>×{suggestedItem.item.qtyExpected}</span>
                            </div>
                            <button
                              style={{ padding: '5px 14px', background: 'var(--green-dark)', border: 'none', color: '#fff', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}
                              onClick={() => handleAssign(suggestedItem.item)}>
                              ✓ Yes
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Manual search */}
                      <div style={{ padding: '6px 12px', borderTop: '1px solid #e5a10022' }}>
                        <button
                          style={{ width: '100%', padding: '7px 10px', background: isOpen ? '#e5a10033' : 'transparent', border: '1px solid #e5a10055', color: 'var(--amber)', borderRadius: 6, fontSize: 12, cursor: 'pointer', fontWeight: 600 }}
                          onClick={() => setOpenPicker(isOpen ? null : pk)}>
                          {isOpen ? '▲ Close search' : '🔍 Search all items...'}
                        </button>
                      </div>
                      {isOpen && (
                        <div style={{ borderTop: '1px solid #e5a10033' }}>
                          <ItemPicker
                            searchHint={r.suggestedName || ''}
                            remainingItems={allRemaining}
                            onSelect={handleAssign}
                            onDismiss={() => setOpenPicker(null)}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {ar.length === 0 && (
              <div style={{ textAlign: 'center', padding: 20, color: 'var(--text3)', fontSize: 13 }}>
                No foreground items identified. Try a closer photo with items on the counter.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ItemRow({ item }) {
  const { itemPhotoMap, addItemPhotos, set } = useStore();
  const camRef = useRef(); const fileRef = useRef();
  const photos = itemPhotoMap[item.id] || [];
  const hasPhoto = photos.length > 0;

  return (
    <div className={`result-row ${hasPhoto ? 'row-green' : 'row-red'}`}>
      <input ref={camRef} type="file" accept="image/*" capture="environment" multiple style={{ display: 'none' }}
        onChange={e => { addItemPhotos(item.id, e.target.files); e.target.value = ''; }} />
      <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: 'none' }}
        onChange={e => { addItemPhotos(item.id, e.target.files); e.target.value = ''; }} />
      <div className="row-header" style={{ padding: '10px 12px' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {hasPhoto ? '✅ ' : ''}{item.name}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 3, display: 'flex', gap: 8 }}>
            {item.pageNumber && <span>p.{item.pageNumber}</span>}
            <span>Qty: {item.qtyExpected}</span>
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

export default function VerifyStep() {
  const store = useStore();
  const { results, itemPhotoMap, itemPhotos, bulkPhotoResults, selectedSupplier, set, resetDelivery } = store;
  const bulkRef = useRef();
  const items = results || [];
  const confirmed = items.filter(i => (itemPhotoMap[i.id] || []).length > 0).length;
  const remaining = items.length - confirmed;
  const sorted = [...items].sort((a, b) => {
    const aH = (itemPhotoMap[a.id] || []).length > 0;
    const bH = (itemPhotoMap[b.id] || []).length > 0;
    return (bH ? 1 : 0) - (aH ? 1 : 0);
  });

  const handleBulkAdd = (files) => {
    const newFiles = Array.from(files);
    if (!newFiles.length) return;
    const startIdx = itemPhotos.length;
    set({ itemPhotos: [...itemPhotos, ...newFiles] });
    // Auto-analyze the first new photo immediately
    setTimeout(() => analyzePhotoItems(startIdx, set, useStore.getState), 50);
  };

  const handleAnalyze = (idx) => {
    if (bulkPhotoResults[idx]) {
      const url = URL.createObjectURL(itemPhotos[idx]);
      const allRemaining = getRemainingItems(results, itemPhotoMap);
      const remainingItems = allRemaining.slice(0, MAX_ITEMS_PER_ANALYSIS);
      set({ photoAnalysisModal: { photoIdx: idx, blobUrl: url, analyzing: false, results: bulkPhotoResults[idx], remainingItems, allRemaining, hiddenCount: allRemaining.length - remainingItems.length } });
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
        <div className="stat"><div className="stat-val" style={{ color: remaining > 0 ? 'var(--amber)' : 'var(--green)' }}>{remaining}</div><div className="stat-label">Remaining</div></div>
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>📦 Overview Photos</span>
          <button className="btn btn-ghost" style={{ fontSize: 11, padding: '5px 10px' }} onClick={() => bulkRef.current?.click()}>
            <Icon name="camera" size={13} /> Add
          </button>
        </div>
        <p style={{ fontSize: 11, color: 'var(--text3)', margin: '0 0 8px' }}>
          Photo analyzes automatically on upload · reads packaging text only · up to {MAX_ITEMS_PER_ANALYSIS} items per photo
        </p>
        <input ref={bulkRef} type="file" accept="image/*" multiple style={{ display: 'none' }}
          onChange={e => { handleBulkAdd(e.target.files); e.target.value = ''; }} />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {itemPhotos.length ? itemPhotos.map((f, i) => {
            const res = bulkPhotoResults[i];
            const url = URL.createObjectURL(f);
            const foundCount = res ? res.filter(r => r.visible && r.name !== 'UNIDENTIFIED' && r.confidence >= 90).length : null;
            const pendingCount = res ? res.filter(r => r.visible && (r.name === 'UNIDENTIFIED' || r.confidence < 90)).length : null;
            const hasPending = pendingCount > 0;
            return (
              <div key={i} style={{ position: 'relative', cursor: 'pointer', flexShrink: 0 }} onClick={() => handleAnalyze(i)}>
                <img src={url} alt="" style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 8, border: `2px solid ${res ? (hasPending ? 'var(--amber)' : 'var(--green)') : 'var(--border)'}` }} />
                {foundCount !== null ? (
                  <span style={{ position: 'absolute', bottom: 3, left: 3, right: 3, background: '#000000cc', color: '#fff', fontSize: 9, padding: '1px 4px', borderRadius: 4, textAlign: 'center' }}>
                    {foundCount}✓{hasPending ? ` ${pendingCount}❓` : ''}
                  </span>
                ) : (
                  <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#00000077', borderRadius: 6, fontSize: 10, color: '#fff' }}>
                    <span className="spinner">⟳</span>
                  </span>
                )}
              </div>
            );
          }) : <div style={{ color: 'var(--text3)', fontSize: 12, padding: '8px 0' }}>No photos yet — add a photo to start.</div>}
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
