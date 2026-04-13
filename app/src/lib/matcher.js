import { normalize, fuzzyScore } from './fuzzy';

const stripZeros = c => (c || '').replace(/^0+/, '') || '0';

// Key for match corrections dictionary
const correctionKey = (supplier, invoiceCode, invoiceName) => {
  const norm = s => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '').trim();
  return invoiceCode
    ? `${norm(supplier)}|code:${norm(invoiceCode)}`
    : `${norm(supplier)}|name:${norm(invoiceName)}`;
};

// Match a single invoice item against the data store.
// context: { supplierMappings, posItems, learningLayer, matchCorrections, supplierName }
// Returns the item enhanced with match fields.
export function matchInvoiceItem(item, { supplierMappings, posItems, learningLayer, matchCorrections, supplierName }) {
  const result = {
    posCode: null,
    posDescription: null,
    posPrice: null,
    matchLevel: null,      // 1 | 2 | 3 | null
    matchSource: null,     // 'master' | 'learned' | 'fuzzy' | null
    matchConfidence: 0,
    status: 'unmatched',
  };

  // Level 1: master table — supplier code lookup in supplier mappings
  // supplierMappings is a flat array: [{ supplier, supplierCode, description, stockCode }]
  // supplierCode is the code on the supplier's invoice; stockCode is the Idealpos POS code
  if (item.supplierCode && supplierMappings?.length) {
    const normInvoiceCode = stripZeros(item.supplierCode.toLowerCase().trim());
    const normSupplierName = (supplierName || '').toLowerCase().trim();

    const found = supplierMappings.find(m => {
      const mCode = stripZeros((m.supplierCode || '').toLowerCase().trim());
      if (mCode !== normInvoiceCode) return false;
      // If supplier name provided, also filter by matching supplier
      if (normSupplierName) {
        const mName = (m.supplier || '').toLowerCase().trim();
        return mName === normSupplierName;  // exact match only — substring matches are not auto-accepted
      }
      return true;
    });

    if (found) {
      const posItem = posItems?.find(p => p.code === found.stockCode) || null;
      return {
        ...result,
        posCode: found.stockCode,
        posDescription: posItem?.description || found.description || '',
        posPrice: posItem?.price ?? null,
        matchLevel: 1,
        matchSource: 'master',
        matchConfidence: 100,
        status: 'pending',
      };
    }
  }

  // Level 1b: direct POS supplier code lookup
  // Matches item.supplierCode against posItems[].supplierCode (SUPPLIERSTOCKCODE column
  // from FILE-STOCK-4 export). No separate PDF required — works as long as the POS stock
  // file has been uploaded with the SUPPLIERSTOCKCODE column populated.
  if (item.supplierCode && posItems?.length) {
    const normCode = stripZeros(item.supplierCode.toLowerCase().trim());
    if (normCode && normCode !== '0') {
      const found = posItems.find(p => {
        const pCode = stripZeros((p.supplierCode || '').toLowerCase().trim());
        return pCode && pCode !== '0' && pCode === normCode;
      });
      if (found) {
        return {
          ...result,
          posCode: found.code,
          posDescription: found.description,
          posPrice: found.price ?? null,
          matchLevel: 1,
          matchSource: 'master',
          matchConfidence: 100,
          status: 'pending',
        };
      }
    }
  }

  // Level 2: learning layer — normalized invoice name → pos code (or entry object)
  const normName = normalize(item.invoiceName || '');
  if (normName && learningLayer?.[normName]) {
    const entry = learningLayer[normName];
    // Support both legacy string format and new object format { posCode, supplier, ... }
    const posCode = typeof entry === 'string' ? entry : entry.posCode;
    const posItem = posItems?.find(p => p.code === posCode) || null;
    if (posItem) {
      return {
        ...result,
        posCode,
        posDescription: posItem.description,
        posPrice: posItem.price ?? null,
        matchLevel: 2,
        matchSource: 'learned',
        matchConfidence: 99,
        status: 'pending',
      };
    }
  }

  // Level 2.5: match corrections — supplier-scoped explicit mappings from Review screen
  // Checked before fuzzy; treated as high confidence (green)
  if (matchCorrections && (item.supplierCode || item.invoiceName)) {
    const key = correctionKey(supplierName, item.supplierCode, item.invoiceName);
    const correction = matchCorrections[key];
    if (correction) {
      const posItem = posItems?.find(p => p.code === correction.posCode) || null;
      return {
        ...result,
        posCode: correction.posCode,
        posDescription: posItem?.description || correction.posDescription,
        posPrice: posItem?.price ?? null,
        matchLevel: 2,
        matchSource: 'learned',
        matchConfidence: 99,
        status: 'pending',
      };
    }
  }

  // Level 3: fuzzy match against posItems descriptions (threshold ≥ 70)
  if (item.invoiceName && posItems?.length) {
    let best = { code: '', description: '', price: null, confidence: 0 };
    for (const p of posItems) {
      const s = fuzzyScore(item.invoiceName, p.description);
      if (s > best.confidence) best = { code: p.code, description: p.description, price: p.price ?? null, confidence: s };
    }
    if (best.confidence >= 70) {
      return {
        ...result,
        posCode: best.code,
        posDescription: best.description,
        posPrice: best.price,
        matchLevel: 3,
        matchSource: 'fuzzy',
        matchConfidence: best.confidence,
        status: 'pending',
      };
    }
  }

  return result;
}

// Match all invoice items. Returns array with match fields added.
// context: { supplierMappings, posItems, learningLayer, matchCorrections, supplierName }
export function matchAllItems(items, context) {
  return items.map(item => ({
    ...item,
    ...matchInvoiceItem(item, context),
  }));
}

// Find a POS item by barcode/scanCode.
export function findByBarcode(barcode, posItems) {
  if (!barcode || !posItems?.length) return null;
  const norm = barcode.replace(/\s/g, '');
  return posItems.find(p => p.scanCode && p.scanCode.replace(/\s/g, '') === norm) || null;
}

// Search POS items by query, return top 10 fuzzy matches.
export function searchPosItems(query, posItems) {
  if (!query || !posItems?.length) return [];
  const scored = posItems
    .map(p => ({ ...p, _score: fuzzyScore(query, p.description) }))
    .filter(p => p._score > 0)
    .sort((a, b) => b._score - a._score)
    .slice(0, 10);
  return scored.map(({ _score, ...p }) => p);
}
