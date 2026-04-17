import { useState, useRef } from 'react';
import Icon from '../lib/icons';
import { useStore } from '../state/store';
import { parseStockCodes } from '../lib/stockParser';

export default function Settings() {
  const {
    locationName, posItems, learnedMappings, matchCorrections,
    saveLocationName, savePosItems, setLearnedMappings, setMatchCorrections, clearHistory,
  } = useStore();

  const [locationVal, setLocationVal] = useState(locationName);
  const [locationSaved, setLocationSaved] = useState(false);
  const [processing, setProcessing] = useState(null);
  const [progressMsg, setProgressMsg] = useState('');
  const [pendingAction, setPendingAction] = useState(null);
  const [errors, setErrors] = useState({});

  const stockRef = useRef();
  const learnedImportRef = useRef();
  const correctionsImportRef = useRef();

  const setError = (key, msg) => setErrors(e => ({ ...e, [key]: msg }));

  const learnedCount = Object.keys(learnedMappings || {}).length;
  const correctionsCount = Object.keys(matchCorrections || {}).length;

  // ── Location Name ─────────────────────────────────────────────────
  const handleSaveLocation = async () => {
    await saveLocationName(locationVal.trim());
    setLocationSaved(true);
    setTimeout(() => setLocationSaved(false), 2000);
  };

  // ── Stock List Upload ─────────────────────────────────────────────
  const handleStockFile = async (file) => {
    setError('stock', '');
    setProcessing('stock');
    setProgressMsg('Loading...');
    try {
      const text = await file.text();
      setProgressMsg('Parsing...');
      const items = parseStockCodes(text);
      if (items.length === 0) throw new Error('No items found. Check the file format.');
      await savePosItems(items);
      setProgressMsg(`✓ ${items.length} items loaded`);
    } catch (err) {
      setError('stock', err.message);
      setProgressMsg('');
    } finally {
      setProcessing(null);
    }
  };

  // ── Learned Mappings Export/Import ────────────────────────────────
  const handleExportLearned = () => {
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), learnedMappings }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `learned-mappings-${new Date().toISOString().slice(0, 10)}.json`; a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportLearned = async (file) => {
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const incoming = data.learnedMappings ?? data;
      if (typeof incoming !== 'object' || Array.isArray(incoming)) throw new Error('Invalid format');
      await setLearnedMappings({ ...learnedMappings, ...incoming });
      setError('learned', '');
    } catch (err) {
      setError('learned', `Import failed: ${err.message}`);
    }
  };

  // ── Match Corrections Export/Import ───────────────────────────────
  const handleExportCorrections = () => {
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), matchCorrections }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `match-corrections-${new Date().toISOString().slice(0, 10)}.json`; a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportCorrections = async (file) => {
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const incoming = data.matchCorrections ?? data;
      if (typeof incoming !== 'object' || Array.isArray(incoming)) throw new Error('Invalid format');
      await setMatchCorrections({ ...matchCorrections, ...incoming });
      setError('corrections', '');
    } catch (err) {
      setError('corrections', `Import failed: ${err.message}`);
    }
  };

  return (
    <div style={{ paddingTop: 16 }}>
      <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <Icon name="settings" size={20} /> Settings
      </h2>

      {/* Location Name */}
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="card-label">Store Name</div>
        <input className="input" value={locationVal} onChange={e => setLocationVal(e.target.value)}
          placeholder="e.g. Downtown Store" style={{ marginBottom: 8 }} />
        <button className="btn btn-primary" style={{ fontSize: 13 }} onClick={handleSaveLocation}
          disabled={!locationVal.trim()}>
          {locationSaved ? '✓ Saved' : 'Save'}
        </button>
      </div>

      {/* Stock List */}
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="card-label">Stock List</div>
        <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 8 }}>
          <span style={{ color: 'var(--green)', fontWeight: 600 }}>{posItems.length}</span> items loaded
        </div>
        <p style={{ fontSize: 11, color: 'var(--text3)', margin: '0 0 10px' }}>
          Upload a new <strong>Stockcodes.txt</strong> to replace the current stock list.
        </p>
        <input ref={stockRef} type="file" accept=".txt,.csv" style={{ display: 'none' }}
          onChange={e => { if (e.target.files[0]) handleStockFile(e.target.files[0]); e.target.value = ''; }} />
        <button className="btn btn-ghost" style={{ fontSize: 12 }} disabled={processing === 'stock'}
          onClick={() => stockRef.current?.click()}>
          {processing === 'stock'
            ? <><span className="spinner">⟳</span> {progressMsg}</>
            : <><Icon name="upload" size={14} /> Upload Stockcodes.txt</>}
        </button>
        {progressMsg && processing !== 'stock' && !errors.stock && (
          <div style={{ fontSize: 11, color: 'var(--green)', marginTop: 6 }}>{progressMsg}</div>
        )}
        {errors.stock && <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 6 }}>{errors.stock}</div>}
      </div>

      {/* Learned Mappings */}
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="card-label">Learned Mappings</div>
        <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 8 }}>
          <span style={{ color: 'var(--green)', fontWeight: 600 }}>{learnedCount}</span> mapping{learnedCount !== 1 ? 's' : ''} saved
        </div>
        <input ref={learnedImportRef} type="file" accept=".json" style={{ display: 'none' }}
          onChange={e => { if (e.target.files[0]) handleImportLearned(e.target.files[0]); e.target.value = ''; }} />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: errors.learned ? 8 : 0 }}>
          <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={handleExportLearned}
            disabled={learnedCount === 0}>
            <Icon name="download" size={14} /> Export
          </button>
          <button className="btn btn-ghost" style={{ fontSize: 12 }}
            onClick={() => learnedImportRef.current?.click()}>
            <Icon name="upload" size={14} /> Import
          </button>
          {learnedCount > 0 && (
            <button className="btn btn-danger" style={{ fontSize: 12 }}
              onClick={() => setPendingAction(pendingAction === 'learned' ? null : 'learned')}>
              Clear
            </button>
          )}
        </div>
        {errors.learned && <div style={{ fontSize: 11, color: 'var(--red)' }}>{errors.learned}</div>}
        {pendingAction === 'learned' && (
          <div style={{ marginTop: 8, padding: '8px 10px', background: '#f4433612', border: '1px solid #f4433630', borderRadius: 6, fontSize: 12 }}>
            <div style={{ marginBottom: 8, color: 'var(--red)' }}>Clear all {learnedCount} learned mappings?</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-danger" style={{ fontSize: 11, padding: '5px 12px' }}
                onClick={() => { setLearnedMappings({}); setPendingAction(null); }}>Yes, clear</button>
              <button className="btn btn-ghost" style={{ fontSize: 11, padding: '5px 12px' }}
                onClick={() => setPendingAction(null)}>Cancel</button>
            </div>
          </div>
        )}
      </div>

      {/* Match Corrections */}
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="card-label">Match Corrections</div>
        <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 8 }}>
          <span style={{ color: 'var(--green)', fontWeight: 600 }}>{correctionsCount}</span> correction{correctionsCount !== 1 ? 's' : ''} saved
        </div>
        <input ref={correctionsImportRef} type="file" accept=".json" style={{ display: 'none' }}
          onChange={e => { if (e.target.files[0]) handleImportCorrections(e.target.files[0]); e.target.value = ''; }} />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: errors.corrections ? 8 : 0 }}>
          <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={handleExportCorrections}
            disabled={correctionsCount === 0}>
            <Icon name="download" size={14} /> Export
          </button>
          <button className="btn btn-ghost" style={{ fontSize: 12 }}
            onClick={() => correctionsImportRef.current?.click()}>
            <Icon name="upload" size={14} /> Import
          </button>
          {correctionsCount > 0 && (
            <button className="btn btn-danger" style={{ fontSize: 12 }}
              onClick={() => setPendingAction(pendingAction === 'corrections' ? null : 'corrections')}>
              Clear
            </button>
          )}
        </div>
        {errors.corrections && <div style={{ fontSize: 11, color: 'var(--red)' }}>{errors.corrections}</div>}
        {pendingAction === 'corrections' && (
          <div style={{ marginTop: 8, padding: '8px 10px', background: '#f4433612', border: '1px solid #f4433630', borderRadius: 6, fontSize: 12 }}>
            <div style={{ marginBottom: 8, color: 'var(--red)' }}>Clear all {correctionsCount} corrections?</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-danger" style={{ fontSize: 11, padding: '5px 12px' }}
                onClick={() => { setMatchCorrections({}); setPendingAction(null); }}>Yes, clear</button>
              <button className="btn btn-ghost" style={{ fontSize: 11, padding: '5px 12px' }}
                onClick={() => setPendingAction(null)}>Cancel</button>
            </div>
          </div>
        )}
      </div>

      {/* Danger Zone */}
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="card-label" style={{ color: 'var(--red)' }}>Danger Zone</div>
        <button className="btn btn-danger" style={{ fontSize: 12 }}
          onClick={() => setPendingAction(pendingAction === 'history' ? null : 'history')}>
          Clear All History
        </button>
        {pendingAction === 'history' && (
          <div style={{ marginTop: 8, padding: '8px 10px', background: '#f4433612', border: '1px solid #f4433630', borderRadius: 6, fontSize: 12 }}>
            <div style={{ marginBottom: 8, color: 'var(--red)' }}>Delete all delivery history?</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-danger" style={{ fontSize: 11, padding: '5px 12px' }}
                onClick={() => { clearHistory(); setPendingAction(null); }}>Yes, delete all</button>
              <button className="btn btn-ghost" style={{ fontSize: 11, padding: '5px 12px' }}
                onClick={() => setPendingAction(null)}>Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
