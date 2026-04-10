export const store = {
  get(k) { try { const v = localStorage.getItem('dc-' + k); return v ? JSON.parse(v) : null; } catch { return null; } },
  set(k, v) { try { localStorage.setItem('dc-' + k, JSON.stringify(v)); return true; } catch { return false; } },
  del(k) { try { localStorage.removeItem('dc-' + k); return true; } catch { return false; } },
};
