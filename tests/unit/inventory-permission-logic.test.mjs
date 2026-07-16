import test from "node:test";
import assert from "node:assert/strict";
import {
  authorizeAdmin,
  authorizeOwnedResource,
  deliverReservedInventory,
  releaseReservation,
  reserveInventory,
} from "./helpers/inventory-auth-logic.mjs";

const baseInventory = [
  { id: "inv_1", productId: "p1", skuId: "sku_us", status: "available" },
  { id: "inv_2", productId: "p1", skuId: "sku_uk", status: "available" },
  { id: "inv_3", productId: "p2", skuId: null, status: "available" },
];

test("reserves inventory only for the requested SKU", () => {
  const result = reserveInventory(baseInventory, {
    orderId: "order_1",
    productId: "p1",
    skuId: "sku_us",
    quantity: 1,
    now: "2026-06-30T00:00:00Z",
  });

  assert.equal(result.reserved.length, 1);
  assert.equal(result.reserved[0].id, "inv_1");
  assert.equal(result.inventory.find((item) => item.id === "inv_2").status, "available");
});

test("does not mix stock from another SKU when inventory is insufficient", () => {
  assert.throws(
    () =>
      reserveInventory(baseInventory, {
        orderId: "order_1",
        productId: "p1",
        skuId: "sku_us",
        quantity: 2,
        now: "2026-06-30T00:00:00Z",
      }),
    /库存不足/,
  );
});

test("reservation is idempotent for the same order", () => {
  const first = reserveInventory(baseInventory, {
    orderId: "order_1",
    productId: "p1",
    skuId: "sku_us",
    quantity: 1,
    now: "2026-06-30T00:00:00Z",
  });
  const second = reserveInventory(first.inventory, {
    orderId: "order_1",
    productId: "p1",
    skuId: "sku_us",
    quantity: 1,
    now: "2026-06-30T00:00:01Z",
  });

  assert.equal(second.reused, true);
  assert.equal(second.reserved[0].id, "inv_1");
});

test("delivery is idempotent and delivered stock is not released", () => {
  const reserved = reserveInventory(baseInventory, {
    orderId: "order_1",
    productId: "p1",
    skuId: "sku_us",
    quantity: 1,
    now: "2026-06-30T00:00:00Z",
  });
  const delivered = deliverReservedInventory(reserved.inventory, {
    orderId: "order_1",
    productId: "p1",
    skuId: "sku_us",
    quantity: 1,
    now: "2026-06-30T00:01:00Z",
  });
  const duplicate = deliverReservedInventory(delivered.inventory, {
    orderId: "order_1",
    productId: "p1",
    skuId: "sku_us",
    quantity: 1,
    now: "2026-06-30T00:02:00Z",
  });
  const released = releaseReservation(duplicate.inventory, "order_1");

  assert.equal(duplicate.reused, true);
  assert.equal(released.find((item) => item.id === "inv_1").status, "delivered");
});

test("delivery does not consume available inventory that was not reserved for the order", () => {
  assert.throws(
    () =>
      deliverReservedInventory(baseInventory, {
        orderId: "order_1",
        productId: "p1",
        skuId: "sku_us",
        quantity: 1,
        now: "2026-06-30T00:01:00Z",
      }),
    /已预留|reserved|搴撳瓨/,
  );
});

test("admin API authorization returns 401 for anonymous and 403 for normal user", () => {
  assert.deepEqual(authorizeAdmin(null), { ok: false, status: 401 });
  assert.deepEqual(authorizeAdmin({ id: "user_1", role: "user" }), { ok: false, status: 403 });
  assert.deepEqual(authorizeAdmin({ id: "admin_1", role: "admin" }), { ok: true, status: 200 });
});

test("owned resource authorization blocks cross-user access but allows admin", () => {
  assert.deepEqual(authorizeOwnedResource({ id: "user_a", role: "user" }, "user_b"), {
    ok: false,
    status: 403,
  });
  assert.deepEqual(authorizeOwnedResource({ id: "user_a", role: "user" }, "user_a"), {
    ok: true,
    status: 200,
  });
  assert.deepEqual(authorizeOwnedResource({ id: "admin_1", role: "admin" }, "user_b"), {
    ok: true,
    status: 200,
  });
});
