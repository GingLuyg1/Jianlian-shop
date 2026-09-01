import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function file(path) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

test("admin core operations pages share shell and state components without changing data contracts", () => {
  const products = file("app/admin/products/page.tsx");
  const inventory = file("app/admin/inventory/page.tsx");
  const orders = file("app/admin/orders/page.tsx");

  for (const source of [products, inventory, orders]) {
    assert.match(source, /import AdminPageShell from "@\/components\/admin\/AdminPageShell"/);
    assert.match(source, /<AdminPageShell/);
  }

  assert.match(products, /<AdminEmptyState/);
  assert.match(inventory, /<AdminErrorState/);
  assert.match(inventory, /<AdminEmptyState/);
  assert.match(orders, /<AdminErrorState/);
  assert.match(orders, /<AdminEmptyState/);
  assert.match(orders, /<AdminTableSkeleton/);

  assert.match(products, /searchParams\.get\("view"\) === "categories"/);
  for (const operation of ["listProducts", "getProduct", "createProduct", "updateProduct", "deleteProduct"]) {
    assert.match(products, new RegExp(`${operation}\\(`));
  }

  assert.ok(inventory.includes('fetch("/api/admin/inventory?mode=products"'));
  assert.ok(inventory.includes('mode: "batches"'));
  assert.ok(inventory.includes('mode: "items"'));
  assert.ok(inventory.includes('fetch("/api/admin/inventory", { method: "POST", body: formData })'));

  assert.ok(orders.includes('fetch(`/api/admin/orders?${params.toString()}`'));
  assert.match(orders, /page: String\(page\)/);
  assert.match(orders, /pageSize: String\(pageSize\)/);
  assert.match(orders, /sort,/);
  for (const filter of ["search", "status", "paymentStatus", "deliveryType"]) {
    assert.match(orders, new RegExp(`params\\.set\\("${filter}"`));
  }
});
