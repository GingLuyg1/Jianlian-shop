const AUTOMATIC_DELIVERY_TYPES = new Set([
  "automatic",
  "auto",
  "card",
  "account",
  "auto_delivery",
]);

function isPlainRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function collectFrozenSupplierCodes(items) {
  if (!Array.isArray(items)) throw new Error("SUPPLIER_ROUTER_ITEMS_INVALID");
  const suppliers = new Set();
  for (const rawItem of items) {
    if (!isPlainRecord(rawItem)) throw new Error("SUPPLIER_ROUTER_ITEM_INVALID");
    if (!AUTOMATIC_DELIVERY_TYPES.has(String(rawItem.delivery_type))) continue;
    if (rawItem.delivery_status === "delivered") continue;

    const snapshot = isPlainRecord(rawItem.product_snapshot) ? rawItem.product_snapshot : null;
    if (!snapshot || !Object.prototype.hasOwnProperty.call(snapshot, "supplier_binding") || snapshot.supplier_binding === null) {
      continue;
    }

    const binding = snapshot.supplier_binding;
    if (
      !isPlainRecord(binding)
      || typeof binding.supplier !== "string"
      || !binding.supplier
      || binding.supplier !== binding.supplier.trim()
    ) {
      throw new Error("SUPPLIER_ROUTING_BINDING_INVALID");
    }

    suppliers.add(binding.supplier);
  }
  return Array.from(suppliers).sort();
}

export function resolveSupplierHandlers(supplierCodes, registry) {
  if (!Array.isArray(supplierCodes) || !isPlainRecord(registry)) {
    throw new Error("SUPPLIER_ROUTER_REGISTRY_INVALID");
  }
  return supplierCodes.map((supplierCode) => {
    const handler = registry[supplierCode];
    if (typeof handler !== "function") {
      throw new Error("SUPPLIER_ROUTER_UNSUPPORTED_SUPPLIER");
    }
    return handler;
  });
}

export function zeroSupplierSummary() {
  return { handled: 0, fulfilled: 0, failed: 0, uncertain: 0, needsInput: 0 };
}

export function addSupplierSummary(target, source) {
  target.handled += source.handled;
  target.fulfilled += source.fulfilled;
  target.failed += source.failed;
  target.uncertain += source.uncertain;
  target.needsInput += source.needsInput;
  return target;
}
