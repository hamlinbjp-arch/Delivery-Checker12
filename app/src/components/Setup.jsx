import { useState, useRef } from 'react';
import Icon from '../lib/icons';
import { useStore } from '../state/store';
import { parseSupplierMappingsPDF } from '../lib/pdfParser';
import { parsePOSStock } from '../lib/posParser';
import { store as ls } from '../lib/storage';

export default function Setup() {
  const { apiKey, saveApiKey, saveSupplierMappings, savePosItems, set } = useStore();
  const [step, setStep] = useState(1);
  const [keyVal, setKeyVal] = useState(apiKey);
  const [processing, setProcessing] = useState(false);
  const [progressMsg, setProgressMsg] = useState('');
  const [error, setError] = useState('');
  const mappingsRef = useRef();
  const stockRef = useRef();

  const handleSaveKey = async () => {
    if (!keyVal.trim()) return;
    await saveApiKey(keyVal.trim());
    setStep(2);
  };

  const handleMappingsPDF = async (file) => {
    setError(''); setProcessing(true); setProgressMsg('Loading PDF...');
    try {
      const { items } = await parseSupplierMappingsPDF(file, msg => setProgressMsg(msg));
      await saveSupplierMappings(items);
      setProgressMsg(`✓ ${items.length} supplier mappings loaded`);
      setTimeout(() => setStep(3), 800);
    } catch (err) {
      setError(err.message);
    } finally {
      setProcessing(false);
    }
  };

  const handleStockFile = async (file) => {
    setError(''); setProcessing(true); setProgressMsg('Loading...');
    try {
      const text = await file.text();
      const { items } = await parsePOSStock(text, pct => setProgressMsg(`Parsing... ${pct}%`));
      await savePosItems(items);
      setProgressMsg(`✓ ${items.length} stock items loaded`);
      setTimeout(() => completeSetup(), 800);
    } catch (err) {
      setError(err.message);
    } finally {
      setProcessing(false);
    }
  };

  const completeSetup = async () => {
    await ls.set('setup-complete', true);
    set({ setupComplete: true });
  };

  return (
    <div className="setup">
      <div className="setup-icon"><Icon name="check" size={28} /></div>
      <h1 style={{ fontFamily: 'var(--font-mono)', fontSize: 24, fontWeight: 800, letterSpacing: 2, color: 'var(--green)' }}>DELIVERYCHECK</h1>
      <p style={{ color: 'var(--text3)', margin: '8px 0 32px', textAlign: 'center' }}>Stock delivery reconciliation powered by AI</p>

      {/* Step indicators */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        {[1, 2, 3].map(n => (
          <div key={n} style={{
            width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 12, fontWeight: 700,
            background: step >= n ? 'var(--green)' : 'var(--bg3)',
            color: step >= n ? '#fff' : 'var(--text3)',
          }}>{n}</div>
        ))}
      </div>

      <div style={{ width: '100%', maxWidth: 400 }}>
        {/* Step 1: API Key */}
        {step === 1 && (
          <>
            <label style={{ fontSize: 13, color: 'var(--text2)', display: 'block', marginBottom: 6 }}>Step 1: Anthropic API Key</label>
            <input type="password" className="input" placeholder="sk-ant-..." value={keyVal} onChange={e => setKeyVal(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSaveKey()} />
            <button className="btn btn-primary" style={{ width: '100%', marginTop: 12, padding: 14 }}
              onClick={handleSaveKey} disabled={!keyVal.trim()}>
              Save &amp; Continue
            </button>
          </>
        )}

        {/* Step 2: Supplier Mappings PDF */}
        {step === 2 && (
          <>
            <label style={{ fontSize: 13, color: 'var(--text2)', display: 'block', marginBottom: 6 }}>Step 2: Supplier Mappings PDF</label>
            <p style={{ fontSize: 12, color: 'var(--text3)', margin: '0 0 12px' }}>
              Export from Idealpos: Supplier Mappings report as PDF. Maps supplier codes to stock codes.
            </p>
            <input ref={mappingsRef} type="file" accept=".pdf" style={{ display: 'none' }}
              onChange={e => { if (e.target.files[0]) handleMappingsPDF(e.target.files[0]); e.target.value = ''; }} />
            <button className="btn btn-primary" style={{ width: '100%', padding: 14 }} disabled={processing}
              onClick={() => mappingsRef.current?.click()}>
              {processing ? <><span className="spinner">⟳</span> {progressMsg}</> : <><Icon name="upload" size={18} /> Upload Mappings PDF</>}
            </button>
            {error && <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 8 }}>{error}</div>}
            <button className="btn" style={{ width: '100%', marginTop: 10, padding: 12, background: 'none', border: '1px solid var(--border)', color: 'var(--text3)', fontSize: 13 }}
              onClick={() => { setError(''); setStep(3); }}>
              Skip for now
            </button>
          </>
        )}

        {/* Step 3: POS Stock File */}
        {step === 3 && (
          <>
            <label style={{ fontSize: 13, color: 'var(--text2)', display: 'block', marginBottom: 6 }}>Step 3: POS Stock File</label>
            <p style={{ fontSize: 12, color: 'var(--text3)', margin: '0 0 12px' }}>
              Export from Idealpos: FILE-STOCK-4 tab-delimited text file. Used to look up stock codes and prices.
            </p>
            <input ref={stockRef} type="file" accept=".txt,.csv,.tsv" style={{ display: 'none' }}
              onChange={e => { if (e.target.files[0]) handleStockFile(e.target.files[0]); e.target.value = ''; }} />
            <button className="btn btn-primary" style={{ width: '100%', padding: 14 }} disabled={processing}
              onClick={() => stockRef.current?.click()}>
              {processing ? <><span className="spinner">⟳</span> {progressMsg}</> : <><Icon name="upload" size={18} /> Upload Stock File</>}
            </button>
            {error && <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 8 }}>{error}</div>}
            <button className="btn" style={{ width: '100%', marginTop: 10, padding: 12, background: 'none', border: '1px solid var(--border)', color: 'var(--text3)', fontSize: 13 }}
              onClick={() => completeSetup()}>
              Skip for now
            </button>
          </>
        )}
      </div>
    </div>
  );
}
