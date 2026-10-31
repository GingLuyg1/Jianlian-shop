// Read-only planning. This module cannot activate SKUs, call a supplier or buy.
import { parseBitrefillProduct } from "./protocol.mjs";
const sameRecord = (a, b) => JSON.stringify(a, (key, value) =>
  ["checkedAt", "evidenceName"].includes(key) ? undefined : value) === JSON.stringify(b, (key, value) =>
  ["checkedAt", "evidenceName"].includes(key) ? undefined : value);

export function classifyMobileProduct(raw) {
  const categories = new Set(raw?.categories ?? []);
  const data = ["data", "Data", "esim"].some((v) => categories.has(v));
  if (raw?.recipient_type === "phone_number") return data ? "DIRECT_DATA" : "DIRECT_TOPUP";
  if (raw?.recipient_type === "none" && categories.has("pin")) return "PIN";
  return "REVIEW_REQUIRED";
}

export function buildMobileCatalog(pages) {
  const products = new Map(), packages = new Map();
  for (const page of pages) {
    if (!Array.isArray(page?.data?.data)) throw new Error("MOBILE_PAGE_INVALID");
    for (const raw of page.data.data) {
      const parsed = parseBitrefillProduct(raw);
      if (!raw || !/^[A-Za-z0-9_-]{1,200}$/.test(raw.id ?? "") ||
          !/^[A-Z]{2}$/.test(raw.country_code ?? "") || !Array.isArray(raw.packages)) throw new Error("MOBILE_PRODUCT_SCHEMA_UNSUPPORTED");
      // Keep every supplier record, including bundles the purchase parser does
      // not support. Quarantine those records; never relax the purchase parser.
      const product = parsed ?? { id: raw.id, name: raw.name, country: raw.country_code,
        currency: raw.currency, inStock: raw.in_stock, range: raw.range ?? null,
        packages: raw.packages.map(p => ({ packageId: p.id, value: null, valueLabel: String(p.value), price: p.price ?? null })) };
      const identity = `${product.country}:${product.id}`;
      const record = {
        identity, productId: product.id, name: product.name, schemaStatus: parsed ? "SUPPORTED" : "QUARANTINED_READONLY",
        operator: typeof raw.base_name === "string" ? raw.base_name : product.name,
        operatorIdentityStatus: "SUPPLIER_LABEL_NOT_INDEPENDENTLY_VERIFIED",
        country: product.country, faceCurrency: product.currency,
        deliveryKind: classifyMobileProduct(raw), recipientType: raw.recipient_type ?? "UNKNOWN",
        requiredCustomerInput: raw.recipient_type === "phone_number" ? ["country", "operator", "phone_number"]
          : raw.recipient_type === "none" ? [] : ["SUPPLIER_SCHEMA_REVIEW"],
        supplierAvailable: product.inStock, checkedAt: page.startedAt,
        evidenceName: page.name, range: product.range,
        commercialPermission: "UNVERIFIED", fulfillment: "NOT_LIVE_VERIFIED",
        fees: null, finalCost: null, suggestedCny: null, status: "DRAFT_PLAN_ONLY",
      };
      const previous = products.get(identity);
      // Duplicate pages must not silently replace an earlier supplier snapshot.
      if (previous && !sameRecord(previous, record)) throw new Error("MOBILE_PRODUCT_DRIFT");
      if (!previous) products.set(identity, record);
      for (const pkg of product.packages) {
        const packageId = pkg.packageId;
        // Some real bundle IDs exceed the purchase parser's 200-character
        // bound. Preserve them for review only, never make them purchasable.
        if (typeof packageId !== "string" || !packageId || packageId.length > 4096) throw new Error("MOBILE_PACKAGE_ID_INVALID");
        const key = `${identity}:${packageId}`;
        const row = { ...record, packageId, faceValue: pkg.value, packageLabel: pkg.valueLabel ?? null,
          // REST raw price has no authenticated payment-currency/fee contract.
          supplierRawPrice: pkg.price, rawPriceUnit: "UNVERIFIED_DO_NOT_PRICE_FROM_THIS",
          rangeRule: null, localProductId: null, localSkuId: null };
        if (packages.has(key) && !sameRecord(packages.get(key), row)) throw new Error("MOBILE_PACKAGE_DRIFT");
        if (!packages.has(key)) packages.set(key, row);
      }
    }
  }
  return { products: [...products.values()], packages: [...packages.values()] };
}

// No phone is returned: collecting/storing it requires a separate private
// authenticated order-input path. E.164 alone never proves carrier ownership.
export function validateMobileRecipient({ deliveryKind, country, operatorId, phoneNumber, lookup }) {
  if (deliveryKind === "PIN") {
    if (phoneNumber !== undefined && phoneNumber !== null) throw new Error("PIN_RECIPIENT_FORBIDDEN");
    return { kind: "PIN", recipientRequired: false };
  }
  if (!["DIRECT_TOPUP", "DIRECT_DATA"].includes(deliveryKind)) throw new Error("MOBILE_DELIVERY_UNSUPPORTED");
  if (!/^[A-Z]{2}$/.test(country ?? "") || !/^[A-Za-z0-9_-]{1,200}$/.test(operatorId ?? "") ||
      typeof phoneNumber !== "string" || !/^\+[1-9][0-9]{6,14}$/.test(phoneNumber)) throw new Error("MOBILE_RECIPIENT_INVALID");
  if (!lookup || lookup.country !== country || lookup.productId !== operatorId ||
      lookup.phoneNumber !== phoneNumber || lookup.authoritative !== true) throw new Error("MOBILE_OPERATOR_LOOKUP_REQUIRED");
  return { kind: deliveryKind, recipientRequired: true };
}
