// One-shot, credentials-protected KuajingZy ordinary API read-only preflight.
// Usage (host only): load KUAJINGZY_API_KEY from an existing protected secret source;
// then run: node scripts/probe-kuajingzy-readonly.mjs --catalog-filtered
// Supply exactly one of KUAJINGZY_CATALOG_SEARCH or KUAJINGZY_CATALOG_CATEGORY
// from the protected process environment, without echoing its value.
// NEVER print raw catalog, auth headers, keys, customer data, invoices or account balance.
import { createKuajingZyReadonlyClient, KuajingZyReadError } from '../lib/providers/kuajingzy/readonly-client.mjs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const safeKeys = value => value && typeof value === 'object' && !Array.isArray(value)
  ? Object.keys(value).slice(0, 40).filter(key => /^[A-Za-z_][A-Za-z0-9_]{0,49}$/.test(key)).sort()
  : [];
export function summarizeKuajingZyCatalogShape(data) {
  const rootType = Array.isArray(data) ? 'array' : data && typeof data === 'object' ? 'object' : 'other';
  const array = Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : null;
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
export async function main({key=process.env.KUAJINGZY_API_KEY,fetchImpl=fetch,scope='balance-and-catalog',filter}={}) {
  if (!['balance-and-catalog', 'catalog-only', 'catalog-filtered'].includes(scope)) {
    throw new KuajingZyReadError('SCOPE_INVALID');
  }
  // Reject missing/ambiguous filters BEFORE any outbound request.
  // The client separately checks exact documented names and UTF-8 byte limits.
  if (scope === 'catalog-filtered') {
    if (!filter || typeof filter !== 'object' || Array.isArray(filter) ||
        Object.keys(filter).length !== 1 || !['category','search'].includes(Object.keys(filter)[0])) {
      throw new KuajingZyReadError('CATALOG_FILTER_INVALID');
    }
  }
  const client=createKuajingZyReadonlyClient({apiKey:key,fetchImpl});
  // The historical balance GET already passed; never repeat for filtered reads.
  const balance=scope === 'balance-and-catalog' ? await client.readBalance() : null;
  const catalog=scope === 'catalog-filtered'
    ? await client.readMallCatalogFiltered(filter)
    : await client.readMallCatalog(); // legacy test-only full read
  const result={
    operation:'KUAJINGZY_ORDINARY_READONLY_PROBE',
    balanceGet:balance ? 'PASS' : 'SKIPPED_PRIOR_PASS',
    balanceCurrency:balance?.currency ?? null,
    catalogGet:'PASS', catalogShape:summarizeKuajingZyCatalogShape(catalog.data),
    filterMode:scope === 'catalog-filtered' ? 'SINGLE_DOCUMENTED_FILTER' : 'LEGACY',
    fullCatalogVerified:false,
    paymentExecuted:false, purchaseExecuted:false, productionChanged:false,
  };
  return result;
}
if (process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  const args=process.argv.slice(2);
  // CLI is intentionally filtered-only. Legacy unfiltered and balance GET
  // remain accessible only to synthetic unit tests, not operator CLI.
  const scope=args.length===1 && args[0]==='--catalog-filtered' ? 'catalog-filtered' : 'INVALID';
  const search=process.env.KUAJINGZY_CATALOG_SEARCH;
  const category=process.env.KUAJINGZY_CATALOG_CATEGORY;
  const filter=search !== undefined && category === undefined ? {search}
    : category !== undefined && search === undefined ? {category} : null;
  main({scope,filter}).then(result => {
    process.stdout.write(JSON.stringify(result)+'\n');
  }).catch(error=>{
    // Only controlled classification. Never serialize upstream error, key or stack.
    const allowed = /^KUAJINGZY_[A-Z0-9_]+$/.test(error?.code ?? '') ? error.code : 'KUAJINGZY_PROBE_FAILED';
    process.stderr.write('PROBE_ERROR='+allowed+'\n');
    process.exitCode=1;
  });
}
