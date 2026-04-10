// Read-only view of a past delivery from history
import Icon from '../lib/icons';
import { useStore } from '../state/store';
import { downloadCSV } from '../lib/csv';
import { fuzzyScore } from '../lib/fuzzy';

const pct = v => `${Math.round(v)}%`;
const fmt = d => new Date(d).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export default function HistoryResults() {
  const { viewingHistory, results, expandedRows, toggleRow, set, resetDelivery } = useStore();
  const allItems = results || viewingHistory?.items || [];
  const isHist = !!viewingHistory;
  const supplier = viewingHistory?.supplier || '';
  const notes = viewingHistory?.notes || '';

  const strong = allItems.filter(i => i.confidence >= 80 || i.learned).length;
  const newC = allItems.filter(i => i.status === 'NEW ITEM').length;
  const dmg = allItems.filter(i => i.damaged).length;

  return (
    <div style={{ paddingTop: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>📋 Results</h2>
          {supplier && <p style={{ fontSize: 12, color: 'var(--text3)', margin: '2px 0 0' }}>{supplier}</p>}
          {notes && <p style={{ fontSize: 12, color: 'var(--text3)', margin: '2px 0 0' }}>{fmt(viewingHistory?.date)}</p>}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn btn-ghost" style={{ padding: '6px 12px', fontSize: 12 }}
            onClick={() => downloadCSV(allItems, notes, supplier)}>
            <Icon name="download" size={12} /> CSV
          </button>
          <button className="btn btn-ghost" style={{ padding: '6px 12px', fontSize: 12 }}
            onClick={() => { set({ viewingHistory: null, results: null }); resetDelivery(); }}>
            ← Back
          </button>
        </div>
      </div>

      <div className="stats">
        <div className="stat"><div className="stat-val" style={{ color: 'var(--text2)' }}>{allItems.length}</div><div className="stat-label">Total</div></div>
        <div className="stat"><div className="stat-val" style={{ color: 'var(--green)' }}>{strong}</div><div className="stat-label">Strong</div></div>
        <div className="stat"><div className="stat-val" style={{ color: 'var(--amber)' }}>{newC}</div><div className="stat-label">New</div></div>
        <div className="stat"><div className="stat-val" style={{ color: 'var(--red)' }}>{dmg}</div><div className="stat-label">Damaged</div></div>
      </div>

      {allItems.map(item => {
        const posInd = item.confidence >= 80 || item.learned ? '✅' : item.confidence >= 45 ? '⚠️' : '❌';
        const confColor = item.confidence >= 80 ? 'var(--green)' : item.confidence >= 45 ? 'var(--amber)' : 'var(--red)';
        let rowCls = item.confidence >= 80 || item.learned ? 'row-green' : item.confidence >= 45 ? 'row-yellow' : 'row-red';
        if (item.damaged) rowCls = 'damaged';
        const expanded = expandedRows.has(item.id);

        return (
          <div key={item.id} className={`result-row ${rowCls}`}>
            <div className="row-header" onClick={() => toggleRow(item.id)} style={{ cursor: 'pointer' }}>
              <span style={{ fontSize: 15, flexShrink: 0 }}>{posInd}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
                <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 3, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {item.pageNumber && <span>p.{item.pageNumber}</span>}
                  <span>Qty:{item.qtyExpected}</span>
                  {item.posCode && <span>POS:<b style={{ color: 'var(--green)', fontFamily: 'var(--font-mono)' }}>{item.posCode}</b></span>}
                  <span style={{ color: confColor, fontWeight: 600 }}>{pct(item.confidence)}</span>
                  {item.damaged && <span style={{ color: 'var(--red)' }}>⚠ Damaged</span>}
                </div>
              </div>
            </div>
            {expanded && (
              <div className="row-details">
                <div style={{ paddingTop: 10, display: 'grid', gap: 6, fontSize: 12 }}>
                  <div><span style={{ color: 'var(--text3)' }}>Idealpos:</span> {item.posName || '—'} <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--green)' }}>{item.posCode ? `(${item.posCode})` : ''}</span></div>
                  <div><span style={{ color: 'var(--text3)' }}>Match:</span> <span style={{ color: confColor, fontWeight: 600 }}>{pct(item.confidence)}</span> <span style={{ color: 'var(--text3)', fontSize: 10 }}>{item.aliased ? 'via alias' : item.learned ? 'learned' : 'fuzzy'}</span></div>
                  {item.damageNote && <div style={{ color: 'var(--red)' }}>Damage: {item.damageNote}</div>}
                  {item.manualNotes && <div style={{ color: 'var(--text2)' }}>Notes: {item.manualNotes}</div>}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
