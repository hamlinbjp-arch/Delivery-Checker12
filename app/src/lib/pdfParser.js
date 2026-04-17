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

// Words that indicate a row is a header, not data
const HEADER_WORDS = new Set([
  'description', 'item', 'product', 'qty', 'quantity', 'price', 'unit',
  'amount', 'total', 'code', 'discount', 'disc', 'options', 'uom',
]);

// Words that indicate the footer / summary area — stop parsing
const FOOTER_WORDS = new Set([
  'subtotal', 'sub-total', 'gst', 'vat', 'tax', 'total', 'shipping',
  'freight', 'payment', 'balance', 'due', 'amount due', 'includes',
  'bank', 'account', 'credit', 'paid', 'store credit',
]);

// "CODE - Description" splitter
function splitCodeDash(text) {
  const m = text.match(/^(\d{3,8})\s*[-–—]\s*(.{2,})$/);
  if (m) {
    const desc = m[2].trim();
    if (!/^\d+\.?\d*$/.test(desc)) return { code: m[1], desc };
  }
  const m2 = text.match(/^([A-Z0-9][A-Z0-9-]{1,20})\s*[-–—]\s*([A-Za-z].+)$/);
  if (m2) return { code: m2[1], desc: m2[2].trim() };
  return null;
}

function looksLikeCode(s) {
  const t = s.trim();
  if (!t || t.length > 25) return false;
  if (/^\d{3,8}$/.test(t)) return true;
  if (/^[A-Z0-9][A-Z0-9._-]{1,24}$/.test(t) && /\d/.test(t)) return true;
  if (/^[A-Z]{1,4}\d{2,6}[A-Z]?$/.test(t)) return true;
  return false;
}

function isNumeric(s) {
  const t = s.trim().replace(/^\$/, '').replace(/,/g, '');
  return /^\d+\.?\d*$/.test(t);
}

function parseNum(s) {
  if (s == null) return null;
  const t = s.trim().replace(/^\$/, '').replace(/,/g, '');
  const n = parseFloat(t);
  return isNaN(n) ? null : n;
}

function splitCamelCase(s) {
  if (!s) return s;
  return s
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/(\d)([A-Z][a-z])/g, '$1 $2')
    .replace(/([a-zA-Z])(\d)/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim();
}

