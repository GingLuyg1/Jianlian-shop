import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function file(path) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

test("final-polish Admin workspaces use V2 shells and shared list surfaces", () => {
  const migrated = [
    "app/admin/media/page.tsx",
    "app/admin/notifications/email-deliveries/page.tsx",
    "app/admin/system-errors/page.tsx",
    "app/admin/system/request-traces/page.tsx",
    "app/admin/audit-logs/page.tsx",
    "components/admin/email/AdminEmailTemplatesWorkspace.tsx",
  ];

  for (const path of migrated) {
    const source = file(path);
    assert.match(source, /variant="v2"/, `${path} must opt into the V2 shell`);
    assert.doesNotMatch(source, /shadow-sm/, `${path} must not restore static legacy shadows`);
  }

  for (const path of migrated.filter((path) => !path.includes("request-traces"))) {
    assert.match(file(path), /AdminListSurface/, `${path} must use the shared V2 list surface`);
  }
});

test("global Admin search keeps its endpoint and routing with an accessible keyboard combobox", () => {
  const search = file("components/admin/AdminGlobalSearch.tsx");

  assert.match(search, /\/api\/admin\/global-search\?q=/);
  assert.match(search, /router\.push\(result\.href\)/);
  assert.match(search, /role="combobox"/);
  assert.match(search, /aria-autocomplete="list"/);
  assert.match(search, /aria-activedescendant=/);
  assert.match(search, /role="listbox"/);
  assert.match(search, /role="option"/);
  for (const key of ["ArrowDown", "ArrowUp", "Enter", "Escape"]) {
    assert.match(search, new RegExp(`event\\.key === "${key}"`));
  }
  assert.doesNotMatch(search, /recentSearch|localStorage|sessionStorage/i);
});

test("operational tables contain overflow and use responsive V2 controls", () => {
  const sources = [
    file("app/admin/media/page.tsx"),
    file("app/admin/notifications/email-deliveries/page.tsx"),
    file("app/admin/system-errors/page.tsx"),
    file("app/admin/audit-logs/page.tsx"),
    file("components/admin/email/AdminEmailTemplatesWorkspace.tsx"),
  ];

  for (const source of sources) {
    assert.match(source, /AdminTableViewport/);
    assert.match(source, /AdminFilterBar/);
    assert.match(source, /h-11[^"\n]*sm:h-9|adminListControlClass/);
  }
});

test("audit and system detail overlays use the shared Radix modal drawer", () => {
  const primitive = file("components/admin/v2/AdminDetail.tsx");
  const audit = file("app/admin/audit-logs/page.tsx");
  const errors = file("app/admin/system-errors/page.tsx");

  assert.match(primitive, /@radix-ui\/react-dialog/);
  assert.match(primitive, /<DialogPrimitive\.Root open modal/);
  assert.match(primitive, /onOpenAutoFocus=/);
  assert.match(primitive, /onCloseAutoFocus=/);
  assert.match(primitive, /overflow-y-auto overflow-x-hidden/);
  assert.match(audit, /<AdminDetailDrawer/);
  assert.match(errors, /<AdminDetailDrawer/);
  assert.doesNotMatch(audit + errors, /fixed inset-0 z-50 flex justify-end/);
});

test("safe Admin operations and established list query contracts remain present", () => {
  const orders = file("app/admin/orders/page.tsx");
  const delivery = file("components/admin/orders/OrderFulfillmentPanel.tsx");
  const reconciliation = file("components/admin/payments/AdminReconciliationPanel.tsx");
  const lists = [
    file("app/admin/users/page.tsx"),
    file("app/admin/risk/page.tsx"),
    file("app/admin/privacy-requests/page.tsx"),
    orders,
    file("components/admin/payments/AdminPaymentRecordsPage.tsx"),
  ].join("\n");

  assert.match(delivery, /\/items\/\$\{itemId\}\/deliver/);
  assert.match(reconciliation, /\/reconciliations\/\$\{row\.id\}\/recheck/);
  assert.match(reconciliation, /recheckingRef\.current\.has\(row\.id\)/);
  assert.match(orders, /searchParams/);
  assert.match(lists, /pageSize/);
  assert.match(lists, /URLSearchParams/);
});

test("final-polish surfaces add no placeholder links or unsafe user/risk/privacy actions", () => {
  const polished = [
    file("app/admin/media/page.tsx"),
    file("app/admin/notifications/email-deliveries/page.tsx"),
    file("app/admin/system/request-traces/page.tsx"),
    file("app/admin/audit-logs/page.tsx"),
    file("components/admin/AdminGlobalSearch.tsx"),
    file("components/admin/email/AdminEmailTemplatesWorkspace.tsx"),
  ].join("\n");
  const readOnly = [
    file("app/admin/users/page.tsx"),
    file("app/admin/risk/page.tsx"),
    file("app/admin/privacy-requests/page.tsx"),
  ].join("\n");

  assert.doesNotMatch(polished, /href=["']#["']/);
  assert.doesNotMatch(readOnly, /adjust_balance|impersonat|reset_password|delete_user|force_paid|callback_replay/i);
});
