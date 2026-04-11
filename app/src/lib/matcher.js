import { normalize, fuzzyScore } from './fuzzy';

const stripZeros = c => (c || '').replace(/^0+/, '') || '0';

// Match a single invoice item against the data store.
// context: { supplierMappings, posItems, learningLayer, supplierName }
// Returns the item enhanced with match fields.
export function matchInvoiceItem(item, { supplierMappings, posItems, learningLayer, supplierName }) {
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
  // supplierMappings is a flat array: [{ supplier, code, description, price }]
  // where code is the supplier's item code (appears on their invoices)
  if (item.supplierCode && supplierMappings?.length) {
    const normInvoiceCode = stripZeros(item.supplierCode.trim());
    const normSupplierName = (supplierName || '').toLowerCase().trim();

    const found = supplierMappings.find(m => {
      const mCode = stripZeros((m.code || '').trim());
      if (mCode !== normInvoiceCode) return false;
      // If supplier name provided, also filter by matching supplier
      if (normSupplierName) {
        const mName = (m.supplier || '').toLowerCase().trim();
        return mName === normSupplierName
          || mName.includes(normSupplierName)
          || normSupplierName.includes(mName);
      }
      return true;
    });

    if (found) {
      const posItem = posItems?.find(p => p.code === found.code) || null;
      return {
        ...result,
        posCode: found.code,
        posDescription: posItem?.description || found.description || '',
        posPrice: posItem?.price ?? found.price ?? null,
        matchLevel: 1,
        matchSource: 'master',
        matchConfidence: 100,
        status: 'pending',
      };
    }
  }

  // Level 2: learning layer — normalized invoice name → pos code
  const normName = normalize(item.invoiceName || '');
  if (normName && learningLayer?.[normName]) {
    const posCode = learningLayer[normName];
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
// context: { supplierMappings, posItems, learningLayer, supplierName }
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
