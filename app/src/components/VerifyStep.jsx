import { useRef, useState } from 'react';
import Icon from '../lib/icons';
import { useStore } from '../state/store';
import { callClaude } from '../lib/claude';
import { resizeImage } from '../lib/imageUtils';
import { fuzzyScore } from '../lib/fuzzy';
import PhotoModal from './PhotoModal';

function getRemainingItems(results, itemPhotoMap) {
  return (results || []).filter(i => !(itemPhotoMap[i.id] || []).length);
}

const SYSTEM_PROMPT = `You are a strict stock verification assistant for delivery checking.

ABSOLUTE RULES — violating these is worse than saying nothing:
1. FOREGROUND ONLY: Identify ONLY items physically placed in the immediate foreground (on the counter/table surface directly in front of you). Do NOT identify anything visible through glass panels, cabinet doors, reflections in glass, background shelves, or items stored away in display cabinets. If in doubt about whether something is foreground, exclude it.
2. READ THE PACKAGING: Only identify an item if you can clearly read its brand name, product name, or barcode from the packaging in this photo.
3. NO GUESSING: If you cannot read the packaging clearly, or your confidence is below 85%, you MUST return the name as exactly the string "UNIDENTIFIED" and describe what you physically see in the reason field.
4. NO HALLUCINATION: Never invent or assume a product name you cannot directly read. It is better to return "UNIDENTIFIED" than to guess incorrectly.
5. COUNT PHYSICAL UNITS: Count each distinct physical box/package as one unit. Never count a reflection as a unit.

Output only a raw JSON array. No markdown fences. No text outside the JSON.`;

async function analyzePhotoItems(photoIdx, set, get) {
  const state = get();
  const file = state.itemPhotos[photoIdx];
  if (!file) return;
  const blobUrl = URL.createObjectURL(file);

  const remainingItems = getRemainingItems(state.results, state.itemPhotoMap);
  set({ photoAnalysisModal: { photoIdx, blobUrl, analyzing: true, results: null, remainingItems } });

  if (!remainingItems.length) {
    set({ photoAnalysisModal: { photoIdx, blobUrl, analyzing: false, results: [], remainingItems, allDone: true } });
    return;
  }

  try {
    const itemList = remainingItems
      .map((it, i) => `${i + 1}. ${it.name} (expected ×${it.qtyExpected || 1})`)
      .join('\n');

    const b64 = await resizeImage(file);
    const data = await callClaude(state.apiKey, [{ role: 'user', content: [
      { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64 } },
      { type: 'text', text: `Items still to find in this delivery (foreground only):\n${itemList}\n\nInspect the FOREGROUND of this photo only. Ignore anything through glass, in cabinets, or on background shelves.\n\nFor each distinct item you physically see in the foreground:\n- If you can read the packaging text clearly and match it to an item above with ≥85% certainty: use the exact name from the list\n- If you cannot read it clearly, or are unsure: use exactly the string "UNIDENTIFIED"\n\nCount each distinct physical unit. Do not count reflections or the same item twice.\n\n[{"name":"item name from list OR UNIDENTIFIED","visible":true,"foundCount":2,"expectedCount":3,"confidence":92,"reason":"exact text read from packaging"},...]` },
    ] }], SYSTEM_PROMPT, 6000);

    const raw = data.content.map(c => c.text || '').join('');
    const stripped = raw.replace(/```[a-z]*\n?/g, '').replace(/```/g, '').trim();
    const s = stripped.indexOf('['), e = stripped.lastIndexOf(']');
    let results;
    try { results = s >= 0 && e > s ? JSON.parse(stripped.slice(s, e + 1)) : JSON.parse(stripped); }
    catch (pe) { throw new Error(`Parse failed: ${stripped.slice(0, 200)}`); }

    // Re-read state to avoid race with concurrent user edits
    const current = get();
    const map = { ...current.itemPhotoMap };
    const stillRemaining = getRemainingItems(current.results, map);

    // Auto-assign only at ≥90% confidence and not UNIDENTIFIED
    for (const r of results) {
      if (!r.visible || r.name === 'UNIDENTIFIED' || r.confidence < 90) continue;
      const match = stillRemaining.find(i => fuzzyScore(r.name, i.name) >= 70);
      if (match) {
        if (!map[match.id]) map[match.id] = [];
        map[match.id].push(blobUrl);
      }
    }

    const bulkPhotoResults = { ...get().bulkPhotoResults, [photoIdx]: results };
    set({ bulkPhotoResults, itemPhotoMap: map, photoAnalysisModal: { photoIdx, blobUrl, analyzing: false, results, remainingItems } });
  } catch (err) {
    set({ photoAnalysisModal: { ...get().photoAnalysisModal, analyzing: false, results: [{ name: 'Analysis failed', visible: false, confidence: 0, reason: err.message }] } });
  }
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
          <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 3, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {item.pageNumber && `p.${item.pageNumber}`}
            {` Qty: ${item.qtyExpected}`}
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

