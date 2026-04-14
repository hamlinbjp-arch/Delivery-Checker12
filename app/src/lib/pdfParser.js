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

// ── Generic column-detecting invoice line item extractor ─────────────
// Works with any tabular PDF invoice by:
// 1. Extracting positioned text spans from pdfjs
// 2. Grouping spans into rows (by y-coordinate)
// 3. Detecting column structure from header row and numeric clustering
// 4. Classifying columns (code, description, qty, price, total)
// 5. Parsing each data row using detected columns
// Returns [{ supplierCode, invoiceName, qtyExpected, unitPrice, lineTotal, pageNumber }] or null

// Words that indicate a row is a header, not data
const HEADER_WORDS = new Set([
  'description', 'item', 'product', 'qty', 'quantity', 'price', 'unit',
  'amount', 'total', 'code', 'discount', 'disc', 'options', 'uom',
]);

// Words that indicate we've hit the footer / summary area — stop parsing
const FOOTER_WORDS = new Set([
  'subtotal', 'sub-total', 'gst', 'vat', 'tax', 'total', 'shipping',
  'freight', 'payment', 'balance', 'due', 'amount due', 'includes',
  'bank', 'account', 'credit', 'paid', 'store credit',
]);

// "CODE - Description" splitter
function splitCodeDash(text) {
  // Match: 3-8 digit code, then dash, then description (can start with digit or letter)
  const m = text.match(/^(\d{3,8})\s*[-–—]\s*(.{2,})$/);
  if (m) {
    const desc = m[2].trim();
    // Avoid matching if the "description" is just more numbers (e.g. price fragment)
    if (!/^\d+\.?\d*$/.test(desc)) return { code: m[1], desc };
  }
  // Match: alphanumeric code (with optional dashes), then dash, then description
  const m2 = text.match(/^([A-Z0-9][A-Z0-9-]{1,20})\s*[-–—]\s*([A-Za-z].+)$/);
  if (m2) return { code: m2[1], desc: m2[2].trim() };
  return null;
}

// Detect if a string looks like a supplier/item code (not a description word)
function looksLikeCode(s) {
  const t = s.trim();
  if (!t || t.length > 25) return false;
  // Pure digits 3-8 long
  if (/^\d{3,8}$/.test(t)) return true;
  // Alphanumeric with dashes, like SOLO-PKIT-M2810 or SP476
  if (/^[A-Z0-9][A-Z0-9._-]{1,24}$/.test(t) && /\d/.test(t)) return true;
  // Short all-caps alpha with numbers
  if (/^[A-Z]{1,4}\d{2,6}[A-Z]?$/.test(t)) return true;
  return false;
}

// Detect if a string is a numeric value (price, qty, total)
function isNumeric(s) {
  const t = s.trim().replace(/^\$/, '').replace(/,/g, '');
  return /^\d+\.?\d*$/.test(t);
}

// Parse a numeric string to a number
function parseNum(s) {
  if (s == null) return null;
  const t = s.trim().replace(/^\$/, '').replace(/,/g, '');
  const n = parseFloat(t);
  return isNaN(n) ? null : n;
}

