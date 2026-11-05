// One-shot, credentials-protected KuajingZy ordinary API read-only preflight.
// Usage (host only): KUAJINGZY_API_KEY=... node scripts/probe-kuajingzy-readonly.mjs
// NEVER print raw catalog, auth headers, keys, customer data, invoices or account balance.
import { createKuajingZyReadonlyClient } from '../lib/providers/kuajingzy/readonly-client.mjs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const safeKeys = value => value && typeof value === 'object' && !Array.isArray(value)
  ? Object.keys(value).slice(0, 40).filter(key => /^[A-Za-z_][A-Za-z0-9_]{0,49}$/.test(key)).sort()
  : [];
export function summarizeKuajingZyCatalogShape(data) {
  const rootType = Array.isArray(data) ? 'array' : data && typeof data === 'object' ? 'object' : 'other';
  const array = Array.isArray(data) ? data : null;
  const sample = array?.[0] ?? null;
  return Object.freeze({
    rootType,
    rootKeys: rootType === 'object' ? safeKeys(data) : [],
    rootArrayCount: array?.length ?? null,
    itemKeys: safeKeys(sample),
    purchaseEnabled: false,
    schemaVerified: false,
    priceVerified: false,
    stockVerified: false,
  });
}
export async function main({key=process.env.KUAJINGZY_API_KEY,fetchImpl=fetch}={}) {
  const client=createKuajingZyReadonlyClient({apiKey:key,fetchImpl});
  const balance=await client.readBalance(); // GET once, no amount printed
  const catalog=await client.readMallCatalog(); // GET once, no item contents printed
  const result={
    operation:'KUAJINGZY_ORDINARY_READONLY_PROBE',
    balanceGet:'PASS', balanceCurrency:balance.currency,
    catalogGet:'PASS', catalogShape:summarizeKuajingZyCatalogShape(catalog.data),
    paymentExecuted:false, purchaseExecuted:false, productionChanged:false,
  };
  return result;
}
if (process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  main().then(result => {
    process.stdout.write(JSON.stringify(result)+'\n');
  }).catch(error=>{
    // Only controlled classification. Never serialize upstream error, key or stack.
    const allowed = /^KUAJINGZY_[A-Z0-9_]+$/.test(error?.code ?? '') ? error.code : 'KUAJINGZY_PROBE_FAILED';
    process.stderr.write('PROBE_ERROR='+allowed+'\n');
    process.exitCode=1;
  });
}
