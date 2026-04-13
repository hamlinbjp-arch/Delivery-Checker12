// Parse FILE-STOCK-4 tab-delimited POS stock export from Idealpos.

export function parseCSVLine(line) {
  const fields = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if ((ch === '\t' || ch === ',') && !inQuotes) {
      fields.push(cur); cur = '';
    } else {
      cur += ch;
    }
  }
  fields.push(cur);
  return fields;
}

// Parse a FILE-STOCK-4 text export.
// onProgress(pct: 0-100) called periodically.
// Returns { items, headers }
export async function parsePOSStock(text, onProgress) {
  const lines = text.split(/\r?\n/);
  const items = [];
  let headers = null;
  let headerIndexes = {};

  const total = lines.length;
  let processed = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    processed++;

    if (!line) continue;

    const fields = parseCSVLine(line);

    // First non-empty line is the header
    if (!headers) {
      headers = fields.map(h => h.trim().toUpperCase());
      // Build index map for known columns
      for (let j = 0; j < headers.length; j++) {
        const h = headers[j];
        if (h === 'CODE' || h === 'STOCK CODE' || h === 'ITEM CODE') headerIndexes.code = j;
        else if (h === 'DESCRIPTION' || h === 'ITEM DESCRIPTION' || h === 'NAME') headerIndexes.description = j;
        else if (h === 'DEPARTMENT' || h === 'DEPT' || h === 'DEPT CODE') headerIndexes.department = j;
        else if (h === 'PRICE1' || h === 'PRICE' || h === 'SELL PRICE' || h === 'UNIT PRICE') headerIndexes.price = j;
        else if (h === 'SUPPLIERSTOCKCODE' || h === 'SUPPLIER STOCK CODE' || h === 'SUPPLIER CODE' || h === 'SUP CODE') headerIndexes.supplierCode = j;
        else if (h === 'SCANCODE' || h === 'SCAN CODE' || h === 'BARCODE' || h === 'EAN' || h === 'UPC') headerIndexes.scanCode = j;
      }
      // Fallback: use positional indexes if named not found
      if (headerIndexes.code === undefined) headerIndexes.code = 0;
      if (headerIndexes.description === undefined) headerIndexes.description = 1;
      continue;
    }

    if (fields.length < 2) continue;

    const code = (fields[headerIndexes.code] || '').trim();
    const description = (fields[headerIndexes.description] || '').trim();
    if (!code || !description) continue;

    const item = {
      code,
      description,
      department: headerIndexes.department !== undefined ? (fields[headerIndexes.department] || '').trim() : '',
      price: headerIndexes.price !== undefined ? parseFloat(fields[headerIndexes.price]) || 0 : 0,
      supplierCode: headerIndexes.supplierCode !== undefined ? (fields[headerIndexes.supplierCode] || '').trim() : '',
      scanCode: headerIndexes.scanCode !== undefined ? (fields[headerIndexes.scanCode] || '').trim() : '',
    };
    items.push(item);

    // Yield every 500 lines to avoid blocking the main thread
    if (processed % 500 === 0) {
      onProgress?.(Math.round((processed / total) * 100));
      await new Promise(r => setTimeout(r, 0));
    }
  }

  onProgress?.(100);
  return { items, headers: headers || [] };
}

// Merge incoming POS items into existing items.
// mode: 'replace' | 'add-new' | 'update'
export function mergePOSStock(existing, incoming, mode) {
  if (mode === 'replace') return incoming;

  const existingMap = new Map(existing.map(item => [item.code, item]));

  if (mode === 'add-new') {
    const newItems = incoming.filter(item => !existingMap.has(item.code));
    return [...existing, ...newItems];
  }

  if (mode === 'update') {
    for (const item of incoming) {
      existingMap.set(item.code, item);
    }
    return Array.from(existingMap.values());
  }

  return existing;
}
