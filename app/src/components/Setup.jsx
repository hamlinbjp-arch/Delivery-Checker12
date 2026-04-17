import { useState, useRef } from 'react';
import Icon from '../lib/icons';
import { useStore } from '../state/store';
import { parseStockCodes } from '../lib/stockParser';

export default function Setup() {
  const { locationName, saveLocationName, savePosItems } = useStore();
  const [step, setStep] = useState(locationName ? 2 : 1);
  const [locationVal, setLocationVal] = useState(locationName || '');
  const [processing, setProcessing] = useState(false);
  const [progressMsg, setProgressMsg] = useState('');
  const [error, setError] = useState('');
  const stockRef = useRef();

  const handleSaveLocation = async () => {
    const name = locationVal.trim();
    if (!name) return;
    await saveLocationName(name);
    setStep(2);
  };

  const handleStockFile = async (file) => {
    setError('');
    setProcessing(true);
    setProgressMsg('Loading...');
    try {
      const text = await file.text();
      setProgressMsg('Parsing...');
      const items = parseStockCodes(text);
      if (items.length === 0) throw new Error('No items found. Check the file is a valid Stockcodes.txt export.');
      await savePosItems(items);
      setProgressMsg(`✓ ${items.length} stock items loaded`);
      // App re-renders automatically once posItems.length > 0
    } catch (err) {
      setError(err.message);
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="setup">
      <div className="setup-icon"><Icon name="check" size={28} /></div>
      <h1 style={{ fontFamily: 'var(--font-mono)', fontSize: 24, fontWeight: 800, letterSpacing: 2, color: 'var(--green)' }}>DELIVERYCHECK</h1>
      <p style={{ color: 'var(--text3)', margin: '8px 0 32px', textAlign: 'center' }}>Stock delivery reconciliation</p>

      {/* Step indicators */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        {[1, 2].map(n => (
          <div key={n} style={{
            width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 12, fontWeight: 700,
            background: step >= n ? 'var(--green)' : 'var(--bg3)',
            color: step >= n ? '#fff' : 'var(--text3)',
          }}>{n}</div>
        ))}
      </div>

      <div style={{ width: '100%', maxWidth: 400 }}>
        {/* Step 1: Location name */}
        {step === 1 && (
          <>
            <label style={{ fontSize: 13, color: 'var(--text2)', display: 'block', marginBottom: 6 }}>Step 1: Store / Location Name</label>
            <p style={{ fontSize: 12, color: 'var(--text3)', margin: '0 0 12px' }}>
              Enter your store name. This appears on exports and reports.
            </p>
            <input className="input" placeholder="e.g. Downtown Store" value={locationVal}
              onChange={e => setLocationVal(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSaveLocation()} />
            <button className="btn btn-primary" style={{ width: '100%', marginTop: 12, padding: 14 }}
              onClick={handleSaveLocation} disabled={!locationVal.trim()}>
              Save &amp; Continue
            </button>
          </>
        )}

        {/* Step 2: Upload Stockcodes.txt */}
        {step === 2 && (
          <>
            <label style={{ fontSize: 13, color: 'var(--text2)', display: 'block', marginBottom: 6 }}>Step 2: Upload Stock List</label>
            <p style={{ fontSize: 12, color: 'var(--text3)', margin: '0 0 12px' }}>
              Upload your <strong>Stockcodes.txt</strong> file. Format: quoted CSV with supplier code, description, and price columns.
            </p>
            <input ref={stockRef} type="file" accept=".txt,.csv" style={{ display: 'none' }}
              onChange={e => { if (e.target.files[0]) handleStockFile(e.target.files[0]); e.target.value = ''; }} />
            <button className="btn btn-primary" style={{ width: '100%', padding: 14 }} disabled={processing}
              onClick={() => stockRef.current?.click()}>
              {processing
                ? <><span className="spinner">⟳</span> {progressMsg}</>
                : <><Icon name="upload" size={18} /> Upload Stockcodes.txt</>}
            </button>
            {error && <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 8 }}>{error}</div>}
            {progressMsg && !processing && !error && (
              <div style={{ fontSize: 12, color: 'var(--green)', marginTop: 8 }}>{progressMsg}</div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
