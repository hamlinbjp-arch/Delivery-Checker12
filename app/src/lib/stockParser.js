// Parse Stockcodes.txt: quoted CSV, no header row.
// Format: "SUPPLIER_CODE","DESCRIPTION","PRICE"
// Codes are the supplier stock codes saved in Idealpos.
// Some codes have leading/trailing whitespace inside the quotes — always trim.
// Rows with empty codes are category headers — skip them.

function parseCSVLine(line) {
  const fields = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      fields.push(cur); cur = '';
    } else {
      cur += ch;
    }
  }
  fields.push(cur);
  return fields;
}

export function parseStockCodes(text) {
  const lines = text.split(/\r?\n/);
  const items = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    const fields = parseCSVLine(line);
    if (fields.length < 2) continue;
    const code = (fields[0] || '').trim();
    const description = (fields[1] || '').trim();
    const price = fields.length >= 3 ? (parseFloat(fields[2]) || 0) : 0;
    if (!code || !description) continue;
    items.push({ code, description, price });
  }
  return items;
}
