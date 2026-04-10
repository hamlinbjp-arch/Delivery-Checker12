import { useRef, useState } from 'react';
import Icon from '../lib/icons';
import { useStore } from '../state/store';
import { fuzzyScore } from '../lib/fuzzy';
import { downloadCSV } from '../lib/csv';
import PhotoModal from './PhotoModal';

const pct = v => `${Math.round(v)}%`;

function ItemRow({ item }) {
  const { itemPhotoMap, addItemPhotos, removeItemPhoto, toggleRow, expandedRows, posData, saveAlias, confirmMatch, updateResultItem, set } = useStore();
  const camRef = useRef(); const fileRef = useRef();
  const photos = itemPhotoMap[item.id] || [];
  const isDmg = item.damaged;
  const expanded = expandedRows.has(item.id);
  const posInd = item.confidence >= 80 || item.learned ? '✅' : item.confidence >= 45 ? '⚠️' : '❌';
  const confColor = item.confidence >= 80 ? 'var(--green)' : item.confidence >= 45 ? 'var(--amber)' : 'var(--red)';
  let rowCls = item.confidence >= 80 || item.learned ? 'row-green' : item.confidence >= 45 ? 'row-yellow' : 'row-red';
  if (isDmg) rowCls = 'damaged';
  const existingAlias = Object.entries(posData?.aliases || {}).find(([, code]) => code === item.posCode);
  const [aliasVal, setAliasVal] = useState(existingAlias ? existingAlias[0] : '');

  const meta = [];
  if (item.supplierCode) meta.push(<span key="ref" style={{ color: 'var(--text3)' }}>Ref:{item.supplierCode}</span>);
  if (item.pageNumber) meta.push(`p.${item.pageNumber}`);
  meta.push(`Qty:${item.qtyExpected}`);
  if (item.posCode) meta.push(<span key="pos">POS:<b style={{ color: 'var(--green)', fontFamily: 'var(--font-mono)' }}>{item.posCode}</b></span>);
  meta.push(<span key="conf" style={{ color: confColor, fontWeight: 600 }}>{pct(item.confidence)}</span>);
  if (photos.length) meta.push(<span key="photo" style={{ color: 'var(--green)' }}>📷{photos.length}</span>);

  return (
    <div className={`result-row ${rowCls}`}>
      <input ref={camRef} type="file" accept="image/*" capture="environment" multiple style={{ display: 'none' }}
        onChange={e => { addItemPhotos(item.id, e.target.files); e.target.value = ''; }} />
      <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: 'none' }}
        onChange={e => { addItemPhotos(item.id, e.target.files); e.target.value = ''; }} />

      <div className="row-header">
        <div className="row-header-tap" style={{ minWidth: 0, flex: 1 }} onClick={() => toggleRow(item.id)}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
            <span style={{ fontSize: 15, flexShrink: 0 }}>{posInd}</span>
            <span style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text2)', paddingLeft: 20, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {meta.map((m, i) => <span key={i}>{i > 0 ? ' · ' : ''}{m}</span>)}
          </div>
          {item.posName && <div style={{ fontSize: 11, color: 'var(--text3)', paddingLeft: 20, marginTop: 1 }}>→ {item.posName}</div>}
        </div>
        <div style={{ display: 'flex', gap: 4, flexShrink: 0, marginLeft: 8 }}>
          <button className="btn-camera" disabled={photos.length >= 10} onClick={() => camRef.current?.click()}><Icon name="camera" size={16} /></button>
          <button className="btn-camera" disabled={photos.length >= 10} style={{ background: '#1e4d38', padding: '8px 10px', fontSize: 13 }} onClick={() => fileRef.current?.click()}>📎</button>
        </div>
      </div>

      {!item.learned && item.confidence < 80 && (() => {
        let msg, bg, border, col;
        if (item.confidence < 45) {
          col = 'var(--red)'; bg = '#f4433612'; border = '#f4433630';
          msg = item.posName
            ? `No reliable match. Best candidate: "${item.posName}" at ${pct(item.confidence)} — confidence too low. Check your stocklist or enter the POS code manually.`
            : 'Item not found in Idealpos stocklist. May be a new item or the name is very different from POS naming.';
        } else {
          col = 'var(--amber)'; bg = '#e5a10012'; border = '#e5a10030';
          msg = `Uncertain match at ${pct(item.confidence)}. Delivery name and Idealpos name look different — tap to expand and verify, then confirm or add an alias.`;
        }
        return (
          <div style={{ margin: '0 12px 8px', padding: '7px 10px', background: bg, border: `1px solid ${border}`, borderRadius: 6, fontSize: 11, color: col, lineHeight: 1.5 }}>
            {item.confidence < 45 ? '❌' : '⚠️'} {msg}
          </div>
        );
      })()}

      {photos.length > 0 && (
        <div className="photo-strip">
          {photos.map((url, i) => <img key={i} className="photo-thumb" src={url} alt="" onClick={() => set({ viewingPhoto: url })} />)}
        </div>
      )}

      {expanded && (
        <div className="row-details">
          <div style={{ paddingTop: 10, display: 'grid', gap: 8, fontSize: 12 }}>
            <div><span style={{ color: 'var(--text3)' }}>Idealpos:</span> {item.posName || '—'} <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--green)' }}>{item.posCode ? `(${item.posCode})` : ''}</span></div>
            <div><span style={{ color: 'var(--text3)' }}>Match:</span> <span style={{ color: confColor, fontWeight: 600 }}>{pct(item.confidence)}</span> <span style={{ color: 'var(--text3)', fontSize: 10 }}>{item.aliased ? 'via alias' : item.learned ? 'learned' : 'fuzzy'}</span></div>
            {item.posCode && (
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input className="input" placeholder="Save alias (e.g. 'Coke 2L')" value={aliasVal}
                  onChange={e => setAliasVal(e.target.value)}
                  style={{ fontSize: 11, padding: '6px 8px', flex: 1 }} />
                <button className="btn btn-ghost" style={{ fontSize: 11, padding: '6px 10px' }} onClick={() => saveAlias(item.id, aliasVal)}>Save Alias</button>
              </div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button className={`btn${isDmg ? ' btn-danger' : ' btn-ghost'}`} style={{ flex: 1, fontSize: 12 }}
                onClick={() => updateResultItem(item.id, { damaged: !isDmg, status: !isDmg ? 'Damaged' : item.confidence < 45 ? 'NEW ITEM' : 'Matched' })}>
                <Icon name="flag" size={12} /> {isDmg ? 'Unflag' : 'Flag Damage'}
              </button>
              {item.confidence >= 45 && item.confidence < 95 && !item.learned && !item.aliased && (
                <button className="btn" style={{ background: '#2d6a4f22', border: '1px solid var(--green-dark)', color: 'var(--green)', fontSize: 12 }} onClick={() => confirmMatch(item.id)}>
                  <Icon name="check" size={12} /> Confirm match
                </button>
              )}
            </div>
            {isDmg && <input className="input" placeholder="Damage notes..." value={item.damageNote || ''} style={{ fontSize: 12, padding: '8px 10px', borderColor: '#f4433644' }} onChange={e => updateResultItem(item.id, { damageNote: e.target.value })} />}
            {item.status === 'NEW ITEM' && <input className="input" placeholder="Manual POS code or notes..." value={item.manualNotes || ''} style={{ fontSize: 12, padding: '8px 10px', fontFamily: 'var(--font-mono)', borderColor: '#e5a10044' }} onChange={e => updateResultItem(item.id, { manualNotes: e.target.value })} />}
            {photos.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {photos.map((_, i) => <button key={i} className="btn btn-ghost" style={{ fontSize: 10, padding: '4px 8px', color: 'var(--red)' }} onClick={() => removeItemPhoto(item.id, i)}>✕ Photo {i + 1}</button>)}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function POSEntryMode() {
  const { results, posChecked, togglePosChecked, set } = useStore();
  const items = (results || []).filter(i => i.posCode).sort((a, b) => a.posCode.localeCompare(b.posCode));
  return (
    <div className="pos-mode">
      <div className="pos-header">
        <span style={{ fontWeight: 800, fontSize: 16, color: 'var(--green)' }}>POS ENTRY MODE</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 12, color: 'var(--text3)' }}>{posChecked.size}/{items.length}</span>
          <button className="btn" style={{ padding: '6px 12px', background: 'var(--border)', fontSize: 12 }} onClick={() => { set({ showPOSEntry: false, posChecked: new Set() }); }}>Done</button>
        </div>
      </div>
      <div style={{ padding: '8px 12px' }}>
        {items.map(item => (
          <div key={item.id} className={`pos-row${posChecked.has(item.id) ? ' checked' : ''}`} onClick={() => togglePosChecked(item.id)}>
            <span className="pos-code">{item.posCode}</span>
            <span className="pos-name">{item.name}</span>
            <span className="pos-qty">{item.qtyExpected}</span>
          </div>
        ))}
        {!items.length && <div style={{ textAlign: 'center', padding: 40, color: 'var(--text3)' }}>No POS-matched items.</div>}
      </div>
    </div>
  );
}

export default function POSStep() {
  const store = useStore();
  const { results, itemPhotoMap, posData, selectedSupplier, deliveryNotes, issuesOnly, resultsSearch, showPOSEntry, set, resetDelivery, addHistoryRecord, uid } = store;
  const allItems = results || [];
  const aliases = posData?.aliases || {};

  if (showPOSEntry) return <POSEntryMode />;

  const q = resultsSearch.trim();
  const filtered = q ? allItems.filter(i => {
    if (fuzzyScore(q, i.name) >= 50) return true;
    if (i.posName && fuzzyScore(q, i.posName) >= 50) return true;
    for (const [label, code] of Object.entries(aliases)) { if (code === i.posCode && fuzzyScore(q, label) >= 50) return true; }
    return false;
  }) : allItems;
  const baseItems = issuesOnly ? filtered.filter(i => i.confidence < 80 && !i.learned) : filtered;

  const strong = allItems.filter(i => i.confidence >= 80 || i.learned).length;
  const uncertain = allItems.filter(i => i.confidence >= 45 && i.confidence < 80 && !i.learned).length;
  const newItems = allItems.filter(i => i.confidence < 45).length;
  const posSupSection = allItems.find(i => i.posSupplier)?.posSupplier || '';

  const handleSave = () => {
    const record = {
      id: uid(), date: new Date().toISOString(), supplier: selectedSupplier || 'Unknown',
      notes: deliveryNotes, items: allItems, itemCount: allItems.length,
      issueCount: allItems.filter(i => i.status !== 'Matched').length,
    };
    addHistoryRecord(record);
    resetDelivery();
  };

  return (
    <div style={{ paddingTop: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 600, letterSpacing: '.5px' }}>STEP 2 OF 2</div>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>🔍 POS Matching</h2>
          {selectedSupplier && (
            <p style={{ fontSize: 12, color: 'var(--text3)', margin: '2px 0 0' }}>
              {selectedSupplier}{posSupSection ? <> · POS section: <b style={{ color: 'var(--green)' }}>{posSupSection}</b></> : ''}
            </p>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn btn-ghost" style={{ padding: '6px 10px', fontSize: 12 }} onClick={() => set({ deliveryStep: 'verify' })}>← Photos</button>
          <button className="btn btn-ghost" style={{ padding: '6px 10px', fontSize: 12 }} onClick={resetDelivery}>New</button>
        </div>
      </div>
      <div className="step-bar"><div className="step-pill done" /><div className="step-pill active" /></div>

      <div className="stats">
        <div className="stat"><div className="stat-val">{allItems.length}</div><div className="stat-label">Total</div></div>
        <div className="stat"><div className="stat-val" style={{ color: 'var(--green)' }}>{strong}</div><div className="stat-label">✅ Strong</div></div>
        <div className="stat"><div className="stat-val" style={{ color: 'var(--amber)' }}>{uncertain}</div><div className="stat-label">⚠️ Fuzzy</div></div>
        <div className="stat"><div className="stat-val" style={{ color: 'var(--red)' }}>{newItems}</div><div className="stat-label">❌ New</div></div>
      </div>

      <details style={{ marginBottom: 10, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', fontSize: 11, color: 'var(--text2)' }}>
        <summary style={{ cursor: 'pointer', fontWeight: 600, color: 'var(--text)', listStyle: 'none' }}>▾ POS Match Key</summary>
        <div style={{ marginTop: 8, display: 'grid', gap: 4 }}>
          <div>✅ <b>Strong</b> (≥80%) — Idealpos item found with high confidence</div>
          <div>⚠️ <b>Fuzzy</b> (45–79%) — possible match, verify before accepting</div>
          <div>❌ <b>Not found</b> (&lt;45%) — may be a new item or naming differs greatly</div>
        </div>
      </details>

      <div style={{ marginBottom: 10, position: 'relative' }}>
        <input className="input" placeholder="Search by name or Idealpos name..." value={resultsSearch}
          onChange={e => set({ resultsSearch: e.target.value })}
          style={{ paddingLeft: 32, fontSize: 12 }} />
        <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', opacity: .5 }}><Icon name="search" size={14} /></span>
        {q && <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: 'var(--text3)' }}>{filtered.length}/{allItems.length}</span>}
      </div>

      <div className="action-bar">
        <button className={`btn${issuesOnly ? '' : ' btn-ghost'}`} style={issuesOnly ? { background: '#e5a10022', border: '1px solid var(--amber)', color: 'var(--amber)' } : {}}
          onClick={() => set({ issuesOnly: !issuesOnly })}>
          <Icon name="filter" size={14} /> {issuesOnly ? 'All' : 'Issues Only'}
        </button>
        <button className="btn btn-ghost" style={{ color: 'var(--green)' }} onClick={() => set({ showPOSEntry: true })}><Icon name="zap" size={12} /> POS Mode</button>
        <button className="btn btn-ghost" onClick={() => downloadCSV(allItems, deliveryNotes, selectedSupplier, itemPhotoMap)}><Icon name="download" size={14} /> CSV</button>
      </div>

      {baseItems.map(item => <ItemRow key={item.id} item={item} />)}
      {!baseItems.length && <div style={{ textAlign: 'center', padding: 32, color: 'var(--text3)' }}>{issuesOnly ? 'No issues found! All items matched strongly.' : 'No items to display.'}</div>}

      <button className="btn btn-primary" style={{ width: '100%', padding: 14, fontSize: 14, fontWeight: 600, marginTop: 16 }} onClick={handleSave}>
        <Icon name="check" size={16} /> Save &amp; Finish
      </button>

      <PhotoModal />
    </div>
  );
}
