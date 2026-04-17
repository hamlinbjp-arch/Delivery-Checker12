import { useState } from 'react';
import Icon from '../lib/icons';
import { useStore } from '../state/store';
import { searchPosItems } from '../lib/matcher';

export default function ActionSheet({ item, onAction, onClose }) {
  const { posItems } = useStore();
  const [mode, setMode] = useState('main'); // 'main' | 'short' | 'damaged' | 'swap-search'
  const [qtyReceived, setQtyReceived] = useState(item.qtyReceived ?? item.qtyExpected);
  const [damageNote, setDamageNote] = useState(item.damageNote || '');
  const [swapQuery, setSwapQuery] = useState('');
  const [swapResults, setSwapResults] = useState([]);
  const name = item.posDescription || item.invoiceName || '(unknown)';

  const handleSwapSearch = (q) => {
    setSwapQuery(q);
    setSwapResults(q.length >= 2 ? searchPosItems(q, posItems) : []);
  };

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100 }} onClick={onClose} />
      <div style={{
        position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 101,
        background: 'var(--bg2)', borderRadius: '16px 16px 0 0',
        padding: '20px 16px calc(20px + env(safe-area-inset-bottom))',
        boxShadow: '0 -4px 24px rgba(0,0,0,0.4)',
      }}>
        <div style={{ width: 36, height: 4, background: 'var(--bg3)', borderRadius: 2, margin: '0 auto 16px' }} />
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>{name}</div>
        <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 16 }}>
          Qty expected: {item.qtyExpected}
          {item.posCode && <span style={{ marginLeft: 8, fontFamily: 'var(--font-mono)' }}>{item.posCode}</span>}
        </div>

        {mode === 'main' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <button className="btn" style={{ background: 'var(--green)', color: '#fff', padding: 14, fontWeight: 700 }}
              onClick={() => onAction(item.id, { status: 'confirmed' })}>
              ✓ Confirm
            </button>
            <button className="btn" style={{ background: 'var(--amber)', color: '#fff', padding: 14, fontWeight: 700 }}
              onClick={() => setMode('short')}>
              Short
            </button>
            <button className="btn" style={{ background: 'var(--red)', color: '#fff', padding: 14, fontWeight: 700 }}
              onClick={() => setMode('damaged')}>
              Damaged
            </button>
            <button className="btn" style={{ background: 'var(--bg3)', color: 'var(--text2)', padding: 14 }}
              onClick={() => onAction(item.id, { status: 'set-aside' })}>
              Set Aside
            </button>
            <button className="btn" style={{ background: '#1d4ed8', color: '#fff', padding: 14 }}
              onClick={() => setMode('swap-search')}>
              Swapped
            </button>
            <button className="btn" style={{ background: 'transparent', border: '2px solid var(--red)', color: 'var(--red)', padding: 14 }}
              onClick={() => onAction(item.id, { status: 'missing' })}>
              Missing
            </button>
            <button className="btn" style={{ background: 'transparent', border: '2px solid var(--green)', color: 'var(--green)', padding: 14, gridColumn: 'span 2' }}
              onClick={() => onAction(item.id, { status: 'confirmed', isBonus: true })}>
              + Bonus Item
            </button>
          </div>
        )}

        {mode === 'short' && (
          <div>
            <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 10 }}>How many were received?</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <button className="btn btn-ghost" style={{ padding: '8px 18px', fontSize: 20 }}
                onClick={() => setQtyReceived(q => Math.max(0, q - 1))}>−</button>
              <span style={{ fontSize: 28, fontWeight: 700, minWidth: 48, textAlign: 'center' }}>{qtyReceived}</span>
              <button className="btn btn-ghost" style={{ padding: '8px 18px', fontSize: 20 }}
                onClick={() => setQtyReceived(q => q + 1)}>+</button>
              <span style={{ fontSize: 13, color: 'var(--text3)' }}>of {item.qtyExpected}</span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary" style={{ flex: 1 }}
                onClick={() => onAction(item.id, { status: 'short', qtyReceived })}>Confirm Short</button>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setMode('main')}>Back</button>
            </div>
          </div>
        )}

        {mode === 'damaged' && (
          <div>
            <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 8 }}>Describe the damage (optional):</div>
            <input className="input" placeholder="e.g. Crushed box, leaking bottle..." value={damageNote}
              onChange={e => setDamageNote(e.target.value)} style={{ marginBottom: 12 }} autoFocus />
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn" style={{ flex: 1, background: 'var(--red)', color: '#fff' }}
                onClick={() => onAction(item.id, { status: 'damaged', damageNote })}>Mark Damaged</button>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setMode('main')}>Back</button>
            </div>
          </div>
        )}

        {mode === 'swap-search' && (
          <div>
            <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 8 }}>What was delivered instead?</div>
            <input className="input" placeholder="Search stock list..." value={swapQuery}
              onChange={e => handleSwapSearch(e.target.value)} autoFocus style={{ marginBottom: 8 }} />
            <div style={{ maxHeight: 200, overflowY: 'auto' }}>
              {swapResults.map(r => (
                <button key={r.code} className="btn btn-ghost"
                  style={{ display: 'block', width: '100%', textAlign: 'left', fontSize: 12, padding: '7px 10px', marginBottom: 3 }}
                  onClick={() => onAction(item.id, { status: 'swapped', swappedForCode: r.code, swappedForDescription: r.description })}>
                  <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text3)', marginRight: 6 }}>{r.code}</span>
                  {r.description}
                </button>
              ))}
            </div>
            <button className="btn btn-ghost" style={{ width: '100%', marginTop: 8 }} onClick={() => setMode('main')}>Back</button>
          </div>
        )}
      </div>
    </>
  );
}
