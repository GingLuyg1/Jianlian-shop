import test from "node:test";
import assert from "node:assert/strict";

import {
  getNavigationGroupForPath,
  toggleNavigationGroup,
} from "../../components/admin/admin-navigation-state.mjs";

const groups = [
  {
    key: "products",
    children: [
      { href: "/admin/products" },
      { href: "/admin/categories" },
    ],
  },
  {
    key: "system",
    routePrefixes: ["/admin/system"],
    children: [
      { href: "/admin/system/production-readiness" },
      { href: "/admin/system-errors" },
      { href: "/admin/system/request-traces" },
      { href: "/admin/system/database" },
      { href: "/admin/audit-logs" },
    ],
  },
];

test("route matching opens only the owning admin navigation group", () => {
  assert.equal(getNavigationGroupForPath("/admin/products", groups), "products");
  assert.equal(getNavigationGroupForPath("/admin/categories", groups), "products");
  assert.equal(getNavigationGroupForPath("/admin/products/product-id", groups), "products");
  assert.equal(getNavigationGroupForPath("/admin/system/production-readiness", groups), "system");
  assert.equal(getNavigationGroupForPath("/admin/system/request-traces/request-id", groups), "system");
  assert.equal(getNavigationGroupForPath("/admin/system-errors", groups), "system");
  assert.equal(getNavigationGroupForPath("/admin/system/data-consistency", groups), "system");
  assert.equal(getNavigationGroupForPath("/admin/system/performance", groups), "system");
  assert.equal(getNavigationGroupForPath("/admin/system/project-status", groups), "system");
  assert.equal(getNavigationGroupForPath("/admin/systematic", groups), null);
  assert.equal(getNavigationGroupForPath("/admin", groups), null);
});

test("accordion transitions keep at most one group open", () => {
  let openSection = null;
  openSection = toggleNavigationGroup(openSection, "products");
  assert.equal(openSection, "products");

  openSection = toggleNavigationGroup(openSection, "system");
  assert.equal(openSection, "system");

  openSection = toggleNavigationGroup(openSection, "system");
  assert.equal(openSection, null);
});