// Inline picker component used inside the analysis modal
function ItemPicker({ searchHint, remainingItems, onSelect, onDismiss }) {
  const [query, setQuery] = useState(searchHint || '');
  const scored = remainingItems
    .map(item => ({ item, score: query ? fuzzyScore(query, item.name) : 50 }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);

  return (
    <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, marginTop: 4, overflow: 'hidden' }}>
      <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 6 }}>
        <input
          className="input"
          placeholder="Search items..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          style={{ fontSize: 12, padding: '6px 10px', flex: 1 }}
          autoFocus
        />
      </div>
      <div style={{ maxHeight: 220, overflowY: 'auto' }}>
        {scored.map(({ item, score }) => (
          <div key={item.id}
            style={{ padding: '10px 12px', borderBottom: '1px solid #2f333622', fontSize: 12, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}
            onClick={() => onSelect(item)}>
            <div style={{ minWidth: 0 }}>
              <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
              <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>Qty: {item.qtyExpected}</div>
            </div>
            {query && <span style={{ fontSize: 10, color: 'var(--text3)', flexShrink: 0 }}>{score}%</span>}
          </div>
        ))}
        {!scored.length && <div style={{ padding: '12px', fontSize: 12, color: 'var(--text3)' }}>No items match.</div>}
      </div>
      <button
        style={{ width: '100%', padding: '8px 12px', background: 'none', border: 'none', borderTop: '1px solid var(--border)', color: 'var(--text3)', fontSize: 12, cursor: 'pointer', textAlign: 'left' }}
        onClick={onDismiss}>
        ✕ Not a delivery item / skip
      </button>
    </div>
  );
}

