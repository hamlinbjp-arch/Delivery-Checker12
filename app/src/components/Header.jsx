import Icon from '../lib/icons';
import { useStore } from '../state/store';

export default function Header() {
  const activeDelivery = useStore(s => s.activeDelivery);
  const supplier = activeDelivery?.supplier;
  return (
    <div className="header">
      <div className="header-logo">
        <div className="header-icon"><Icon name="check" size={18} /></div>
        <span className="header-title">DELIVERYCHECK</span>
      </div>
      {supplier && <div className="header-meta">{supplier}</div>}
    </div>
  );
}
