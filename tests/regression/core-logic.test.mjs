import test from "node:test";
import assert from "node:assert/strict";

function normalizeOptionalText(value) {
  const next = String(value ?? "").trim();
  return next || null;
}

function normalizeNumber(value, fallback = 0) {
  if (value === null || value === undefined || String(value).trim() === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeOptionalNumber(value) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeProductFormValues(form) {
  return {
    name: String(form.name ?? "").trim(),
    slug: String(form.slug ?? "").trim().toLowerCase(),
    category_id: normalizeOptionalText(form.category_id),
    short_description: normalizeOptionalText(form.short_description),
    description: normalizeOptionalText(form.description),
    image_url: normalizeOptionalText(form.image_url),
    price: normalizeNumber(form.price),
    original_price: normalizeOptionalNumber(form.original_price),
    stock: Math.max(0, Math.trunc(normalizeNumber(form.stock))),
    status: String(form.status ?? "draft"),
    delivery_type: String(form.delivery_type ?? "manual"),
    sort_order: Math.trunc(normalizeNumber(form.sort_order)),
  };
}

function isProductFormDirty(current, initial) {
  const left = normalizeProductFormValues(current);
  const right = normalizeProductFormValues(initial);
  return Object.keys(left).some((key) => left[key] !== right[key]);
}

function cents(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error("invalid amount");
  return Math.round(parsed * 100);
}

function moneyFromCents(value) {
  return Number((value / 100).toFixed(2));
}

function calculateOrderTotalFromServerPrice({ serverUnitPrice, quantity }) {
  if (!Number.isInteger(quantity) || quantity <= 0) throw new Error("invalid quantity");
  return moneyFromCents(cents(serverUnitPrice) * quantity);
}

function uniqueValues(values) {
  const seen = new Set();
  const output = [];
  for (const value of values) {
    const key = String(value.id ?? value.name).trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    output.push(value);
  }
  return output;
}

function stableCombinationKey(selection) {
  return selection
    .map((entry) => `${entry.groupId}:${entry.valueId}`)
    .sort()
    .join("|");
}

function generateSkuCombinations(groups) {
  const activeGroups = groups
    .filter((group) => group && Array.isArray(group.values) && group.values.length > 0)
    .slice(0, 3)
    .map((group) => ({ ...group, values: uniqueValues(group.values) }));
  if (activeGroups.length === 0) return [];

  return activeGroups.reduce((rows, group) => {
    const next = [];
    for (const row of rows) {
      for (const value of group.values) {
        next.push([...row, { groupId: group.id, groupName: group.name, valueId: value.id, valueName: value.name }]);
      }
    }
    return next;
  }, [[]]).map((selection) => ({
    key: stableCombinationKey(selection),
    title: selection.map((item) => item.valueName).join(" / "),
    selection,
  }));
}

function mergeSkuCombinations(combinations, existingSkus, defaults) {
  const existingByKey = new Map(existingSkus.map((sku) => [sku.combination_key, sku]));
  return combinations.map((combo) => {
    const existing = existingByKey.get(combo.key);
    return existing
      ? { ...existing, combination_key: combo.key, title: combo.title }
      : { id: null, combination_key: combo.key, title: combo.title, ...defaults };
  });
}

function createOrderStore() {
  const byRequest = new Map();
  return {
    create({ userId, clientRequestId, serverUnitPrice, frontendUnitPrice, quantity }) {
      const key = `${userId}:${clientRequestId}`;
      if (byRequest.has(key)) return { ...byRequest.get(key), idempotent: true };
      const order = {
        orderNo: `TEST-${byRequest.size + 1}`,
        total: calculateOrderTotalFromServerPrice({ serverUnitPrice, quantity }),
        ignoredFrontendUnitPrice: frontendUnitPrice,
      };
      byRequest.set(key, order);
      return { ...order, idempotent: false };
    },
  };
}

function completePaymentOnce(state, callback) {
  if (state.completedTransactions.has(callback.providerTransactionId)) {
    return { status: "duplicate", credited: 0 };
  }
  if (cents(callback.amount) !== cents(state.expectedAmount)) return { status: "amount_mismatch", credited: 0 };
  if (callback.currency !== state.currency) return { status: "currency_mismatch", credited: 0 };
  state.completedTransactions.add(callback.providerTransactionId);
  state.balance = moneyFromCents(cents(state.balance) + cents(callback.amount));
  return { status: "success", credited: callback.amount };
}

function allocateInventory({ inventory, productId, skuId, orderId }) {
  const item = inventory.find((next) =>
    next.productId === productId &&
    (skuId ? next.skuId === skuId : !next.skuId) &&
    next.status === "available"
  );
  if (!item) return null;
  item.status = "reserved";
  item.orderId = orderId;
  return item;
}

function deliverReservedInventory(item) {
  if (!item || item.status !== "reserved") return false;
  item.status = "delivered";
  return true;
}

function restoreReservedInventory(item) {
  if (!item || item.status !== "reserved") return false;
  item.status = "available";
  item.orderId = null;
  return true;
}

function canAccessAdmin({ user }) {
  if (!user) return { ok: false, status: 401 };
  if (user.role !== "admin") return { ok: false, status: 403 };
  return { ok: true, status: 200 };
}

function canAccessOwnedResource({ userId, ownerId }) {
  return Boolean(userId && ownerId && userId === ownerId);
}

test("product form normalization avoids false dirty state", () => {
  const saved = {
    name: "  Apple Gift Card  ",
    slug: "APPLE-GIFT-CARD",
    category_id: "cat-1",
    short_description: "",
    description: null,
    image_url: " https://example.com/a.png ",
    price: "10.00",
    original_price: "",
    stock: "5.9",
    status: "active",
    delivery_type: "automatic",
    sort_order: "2.4",
  };
  const current = { ...saved, name: "Apple Gift Card", slug: "apple-gift-card", price: 10, original_price: null, stock: 5, sort_order: 2 };
  assert.equal(isProductFormDirty(current, saved), false);
  assert.equal(isProductFormDirty({ ...current, price: 11 }, saved), true);
});

test("order amount uses server price and ignores frontend price", () => {
  const store = createOrderStore();
  const first = store.create({ userId: "u1", clientRequestId: "req-1", serverUnitPrice: 69, frontendUnitPrice: 0.01, quantity: 2 });
  const second = store.create({ userId: "u1", clientRequestId: "req-1", serverUnitPrice: 999, frontendUnitPrice: 0.01, quantity: 2 });
  assert.equal(first.total, 138);
  assert.equal(second.total, 138);
  assert.equal(second.idempotent, true);
});

test("SKU combinations are unique and keep stable keys after sorting changes", () => {
  const groups = [
    { id: "color", name: "颜色", values: [{ id: "red", name: "红" }, { id: "red", name: "红重复" }, { id: "blue", name: "蓝" }] },
    { id: "size", name: "容量", values: [{ id: "500", name: "500" }, { id: "1000", name: "1000" }] },
  ];
  const combos = generateSkuCombinations(groups);
  assert.equal(combos.length, 4);
  assert.equal(new Set(combos.map((combo) => combo.key)).size, 4);

  const reversed = generateSkuCombinations([...groups].reverse());
  assert.deepEqual(new Set(reversed.map((combo) => combo.key)), new Set(combos.map((combo) => combo.key)));

  const merged = mergeSkuCombinations(combos, [{ id: "sku-1", combination_key: combos[0].key, price: 88, stock: 7, status: "active" }], { price: 10, stock: 0, status: "draft" });
  assert.equal(merged[0].id, "sku-1");
  assert.equal(merged[0].price, 88);
  assert.equal(merged.at(-1).id, null);
});

test("payment completion is idempotent and validates amount and currency", () => {
  const state = { expectedAmount: 100, currency: "CNY", balance: 0, completedTransactions: new Set() };
  assert.deepEqual(completePaymentOnce(state, { providerTransactionId: "tx-1", amount: 99, currency: "CNY" }), { status: "amount_mismatch", credited: 0 });
  assert.deepEqual(completePaymentOnce(state, { providerTransactionId: "tx-2", amount: 100, currency: "USDT" }), { status: "currency_mismatch", credited: 0 });
  assert.deepEqual(completePaymentOnce(state, { providerTransactionId: "tx-3", amount: 100, currency: "CNY" }), { status: "success", credited: 100 });
  assert.deepEqual(completePaymentOnce(state, { providerTransactionId: "tx-3", amount: 100, currency: "CNY" }), { status: "duplicate", credited: 0 });
  assert.equal(state.balance, 100);
});

test("digital inventory allocation is isolated by SKU and state", () => {
  const inventory = [
    { id: "a", productId: "p1", skuId: "sku-a", status: "available", content: "secret-a" },
    { id: "b", productId: "p1", skuId: "sku-b", status: "available", content: "secret-b" },
  ];
  const allocated = allocateInventory({ inventory, productId: "p1", skuId: "sku-b", orderId: "o1" });
  assert.equal(allocated.id, "b");
  assert.equal(inventory[0].status, "available");
  assert.equal(allocateInventory({ inventory, productId: "p1", skuId: "sku-c", orderId: "o2" }), null);
  assert.equal(deliverReservedInventory(allocated), true);
  assert.equal(restoreReservedInventory(allocated), false);
});

test("permission helpers return 401, 403 and ownership isolation", () => {
  assert.deepEqual(canAccessAdmin({ user: null }), { ok: false, status: 401 });
  assert.deepEqual(canAccessAdmin({ user: { role: "user" } }), { ok: false, status: 403 });
  assert.deepEqual(canAccessAdmin({ user: { role: "admin" } }), { ok: true, status: 200 });
  assert.equal(canAccessOwnedResource({ userId: "u1", ownerId: "u2" }), false);
  assert.equal(canAccessOwnedResource({ userId: "u1", ownerId: "u1" }), true);
});
