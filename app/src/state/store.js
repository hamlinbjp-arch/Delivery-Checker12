import { create } from 'zustand';
import { store as ls } from '../lib/storage';

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

// Debounce helper
function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

// Debounced active-delivery persist (250ms)
const persistDelivery = debounce(async (delivery) => {
  const result = await ls.set('active-delivery', delivery);
  if (result === 'quota') {
    useStore.getState().set({ storageError: 'quota' });
  }
}, 250);

// Single source of truth for review badge count
// X = items with status 'unmatched' (no POS match) OR 'flagged' (user sent to review)
export const reviewCountSelector = (state) => {
  const items = state.activeDelivery?.items || [];
  return items.filter(i => i.status === 'unmatched' || i.status === 'flagged').length;
};

export const useStore = create((set, get) => ({
  // ── Persisted state ──────────────────────────────────────────────
  apiKey: '',
  locationName: '',
  supplierMappings: [],
  posItems: [],
  departments: [],
  learningLayer: {},
  matchCorrections: {},     // supplier-scoped learned mappings: { 'SUP|code:X' | 'SUP|name:Y': { ... } }
  activeDelivery: null,
  history: [],

  // ── Session state ────────────────────────────────────────────────
  setupComplete: false,
  page: 'delivery',
  processStep: 'idle',
  extractionError: null,
  viewingHistoryId: null,
  storageError: null,

  // Supplier recency — stored in localStorage for sync read
  supplierRecencyOrder: (() => { try { return JSON.parse(localStorage.getItem('supplier-recency-order') || '[]'); } catch { return []; } })(),
  supplierUsageCounts:  (() => { try { return JSON.parse(localStorage.getItem('supplier-usage-counts')  || '{}'); } catch { return {}; } })(),

  // ── Simple setter ────────────────────────────────────────────────
  set,

  // ── Review count (single source of truth) ────────────────────────
  getReviewCount() {
    const items = get().activeDelivery?.items || [];
    return items.filter(i => i.status === 'unmatched' || i.status === 'flagged').length;
  },

  // ── Storage error ────────────────────────────────────────────────
  clearStorageError() { set({ storageError: null }); },

  // ── API Key ──────────────────────────────────────────────────────
  async saveApiKey(key) {
    await ls.set('api-key', key);
    set({ apiKey: key });
  },

  // ── Location Name ────────────────────────────────────────────────
  async saveLocationName(name) {
    await ls.set('location-name', name);
    set({ locationName: name });
  },

  // ── Supplier Mappings ────────────────────────────────────────────
  async saveSupplierMappings(items) {
    await ls.set('supplier-mappings', items);
    set({ supplierMappings: items });
  },

  // ── POS Items ────────────────────────────────────────────────────
  async savePosItems(items) {
    await ls.set('pos-items', items);
    set({ posItems: items });
  },

  // ── Departments ──────────────────────────────────────────────────
  async saveDepartments(depts) {
    await ls.set('departments', depts);
    set({ departments: depts });
  },

  // ── Learning Layer ───────────────────────────────────────────────
  async setLearningLayer(ll) {
    await ls.set('learning-layer', ll);
    set({ learningLayer: ll });
  },
  async addLearning({ invoiceName, posCode, supplier, posDescription, confirmedAt }) {
    if (!posCode) return;
    const key = (invoiceName || '').toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!key) return;
    // Store full object so matcher and future features can use supplier/description context
    const entry = { posCode, supplier: supplier || null, posDescription: posDescription || null, confirmedAt: confirmedAt || new Date().toISOString() };
    const ll = { ...get().learningLayer, [key]: entry };
    await ls.set('learning-layer', ll);
    set({ learningLayer: ll });
  },

  // ── Active Delivery ──────────────────────────────────────────────
  async startDelivery(supplier) {
    const delivery = {
      step: 'form',
      supplier: supplier || '',
      date: new Date().toISOString(),
      items: [],
      notes: '',
    };
    await ls.set('active-delivery', delivery);
    set({ activeDelivery: delivery });
  },

  async updateDeliveryStep(step) {
    const delivery = { ...get().activeDelivery, step };
    await ls.set('active-delivery', delivery);
    set({ activeDelivery: delivery });
  },

  updateDeliveryItem(id, patch) {
    const ad = get().activeDelivery;
    if (!ad) return;
    const items = ad.items.map(it => it.id === id ? { ...it, ...patch } : it);
    const delivery = { ...ad, items };
    set({ activeDelivery: delivery });
    persistDelivery(delivery);
  },

  // Alias for backwards compat
  updateResultItem(id, patch) {
    get().updateDeliveryItem(id, patch);
  },

  async setDeliveryNotes(notes) {
    const delivery = { ...get().activeDelivery, notes };
    await ls.set('active-delivery', delivery);
    set({ activeDelivery: delivery });
  },

  async setDeliveryItems(items) {
    const delivery = { ...get().activeDelivery, items };
    await ls.set('active-delivery', delivery);
    set({ activeDelivery: delivery });
  },

  async cancelDelivery() {
    await ls.del('active-delivery');
    set({ activeDelivery: null, processStep: 'idle' });
  },

  // ── Finalize Delivery ────────────────────────────────────────────
  async finalizeDelivery() {
    const ad = get().activeDelivery;
    if (!ad) return;
    const record = {
      id: uid(),
      supplier: ad.supplier,
      date: ad.date,
      notes: ad.notes,
      items: ad.items,
      itemCount: ad.items.length,
      issueCount: ad.items.filter(i => i.status && i.status !== 'confirmed').length,
    };
    const history = [record, ...get().history].slice(0, 100);
    await ls.set('history', history);
    await ls.del('active-delivery');
    set({ history, activeDelivery: null, processStep: 'idle' });
  },

  // ── Match Corrections (supplier-scoped learned mappings) ─────────
  async addMatchCorrection({ supplier, invoiceName, invoiceCode, posCode, posDescription }) {
    if (!posCode) return;
    const norm = s => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '').trim();
    const key = invoiceCode
      ? `${norm(supplier)}|code:${norm(invoiceCode)}`
      : `${norm(supplier)}|name:${norm(invoiceName)}`;
    const corrections = { ...get().matchCorrections, [key]: { supplier, invoiceName, invoiceCode: invoiceCode || null, posCode, posDescription } };
    await ls.set('match-corrections', corrections);
    set({ matchCorrections: corrections });
  },

  // ── Dashboard item actions ────────────────────────────────────────
  markItemFlagged(id) {
    get().updateDeliveryItem(id, { status: 'flagged' });
  },

  resolveItemWithPOS(id, posItem) {
    get().updateDeliveryItem(id, {
      posCode: posItem.code,
      posDescription: posItem.description,
      posPrice: posItem.price ?? null,
      matchLevel: 2,
      matchSource: 'learned',
      matchConfidence: 99,
      status: 'confirmed',
      qtyReceived: get().activeDelivery?.items.find(i => i.id === id)?.qtyExpected ?? 1,
    });
  },

  markItemAsNewItem(id) {
    const ad = get().activeDelivery;
    if (!ad) return;
    const item = ad.items.find(i => i.id === id);
    if (!item) return;
    const newItemEntry = {
      invoiceName: item.invoiceName,
      invoiceCode: item.supplierCode || null,
      invoiceQty: item.qtyExpected,
      invoicePrice: null,
    };
    const newItems = [...(ad.newItems || []), newItemEntry];
    const items = ad.items.map(it => it.id === id ? { ...it, status: 'new-item' } : it);
    const delivery = { ...ad, items, newItems };
    set({ activeDelivery: delivery });
    persistDelivery(delivery);
  },

  addSplitToItem(id, splits) {
    const ad = get().activeDelivery;
    if (!ad) return;
    const items = ad.items.map(it => it.id === id ? { ...it, status: 'confirmed', splits } : it);
    const delivery = { ...ad, items };
    set({ activeDelivery: delivery });
    persistDelivery(delivery);
  },

  // ── Supplier Recency (localStorage) ──────────────────────────────
  updateSupplierRecency(supplierName) {
    if (!supplierName) return;
    const order = get().supplierRecencyOrder.filter(s => s !== supplierName);
    const newOrder = [supplierName, ...order];

    const counts = { ...get().supplierUsageCounts };
    counts[supplierName] = {
      lastUsed: new Date().toISOString(),
      useCount: (counts[supplierName]?.useCount || 0) + 1,
    };

    try {
      localStorage.setItem('supplier-recency-order', JSON.stringify(newOrder));
      localStorage.setItem('supplier-usage-counts', JSON.stringify(counts));
    } catch {}
    set({ supplierRecencyOrder: newOrder, supplierUsageCounts: counts });
  },

  // ── Complete Delivery (finalize + recency update) ─────────────────
  async completeDelivery() {
    const ad = get().activeDelivery;
    if (!ad) return;
    get().updateSupplierRecency(ad.supplier);
    const record = {
      id: uid(),
      supplier: ad.supplier,
      date: ad.date,
      notes: ad.notes,
      items: ad.items,
      newItems: ad.newItems || [],
      itemCount: ad.items.length,
      issueCount: ad.items.filter(i => i.status && !['confirmed', 'new-item'].includes(i.status)).length,
    };
    const history = [record, ...get().history].slice(0, 100);
    await ls.set('history', history);
    await ls.del('active-delivery');
    set({ history, activeDelivery: null, processStep: 'idle' });
  },

  // ── History ──────────────────────────────────────────────────────
  async deleteHistoryRecord(id) {
    const history = get().history.filter(h => h.id !== id);
    await ls.set('history', history);
    set({ history });
  },
  async clearHistory() {
    await ls.set('history', []);
    set({ history: [] });
  },

  // ── uid ──────────────────────────────────────────────────────────
  uid,
}));

