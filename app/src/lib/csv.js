const esc = v => `"${String(v).replace(/"/g, '""')}"`;
const pct = v => `${Math.round(v)}%`;

export function generateCSV(items, notes, itemPhotoMap = {}) {
  const h = ['Item ID', 'Delivery Item', 'Supplier Code', 'Page Number', 'Qty Expected', 'Qty Received', 'POS Code', 'Idealpos Name', 'Match Confidence', 'Match Source', 'Photos Attached', 'Damage Flag', 'Damage Note', 'Status', 'Manual Notes', 'Delivery Notes'];
  const rows = items.map(it => {
    const photoCount = (itemPhotoMap[it.id] || []).length;
    const matchSrc = it.learned ? 'Learned' : it.aliased ? 'Alias' : 'Fuzzy';
    return [it.id, it.name, it.supplierCode || '', it.pageNumber || '', it.qtyExpected, it.qtyReceived ?? it.qtyExpected, it.posCode || '', it.posName || '', pct(it.confidence), matchSrc, photoCount, it.damaged ? 'Yes' : 'No', it.damageNote || '', it.status, it.manualNotes || '', notes || ''];
  });
  return [h.map(esc).join(','), ...rows.map(r => r.map(esc).join(','))].join('\n');
}

export function downloadCSV(items, notes, supplier, itemPhotoMap = {}) {
  const csv = generateCSV(items, notes, itemPhotoMap);
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `delivery_${supplier || 'export'}_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
