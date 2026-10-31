// Private browser-memory cache. Its owner clears it on auth/lifecycle changes.
export function createDashboardReadCache({ ttl = 15_000, maximum = 32, now = Date.now } = {}) {
  const values = new Map();
  const pending = new Map();
  let generation = 0;
  return {
    clear() { generation++; values.clear(); pending.clear(); },
    read(key, fetcher) {
      const cached = values.get(key);
      if (cached && cached.expires > now()) return Promise.resolve(cached.value);
      values.delete(key);
      if (pending.has(key)) return pending.get(key);
      const started = generation;
      const request = Promise.resolve().then(fetcher).then(value => {
        if (started === generation) {
          if (values.size >= maximum) values.delete(values.keys().next().value);
          values.set(key, { value, expires: now() + ttl });
        }
        return value;
      }).finally(() => { if (pending.get(key) === request) pending.delete(key); });
      pending.set(key, request);
      return request;
    },
  };
}