// Split CamelCase: "BootyCleanser" → "Booty Cleanser"
function splitCamelCase(s) {
  if (!s) return s;
  return s
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/(\d)([A-Z][a-z])/g, '$1 $2')
    .replace(/([a-zA-Z])(\d)/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function extractInvoiceItemsLocally(file) {
  if (!file || (!file.type.includes('pdf') && !file.name.toLowerCase().endsWith('.pdf'))) {
    return null;
  }
  try {
    const lib = await getPdfJs();
    const ab = await file.arrayBuffer();
    const pdf = await lib.getDocument({ data: ab }).promise;
    const allItems = [];

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const tc = await page.getTextContent();
      await new Promise(r => setTimeout(r, 0));

      // ── Step 1: Extract all text spans with positions ──
      const spans = [];
      for (const span of tc.items) {
        const text = span.str.trim();
        if (!text) continue;
        const x = Math.round(span.transform[4]);
        const y = Math.round(span.transform[5]);
        const w = span.width || text.length * 6;
        spans.push({ x, y, w, text });
      }
      if (spans.length < 4) continue;

      // ── Step 2: Group into rows (y-coordinate ±3px) ──
      const rowMap = {};
      for (const s of spans) {
        const ry = Math.round(s.y / 3) * 3;
        if (!rowMap[ry]) rowMap[ry] = [];
        rowMap[ry].push(s);
      }
      // Sort rows top-to-bottom (higher y = higher on page in PDF coords, so descending)
      const rowKeys = Object.keys(rowMap).map(Number).sort((a, b) => b - a);

      // ── Step 3: Build each row as sorted spans + reconstructed text ──
      const rows = rowKeys.map(ry => {
        const parts = rowMap[ry].sort((a, b) => a.x - b.x);
        // Reconstruct text with gap-aware spacing
        let text = parts[0].text;
        for (let i = 1; i < parts.length; i++) {
          const prevEnd = parts[i - 1].x + parts[i - 1].w;
          const gap = parts[i].x - prevEnd;
          text += (gap > 12 ? '   ' : ' ') + parts[i].text;
        }
        return { ry, parts, text: text.trim() };
      });

      // ── Step 4: Find header row and detect column structure ──
      let headerIdx = -1;
      for (let i = 0; i < rows.length; i++) {
        const lower = rows[i].text.toLowerCase();
        const words = lower.split(/\s+/);
        const headerHits = words.filter(w => HEADER_WORDS.has(w)).length;
        if (headerHits >= 2) {
          headerIdx = i;
          break;
        }
      }

      // ── Step 5: Detect numeric column boundary via largest x-gap ──
      // Numeric supplier codes (e.g. "225127") are on the LEFT side of the page,
      // while qty/price/total columns are on the RIGHT side. There's always a
      // large x-gap between the description area and the numeric data columns.
      // We find this gap to correctly classify spans.
      const startIdx = headerIdx >= 0 ? headerIdx + 1 : 0;
      const allNumericXs = []; // all x-positions of numeric spans in data rows

      for (let i = startIdx; i < Math.min(rows.length, startIdx + 20); i++) {
        const lower = rows[i].text.toLowerCase();
        if (FOOTER_WORDS.has(lower.split(/\s+/)[0]) || /^(sub\s*total|total\s*(gst|nzd|aud))/i.test(lower)) break;
        for (const span of rows[i].parts) {
          if (isNumeric(span.text)) allNumericXs.push(span.x);
        }
      }

      if (allNumericXs.length < 3) continue;

      // Find the largest gap between consecutive numeric x-positions.
      // This gap separates "numbers in the text area" (codes, sizes like "6 Pack")
      // from "actual data columns" (qty, price, total).
      const uniqueXs = [...new Set(allNumericXs)].sort((a, b) => a - b);
      let maxGap = 0, gapBoundary = 0;
      for (let i = 1; i < uniqueXs.length; i++) {
        const gap = uniqueXs[i] - uniqueXs[i - 1];
        if (gap > maxGap) {
          maxGap = gap;
          gapBoundary = (uniqueXs[i - 1] + uniqueXs[i]) / 2;
        }
      }
      // If no clear gap found (all numbers close together), use header position
      // or fall back to rightmost 40% of page width
      if (maxGap < 40) {
        if (headerIdx >= 0) {
          // Use the x-position of the first numeric-looking header word
          const hParts = rows[headerIdx].parts;
          const qtyHeader = hParts.find(p => /^(qty|quantity|qté)$/i.test(p.text));
          if (qtyHeader) gapBoundary = qtyHeader.x - 10;
          else gapBoundary = Math.max(...uniqueXs) * 0.6;
        } else {
          gapBoundary = Math.max(...uniqueXs) * 0.6;
        }
      }

      const numericMinX = gapBoundary;

      // ── Step 6: Parse data rows ──
      for (let i = startIdx; i < rows.length; i++) {
        const row = rows[i];
        const lower = row.text.toLowerCase();

        // Stop at footer
        const firstWord = lower.split(/\s{2,}/)[0].trim();
        if (FOOTER_WORDS.has(firstWord.split(/\s+/)[0])) break;
        if (/^(sub\s*total|total\s*(gst|nzd|aud)|n\/a|store\s*credit|shipping)/i.test(firstWord)) break;

        // Split spans into text-side and numeric-side
        const textSpans = [];
        const numSpans = [];
        for (const span of row.parts) {
          if (span.x >= numericMinX - 15 && isNumeric(span.text)) {
            numSpans.push(span);
          } else {
            textSpans.push(span);
          }
        }

        // Need at least 1 text span and 1 numeric span
        if (textSpans.length === 0 || numSpans.length === 0) continue;

        // Reconstruct the text portion (code + description)
        let textPart = textSpans[0].text;
        for (let j = 1; j < textSpans.length; j++) {
          const prevEnd = textSpans[j - 1].x + textSpans[j - 1].w;
          const gap = textSpans[j].x - prevEnd;
          textPart += (gap > 12 ? '   ' : ' ') + textSpans[j].text;
        }
        textPart = textPart.trim();

        // Try to separate supplier code from description
        let supplierCode = '';
        let description = textPart;

        // Pattern 1: "CODE - Description" (Wholesale Solutions, NZ Craft Brewing)
        const codeDash = splitCodeDash(textPart);
        if (codeDash) {
          supplierCode = codeDash.code;
          description = codeDash.desc;
        }
        // Pattern 2: first span looks like a code, rest is description
        else if (textSpans.length >= 2) {
          const firstText = textSpans[0].text.trim();
          const gapAfterFirst = textSpans[1].x - (textSpans[0].x + textSpans[0].w);
          if (looksLikeCode(firstText) && gapAfterFirst > 8) {
            supplierCode = firstText;
            description = textSpans.slice(1).map(s => s.text).join(' ').trim();
            // Remove leading dash if present
            description = description.replace(/^[-–—]\s*/, '');
          }
        }

        // Clean description: apply CamelCase splitting, remove trailing prices
        description = splitCamelCase(description);
        description = description.replace(/\s+[\$£]?[\d.,]+\s*$/, '').trim();

        if (description.length < 2) continue;

        // Assign numeric values to columns based on x-position
        // Sort numerics left to right
        numSpans.sort((a, b) => a.x - b.x);
        const numValues = numSpans.map(s => parseNum(s.text));

        // The first numeric is usually quantity (smallest value, integer-ish)
        // Heuristic: qty is the leftmost numeric that looks like a count (≤ 999, often integer)
        let qty = 1;
        let unitPrice = null;
        let lineTotal = null;

        if (numValues.length >= 1) {
          const q = numValues[0];
          if (q != null && q > 0 && q <= 9999) {
            qty = q % 1 === 0 ? q : Math.round(q); // 2.00 → 2
          }
        }
        if (numValues.length >= 2) {
          unitPrice = numValues[1];
        }
        if (numValues.length >= 3) {
          lineTotal = numValues[numValues.length - 1]; // last numeric = total
          if (numValues.length >= 3 && numValues.length <= 4) {
            unitPrice = numValues[1]; // second = unit price
          }
        }

        // Skip rows where qty is 0 (often N/A or credit lines)
        if (qty <= 0) continue;

        allItems.push({
          supplierCode,
          invoiceName: description,
          qtyExpected: qty,
          unitPrice,
          lineTotal,
          pageNumber: pageNum,
        });
      }
    }

    // Require at least 2 items for the format to be considered valid
    return allItems.length >= 2 ? allItems : null;
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
