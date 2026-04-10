import { useState } from 'react';
import Icon from '../lib/icons';
import { useStore } from '../state/store';
import { parsePOSPdf } from '../lib/pdfParser';

const fmt = d => new Date(d).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export default function Settings() {
  const { apiKey, posData, saveApiKey, savePosData, clearPosData, clearHistory } = useStore();
  const [keyVal, setKeyVal] = useState(apiKey);
  const [showKey, setShowKey] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [step, setStep] = useState('');

  const handlePdf = async (file) => {
    setProcessing(true); setStep('Loading PDF...');
    try {
      const items = await parsePOSPdf(file, s => setStep(s));
      savePosData({ items, aliases: posData?.aliases || {}, updatedAt: new Date().toISOString() });
      alert(`Loaded ${items.length} items.`);
    } catch (err) {
      alert('Error: ' + err.message);
    } finally { setProcessing(false); setStep(''); }
  };

  return (
    <div style={{ paddingTop: 16 }}>
      <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <Icon name="settings" size={20} /> Settings
      </h2>

      <div className="card">
        <div className="card-label">Anthropic API Key</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input type={showKey ? 'text' : 'password'} className="input" placeholder="sk-ant-..." value={keyVal}
            onChange={e => setKeyVal(e.target.value)} style={{ flex: 1 }} />
          <button className="btn btn-ghost" style={{ padding: 8 }} onClick={() => setShowKey(v => !v)}><Icon name="eye" size={16} /></button>
        </div>
        <button className="btn btn-primary" style={{ marginTop: 8, fontSize: 12 }} onClick={() => { saveApiKey(keyVal.trim()); alert('API key saved'); }}>
          Save Key
        </button>
      </div>

      <div className="card">
        <div className="card-label">POS Stocklist</div>
        {posData?.items?.length ? (
          <>
            <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 4 }}>
              <span style={{ color: 'var(--green)', fontWeight: 600 }}>{posData.items.length}</span> items loaded
            </div>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 10 }}>Last updated: {fmt(posData.updatedAt)}</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input id="set-pos-file" type="file" accept=".pdf" style={{ display: 'none' }} onChange={e => { if (e.target.files[0]) handlePdf(e.target.files[0]); }} />
              <button className="btn btn-primary" style={{ fontSize: 12 }} disabled={processing} onClick={() => document.getElementById('set-pos-file').click()}>
                {processing ? <><span className="spinner">⟳</span> {step}</> : 'Re-upload PDF'}
              </button>
              <button className="btn btn-danger" style={{ fontSize: 12 }} onClick={() => { if (confirm('Clear POS data?')) clearPosData(); }}>Clear</button>
            </div>
          </>
        ) : (
          <>
            <p style={{ fontSize: 12, color: 'var(--text3)', margin: '0 0 8px' }}>No POS stocklist loaded.</p>
            <input id="set-pos-file" type="file" accept=".pdf" style={{ display: 'none' }} onChange={e => { if (e.target.files[0]) handlePdf(e.target.files[0]); }} />
            <button className="btn btn-primary" style={{ fontSize: 12 }} disabled={processing} onClick={() => document.getElementById('set-pos-file').click()}>
              {processing ? <><span className="spinner">⟳</span> {step}</> : 'Upload POS PDF'}
            </button>
          </>
        )}
      </div>

      <div className="card">
        <div className="card-label">Data Management</div>
        <button className="btn btn-danger" style={{ fontSize: 12 }} onClick={() => { if (confirm('Clear ALL history?')) clearHistory(); }}>Clear All History</button>
      </div>
    </div>
  );
}
