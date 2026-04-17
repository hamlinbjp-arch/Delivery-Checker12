import { useState, useRef } from 'react';
import Icon from '../lib/icons';
import { useStore } from '../state/store';
import { parseSupplierMappingsPDF } from '../lib/pdfParser';
import { parsePOSStock, mergePOSStock } from '../lib/posParser';
import { parseDepartments } from '../lib/departmentsParser';

const fmt = d => new Date(d).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export default function Settings() {
  const {
    apiKey, locationName, supplierMappings, posItems, departments, learningLayer, matchCorrections,
    supplierRecencyOrder, supplierUsageCounts,
    saveApiKey, saveLocationName, saveSupplierMappings, savePosItems, saveDepartments,
    setLearningLayer, setMatchCorrections, clearHistory,
  } = useStore();

  const [keyVal, setKeyVal] = useState(apiKey);
  const [showKey, setShowKey] = useState(false);
  const [keySaved, setKeySaved] = useState(false);
  const [locationVal, setLocationVal] = useState(locationName);
  const [locationSaved, setLocationSaved] = useState(false);
  const [processing, setProcessing] = useState(null); // which section is processing
  const [progressMsg, setProgressMsg] = useState('');
  const [stockMode, setStockMode] = useState('replace');
  const [pendingAction, setPendingAction] = useState(null);
  const [errors, setErrors] = useState({});

  const mappingsRef          = useRef();
  const stockRef             = useRef();
  const deptsRef             = useRef();
  const correctionsImportRef = useRef();
  const learningImportRef    = useRef();

  const setError = (key, msg) => setErrors(e => ({ ...e, [key]: msg }));
  const clearError = (key) => setErrors(e => ({ ...e, [key]: '' }));

  // -- Export Suppliers
  const handleExportSuppliers = () => {
    const suppliers = (supplierRecencyOrder || []).map(name => ({
      name,
      lastUsed: supplierUsageCounts?.[name]?.lastUsed || null,
      useCount: supplierUsageCounts?.[name]?.useCount || 0,
    }));
    const data = { exportedAt: new Date().toISOString(), suppliers };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `suppliers-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // -- Location Name
  const handleSaveLocation = async () => {
    await saveLocationName(locationVal.trim());
    setLocationSaved(true);
    setTimeout(() => setLocationSaved(false), 2000);
  };

  // -- API Key
  const handleSaveKey = async () => {
    await saveApiKey(keyVal.trim());
    setKeySaved(true);
    setTimeout(() => setKeySaved(false), 2000);
  };

  // -- Supplier Mappings
  const handleMappingsPDF = async (file) => {
    clearError('mappings'); setProcessing('mappings'); setProgressMsg('Loading PDF...');
    try {
      const { items, supplierCount } = await parseSupplierMappingsPDF(file, msg => setProgressMsg(msg));
      await saveSupplierMappings(items);
      setProgressMsg(`✓ ${items.length} mappings from ${supplierCount} supplier${supplierCount !== 1 ? 's' : ''}`);
    } catch (err) {
      setError('mappings', err.message);
    } finally {
      setProcessing(null);
      setTimeout(() => setProgressMsg(''), 2500);
    }
  };

  // -- POS Stock
  const handleStockFile = async (file) => {
    clearError('stock'); setProcessing('stock'); setProgressMsg('Loading...');
    try {
      const text = await file.text();
      const { items } = await parsePOSStock(text, pct => setProgressMsg(`Parsing... ${pct}%`));
      const merged = mergePOSStock(posItems, items, stockMode);
      await savePosItems(merged);
      setProgressMsg(`✓ ${merged.length} items (${stockMode})`);
    } catch (err) {
      setError('stock', err.message);
    } finally {
      setProcessing(null);
      setTimeout(() => setProgressMsg(''), 2500);
    }
  };

  // -- Departments
  const handleDeptsFile = async (file) => {
    clearError('depts'); setProcessing('depts'); setProgressMsg('Loading...');
    try {
      const text = await file.text();
      const depts = parseDepartments(text);
      await saveDepartments(depts);
      setProgressMsg(`✓ ${depts.length} departments`);
    } catch (err) {
      setError('depts', err.message);
    } finally {
      setProcessing(null);
      setTimeout(() => setProgressMsg(''), 2500);
    }
  };

  // -- Export Match Corrections
  const handleExportCorrections = () => {
    const data = { exportedAt: new Date().toISOString(), matchCorrections };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `match-corrections-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // -- Import Match Corrections
  const handleImportCorrections = async (file) => {
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const incoming = data.matchCorrections ?? data; // support both wrapped and raw
      if (typeof incoming !== 'object' || Array.isArray(incoming)) throw new Error('Invalid format');
      await setMatchCorrections({ ...matchCorrections, ...incoming });
      clearError('corrections');
    } catch (err) {
      setError('corrections', `Import failed: ${err.message}`);
    }
  };

  // -- Export Learning Layer
  const handleExportLearning = () => {
    const data = { exportedAt: new Date().toISOString(), learningLayer };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `learning-layer-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // -- Import Learning Layer
  const handleImportLearning = async (file) => {
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const incoming = data.learningLayer ?? data;
      if (typeof incoming !== 'object' || Array.isArray(incoming)) throw new Error('Invalid format');
      await setLearningLayer({ ...learningLayer, ...incoming });
      clearError('learning');
    } catch (err) {
      setError('learning', `Import failed: ${err.message}`);
    }
  };

  const mappingsUpdatedAt  = supplierMappings?.[0]?.updatedAt;
  const learningCount      = Object.keys(learningLayer || {}).length;
  const correctionsCount   = Object.keys(matchCorrections || {}).length;

  return (
    <div style={{ paddingTop: 16 }}>
      <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <Icon name="settings" size={20} /> Settings
      </h2>

      {/* Section 0: Store Settings */}
      <div className="card">
        <div className="card-label">Store Settings</div>
        <label style={{ fontSize: 12, color: 'var(--text2)', display: 'block', marginBottom: 4 }}>Location Name</label>
        <input className="input" placeholder="e.g. MAIN STORE" value={locationVal}
          onChange={e => setLocationVal(e.target.value)} style={{ fontSize: 16 }} />
        <div style={{ fontSize: 11, color: 'var(--text3)', margin: '4px 0 8px' }}>
          Must match your Idealpos Location Name exactly
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={handleSaveLocation}>Save</button>
          {locationSaved && <span style={{ fontSize: 11, color: 'var(--green)' }}>✓ Saved</span>}
        </div>
      </div>

      {/* Section 1: API Key */}
      <div className="card">
        <div className="card-label">Anthropic API Key</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input type={showKey ? 'text' : 'password'} className="input" placeholder="sk-ant-..." value={keyVal}
            onChange={e => setKeyVal(e.target.value)} style={{ flex: 1 }} />
          <button className="btn btn-ghost" style={{ padding: 8 }} onClick={() => setShowKey(v => !v)}><Icon name="eye" size={16} /></button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
          <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={handleSaveKey}>Save Key</button>
          {keySaved && <span style={{ fontSize: 11, color: 'var(--green)' }}>✓ Saved</span>}
        </div>
      </div>

      {/* Section 2: Data Sources */}
      <div className="card">
        <div className="card-label">Data Sources</div>

        {/* Supplier Mappings */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 4 }}>Supplier Mappings PDF</div>
          {supplierMappings?.length ? (
            <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 6 }}>
              <span style={{ color: 'var(--green)', fontWeight: 600 }}>{supplierMappings.length}</span> mappings loaded
            </div>
          ) : (
            <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 6 }}>Not loaded</div>
          )}
          <input ref={mappingsRef} type="file" accept=".pdf" style={{ display: 'none' }}
            onChange={e => { if (e.target.files[0]) handleMappingsPDF(e.target.files[0]); e.target.value = ''; }} />
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button className="btn btn-primary" style={{ fontSize: 12 }} disabled={processing === 'mappings'}
              onClick={() => mappingsRef.current?.click()}>
              {processing === 'mappings' ? <><span className="spinner">⟳</span> {progressMsg}</> : supplierMappings?.length ? 'Re-upload' : 'Upload PDF'}
            </button>
            {supplierMappings?.length > 0 && (
              <button className="btn btn-danger" style={{ fontSize: 12 }} onClick={() => saveSupplierMappings([])}>Clear</button>
            )}
          </div>
          {errors.mappings && <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 4 }}>{errors.mappings}</div>}
          {processing === 'mappings' && progressMsg && !errors.mappings && (
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>{progressMsg}</div>
          )}
        </div>

        {/* POS Stock */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 4 }}>POS Stock File</div>
          {posItems?.length ? (
            <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 6 }}>
              <span style={{ color: 'var(--green)', fontWeight: 600 }}>{posItems.length}</span> items loaded
            </div>
          ) : (
            <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 6 }}>Not loaded</div>
          )}
          {posItems?.length > 0 && !posItems.some(p => p.supplierCode) && (
            <div style={{ fontSize: 12, color: 'var(--amber)', background: '#e5a10018', border: '1px solid var(--amber)', borderRadius: 6, padding: '8px 10px', marginBottom: 6 }}>
              ⚠ Supplier codes missing — re-upload this file to enable supplier code matching.
            </div>
          )}
          <div style={{ marginBottom: 6 }}>
            <select className="input" style={{ fontSize: 12, padding: '6px 8px', appearance: 'auto' }}
              value={stockMode} onChange={e => setStockMode(e.target.value)}>
              <option value="replace">Replace all</option>
              <option value="add-new">Add new items only</option>
              <option value="update">Update existing</option>
            </select>
          </div>
          <input ref={stockRef} type="file" accept=".txt,.csv,.tsv" style={{ display: 'none' }}
            onChange={e => { if (e.target.files[0]) handleStockFile(e.target.files[0]); e.target.value = ''; }} />
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button className="btn btn-primary" style={{ fontSize: 12 }} disabled={processing === 'stock'}
              onClick={() => stockRef.current?.click()}>
              {processing === 'stock' ? <><span className="spinner">⟳</span> {progressMsg}</> : posItems?.length ? 'Re-upload' : 'Upload File'}
            </button>
            {posItems?.length > 0 && (
              <button className="btn btn-danger" style={{ fontSize: 12 }} onClick={() => savePosItems([])}>Clear</button>
            )}
          </div>
          {errors.stock && <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 4 }}>{errors.stock}</div>}
          {processing === 'stock' && progressMsg && !errors.stock && (
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>{progressMsg}</div>
          )}
        </div>

        {/* Departments */}
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 4 }}>Departments</div>
          {departments?.length ? (
            <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 6 }}>
              <span style={{ color: 'var(--green)', fontWeight: 600 }}>{departments.length}</span> departments loaded
            </div>
          ) : (
            <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 6 }}>Not loaded</div>
          )}
          <input ref={deptsRef} type="file" accept=".txt,.csv,.tsv" style={{ display: 'none' }}
            onChange={e => { if (e.target.files[0]) handleDeptsFile(e.target.files[0]); e.target.value = ''; }} />
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button className="btn btn-primary" style={{ fontSize: 12 }} disabled={processing === 'depts'}
              onClick={() => deptsRef.current?.click()}>
              {processing === 'depts' ? <><span className="spinner">⟳</span> {progressMsg}</> : departments?.length ? 'Re-upload' : 'Upload File'}
            </button>
            {departments?.length > 0 && (
              <button className="btn btn-danger" style={{ fontSize: 12 }} onClick={() => saveDepartments([])}>Clear</button>
            )}
          </div>
          {errors.depts && <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 4 }}>{errors.depts}</div>}
        </div>
      </div>

      {/* Section 3: Learning Layer */}
      <div className="card">
        <div className="card-label">Learning Layer</div>
        <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 8 }}>
          <span style={{ color: 'var(--green)', fontWeight: 600 }}>{learningCount}</span> learned mapping{learningCount !== 1 ? 's' : ''}
        </div>
        <input ref={learningImportRef} type="file" accept=".json" style={{ display: 'none' }}
          onChange={e => { if (e.target.files[0]) handleImportLearning(e.target.files[0]); e.target.value = ''; }} />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: errors.learning ? 8 : 0 }}>
          <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={handleExportLearning}
            disabled={learningCount === 0}>
            <Icon name="download" size={14} /> Export
          </button>
          <button className="btn btn-ghost" style={{ fontSize: 12 }}
            onClick={() => learningImportRef.current?.click()}>
            <Icon name="upload" size={14} /> Import
          </button>
          {learningCount > 0 && (
            <button className="btn btn-danger" style={{ fontSize: 12 }}
              onClick={() => setPendingAction(pendingAction === 'learning' ? null : 'learning')}>
              Clear
            </button>
          )}
        </div>
        {errors.learning && <div style={{ fontSize: 11, color: 'var(--red)', marginBottom: 8 }}>{errors.learning}</div>}
        {pendingAction === 'learning' && (
          <div style={{ marginTop: 8, padding: '8px 10px', background: '#f4433612', border: '1px solid #f4433630', borderRadius: 6, fontSize: 12 }}>
            <div style={{ marginBottom: 8, color: 'var(--red)' }}>Clear all {learningCount} learned mappings?</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-danger" style={{ fontSize: 11, padding: '5px 12px' }}
                onClick={() => { setLearningLayer({}); setPendingAction(null); }}>Yes, clear</button>
              <button className="btn btn-ghost" style={{ fontSize: 11, padding: '5px 12px' }}
                onClick={() => setPendingAction(null)}>Cancel</button>
            </div>
          </div>
        )}
      </div>

      {/* Section 3b: Match Corrections */}
      <div className="card">
        <div className="card-label">Match Corrections</div>
        <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 8 }}>
          <span style={{ color: 'var(--green)', fontWeight: 600 }}>{correctionsCount}</span> correction{correctionsCount !== 1 ? 's' : ''}
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
        {errors.corrections && <div style={{ fontSize: 11, color: 'var(--red)', marginBottom: 8 }}>{errors.corrections}</div>}
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

      {/* Section 3c: Supplier Data */}
      <div className="card">
        <div className="card-label">Supplier Data</div>
        <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 8 }}>
          <span style={{ color: 'var(--green)', fontWeight: 600 }}>{(supplierRecencyOrder || []).length}</span> known supplier{(supplierRecencyOrder || []).length !== 1 ? 's' : ''}
        </div>
        <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={handleExportSuppliers}>
          <Icon name="download" size={14} /> Export Suppliers JSON
        </button>
      </div>

      {/* Section 4: Danger Zone */}
      <div className="card">
        <div className="card-label">Danger Zone</div>
        <button className="btn btn-danger" style={{ fontSize: 12 }}
          onClick={() => setPendingAction(pendingAction === 'history' ? null : 'history')}>
          Clear All History
        </button>
        {pendingAction === 'history' && (
          <div style={{ marginTop: 8, padding: '8px 10px', background: '#f4433612', border: '1px solid #f4433630', borderRadius: 6, fontSize: 12 }}>
            <div style={{ marginBottom: 8, color: 'var(--red)' }}>Delete all delivery history permanently?</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-danger" style={{ fontSize: 11, padding: '5px 12px' }}
                onClick={() => { clearHistory(); setPendingAction(null); }}>Yes, clear all</button>
              <button className="btn btn-ghost" style={{ fontSize: 11, padding: '5px 12px' }}
                onClick={() => setPendingAction(null)}>Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
