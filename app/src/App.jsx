import { useStore } from './state/store';
import { store as ls } from './lib/storage';
import Header from './components/Header';
import Nav from './components/Nav';
import Setup from './components/Setup';
import DeliveryForm from './components/DeliveryForm';
import VerifyStep from './components/VerifyStep';
import POSStep from './components/POSStep';
import History from './components/History';
import HistoryResults from './components/HistoryResults';
import Suppliers from './components/Suppliers';
import Settings from './components/Settings';

export default function App() {
  const { apiKey, posData, page, deliveryStep, results, viewingHistory, storageError, clearStorageError } = useStore();

  // Show setup if missing API key or POS data (unless explicitly skipped)
  const skipPos = ls.get('skip-pos');
  if (!apiKey || (!posData && !skipPos)) {
    return <Setup />;
  }

  const renderPage = () => {
    if (page === 'delivery') {
      if (viewingHistory) return <HistoryResults />;
      if (deliveryStep === 'verify' && results) return <VerifyStep />;
      if (deliveryStep === 'pos' && results) return <POSStep />;
      return <DeliveryForm />;
    }
    if (page === 'history') return <History />;
    if (page === 'suppliers') return <Suppliers />;
    if (page === 'settings') return <Settings />;
    return <DeliveryForm />;
  };

  return (
    <>
      <Header />
      {storageError === 'quota' && (
        <div style={{ background: '#e5a10018', border: '1px solid var(--amber)', borderRadius: 8, margin: '8px 12px 0', padding: '8px 12px', fontSize: 12, color: 'var(--amber)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Storage full — oldest history was trimmed to free space.</span>
          <button onClick={clearStorageError} style={{ background: 'none', border: 'none', color: 'var(--amber)', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: '0 2px' }}>✕</button>
        </div>
      )}
      <div style={{ padding: '0 12px 12px' }}>
        {renderPage()}
      </div>
      <Nav />
    </>
  );
}
