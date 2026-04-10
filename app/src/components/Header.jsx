import Icon from '../lib/icons';
import { useStore } from '../state/store';

export default function Header() {
  const posData = useStore(s => s.posData);
  const posCount = posData?.items?.length ?? 0;
  return (
    <div className="header">
      <div className="header-logo">
        <div className="header-icon"><Icon name="check" size={18} /></div>
        <span className="header-title">DELIVERYCHECK</span>
      </div>
      {posCount ? <div className="header-meta">{posCount} POS items</div> : null}
    </div>
  );
}
