import { createBitrefillClient } from "../lib/providers/bitrefill/client-core.mjs";

const apiKey = process.env.BITREFILL_API_KEY;
if (!apiKey) {
  console.log(JSON.stringify({ LIVE_PROBE_EXECUTED: false, LIVE_PROBE_SKIPPED: "no_credentials" }));
  process.exit(0);
}

const client = createBitrefillClient({ authMode: "personal", apiKey, maxRetries: 1 });
const countries = ["US", "CA", "GB", "CN"];
const searches = ["Apple", "Amazon", "Steam", "Google Play", "PlayStation", "Netflix"];

function summarize(products) {
  const counts = (key) => Object.fromEntries([...products.reduce((map, product) => map.set(product[key], (map.get(product[key]) ?? 0) + 1), new Map())]);
  return { count: products.length, types: counts("type"), currencies: counts("currency"), inStock: counts("inStock") };
}

try {
  const ping = await client.ping();
  const catalog = {};
  for (const country of countries) catalog[country] = summarize((await client.listProducts({ country, limit: 50 })).products);
  const found = {};
  for (const query of searches) {
    const result = await client.searchProducts(query, { limit: 10 });
    found[query] = result.products.map(({ id, name, country, currency, type, inStock, packages, range }) => ({
      id, name, country, currency, type, inStock, hasPackages: packages.length > 0, hasRange: range !== null,
    }));
  }
  console.log(JSON.stringify({ BITREFILL_AUTH_PASS: ping.message === "pong", LIVE_PROBE_EXECUTED: true, catalog, searches: found }, null, 2));
} catch (error) {
  console.log(JSON.stringify({ BITREFILL_AUTH_PASS: false, LIVE_PROBE_EXECUTED: true, error: error?.code ?? "UPSTREAM_UNAVAILABLE" }));
  process.exitCode = 1;
}
