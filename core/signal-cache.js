export function createSignalCache({ maxEntries = 1000, ttlMs = 300_000, clock = Date.now } = {}) {
  const entries = new Map();
  return {
    get(key) {
      const entry = entries.get(key);
      if (!entry) return undefined;
      if (clock() >= entry.expiresAt) {
        entries.delete(key);
        return undefined;
      }
      entries.delete(key);
      entries.set(key, entry);
      return entry.value;
    },
    set(key, value) {
      entries.delete(key);
      entries.set(key, { value, expiresAt: clock() + ttlMs });
      if (entries.size > maxEntries) entries.delete(entries.keys().next().value);
      return true;
    },
    flushAll() {
      entries.clear();
    }
  };
}
