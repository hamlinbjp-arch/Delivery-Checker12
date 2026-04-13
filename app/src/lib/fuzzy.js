export function normalize(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function tokenize(s) {
  return normalize(s).split(' ').filter(Boolean);
}

export function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => { const r = new Array(n + 1); r[0] = i; return r; });
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
  return dp[m][n];
}

export function fuzzyScore(a, b) {
  const na = normalize(a), nb = normalize(b);
  if (na === nb) return 100;
  const ta = tokenize(a), tb = tokenize(b);
  if (!ta.length || !tb.length) return 0;
  let matched = 0;
  const used = new Set();
  for (const wa of ta) {
    let best = 0, bestIdx = -1;
    for (let i = 0; i < tb.length; i++) {
      if (used.has(i)) continue;
      const wb = tb[i];
      let s = 0;
      const lenDiff = Math.abs(wa.length - wb.length);
      if (wa.length > 3 && wb.length > 3 && lenDiff > Math.max(wa.length, wb.length) * 0.6) continue;
      if (wa === wb) s = 1;
      else if (wa.startsWith(wb) || wb.startsWith(wa)) s = 0.85;
      else if (wa.includes(wb) || wb.includes(wa)) s = 0.7;
      else { const d = levenshtein(wa, wb); const ml = Math.max(wa.length, wb.length); s = Math.max(0, 1 - d / ml) * 0.6; }
      if (s > best) { best = s; bestIdx = i; }
    }
    if (bestIdx >= 0 && best > 0.3) { matched += best; used.add(bestIdx); }
  }
  return Math.round(matched / Math.max(ta.length, tb.length) * 100);
}

export function findBestPOSMatch(itemName, posList, mappings = {}, aliases = {}, supplierCode = '') {
  if (!posList || !posList.length) return { code: '', name: '', confidence: 0 };
  const key = normalize(itemName);
  // 0. Exact supplier code match (case-insensitive)
  if (supplierCode) {
    const sc = supplierCode.toLowerCase().trim();
    const e = posList.find(p => p.code.toLowerCase().trim() === sc);
    if (e) return { code: e.code, name: e.description, confidence: 100, byCode: true };
  }
  // 1. Supplier-learned mappings
  const mc = mappings[key];
  if (mc) { const e = posList.find(p => p.code === mc); if (e) return { code: e.code, name: e.description, confidence: 98, learned: true }; }
  // 2. Global aliases
  const ac = aliases[key];
  if (ac) { const e = posList.find(p => p.code === ac); if (e) return { code: e.code, name: e.description, confidence: 97, aliased: true }; }
  // 3. Fuzzy + reverse alias
  const reverseAlias = {};
  for (const [label, code] of Object.entries(aliases)) {
    if (!reverseAlias[code]) reverseAlias[code] = [];
    reverseAlias[code].push(label);
  }
  let best = { code: '', name: '', confidence: 0 };
  for (const p of posList) {
    let s = fuzzyScore(itemName, p.description);
    for (const alias of (reverseAlias[p.code] || [])) { const sa = fuzzyScore(itemName, alias); if (sa > s) s = sa; }
    if (s > best.confidence) best = { code: p.code, name: p.description, confidence: s };
  }
  return best;
}
