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
  await ls.set('active-delivery', delivery);
}, 250);

export const useStore = create((set, get) => ({
  // ── Persisted state ──────────────────────────────────────────────
  apiKey: '',
  supplierMappings: [],     // [{ supplier, code, description, price, department? }]
  posItems: [],             // FILE-STOCK-4 items: [{ code, description, department, price, supplierCode, barcode }]
  departments: [],          // [{ id, name }]
  learningLayer: {},        // { normalizedInvoiceName: posCode }
  activeDelivery: null,     // { step, supplier, date, items:[], notes } | null
  history: [],              // capped at 100

  // ── Session state ────────────────────────────────────────────────
  setupComplete: false,
  page: 'delivery',         // 'delivery' | 'history' | 'settings'
  processStep: 'idle',      // 'idle'|'extracting'|'matching'|'done'|'error'
  viewingHistoryId: null,
  storageError: null,

  // ── Simple setter ────────────────────────────────────────────────
  set,

  // ── Storage error ────────────────────────────────────────────────
  clearStorageError() { set({ storageError: null }); },

  // ── API Key ──────────────────────────────────────────────────────
  async saveApiKey(key) {
    await ls.set('api-key', key);
    set({ apiKey: key });
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
  async addLearning(normalizedName, posCode) {
    const ll = { ...get().learningLayer, [normalizedName]: posCode };
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

// ── initStore: load all persisted data before React renders ──────────
export async function initStore() {
  const [
    apiKey,
    supplierMappings,
    posItems,
    departments,
    learningLayer,
    activeDelivery,
    history,
    setupComplete,
  ] = await Promise.all([
    ls.get('api-key'),
    ls.get('supplier-mappings'),
    ls.get('pos-items'),
    ls.get('departments'),
    ls.get('learning-layer'),
    ls.get('active-delivery'),
    ls.get('history'),
    ls.get('setup-complete'),
  ]);

  useStore.setState({
    apiKey: apiKey || '',
    supplierMappings: supplierMappings || [],
    posItems: posItems || [],
    departments: departments || [],
    learningLayer: learningLayer || {},
    activeDelivery: activeDelivery || null,
    history: history || [],
    setupComplete: setupComplete === true,
  });
}
