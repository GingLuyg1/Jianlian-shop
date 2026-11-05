// Offline-only, protocol-agnostic page acceptance policy.
// Intentionally no transport, URLs, credentials, or assumptions about
// KuajingZy's pagination query parameters / response schema.
import { createHash } from 'node:crypto';

export const KUAJINGZY_BOUNDED_CATALOG_LIMITS = Object.freeze({
  maxPages: 5,
  maxPageBytes: 256 * 1024,
  maxTotalBytes: 1024 * 1024,
  maxItemsPerPage: 1000,
  maxTotalItems: 5000,
});

function reject(code) {
  const error = new Error(`KUAJINGZY_CATALOG_${code}`);
  error.code = `KUAJINGZY_CATALOG_${code}`;
  throw error;
}
function hash(id) { return createHash('sha256').update(id).digest('hex'); }

// All values passed in must be derived from a separately verified,
// documented pagination contract. Never feed this policy raw API responses.
// Product IDs are hashed only for duplicate detection and never exposed.
export function createOfflineCatalogPageAudit() {
  const seen = new Set();
  let pages = 0, totalBytes = 0, totalItems = 0, ended = false;
  const summary = (status) => Object.freeze({
    status, pageCount: pages, totalBytes, totalItems,
    complete: status === 'COMPLETE', saleAuthorized: false,
  });
  return Object.freeze({
    accept(page) {
      if (ended) reject('ALREADY_TERMINAL');
      if (!page || typeof page !== 'object' || Array.isArray(page)) reject('PAGE_INVALID');
      if (page.pageNumber !== pages + 1) reject('PAGE_ORDER_INVALID');
      if (!Number.isSafeInteger(page.bytesRead) || page.bytesRead < 1 || page.bytesRead > KUAJINGZY_BOUNDED_CATALOG_LIMITS.maxPageBytes) {
        reject('PAGE_SIZE_INVALID');
      }
      if (totalBytes + page.bytesRead > KUAJINGZY_BOUNDED_CATALOG_LIMITS.maxTotalBytes) reject('SESSION_SIZE_EXCEEDED');
      if (!Array.isArray(page.productIds) || page.productIds.length > KUAJINGZY_BOUNDED_CATALOG_LIMITS.maxItemsPerPage) reject('ITEMS_INVALID');
      if (totalItems + page.productIds.length > KUAJINGZY_BOUNDED_CATALOG_LIMITS.maxTotalItems) reject('ITEMS_INVALID');
      if (typeof page.hasMore !== 'boolean') reject('TERMINATION_UNKNOWN');
      const current = new Set();
      for (const id of page.productIds) {
        if (typeof id !== 'string' || id.length < 1 || id.length > 256 || /[\x00-\x1f\x7f]/.test(id)) reject('PRODUCT_ID_INVALID');
        const digest = hash(id);
        if (seen.has(digest) || current.has(digest)) reject('DUPLICATE_PRODUCT');
        current.add(digest);
      }
      // Only commit after every property has passed validation.
      for (const digest of current) seen.add(digest);
      pages += 1;
      totalBytes += page.bytesRead;
      totalItems += page.productIds.length;
      if (!page.hasMore) { ended = true; return summary('COMPLETE'); }
      if (page.productIds.length === 0) { ended = true; return summary('PARTIAL_EMPTY_PAGE'); }
      if (pages === KUAJINGZY_BOUNDED_CATALOG_LIMITS.maxPages || totalBytes === KUAJINGZY_BOUNDED_CATALOG_LIMITS.maxTotalBytes) {
        ended = true;
        return summary('PARTIAL_BOUNDED');
      }
      return summary('CONTINUE');
    },
    snapshot() { return summary(ended ? 'TERMINAL' : 'NOT_COMPLETE'); },
  });
}
