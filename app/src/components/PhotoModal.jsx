import { useStore } from '../state/store';

export default function PhotoModal() {
  const viewingPhoto = useStore(s => s.viewingPhoto);
  const set = useStore(s => s.set);
  if (!viewingPhoto) return null;
  return (
    <div className="photo-modal" onClick={e => { if (e.target === e.currentTarget) set({ viewingPhoto: null }); }}>
      <button className="photo-modal-close" onClick={() => set({ viewingPhoto: null })}>✕</button>
      <img src={viewingPhoto} alt="Photo" />
    </div>
  );
}
