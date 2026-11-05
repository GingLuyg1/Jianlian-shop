// One-shot, credentials-protected KuajingZy ordinary API read-only preflight.
// Usage (host only): load KUAJINGZY_API_KEY from an existing protected secret source;
// then run: node scripts/probe-kuajingzy-readonly.mjs --catalog-only
// NEVER print raw catalog, auth headers, keys, customer data, invoices or account balance.
import { createKuajingZyReadonlyClient, KuajingZyReadError } from '../lib/providers/kuajingzy/readonly-client.mjs';
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
export async function main({key=process.env.KUAJINGZY_API_KEY,fetchImpl=fetch,scope='balance-and-catalog'}={}) {
  if (scope !== 'balance-and-catalog' && scope !== 'catalog-only') {
    throw new KuajingZyReadError('SCOPE_INVALID');
  }
  const client=createKuajingZyReadonlyClient({apiKey:key,fetchImpl});
  // The historical balance GET already passed. Never repeat it during a
  // catalog-only read unless a separate task expressly requires it.
  const balance=scope === 'catalog-only' ? null : await client.readBalance();
  const catalog=await client.readMallCatalog(); // GET once, no amount or raw catalog printed
  const result={
    operation:'KUAJINGZY_ORDINARY_READONLY_PROBE',
    balanceGet:balance ? 'PASS' : 'SKIPPED_PRIOR_PASS',
    balanceCurrency:balance?.currency ?? null,
    catalogGet:'PASS', catalogShape:summarizeKuajingZyCatalogShape(catalog.data),
    paymentExecuted:false, purchaseExecuted:false, productionChanged:false,
  };
  return result;
}
if (process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  const args=process.argv.slice(2);
  const scope=args.length===1 && args[0]==='--catalog-only'
    ? 'catalog-only' : args.length===0 ? 'balance-and-catalog' : 'INVALID';
  main({scope}).then(result => {
    process.stdout.write(JSON.stringify(result)+'\n');
  }).catch(error=>{
    // Only controlled classification. Never serialize upstream error, key or stack.
    const allowed = /^KUAJINGZY_[A-Z0-9_]+$/.test(error?.code ?? '') ? error.code : 'KUAJINGZY_PROBE_FAILED';
    process.stderr.write('PROBE_ERROR='+allowed+'\n');
    process.exitCode=1;
  });
}
