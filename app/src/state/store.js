import { create } from 'zustand';
import { store as ls } from '../lib/storage';
import { normalize } from '../lib/fuzzy';

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

const persistDelivery = debounce(async (delivery) => {
  const result = await ls.set('active-delivery', delivery);
  if (result === 'quota') useStore.getState().set({ storageError: 'quota' });
}, 250);

// Nav badge count: items needing user attention
export const reviewCountSelector = (state) => {
  const items = state.activeDelivery?.items || [];
  return items.filter(i => i.status === 'review' || i.status === 'unmatched').length;
};

export const useStore = create((set, get) => ({
  // ── Persisted state ──────────────────────────────────────────────
  locationName: '',
  posItems: [],
  learnedMappings: {},    // { supplierCode | normName: posCode }
  matchCorrections: {},   // { 'SUP|code:X' | 'SUP|name:Y': { posCode, posDescription } }
  activeDelivery: null,
  history: [],

  // ── Session state ────────────────────────────────────────────────
  page: 'delivery',
  processStep: 'idle',
  viewingHistoryId: null,
  storageError: null,

  supplierRecencyOrder: (() => { try { return JSON.parse(localStorage.getItem('supplier-recency-order') || '[]'); } catch { return []; } })(),
  supplierUsageCounts:  (() => { try { return JSON.parse(localStorage.getItem('supplier-usage-counts')  || '{}'); } catch { return {}; } })(),

  set,

  clearStorageError() { set({ storageError: null }); },

  // ── Location Name ────────────────────────────────────────────────
  async saveLocationName(name) {
    await ls.set('location-name', name);
    set({ locationName: name });
  },

  // ── POS Items (from Stockcodes.txt) ──────────────────────────────
  async savePosItems(items) {
    const result = await ls.set('pos-items', items);
    if (result === 'quota') { set({ storageError: 'quota' }); return; }
    set({ posItems: items });
  },

  // ── Learned Mappings ─────────────────────────────────────────────
  async setLearnedMappings(lm) {
    await ls.set('learned-mappings', lm);
    set({ learnedMappings: lm });
  },
  async addLearnedMapping({ supplierCode, invoiceName, posCode }) {
    if (!posCode) return;
    const lm = { ...get().learnedMappings };
    if (supplierCode) lm[supplierCode.trim().toLowerCase()] = posCode;
    else if (invoiceName) lm[normalize(invoiceName)] = posCode;
    await ls.set('learned-mappings', lm);
    set({ learnedMappings: lm });
  },

  // ── Match Corrections (supplier-scoped manual overrides) ─────────
  async setMatchCorrections(corrections) {
    await ls.set('match-corrections', corrections);
    set({ matchCorrections: corrections });
  },
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

  // ── Active Delivery ──────────────────────────────────────────────
  async startDelivery(supplier) {
    const delivery = { step: 'form', supplier: supplier || '', date: new Date().toISOString(), items: [], notes: '' };
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

  // ── Resolve unmatched item with manual POS selection ─────────────
  async resolveItemWithPOS(id, posItem) {
    const ad = get().activeDelivery;
    if (!ad) return;
    const item = ad.items.find(i => i.id === id);
    if (!item) return;
    get().updateDeliveryItem(id, {
      posCode: posItem.code,
      posDescription: posItem.description,
      posPrice: posItem.price ?? null,
      matchLevel: 1,
      matchSource: 'manual',
      matchConfidence: 100,
      status: 'pending',
    });
    await get().addLearnedMapping({ supplierCode: item.supplierCode, invoiceName: item.invoiceName, posCode: posItem.code });
  },

  markItemAsNewItem(id) {
    const ad = get().activeDelivery;
    if (!ad) return;
    const item = ad.items.find(i => i.id === id);
    if (!item) return;
    const newItems = [...(ad.newItems || []), {
      invoiceName: item.invoiceName,
      invoiceCode: item.supplierCode || null,
      invoiceQty: item.qtyExpected,
    }];
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

  // ── Complete Delivery ────────────────────────────────────────────
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
      issueCount: ad.items.filter(i => i.status && !['confirmed', 'new-item', 'na'].includes(i.status)).length,
    };
    const history = [record, ...get().history].slice(0, 100);
    await ls.set('history', history);
    await ls.del('active-delivery');
    set({ history, activeDelivery: null, processStep: 'idle' });
  },

  async finalizeDelivery() {
    return get().completeDelivery();
  },

  // ── Supplier Recency (localStorage) ──────────────────────────────
  updateSupplierRecency(supplierName) {
    if (!supplierName) return;
    const order = get().supplierRecencyOrder.filter(s => s !== supplierName);
    const newOrder = [supplierName, ...order];
    const counts = { ...get().supplierUsageCounts };
    counts[supplierName] = { lastUsed: new Date().toISOString(), useCount: (counts[supplierName]?.useCount || 0) + 1 };
    try {
      localStorage.setItem('supplier-recency-order', JSON.stringify(newOrder));
      localStorage.setItem('supplier-usage-counts', JSON.stringify(counts));
    } catch {}
    set({ supplierRecencyOrder: newOrder, supplierUsageCounts: counts });
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

  uid,
}));

if (typeof window !== 'undefined') {
  const flush = () => {
    const ad = useStore.getState().activeDelivery;
    if (ad) ls.set('active-delivery', ad);
  };
  window.addEventListener('beforeunload', flush);
  window.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
}

export async function initStore() {
  const [locationName, posItems, learnedMappings, matchCorrections, activeDelivery, history] = await Promise.all([
    ls.get('location-name'),
    ls.get('pos-items'),
    ls.get('learned-mappings'),
    ls.get('match-corrections'),
    ls.get('active-delivery'),
    ls.get('history'),
  ]);

  useStore.setState({
    locationName: locationName || '',
    posItems: posItems || [],
    learnedMappings: learnedMappings || {},
    matchCorrections: matchCorrections || {},
    activeDelivery: activeDelivery || null,
    history: history || [],
  });
}