function AnalysisModal() {
  const { photoAnalysisModal, results: allResults, set } = useStore();
  const [openPicker, setOpenPicker] = useState(null); // row index with open picker

  if (!photoAnalysisModal) return null;
  const { blobUrl, analyzing, results: analysisResults, remainingItems = [], allDone } = photoAnalysisModal;

  const handleAssign = (targetItem) => {
    const map = { ...useStore.getState().itemPhotoMap };
    if (!map[targetItem.id]) map[targetItem.id] = [];
    map[targetItem.id].push(blobUrl);
    set({ itemPhotoMap: map });
    setOpenPicker(null);
    // Close modal after assigning
    set({ photoAnalysisModal: null });
  };

  // Group results
  const autoAssigned = (analysisResults || []).filter(r => r.visible && r.name !== 'UNIDENTIFIED' && r.confidence >= 90);
  const needsReview = (analysisResults || []).filter(r => r.visible && (r.name === 'UNIDENTIFIED' || r.confidence < 90));
  const notVisible = (analysisResults || []).filter(r => !r.visible);

  return (
    <div className="analysis-modal" onClick={e => { if (e.target === e.currentTarget) set({ photoAnalysisModal: null }); }}>
      <button className="photo-modal-close" style={{ position: 'fixed' }} onClick={() => set({ photoAnalysisModal: null })}>✕</button>
      <div className="analysis-modal-inner">
        <img src={blobUrl} alt="" style={{ maxWidth: '100%', maxHeight: 220, borderRadius: 10, objectFit: 'contain' }} />

        {analyzing && (
          <div style={{ color: 'var(--text2)', padding: 20, textAlign: 'center' }}>
            <span className="spinner" style={{ fontSize: 24 }}>⟳</span>
            <div style={{ fontSize: 13, marginTop: 8 }}>Identifying foreground items...</div>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>Reading packaging text only</div>
          </div>
        )}

        {allDone && (
          <div style={{ padding: 16, textAlign: 'center', color: 'var(--green)' }}>
            <div style={{ fontSize: 22 }}>✅</div>
            <div style={{ fontSize: 13, marginTop: 8 }}>All items already confirmed!</div>
          </div>
        )}

        {analysisResults && !allDone && (
          <div style={{ width: '100%' }}>
            {/* Remaining counter */}
            <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 10, textAlign: 'center' }}>
              {remainingItems.length} of {(allResults || []).length} items still to find
            </div>

            {/* Auto-assigned (high confidence ≥90%) */}
            {autoAssigned.length > 0 && (
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--green)', marginBottom: 4, letterSpacing: '.5px' }}>
                  ✅ AUTO-CONFIRMED ({autoAssigned.length})
                </div>
                {autoAssigned.map((r, i) => {
                  const qtyOk = !r.foundCount || !r.expectedCount || r.foundCount >= r.expectedCount;
                  return (
                    <div key={i} className="analysis-result-row" style={{ background: '#52b78815', marginBottom: 4 }}>
                      <span style={{ flexShrink: 0, fontSize: 15 }}>✅</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, color: 'var(--green)' }}>
                          {r.name}
                          <span style={{ fontWeight: 400, color: 'var(--text3)', fontSize: 11, marginLeft: 6 }}>{r.confidence}%</span>
                          {r.foundCount > 1 && (
                            <span style={{ fontSize: 10, marginLeft: 6, fontWeight: 700, color: qtyOk ? 'var(--green)' : 'var(--amber)' }}>
                              ×{r.foundCount}{r.expectedCount ? `/${r.expectedCount}` : ''}
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2, lineHeight: 1.4 }}>{r.reason}</div>
                        {!qtyOk && (
                          <div style={{ fontSize: 10, color: 'var(--amber)', marginTop: 2 }}>
                            ⚠ Only {r.foundCount} of {r.expectedCount} expected units visible
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Needs review (uncertain or UNIDENTIFIED) */}
            {needsReview.length > 0 && (
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--amber)', marginBottom: 4, letterSpacing: '.5px' }}>
                  ❓ NEEDS MANUAL ASSIGNMENT ({needsReview.length})
                </div>
                {needsReview.map((r, i) => {
                  const isUnidentified = r.name === 'UNIDENTIFIED';
                  const searchHint = isUnidentified ? '' : r.name;
                  const pickerKey = `review-${i}`;
                  return (
                    <div key={i} style={{ marginBottom: 6 }}>
                      <div className="analysis-result-row" style={{ background: '#e5a10015', alignItems: 'flex-start' }}>
                        <span style={{ flexShrink: 0, fontSize: 15, marginTop: 1 }}>❓</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 600, color: 'var(--amber)' }}>
                            {isUnidentified ? 'Unidentified foreground item' : r.name}
                            {!isUnidentified && <span style={{ fontWeight: 400, color: 'var(--text3)', fontSize: 11, marginLeft: 6 }}>{r.confidence}%</span>}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2, lineHeight: 1.4 }}>{r.reason}</div>
                          <button
                            style={{ marginTop: 6, padding: '5px 12px', background: '#e5a10022', border: '1px solid #e5a10055', color: 'var(--amber)', borderRadius: 6, fontSize: 11, cursor: 'pointer', fontWeight: 600 }}
                            onClick={() => setOpenPicker(openPicker === pickerKey ? null : pickerKey)}>
                            {openPicker === pickerKey ? '▲ Close' : '✎ Select item...'}
                          </button>
                        </div>
                      </div>
                      {openPicker === pickerKey && remainingItems.length > 0 && (
                        <ItemPicker
                          searchHint={searchHint}
                          remainingItems={remainingItems}
                          onSelect={handleAssign}
                          onDismiss={() => setOpenPicker(null)}
                        />
                      )}
                      {openPicker === pickerKey && remainingItems.length === 0 && (
                        <div style={{ padding: '10px 12px', fontSize: 12, color: 'var(--text3)', background: 'var(--bg2)', borderRadius: 8, marginTop: 4 }}>
                          All items already confirmed.
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Not visible */}
            {notVisible.length > 0 && (
              <details style={{ marginTop: 4 }}>
                <summary style={{ fontSize: 11, color: 'var(--text3)', cursor: 'pointer', padding: '4px 0' }}>
                  ❌ Not seen in foreground ({notVisible.length})
                </summary>
                <div style={{ marginTop: 4 }}>
                  {notVisible.map((r, i) => (
                    <div key={i} className="analysis-result-row" style={{ background: '#ffffff08', marginBottom: 4 }}>
                      <span style={{ flexShrink: 0, fontSize: 15 }}>❌</span>
                      <div>
                        <div style={{ fontWeight: 600, color: 'var(--text3)' }}>{r.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{r.reason}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </details>
            )}

            {analysisResults.length === 0 && (
              <div style={{ textAlign: 'center', padding: 20, color: 'var(--text3)', fontSize: 13 }}>
                No foreground items identified. Try a closer photo.
              </div>
            )}
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
  const remaining = items.length - confirmed;
  const sorted = [...items].sort((a, b) => {
    const aH = (itemPhotoMap[a.id] || []).length > 0;
    const bH = (itemPhotoMap[b.id] || []).length > 0;
    return (bH ? 1 : 0) - (aH ? 1 : 0);
  });

  const handleAnalyze = (idx) => {
    if (bulkPhotoResults[idx]) {
      const url = URL.createObjectURL(itemPhotos[idx]);
      const remainingItems = getRemainingItems(results, itemPhotoMap);
      set({ photoAnalysisModal: { photoIdx: idx, blobUrl: url, analyzing: false, results: bulkPhotoResults[idx], remainingItems } });
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
          Tap to identify items. AI reads packaging text only — ignores glass/background. Already-confirmed items are skipped.
        </p>
        <input ref={bulkRef} type="file" accept="image/*" multiple style={{ display: 'none' }}
          onChange={e => { set({ itemPhotos: [...itemPhotos, ...Array.from(e.target.files)] }); e.target.value = ''; }} />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {itemPhotos.length ? itemPhotos.map((f, i) => {
            const url = URL.createObjectURL(f);
            const res = bulkPhotoResults[i];
            const foundCount = res ? res.filter(r => r.visible && r.name !== 'UNIDENTIFIED').length : null;
            const pendingCount = res ? res.filter(r => r.visible && (r.name === 'UNIDENTIFIED' || r.confidence < 90)).length : null;
            return (
              <div key={i} style={{ position: 'relative', cursor: 'pointer', flexShrink: 0 }} onClick={() => handleAnalyze(i)}>
                <img src={url} alt="" style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 8, border: `2px solid ${res ? (pendingCount > 0 ? 'var(--amber)' : 'var(--green)') : 'var(--border)'}` }} />
                {foundCount !== null ? (
                  <span style={{ position: 'absolute', bottom: 3, left: 3, right: 3, background: '#000000bb', color: '#fff', fontSize: 9, padding: '1px 4px', borderRadius: 4, textAlign: 'center' }}>
                    {foundCount} found{pendingCount > 0 ? ` · ${pendingCount}❓` : ''}
                  </span>
                ) : (
                  <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#00000055', borderRadius: 6, fontSize: 9, color: '#fff', textAlign: 'center', lineHeight: 1.3, padding: 4 }}>Tap to<br />analyze</span>
                )}
              </div>
            );
          }) : <div style={{ color: 'var(--text3)', fontSize: 12, padding: '8px 0' }}>No overview photos yet.</div>}
        </div>
      </div>

      <div style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 600, letterSpacing: '.5px', marginBottom: 8 }}>
        DELIVERY ITEMS ({items.length})
      </div>
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
