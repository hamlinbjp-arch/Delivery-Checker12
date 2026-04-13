import { get, set, del, keys, createStore } from 'idb-keyval';

const dbStore = createStore('deliverycheck-db', 'keyval');

export const store = {
  async get(k) { try { return await get(k, dbStore); } catch { return null; } },
  async set(k, v) { try { await set(k, v, dbStore); return true; } catch (e) { if (e.name === 'QuotaExceededError') return 'quota'; return false; } },
  async del(k) { try { await del(k, dbStore); return true; } catch { return false; } },
  async keys() { try { return await keys(dbStore); } catch { return []; } },
};
