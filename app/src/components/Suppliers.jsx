import { useState } from 'react';
import Icon from '../lib/icons';
import { useStore } from '../state/store';

export default function Suppliers() {
  const { suppliers, saveSuppliers } = useStore();
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [pendingDel, setPendingDel] = useState(null);
  const [expandedMappings, setExpandedMappings] = useState(null);

  const add = () => {
    if (!name.trim()) return;
    saveSuppliers([...suppliers, { name: name.trim(), notes: notes.trim(), mappings: {} }]);
    setName(''); setNotes('');
  };

  const deleteSupplier = (n) => {
    saveSuppliers(suppliers.filter(s => s.name !== n));
    setPendingDel(null);
  };

  const deleteMapping = (supplierName, key) => {
    const updated = suppliers.map(s => {
      if (s.name !== supplierName) return s;
      const mappings = { ...(s.mappings || {}) };
      delete mappings[key];
      return { ...s, mappings };
    });
    saveSuppliers(updated);
  };

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

      {suppliers.map(s => {
        const mappingCount = Object.keys(s.mappings || {}).length;
        const isExpanded = expandedMappings === s.name;
        return (
          <div key={s.name} className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{s.name}</div>
                {s.notes && <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>{s.notes}</div>}
                {mappingCount > 0 ? (
                  <button
                    style={{ background: 'none', border: 'none', padding: 0, fontSize: 11, color: 'var(--green)', marginTop: 6, cursor: 'pointer', textAlign: 'left' }}
                    onClick={() => setExpandedMappings(isExpanded ? null : s.name)}>
                    {isExpanded ? '▲' : '▾'} {mappingCount} learned mapping{mappingCount !== 1 ? 's' : ''}
                  </button>
                ) : (
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>No learned mappings yet</div>
                )}
              </div>
              <button className="btn" style={{ background: 'none', border: 'none', color: 'var(--text3)', padding: 4, flexShrink: 0 }}
                onClick={() => setPendingDel(pendingDel === s.name ? null : s.name)}>
                <Icon name="trash" size={16} />
              </button>
            </div>

            {isExpanded && mappingCount > 0 && (
              <div style={{ marginTop: 10, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                {Object.entries(s.mappings || {}).map(([key, posCode]) => (
                  <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', borderBottom: '1px solid #2f333622', fontSize: 12 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ color: 'var(--text2)' }}>{key}</span>
                      <span style={{ color: 'var(--text3)', margin: '0 6px' }}>→</span>
                      <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--green)', fontSize: 11 }}>{posCode}</span>
                    </div>
                    <button style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', padding: '2px 6px', fontSize: 13, flexShrink: 0 }}
                      onClick={() => deleteMapping(s.name, key)}>✕</button>
                  </div>
                ))}
              </div>
            )}

            {pendingDel === s.name && (
              <div style={{ marginTop: 8, padding: '8px 10px', background: '#f4433612', border: '1px solid #f4433630', borderRadius: 6, fontSize: 12 }}>
                <div style={{ marginBottom: 8, color: 'var(--red)' }}>Delete <b>{s.name}</b> and all its learned mappings?</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-danger" style={{ fontSize: 11, padding: '5px 12px' }}
                    onClick={() => deleteSupplier(s.name)}>Yes, delete</button>
                  <button className="btn btn-ghost" style={{ fontSize: 11, padding: '5px 12px' }}
                    onClick={() => setPendingDel(null)}>Cancel</button>
                </div>
              </div>
            )}
          </div>
        );
      })}
      {!suppliers.length && <div style={{ textAlign: 'center', padding: 32, color: 'var(--text3)' }}>No suppliers yet.</div>}
    </div>
  );
}
