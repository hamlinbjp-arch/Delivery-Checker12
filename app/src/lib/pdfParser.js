import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

let pdfjsLib = null;

async function getPdfJs() {
  if (pdfjsLib) return pdfjsLib;
  try {
    const lib = await import('pdfjs-dist');
    lib.GlobalWorkerOptions.workerSrc = workerSrc;
    pdfjsLib = lib;
    return pdfjsLib;
  } catch (e) {
    pdfjsLib = null;
    throw new Error('PDF engine failed to load: ' + e.message);
  }
}

// Scan the first 2 pages of a delivery PDF and return the best-matching supplier name,
// or null if none found. supplierNames: string[] of known names to match against.
export async function detectSupplierFromPDF(file, supplierNames) {
  if (!supplierNames?.length) return null;
  try {
    const lib = await getPdfJs();
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await lib.getDocument({ data: arrayBuffer }).promise;
    let fullText = '';
    const pages = Math.min(pdf.numPages, 2);
    for (let i = 1; i <= pages; i++) {
      const page = await pdf.getPage(i);
      const tc = await page.getTextContent();
      fullText += tc.items.map(item => item.str).join(' ') + '\n';
    }
    const normText = fullText.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ');
    // 1. Direct substring match (fastest)
    for (const s of supplierNames) {
      const norm = s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
      if (norm && normText.includes(norm)) return s;
    }
    // 2. All significant tokens of the supplier name appear in the text
    for (const s of supplierNames) {
      const tokens = s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(t => t.length > 2);
      if (tokens.length > 0 && tokens.every(t => normText.includes(t))) return s;
    }
    return null;
  } catch {
    return null;
  }
}

export async function parsePOSPdf(file, onProgress) {
  const lib = await getPdfJs();
  let arrayBuffer;
  try { arrayBuffer = await file.arrayBuffer(); } catch (e) { throw new Error('Reading file failed: ' + e.message); }
  let pdf;
  try { pdf = await lib.getDocument({ data: arrayBuffer }).promise; } catch (e) { throw new Error('PDF load failed: ' + e.message); }

  const totalPages = pdf.numPages;
  const allItems = [];
  const seen = new Set();

  const itemRow = /^\s*(\d{3,7})\s{1,6}([A-Za-z][^\t\n]{2,80}?)(?:\s{2,}|\t|$)/;
  const supplierHeader = /^([A-Z][A-Za-z0-9\s&'.,/()-]{2,50})$/;
  let currentSupplier = '';

  onProgress?.('Loading PDF...');
  await new Promise(r => setTimeout(r, 0));

  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i % 10 === 0) {
      onProgress?.(`Parsing page ${i}/${totalPages}...`);
      await new Promise(r => setTimeout(r, 0));
    }
    const page = await pdf.getPage(i);
    const tc = await page.getTextContent();

    const rows = {};
    for (const item of tc.items) {
      if (!item.str.trim()) continue;
      const y = Math.round(item.transform[5]);
      const x = Math.round(item.transform[4]);
      if (!rows[y]) rows[y] = { startX: x, parts: [] };
      rows[y].parts.push({ x, text: item.str });
    }

    for (const y of Object.keys(rows).map(Number).sort((a, b) => b - a)) {
      const { startX, parts } = rows[y];
      parts.sort((a, b) => a.x - b.x);
      const fullLine = parts.map(p => p.text).join(' ').trim();
      const nameOnly = parts.filter(p => p.x < startX + 500 * 0.55).map(p => p.text).join(' ').trim();
      const m = nameOnly.match(itemRow) || fullLine.match(itemRow);
      if (m) {
        const code = m[1];
        const desc = m[2].trim().replace(/\s+\d+\.\d{2}.*$/, '').replace(/\s{2,}.*$/, '').trim();
        if (!seen.has(code) && desc.length > 1) {
          seen.add(code);
          allItems.push({ code, description: desc, supplier: currentSupplier });
        }
      } else {
        const sh = fullLine.match(supplierHeader);
        if (sh && !fullLine.match(/^\d/) && fullLine.length >= 4 && fullLine.length <= 52) {
          const words = fullLine.trim().split(/\s+/);
          if (words.length >= 2 || (words.length === 1 && fullLine.length > 7)) {
            currentSupplier = fullLine.trim();
          }
        }
      }
    }
  }

  if (allItems.length === 0) throw new Error('No items found — PDF may be scanned/image-based. Try a text-based export from Idealpos.');
  const supplierCount = new Set(allItems.map(i => i.supplier).filter(Boolean)).size;
  return { items: allItems, supplierCount, pageCount: totalPages };
}

