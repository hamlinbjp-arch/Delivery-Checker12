import { useState } from 'react';
import Icon from '../lib/icons';
import { useStore } from '../state/store';

export default function Suppliers() {
  const { suppliers, saveSuppliers } = useStore();
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');

  const add = () => {
    if (!name.trim()) return;
    saveSuppliers([...suppliers, { name: name.trim(), notes: notes.trim(), mappings: {} }]);
    setName(''); setNotes('');
  };
  const del = (n) => { if (confirm(`Delete ${n}?`)) saveSuppliers(suppliers.filter(s => s.name !== n)); };

  return (
    <div style={{ paddingTop: 16 }}>
      <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <Icon name="users" size={20} /> Supplier Profiles
      </h2>
      <p style={{ fontSize: 12, color: 'var(--text3)', margin: '0 0 16px' }}>Confirmed matches are learned automatically to improve future matching.</p>

      <div className="card">
        <div className="card-label">Add Supplier</div>
        <input className="input" placeholder="Supplier name" style={{ marginBottom: 8 }} value={name} onChange={e => setName(e.target.value)} />
        <textarea className="input" rows={2} placeholder="Naming conventions, notes..." style={{ marginBottom: 8, resize: 'vertical' }} value={notes} onChange={e => setNotes(e.target.value)} />
        <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={add}>Add Supplier</button>
      </div>

      {suppliers.map(s => (
        <div key={s.name} className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{s.name}</div>
              {s.notes && <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>{s.notes}</div>}
              <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 4 }}>{Object.keys(s.mappings || {}).length} learned mappings</div>
            </div>
            <button className="btn" style={{ background: 'none', border: 'none', color: 'var(--text3)', padding: 4 }} onClick={() => del(s.name)}>
              <Icon name="trash" size={16} />
            </button>
          </div>
        </div>
      ))}
      {!suppliers.length && <div style={{ textAlign: 'center', padding: 32, color: 'var(--text3)' }}>No suppliers yet.</div>}
    </div>
  );
}
