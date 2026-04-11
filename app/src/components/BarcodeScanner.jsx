import { useEffect, useRef, useState } from 'react';
import Icon from '../lib/icons';

export default function BarcodeScanner({ onResult, onClose }) {
  const videoRef = useRef();
  const readerRef = useRef(null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('Starting camera...');

  useEffect(() => {
    let active = true;

    async function start() {
      try {
        const { BrowserMultiFormatReader } = await import('@zxing/library');
        const reader = new BrowserMultiFormatReader();
        readerRef.current = reader;

        const devices = await reader.listVideoInputDevices();
        if (!devices.length) { setError('No camera found'); return; }

        // Prefer rear camera
        const device = devices.find(d => /back|rear|environment/i.test(d.label)) || devices[devices.length - 1];

        setStatus('Scanning...');
        await reader.decodeFromVideoDevice(device.deviceId, videoRef.current, (result, err) => {
          if (!active) return;
          if (result) {
            try { navigator.vibrate(30); } catch {}
            onResult(result.getText());
          }
        });
      } catch (e) {
        if (!active) return;
        if (e.name === 'NotAllowedError') {
          setError('Camera permission denied. Please allow camera access and try again.');
        } else {
          setError('Camera error: ' + e.message);
        }
      }
    }

    start();

    return () => {
      active = false;
      readerRef.current?.reset();
    };
  }, [onResult]);

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000', zIndex: 200, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: 'rgba(0,0,0,0.7)' }}>
        <span style={{ color: '#fff', fontWeight: 700, fontSize: 16 }}>Scan Barcode</span>
        <button style={{ background: 'none', border: 'none', color: '#fff', fontSize: 24, cursor: 'pointer', padding: 4 }}
          onClick={onClose}><Icon name="x" size={22} /></button>
      </div>

      {error ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, color: '#fff', textAlign: 'center' }}>
          <div style={{ fontSize: 14, color: '#f44336', marginBottom: 16 }}>{error}</div>
          <button className="btn btn-ghost" style={{ color: '#fff', border: '1px solid rgba(255,255,255,0.3)' }} onClick={onClose}>Close</button>
        </div>
      ) : (
        <>
          <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
            <video ref={videoRef} style={{ width: '100%', height: '100%', objectFit: 'cover' }} autoPlay playsInline muted />
            {/* Targeting overlay */}
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
              <div style={{ width: 240, height: 120, border: '2px solid var(--green)', borderRadius: 8, boxShadow: '0 0 0 9999px rgba(0,0,0,0.4)' }} />
            </div>
          </div>
          <div style={{ padding: '12px 16px', background: 'rgba(0,0,0,0.7)', color: 'rgba(255,255,255,0.7)', fontSize: 13, textAlign: 'center' }}>
            {status}
          </div>
        </>
      )}
    </div>
  );
}
