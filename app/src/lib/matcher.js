import { fuzzyScore, normalize } from './fuzzy';

const correctionKey = (supplier, invoiceCode, invoiceName) => {
  const norm = s => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '').trim();
  return invoiceCode
    ? `${norm(supplier)}|code:${norm(invoiceCode)}`
    : `${norm(supplier)}|name:${norm(invoiceName)}`;
};

function buildPosCodeIndex(posItems) {
  const idx = new Map();
  for (const p of (posItems || [])) {
    if (p.code) idx.set(p.code.toLowerCase(), p);
  }
  return idx;
}

const EMPTY = {
  posCode: null,
  posDescription: null,
  posPrice: null,
  matchLevel: null,
  matchSource: null,
  matchConfidence: 0,
  status: 'unmatched',
};

function hit(pos, matchLevel, matchSource, matchConfidence, status) {
  return {
    posCode: pos.code,
    posDescription: pos.description,
    posPrice: pos.price ?? null,
    matchLevel,
    matchSource,
    matchConfidence,
    status,
  };
}

// Match a single invoice item against the POS catalog.
// context: { posItems, learnedMappings, matchCorrections, supplierName, _posIdx }
export function matchInvoiceItem(item, context) {
  const { posItems, learnedMappings, matchCorrections, supplierName } = context;

  if ((item.qtyExpected ?? 1) === 0) return { ...EMPTY, status: 'na' };

  const posIdx = context._posIdx || buildPosCodeIndex(posItems);

  // 1. Learned mappings by supplier code
  if (item.supplierCode && learnedMappings) {
    const posCode = learnedMappings[item.supplierCode.trim().toLowerCase()];
    if (posCode) {
      const pos = posIdx.get(posCode.toLowerCase()) || null;
      if (pos) return hit(pos, 1, 'learned', 99, 'pending');
    }
  }

  // 2. Learned mappings by normalized invoice name
  if (item.invoiceName && learnedMappings) {
    const posCode = learnedMappings[normalize(item.invoiceName)];
    if (posCode) {
      const pos = posIdx.get(posCode.toLowerCase()) || null;
      if (pos) return hit(pos, 1, 'learned', 99, 'pending');
    }
  }

  // 3. Exact supplier code match (invoice supplierCode vs Stockcodes.txt code)
  if (item.supplierCode) {
    const pos = posIdx.get(item.supplierCode.trim().toLowerCase());
    if (pos) return hit(pos, 1, 'code', 100, 'pending');
  }

  // 4. Match corrections (supplier-scoped manual overrides)
  if (matchCorrections && (item.supplierCode || item.invoiceName)) {
    const key = correctionKey(supplierName, item.supplierCode, item.invoiceName);
    const corr = matchCorrections[key];
    if (corr) {
      const pos = posIdx.get((corr.posCode || '').toLowerCase()) || null;
      if (pos) return hit(pos, 1, 'correction', 99, 'pending');
    }
  }

  // 5. Fuzzy name match: ≥85 auto-accept, 50–84 surface for review
  if (item.invoiceName && posItems?.length) {
    let best = { pos: null, score: 0 };
    for (const p of posItems) {
      const s = fuzzyScore(item.invoiceName, p.description);
      if (s > best.score) best = { pos: p, score: s };
    }
    if (best.score >= 85) return hit(best.pos, 2, 'fuzzy', best.score, 'pending');
    if (best.score >= 50) return hit(best.pos, 2, 'fuzzy', best.score, 'review');
  }

  return { ...EMPTY };
}

// Match all invoice items, building the index once for the batch.
export function matchAllItems(items, context) {
  const _posIdx = buildPosCodeIndex(context.posItems);
  const ctx = { ...context, _posIdx };
  return items.map(item => ({ ...item, ...matchInvoiceItem(item, ctx) }));
}

// Fuzzy search POS catalog by description, returns top 10 matches.
export function searchPosItems(query, posItems) {
  if (!query || !posItems?.length) return [];
  return posItems
    .map(p => ({ ...p, _score: fuzzyScore(query, p.description) }))
    .filter(p => p._score > 0)
    .sort((a, b) => b._score - a._score)
    .slice(0, 10)
    .map(({ _score, ...p }) => p);
}
