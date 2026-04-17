import Icon from '../lib/icons';
import { useStore, reviewCountSelector } from '../state/store';

const TABS = [
  { id: 'delivery', icon: 'truck', label: 'Delivery' },
  { id: 'history', icon: 'clock', label: 'History' },
  { id: 'settings', icon: 'settings', label: 'Settings' },
];

export default function Nav() {
  const page = useStore(s => s.page);
  const set = useStore(s => s.set);
  const hasActiveDelivery = useStore(s => s.activeDelivery !== null);
  const reviewCount = useStore(reviewCountSelector);

  return (
    <div className="nav">
      {TABS.map(t => (
        <button
          key={t.id}
          className={`nav-btn${page === t.id ? ' active' : ''}`}
          onClick={() => set({ page: t.id, viewingHistoryId: null })}
          style={{ position: 'relative' }}
        >
          {t.id === 'delivery' && hasActiveDelivery && reviewCount === 0 && (
            <span style={{ position: 'absolute', top: 6, right: '22%', width: 8, height: 8, borderRadius: '50%', background: 'var(--green)', border: '2px solid var(--bg2)' }} />
          )}
          {t.id === 'delivery' && reviewCount > 0 && (
            <span style={{ position: 'absolute', top: 4, right: '16%', background: 'var(--red)', color: '#fff', borderRadius: 10, fontSize: 10, fontWeight: 700, padding: '1px 5px', minWidth: 16, textAlign: 'center', lineHeight: 1.4 }}>
              {reviewCount}
            </span>
          )}
          <Icon name={t.icon} size={22} />
          <span style={{ fontWeight: page === t.id ? 700 : 400 }}>{t.label}</span>
        </button>
      ))}
    </div>
  );
}
