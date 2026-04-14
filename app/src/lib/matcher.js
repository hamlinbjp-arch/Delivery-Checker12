import { normalize, fuzzyScore } from './fuzzy';

const stripZeros = c => (c || '').replace(/^0+/, '') || '0';

// Key for match corrections dictionary
const correctionKey = (supplier, invoiceCode, invoiceName) => {
  const norm = s => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '').trim();
  return invoiceCode
    ? `${norm(supplier)}|code:${norm(invoiceCode)}`
    : `${norm(supplier)}|name:${norm(invoiceName)}`;
};

// ── Build indexes once per match run for O(1) lookups ────────────────
// These are rebuilt each time matchAllItems is called so they always
// reflect the latest data without stale references.

function buildSupplierMappingIndex(supplierMappings) {
  // Map: normalizedSupplierCode → [{ ...mapping }]
  // Multiple mappings can share the same supplier code (different suppliers)
  const idx = new Map();
  for (const m of (supplierMappings || [])) {
    const key = stripZeros((m.supplierCode || '').toLowerCase().trim());
    if (!key || key === '0') continue;
    if (!idx.has(key)) idx.set(key, []);
    idx.get(key).push(m);
  }
  return idx;
}

function buildPosSupplierCodeIndex(posItems) {
  // Map: normalizedSupplierCode → posItem
  const idx = new Map();
  for (const p of (posItems || [])) {
    const key = stripZeros((p.supplierCode || '').toLowerCase().trim());
    if (key && key !== '0') idx.set(key, p);
  }
  return idx;
}

function buildPosCodeIndex(posItems) {
  // Map: posCode → posItem (for quick lookup after mapping match)
  const idx = new Map();
  for (const p of (posItems || [])) {
    if (p.code) idx.set(p.code, p);
  }
  return idx;
}

// ── Supplier name matching ───────────────────────────────────────────
// The supplier name on the invoice may not exactly match the name stored
// in the mappings PDF. E.g. invoice says "Wholesale Solutions Limited"
// but mappings have "WHOLESALE SOLUTIONS LTD". Use relaxed matching:
// exact, or significant-token overlap.
function supplierNameMatches(mappingSupplier, invoiceSupplier) {
  if (!invoiceSupplier) return true; // no supplier filter = accept all
  const a = (mappingSupplier || '').toLowerCase().trim();
  const b = invoiceSupplier.toLowerCase().trim();
  if (!a || !b) return true;
  if (a === b) return true;
  if (a.includes(b) || b.includes(a)) return true;
  // Token overlap: all significant tokens (len > 2) from the shorter name appear in the longer
  const ta = a.split(/\s+/).filter(t => t.length > 2);
  const tb = b.split(/\s+/).filter(t => t.length > 2);
  if (ta.length && tb.length) {
    const shorter = ta.length <= tb.length ? ta : tb;
    const longer = ta.length <= tb.length ? b : a;
    if (shorter.every(t => longer.includes(t))) return true;
  }
  return false;
}

// Match a single invoice item against the data store.
// context: { supplierMappings, posItems, learningLayer, matchCorrections, supplierName, _indexes }
// Returns the item enhanced with match fields.
export function matchInvoiceItem(item, context) {
  const { supplierMappings, posItems, learningLayer, matchCorrections, supplierName } = context;
  // Use pre-built indexes if available (from matchAllItems), otherwise build on the fly
  const smIdx = context._indexes?.smIdx || buildSupplierMappingIndex(supplierMappings);
  const posScIdx = context._indexes?.posScIdx || buildPosSupplierCodeIndex(posItems);
  const posCodeIdx = context._indexes?.posCodeIdx || buildPosCodeIndex(posItems);

  const result = {
    posCode: null,
    posDescription: null,
    posPrice: null,
    matchLevel: null,      // 1 | 2 | 3 | null
    matchSource: null,     // 'master' | 'learned' | 'fuzzy' | null
    matchConfidence: 0,
    status: 'unmatched',
  };

  // ── Level 1: supplier mappings PDF (supplier code → POS stock code) ──
  if (item.supplierCode) {
    const normInvoiceCode = stripZeros(item.supplierCode.toLowerCase().trim());
    if (normInvoiceCode && normInvoiceCode !== '0') {
      const candidates = smIdx.get(normInvoiceCode);
      if (candidates) {
        // Pick the best candidate: prefer one matching the supplier name
        const found = candidates.find(m => supplierNameMatches(m.supplier, supplierName))
          || candidates[0]; // fallback to first if no supplier match
        if (found) {
          const posItem = posCodeIdx.get(found.stockCode) || null;
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
    }
  }

  // ── Level 1b: POS SUPPLIERSTOCKCODE column (direct code match) ──
  if (item.supplierCode) {
    const normCode = stripZeros(item.supplierCode.toLowerCase().trim());
    if (normCode && normCode !== '0') {
      const found = posScIdx.get(normCode);
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

  // ── Level 2: learning layer (normalized invoice name → POS code) ──
  const normName = normalize(item.invoiceName || '');
  if (normName && learningLayer?.[normName]) {
    const entry = learningLayer[normName];
    const posCode = typeof entry === 'string' ? entry : entry.posCode;
    const posItem = posCodeIdx.get(posCode) || null;
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

  // ── Level 2.5: match corrections (supplier-scoped learned mappings) ──
  if (matchCorrections && (item.supplierCode || item.invoiceName)) {
    const key = correctionKey(supplierName, item.supplierCode, item.invoiceName);
    const correction = matchCorrections[key];
    if (correction) {
      const posItem = posCodeIdx.get(correction.posCode) || null;
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

  // ── Level 3: fuzzy match (last resort, description-based) ──
  if (item.invoiceName && posItems?.length) {
    let best = { code: '', description: '', price: null, confidence: 0 };
    for (const p of posItems) {
      const s = fuzzyScore(item.invoiceName, p.description);
      if (s > best.confidence) best = { code: p.code, description: p.description, price: p.price ?? null, confidence: s };
    }
    if (best.confidence >= 60) {
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
  // Build indexes once for the entire batch
  const _indexes = {
    smIdx: buildSupplierMappingIndex(context.supplierMappings),
    posScIdx: buildPosSupplierCodeIndex(context.posItems),
    posCodeIdx: buildPosCodeIndex(context.posItems),
  };
  const ctx = { ...context, _indexes };
  return items.map(item => ({
    ...item,
    ...matchInvoiceItem(item, ctx),
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
