import Icon from '../lib/icons';
import { useStore } from '../state/store';

const TABS = [
  { id: 'delivery', icon: 'truck', label: 'Delivery' },
  { id: 'history', icon: 'clock', label: 'History' },
  { id: 'suppliers', icon: 'users', label: 'Suppliers' },
  { id: 'settings', icon: 'settings', label: 'Settings' },
];

export default function Nav() {
  const page = useStore(s => s.page);
  const set = useStore(s => s.set);
  return (
    <div className="nav">
      {TABS.map(t => (
        <button
          key={t.id}
          className={`nav-btn${page === t.id ? ' active' : ''}`}
          onClick={() => set({ page: t.id, viewingHistory: null })}
        >
          <Icon name={t.icon} size={22} />
          <span style={{ fontWeight: page === t.id ? 700 : 400 }}>{t.label}</span>
        </button>
      ))}
    </div>
  );
}
