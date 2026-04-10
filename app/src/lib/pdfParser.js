// Disable PDF.js worker — needed for hosted PWA to avoid cross-origin worker issues
// when loading from non-HTTPS or GitHub Pages sub-paths
let pdfjsLib = null;

async function getPdfJs() {
  if (pdfjsLib) return pdfjsLib;
  pdfjsLib = await import('pdfjs-dist');
  pdfjsLib.GlobalWorkerOptions.workerSrc = '';
  return pdfjsLib;
}

export async function parsePOSPdf(file, onProgress) {
  const lib = await getPdfJs();
  let arrayBuffer;
  try { arrayBuffer = await file.arrayBuffer(); } catch (e) { throw new Error('Reading file failed: ' + e.message); }
  let pdf;
  try { pdf = await lib.getDocument({ data: arrayBuffer, disableWorker: true }).promise; } catch (e) { throw new Error('PDF load failed: ' + e.message); }

  const totalPages = pdf.numPages;
  const allItems = [];
  const seen = new Set();

  const itemRow = /^\s*(\d{3,7})\s{1,6}([A-Za-z][^\t\n]{2,80}?)(?:\s{2,}|\t|$)/;
  const supplierHeader = /^([A-Z][A-Za-z0-9\s&'.,/()-]{2,50})$/;
  let currentSupplier = '';

  for (let i = 1; i <= totalPages; i++) {
    if (i % 20 === 0) onProgress?.(`Parsing page ${i}/${totalPages}...`);
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
  return allItems;
}