// ── Flush pending debounced delivery save on page hide / unload ──────
if (typeof window !== 'undefined') {
  const flush = () => {
    const ad = useStore.getState().activeDelivery;
    if (ad) ls.set('active-delivery', ad);
  };
  window.addEventListener('beforeunload', flush);
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
}

// ── initStore: load all persisted data before React renders ──────────
export async function initStore() {
  const [
    apiKey, locationName, supplierMappings, posItems, departments,
    learningLayer, matchCorrections, activeDelivery, history, setupComplete,
  ] = await Promise.all([
    ls.get('api-key'),
    ls.get('location-name'),
    ls.get('supplier-mappings'),
    ls.get('pos-items'),
    ls.get('departments'),
    ls.get('learning-layer'),
    ls.get('match-corrections'),
    ls.get('active-delivery'),
    ls.get('history'),
    ls.get('setup-complete'),
  ]);

  useStore.setState({
    apiKey: apiKey || '',
    locationName: locationName || '',
    supplierMappings: supplierMappings || [],
    posItems: posItems || [],
    departments: departments || [],
    learningLayer: learningLayer || {},
    matchCorrections: matchCorrections || {},
    activeDelivery: activeDelivery || null,
    history: history || [],
    setupComplete: setupComplete === true || localStorage.getItem('setup-complete') === 'true',
  });
}