// Generic column-detecting invoice line item extractor.
// Uses pdfjs-dist to extract positioned text, detects column structure,
// and returns [{ supplierCode, invoiceName, qtyExpected, unitPrice, lineTotal, pageNumber }]
// Returns null if extraction fails or finds < 2 items.
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

      // Step 1: Extract all text spans with positions
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

      // Step 2: Group into rows (y-coordinate ±3px)
      const rowMap = {};
      for (const s of spans) {
        const ry = Math.round(s.y / 3) * 3;
        if (!rowMap[ry]) rowMap[ry] = [];
        rowMap[ry].push(s);
      }
      const rowKeys = Object.keys(rowMap).map(Number).sort((a, b) => b - a);

      // Step 3: Build each row as sorted spans + reconstructed text
      const rows = rowKeys.map(ry => {
        const parts = rowMap[ry].sort((a, b) => a.x - b.x);
        let text = parts[0].text;
        for (let i = 1; i < parts.length; i++) {
          const prevEnd = parts[i - 1].x + parts[i - 1].w;
          const gap = parts[i].x - prevEnd;
          text += (gap > 12 ? '   ' : ' ') + parts[i].text;
        }
        return { ry, parts, text: text.trim() };
      });

      // Step 4: Find header row
      let headerIdx = -1;
      for (let i = 0; i < rows.length; i++) {
        const lower = rows[i].text.toLowerCase();
        const words = lower.split(/\s+/);
        const headerHits = words.filter(w => HEADER_WORDS.has(w)).length;
        if (headerHits >= 2) { headerIdx = i; break; }
      }

      // Step 5: Detect numeric column boundary via largest x-gap
      const startIdx = headerIdx >= 0 ? headerIdx + 1 : 0;
      const allNumericXs = [];

      for (let i = startIdx; i < Math.min(rows.length, startIdx + 20); i++) {
        const lower = rows[i].text.toLowerCase();
        if (FOOTER_WORDS.has(lower.split(/\s+/)[0]) || /^(sub\s*total|total\s*(gst|nzd|aud))/i.test(lower)) break;
        for (const span of rows[i].parts) {
          if (isNumeric(span.text)) allNumericXs.push(span.x);
        }
      }

      if (allNumericXs.length < 3) continue;

      const uniqueXs = [...new Set(allNumericXs)].sort((a, b) => a - b);
      let maxGap = 0, gapBoundary = 0;
      for (let i = 1; i < uniqueXs.length; i++) {
        const gap = uniqueXs[i] - uniqueXs[i - 1];
        if (gap > maxGap) { maxGap = gap; gapBoundary = (uniqueXs[i - 1] + uniqueXs[i]) / 2; }
      }
      if (maxGap < 40) {
        if (headerIdx >= 0) {
          const hParts = rows[headerIdx].parts;
          const qtyHeader = hParts.find(p => /^(qty|quantity|qté)$/i.test(p.text));
          gapBoundary = qtyHeader ? qtyHeader.x - 10 : Math.max(...uniqueXs) * 0.6;
        } else {
          gapBoundary = Math.max(...uniqueXs) * 0.6;
        }
      }

      const numericMinX = gapBoundary;

      // Step 5b: Find qty column x-position from header
      let qtyHeaderX = null;
      if (headerIdx >= 0) {
        const hParts = rows[headerIdx].parts;
        const qtyHeader = hParts.find(p => /^(qty|quantity|qté|units?|ordered|no\.?)$/i.test(p.text));
        if (qtyHeader) qtyHeaderX = qtyHeader.x;
      }

      // Step 6: Parse data rows
      for (let i = startIdx; i < rows.length; i++) {
        const row = rows[i];
        const lower = row.text.toLowerCase();

        const firstWord = lower.split(/\s{2,}/)[0].trim();
        if (FOOTER_WORDS.has(firstWord.split(/\s+/)[0])) break;
        if (/^(sub\s*total|total\s*(gst|nzd|aud)|n\/a|store\s*credit|shipping)/i.test(firstWord)) break;

        const textSpans = [];
        const numSpans = [];
        for (const span of row.parts) {
          if (span.x >= numericMinX - 15 && isNumeric(span.text)) numSpans.push(span);
          else textSpans.push(span);
        }

        if (textSpans.length === 0 || numSpans.length === 0) continue;

        let textPart = textSpans[0].text;
        for (let j = 1; j < textSpans.length; j++) {
          const prevEnd = textSpans[j - 1].x + textSpans[j - 1].w;
          const gap = textSpans[j].x - prevEnd;
          textPart += (gap > 12 ? '   ' : ' ') + textSpans[j].text;
        }
        textPart = textPart.trim();

        let supplierCode = '';
        let description = textPart;

        const codeDash = splitCodeDash(textPart);
        if (codeDash) {
          supplierCode = codeDash.code;
          description = codeDash.desc;
        } else if (textSpans.length >= 2) {
          const firstText = textSpans[0].text.trim();
          const gapAfterFirst = textSpans[1].x - (textSpans[0].x + textSpans[0].w);
          if (looksLikeCode(firstText) && gapAfterFirst > 8) {
            supplierCode = firstText;
            description = textSpans.slice(1).map(s => s.text).join(' ').trim();
            description = description.replace(/^[-–—]\s*/, '');
          }
        }

        description = splitCamelCase(description);
        description = description.replace(/\s+[\$£]?[\d.,]+\s*$/, '').trim();

        if (description.length < 2) continue;

        numSpans.sort((a, b) => a.x - b.x);
        const numValues = numSpans.map(s => parseNum(s.text));
        let qty = 1, unitPrice = null, lineTotal = null;

        if (qtyHeaderX !== null && numSpans.length > 0) {
          const qtySpan = numSpans.reduce((best, s) =>
            Math.abs(s.x - qtyHeaderX) < Math.abs(best.x - qtyHeaderX) ? s : best
          );
          const qv = parseNum(qtySpan.text);
          qty = (qv != null && qv > 0) ? Math.round(qv) : 1;
          const others = numSpans.filter(s => s !== qtySpan).sort((a, b) => a.x - b.x);
          if (others.length >= 1) unitPrice = parseNum(others[0].text);
          if (others.length >= 2) lineTotal = parseNum(others[others.length - 1].text);
        } else {
          const qtyIdx = numValues.findIndex(v => v != null && v > 0 && v <= 9999 && Math.abs(v - Math.round(v)) < 0.05);
          const usedIdx = qtyIdx >= 0 ? qtyIdx : 0;
          if (numValues[usedIdx] != null) qty = Math.max(1, Math.round(numValues[usedIdx]));
          const others = numValues.filter((_, i) => i !== usedIdx);
          if (others.length >= 1) unitPrice = others[0];
          if (others.length >= 2) lineTotal = others[others.length - 1];
        }

        if (qty <= 0) continue;

        allItems.push({ supplierCode, invoiceName: description, qtyExpected: qty, unitPrice, lineTotal, pageNumber: pageNum });
      }
    }

    return allItems.length >= 2 ? allItems : null;
  } catch {
    return null;
  }
}
