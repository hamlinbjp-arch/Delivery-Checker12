import { useRef, useState } from 'react';
import Icon from '../lib/icons';
import { searchPosItems } from '../lib/matcher';
import { callClaude } from '../lib/claude';
import { resizeImage } from '../lib/imageUtils';

// Props:
//   currentItem   – the delivery item being identified
//   apiKey        – Anthropic API key
//   onMatch(posCode, posDescription) – called when user confirms a match
//   onNone()      – called when user marks as "set aside"
//   onClose()     – called to dismiss without action
export default function AIPhotoIdentifier({ currentItem, apiKey, onMatch, onNone, onClose }) {
  const fileRef = useRef();
  const camRef = useRef();
  const [analyzing, setAnalyzing] = useState(false);
  const [suggestion, setSuggestion] = useState(null);
  const [posResults, setPosResults] = useState([]);
  const [error, setError] = useState('');

  const analyze = async (file) => {
    setError(''); setAnalyzing(true); setSuggestion(null); setPosResults([]);
    try {
      const b64 = await resizeImage(file);
      const content = [
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64 } },
        { type: 'text', text: `This is a photo of a delivery item. The invoice name is: "${currentItem?.invoiceName || 'unknown'}".
Identify the product in the photo. Return ONLY a JSON object (no markdown):
{"productName":"exact product name visible on packaging or label","confidence":0-100}` },
      ];
      const data = await callClaude(apiKey, [{ role: 'user', content }],
        'You are a product identification assistant. Identify products from photos accurately.');
      const text = data.content.map(c => c.text || '').join('');
      const stripped = text.replace(/```[a-z]*\n?/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(stripped);
      setSuggestion(parsed);

      // Search posItems from store at call time
      const { posItems } = (await import('../state/store')).useStore.getState();
      const matches = searchPosItems(parsed.productName, posItems || []);
      setPosResults(matches);
    } catch (err) {
      setError(err.message);
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 200, display: 'flex', flexDirection: 'column', padding: 20, overflowY: 'auto' }}>
      <div style={{ background: 'var(--bg2)', borderRadius: 12, padding: 20, maxWidth: 480, width: '100%', margin: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>📷 AI Photo Identify</h3>
          <button className="btn btn-ghost" style={{ padding: 4 }} onClick={onClose}><Icon name="x" size={18} /></button>
        </div>

        <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 12 }}>
          Item: <strong>{currentItem?.invoiceName}</strong>
        </div>

        <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }}
          onChange={e => { if (e.target.files[0]) analyze(e.target.files[0]); e.target.value = ''; }} />
        <input ref={camRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
          onChange={e => { if (e.target.files[0]) analyze(e.target.files[0]); e.target.value = ''; }} />

        {!analyzing && !suggestion && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => camRef.current?.click()}>
              <Icon name="camera" size={16} /> Take Photo
            </button>
            <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => fileRef.current?.click()}>
              <Icon name="upload" size={16} /> Choose Photo
            </button>
          </div>
        )}

        {analyzing && (
          <div style={{ textAlign: 'center', padding: 20, color: 'var(--text2)', fontSize: 13 }}>
            <span className="spinner">⟳</span> Analyzing photo...
          </div>
        )}

        {error && <div style={{ fontSize: 12, color: 'var(--red)', marginTop: 8 }}>{error}</div>}

        {suggestion && (
          <>
            <div style={{ marginBottom: 12, padding: '8px 10px', background: 'var(--bg3)', borderRadius: 6, fontSize: 12 }}>
              AI identified: <strong>{suggestion.productName}</strong>
              <span style={{ color: 'var(--text3)', marginLeft: 6 }}>({suggestion.confidence}% confident)</span>
            </div>
            {posResults.length > 0 ? (
              <>
                <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 6 }}>Select POS match:</div>
                {posResults.slice(0, 5).map(r => (
                  <button key={r.code} className="btn btn-ghost"
                    style={{ display: 'block', width: '100%', textAlign: 'left', fontSize: 12, padding: '8px 10px', marginBottom: 4 }}
                    onClick={() => onMatch(r.code, r.description)}>
                    <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text3)', marginRight: 6 }}>{r.code}</span>
                    {r.description}
                    {r.price != null && r.price > 0 && <span style={{ color: 'var(--text3)', marginLeft: 6 }}>${r.price.toFixed(2)}</span>}
                  </button>
                ))}
              </>
            ) : (
              <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 8 }}>No POS matches found for "{suggestion.productName}"</div>
            )}
            <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
              <button className="btn btn-ghost" style={{ flex: 1, fontSize: 12 }}
                onClick={() => { setSuggestion(null); setPosResults([]); }}>Try Again</button>
              <button className="btn" style={{ flex: 1, fontSize: 12, background: 'var(--bg3)', color: 'var(--text2)' }}
                onClick={onNone}>Set Aside</button>
              <button className="btn btn-ghost" style={{ flex: 1, fontSize: 12 }} onClick={onClose}>Cancel</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
