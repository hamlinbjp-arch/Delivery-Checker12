import { useStore } from './state/store';
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
  const { apiKey, posData, page, deliveryStep, results, viewingHistory } = useStore();

  // Show setup if missing API key or POS data (unless explicitly skipped)
  const skipPos = localStorage.getItem('dc-skip-pos');
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
      <div style={{ padding: '0 12px 12px' }}>
        {renderPage()}
      </div>
      <Nav />
    </>
  );
}
