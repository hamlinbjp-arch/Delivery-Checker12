import Icon from '../lib/icons';
import { useStore } from '../state/store';

const TABS = [
  { id: 'delivery', icon: 'truck', label: 'Delivery' },
  { id: 'history', icon: 'clock', label: 'History' },
  { id: 'settings', icon: 'settings', label: 'Settings' },
];

export default function Nav() {
  const page = useStore(s => s.page);
  const set = useStore(s => s.set);
  const hasActiveDelivery = useStore(s => s.activeDelivery !== null);

  return (
    <div className="nav">
      {TABS.map(t => (
        <button
          key={t.id}
          className={`nav-btn${page === t.id ? ' active' : ''}`}
          onClick={() => set({ page: t.id, viewingHistoryId: null })}
        >
          {t.id === 'delivery' && hasActiveDelivery && (
            <span style={{ position: 'absolute', top: 6, right: '22%', width: 8, height: 8, borderRadius: '50%', background: 'var(--green)', border: '2px solid var(--bg2)' }} />
          )}
          <Icon name={t.icon} size={22} />
          <span style={{ fontWeight: page === t.id ? 700 : 400 }}>{t.label}</span>
        </button>
      ))}
    </div>
  );
}
