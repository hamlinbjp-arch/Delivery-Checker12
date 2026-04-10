import { create } from 'zustand';
import { store as ls } from '../lib/storage';

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

export const useStore = create((set, get) => ({
  // ── Persisted ──────────────────────────────────────────────────
  apiKey: ls.get('api-key') || '',
  posData: ls.get('pos-data'),       // { items:[{code,description,supplier}], aliases:{}, updatedAt }
  suppliers: ls.get('suppliers') || [],
  history: ls.get('history') || [],

  // ── Session: delivery form ──────────────────────────────────────
  page: 'delivery',                  // 'delivery' | 'history' | 'suppliers' | 'settings'
  selectedSupplier: '',
  deliveryNotes: '',
  reportFiles: [],                   // File[]
  itemPhotos: [],                    // File[] — bulk overview shots
  scannedBarcodes: [],

  // ── Session: results ────────────────────────────────────────────
  results: null,                     // processed item array | null
  viewingHistory: null,              // history record | null
  deliveryStep: 'form',              // 'form' | 'verify' | 'pos'
  processing: false,
  processStep: '',

  // ── Session: UI state ───────────────────────────────────────────
  issuesOnly: false,
  showPOSEntry: false,
  posChecked: new Set(),
  itemPhotoMap: {},                  // itemId -> [blobUrl, ...]
  viewingPhoto: null,
  resultsSearch: '',
  expandedRows: new Set(),
  bulkPhotoResults: {},              // photoIdx -> [{name,visible,confidence,reason}]
  photoAnalysisModal: null,          // {photoIdx,blobUrl,analyzing,results}
  scanning: false,

  // ── Setters (simple) ────────────────────────────────────────────
  set,

  // ── Persisted setters ───────────────────────────────────────────
  saveApiKey(key) {
    ls.set('api-key', key);
    set({ apiKey: key });
  },
  savePosData(data) {
    ls.set('pos-data', data);
    ls.set('skip-pos', true);
    set({ posData: data });
  },
  saveSuppliers(suppliers) {
    ls.set('suppliers', suppliers);
    set({ suppliers });
  },
  saveHistory(history) {
    ls.set('history', history);
    set({ history });
  },
  clearPosData() {
    ls.del('pos-data');
    set({ posData: null });
  },

  // ── Item photo helpers ──────────────────────────────────────────
  addItemPhotos(itemId, files) {
    const map = { ...get().itemPhotoMap };
    if (!map[itemId]) map[itemId] = [];
    const slots = 10 - map[itemId].length;
    Array.from(files).slice(0, slots).forEach(f => map[itemId].push(URL.createObjectURL(f)));
    set({ itemPhotoMap: map });
  },
  removeItemPhoto(itemId, idx) {
    const map = { ...get().itemPhotoMap };
    if (!map[itemId]) return;
    URL.revokeObjectURL(map[itemId][idx]);
    map[itemId].splice(idx, 1);
    if (!map[itemId].length) delete map[itemId];
    set({ itemPhotoMap: map });
  },

  // ── Reset delivery session ──────────────────────────────────────
  resetDelivery() {
    Object.values(get().itemPhotoMap).flat().forEach(url => { try { URL.revokeObjectURL(url); } catch {} });
    set({
      results: null, deliveryStep: 'form',
      reportFiles: [], itemPhotos: [], scannedBarcodes: [],
      deliveryNotes: '', selectedSupplier: '',
      issuesOnly: false, expandedRows: new Set(),
      itemPhotoMap: {}, viewingPhoto: null, resultsSearch: '',
      bulkPhotoResults: {}, photoAnalysisModal: null,
    });
  },

  // ── Toggle helpers ──────────────────────────────────────────────
  toggleRow(id) {
    const s = new Set(get().expandedRows);
    s.has(id) ? s.delete(id) : s.add(id);
    set({ expandedRows: s });
  },
  togglePosChecked(id) {
    const s = new Set(get().posChecked);
    s.has(id) ? s.delete(id) : s.add(id);
    set({ posChecked: s });
  },

  // ── Mutate result item in place ─────────────────────────────────
  updateResultItem(id, patch) {
    const results = (get().results || []).map(it => it.id === id ? { ...it, ...patch } : it);
    set({ results });
  },

  // ── Save alias ──────────────────────────────────────────────────
  saveAlias(itemId, label) {
    const posData = { ...get().posData };
    if (!posData.aliases) posData.aliases = {};
    const item = (get().results || []).find(i => i.id === itemId);
    if (!item?.posCode) return;
    for (const k of Object.keys(posData.aliases)) {
      if (posData.aliases[k] === item.posCode) delete posData.aliases[k];
    }
    if (label) posData.aliases[label.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim()] = item.posCode;
    ls.set('pos-data', posData);
    set({ posData });
    get().updateResultItem(itemId, { aliased: !!label });
  },

  // ── Learn supplier mapping ──────────────────────────────────────
  confirmMatch(itemId) {
    const state = get();
    const item = (state.results || []).find(i => i.id === itemId);
    if (!item?.posCode || !state.selectedSupplier) return;
    const suppliers = state.suppliers.map(s => {
      if (s.name !== state.selectedSupplier) return s;
      const mappings = { ...(s.mappings || {}) };
      mappings[item.name.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim()] = item.posCode;
      return { ...s, mappings };
    });
    ls.set('suppliers', suppliers);
    set({ suppliers });
    get().updateResultItem(itemId, { learned: true });
  },

  // ── History helpers ─────────────────────────────────────────────
  addHistoryRecord(record) {
    const history = [record, ...get().history];
    ls.set('history', history);
    set({ history });
  },
  deleteHistoryRecord(id) {
    const history = get().history.filter(h => h.id !== id);
    ls.set('history', history);
    set({ history });
  },
  clearHistory() {
    ls.set('history', []);
    set({ history: [] });
  },

  // ── uid helper exposed ──────────────────────────────────────────
  uid,
}));
