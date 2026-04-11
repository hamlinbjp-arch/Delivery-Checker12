// Parse a tab-delimited departments export from Idealpos.
// Expected columns: Department ID, Department Name (or similar)
// Returns [{ id, name }]

export function parseDepartments(text) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const departments = [];
  let headers = null;
  let idIdx = 0;
  let nameIdx = 1;

  for (const line of lines) {
    const fields = line.split('\t').map(f => f.trim());
    if (!headers) {
      headers = fields.map(h => h.toUpperCase());
      for (let i = 0; i < headers.length; i++) {
        const h = headers[i];
        if (h === 'ID' || h === 'DEPARTMENT ID' || h === 'DEPT ID' || h === 'CODE') idIdx = i;
        if (h === 'NAME' || h === 'DEPARTMENT NAME' || h === 'DEPT NAME' || h === 'DESCRIPTION') nameIdx = i;
      }
      continue;
    }
    if (fields.length < 2) continue;
    const id = fields[idIdx] || '';
    const name = fields[nameIdx] || '';
    if (id && name) departments.push({ id, name });
  }

  return departments;
}
