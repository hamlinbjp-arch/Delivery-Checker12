import { useState } from 'react';
import Icon from '../lib/icons';
import { useStore } from '../state/store';
import { parsePOSPdf } from '../lib/pdfParser';
import { store as ls } from '../lib/storage';

export default function Setup() {
  const { apiKey, saveApiKey, savePosData, set } = useStore();
  const [keyVal, setKeyVal] = useState(apiKey);
  const [processing, setProcessing] = useState(false);
  const [step, setStep] = useState('');

  const handlePdf = async (file) => {
    setProcessing(true); setStep('Loading PDF...');
    try {
      const { items } = await parsePOSPdf(file, s => setStep(s));
      savePosData({ items, aliases: {}, updatedAt: new Date().toISOString() });
    } catch (err) {
      alert('Error parsing POS PDF: ' + err.message);
    } finally {
      setProcessing(false); setStep('');
    }
  };

  return (
    <div className="setup">
      <div className="setup-icon"><Icon name="check" size={28} /></div>
      <h1 style={{ fontFamily: 'var(--font-mono)', fontSize: 24, fontWeight: 800, letterSpacing: 2, color: 'var(--green)' }}>DELIVERYCHECK</h1>
      <p style={{ color: 'var(--text3)', margin: '8px 0 32px', textAlign: 'center' }}>Stock delivery reconciliation powered by AI</p>

      {!apiKey ? (
        <div style={{ width: '100%', maxWidth: 400 }}>
          <label style={{ fontSize: 13, color: 'var(--text2)', display: 'block', marginBottom: 6 }}>Step 1: Anthropic API Key</label>
          <input type="password" className="input" placeholder="sk-ant-..." value={keyVal} onChange={e => setKeyVal(e.target.value)} />
          <button className="btn btn-primary" style={{ width: '100%', marginTop: 12, padding: 14 }}
            onClick={() => { if (keyVal.trim()) saveApiKey(keyVal.trim()); }}>
            Save &amp; Continue
          </button>
        </div>
      ) : (
        <div style={{ width: '100%', maxWidth: 400 }}>
          <label style={{ fontSize: 13, color: 'var(--text2)', display: 'block', marginBottom: 6 }}>Step 2: Upload POS Stocklist PDF</label>
          <p style={{ fontSize: 12, color: 'var(--text3)', margin: '0 0 12px' }}>Exported from Idealpos. Parsed and stored for future sessions.</p>
          <input id="setup-pdf" type="file" accept=".pdf" style={{ display: 'none' }} onChange={e => { if (e.target.files[0]) handlePdf(e.target.files[0]); }} />
          <button className="btn btn-primary" style={{ width: '100%', padding: 16 }} disabled={processing}
            onClick={() => document.getElementById('setup-pdf').click()}>
            {processing ? <><span className="spinner">⟳</span> {step}</> : <><Icon name="upload" size={18} /> Upload POS PDF</>}
          </button>
          <button className="btn" style={{ width: '100%', marginTop: 12, padding: 12, background: 'none', border: '1px solid var(--border)', color: 'var(--text3)' }}
            onClick={() => { ls.set('skip-pos', true); set({ posData: { items: [], aliases: {}, updatedAt: new Date().toISOString() } }); }}>
            Skip for now
          </button>
        </div>
      )}
    </div>
  );
}
