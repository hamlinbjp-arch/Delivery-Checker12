// Parse a comma-separated departments export from Idealpos.
// Format: "ID","Name","...","..." — no header row, double-quoted fields.
// Returns [{ id, name }]

export function parseDepartments(text) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const departments = [];

  for (const line of lines) {
    const fields = line.split(',').map(f => f.trim().replace(/^"|"$/g, ''));
    const id = fields[0] || '';
    const name = fields[1] || '';
    if (!id || !/^\d+$/.test(id) || !name) {
      console.warn('departments: skipping line:', line);
      continue;
    }
    departments.push({ id, name });
  }

  return departments;
}