// Parse a Supplier Mappings PDF (Idealpos supplier-code-to-stock-code report).
// Returns { items: [{ supplier, supplierCode, description, stockCode }], supplierCount, pageCount }
export async function parseSupplierMappingsPDF(file, onProgress) {
  const lib = await getPdfJs();
  let arrayBuffer;
  try { arrayBuffer = await file.arrayBuffer(); } catch (e) { throw new Error('Reading file failed: ' + e.message); }
  let pdf;
  try { pdf = await lib.getDocument({ data: arrayBuffer }).promise; } catch (e) { throw new Error('PDF load failed: ' + e.message); }

  const totalPages = pdf.numPages;
  const allItems = [];
  let currentSupplier = '';

  // Supplier header: all-caps line, length 3–60
  const supplierHeader = /^[A-Z][A-Z0-9\s&'.,/()-]{2,58}$/;

  onProgress?.('Loading PDF...');
  await new Promise(r => setTimeout(r, 0));

  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i % 10 === 0) {
      onProgress?.(`Parsing page ${i}/${totalPages}...`);
      await new Promise(r => setTimeout(r, 0));
    }
    const page = await pdf.getPage(i);
    const tc = await page.getTextContent();

    // Group text items by y-coordinate (±2px tolerance)
    const bands = {};
    for (const item of tc.items) {
      if (!item.str.trim()) continue;
      const y = Math.round(item.transform[5] / 2) * 2; // round to nearest 2px
      const x = Math.round(item.transform[4]);
      if (!bands[y]) bands[y] = [];
      bands[y].push({ x, text: item.str });
    }

    for (const y of Object.keys(bands).map(Number).sort((a, b) => b - a)) {
      const parts = bands[y].sort((a, b) => a.x - b.x);

      // Reconstruct line; insert 3 spaces where x-gap between items exceeds ~20px
      // so that split(/\s{2,}/) reliably separates columns even if pdf.js joins
      // adjacent text runs without whitespace padding.
      let line = parts[0].text;
      for (let j = 1; j < parts.length; j++) {
        const estimatedPrevEnd = parts[j - 1].x + parts[j - 1].text.trimEnd().length * 7;
        const gap = parts[j].x - estimatedPrevEnd;
        line += (gap > 20 ? '   ' : ' ') + parts[j].text;
      }
      line = line.trim();

      // Split on 2+ spaces to get columns:
      // [0] supplierCode  [1] description  [n-3] stockCode  [n-2] "1"  [n-1] "Units"
      const cols = line.split(/\s{2,}/);
      if (cols.length >= 3 && /^\d{1,7}$/.test(cols[cols.length - 3])) {
        const supplierCode = cols[0].trim();
        const stockCode = cols[cols.length - 3];
        const description = cols.slice(1, cols.length - 3).join(' ').trim();
        if (supplierCode && description && stockCode) {
          allItems.push({ supplier: currentSupplier, supplierCode, description, stockCode });
          continue;
        }
      }

      // Not an item row — check for supplier header (all-caps, no item structure)
      if (supplierHeader.test(line) && line === line.toUpperCase() && line.length >= 3) {
        const words = line.trim().split(/\s+/);
        if (words.length >= 2 || (words.length === 1 && line.length > 7)) {
          currentSupplier = line.trim();
        }
      }
    }
  }

  if (allItems.length === 0) throw new Error('No items found in supplier mappings PDF.');
  const supplierCount = new Set(allItems.map(i => i.supplier).filter(Boolean)).size;
  return { items: allItems, supplierCount, pageCount: totalPages };
}
