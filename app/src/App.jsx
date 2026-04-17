import { useStore } from './state/store';
import Header from './components/Header';
import Nav from './components/Nav';
import Setup from './components/Setup';
import DeliveryForm from './components/DeliveryForm';
import ReviewStep from './components/ReviewStep';
import Checklist from './components/Checklist';
import SummaryStep from './components/SummaryStep';
import History from './components/History';
import HistoryDetail from './components/HistoryDetail';
import Settings from './components/Settings';

export default function App() {
  const { posItems, page, activeDelivery, viewingHistoryId, storageError, clearStorageError } = useStore();

  // First-run setup: show until a stock list is loaded
  if (!posItems || posItems.length === 0) {
    return <Setup />;
  }

  const renderPage = () => {
    if (viewingHistoryId) return <HistoryDetail />;
    if (page === 'history') return <History />;
    if (page === 'settings') return <Settings />;

    // Delivery page — route by active delivery step
    const step = activeDelivery?.step;
    if (step === 'review') return <ReviewStep />;
    if (step === 'checklist') return <Checklist />;
    if (step === 'summary') return <SummaryStep />;
    return <DeliveryForm />;
  };

  return (
    <>
      <Header />
      {storageError === 'quota' && (
        <div style={{ background: '#e5a10018', border: '1px solid var(--amber)', borderRadius: 8, margin: '8px 12px 0', padding: '8px 12px', fontSize: 12, color: 'var(--amber)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Storage full — export your history and clear old deliveries.</span>
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
