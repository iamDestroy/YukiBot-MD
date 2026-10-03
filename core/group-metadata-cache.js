export function createGroupMetadataCache({ ttlMs = 60_000, maxEntries = 256, clock = Date.now } = {}) {
  const records = new Map();
  const pending = new Map();

  const get = jid => {
    const entry = records.get(jid);
    if (!entry) return null;
    if (clock() >= entry.expiresAt) { records.delete(jid); return null; }
    return entry.data;
  };
  const store = (jid, data) => {
    records.delete(jid);
    records.set(jid, { data, expiresAt: clock() + ttlMs });
    if (records.size > maxEntries) records.delete(records.keys().next().value);
  };
  const set = (jid, data) => { pending.delete(jid); store(jid, data); };

  function load(sock, jid, fetch) {
    const cached = get(jid);
    if (cached) return Promise.resolve(cached);
    const previous = pending.get(jid);
    if (previous) {
      if (previous.sock === sock) return previous.promise;
      return previous.promise.then(metadata => metadata?.participants ? metadata : load(sock, jid, fetch), () => load(sock, jid, fetch));
    }

    const entry = { sock, promise: null };
    entry.promise = Promise.resolve().then(fetch).then(metadata => {
      if (pending.get(jid) !== entry) return load(sock, jid, fetch);
      if (metadata?.participants) store(jid, metadata);
      return metadata;
    }, error => {
      if (pending.get(jid) !== entry) return load(sock, jid, fetch);
      throw error;
    }).finally(() => {
      if (pending.get(jid) === entry) pending.delete(jid);
    });
    pending.set(jid, entry);
    return entry.promise;
  }

  return {
    get, set, load,
    invalidate(jid) { records.delete(jid); pending.delete(jid); },
    async getFor(sock, jid) {
      const cached = get(jid);
      if (cached) return cached;
      const entry = pending.get(jid);
      if (!entry) return undefined;
      try {
        const result = await entry.promise;
        return result?.participants ? result : undefined;
      } catch { return undefined; }
    },
    prune() {
      const now = clock();
      for (const [jid, entry] of records)
        if (now >= entry.expiresAt) records.delete(jid);
    }
  };
}
