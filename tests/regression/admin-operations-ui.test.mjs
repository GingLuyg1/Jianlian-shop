import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function file(path) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

test("payments, recharges, refunds and users keep operations UI and API contracts aligned", () => {
  const paymentsPage = file("app/admin/payments/page.tsx");
  const rechargesPage = file("app/admin/recharges/page.tsx");
  const paymentWorkspace = file("components/admin/payments/AdminPaymentRecordsPage.tsx");
  const refunds = file("app/admin/refunds/page.tsx");
  const users = file("app/admin/users/page.tsx");

  assert.match(paymentsPage, /<AdminPaymentRecordsPage mode="payments"/);
  assert.match(rechargesPage, /<AdminPaymentRecordsPage mode="recharges"/);
  for (const source of [paymentWorkspace, refunds, users]) {
    assert.match(source, /import AdminPageShell from "@\/components\/admin\/AdminPageShell"/);
    assert.match(source, /<AdminPageShell/);
    assert.match(source, /AdminTableSkeleton/);
    assert.match(source, /AdminErrorState/);
    assert.match(source, /AdminEmptyState/);
  }

  assert.match(paymentWorkspace, /const endpoint = isRechargePage \? "\/api\/admin\/recharges" : "\/api\/admin\/payments"/);
  assert.match(paymentWorkspace, /fetch\(`\/api\/admin\/payments\/\$\{payment\.id\}\?source=\$\{payment\.source\}`/);
  for (const parameter of ["search", "businessType", "channel", "status", "startDate", "endDate", "sort", "view", "exceptionType"]) {
    assert.match(paymentWorkspace, new RegExp(`\\b${parameter},`));
  }
  assert.match(paymentWorkspace, /runChainAction\("reject_late_payment"/);
  assert.match(paymentWorkspace, /fetch\(`\/api\/admin\/recharges\/\$\{rechargeId\}\/actions`/);
  assert.match(paymentWorkspace, /window\.confirm/);

  assert.match(refunds, /fetch\(`\/api\/admin\/refunds\?\$\{params\.toString\(\)\}`/);
  assert.match(refunds, /new URLSearchParams\(\{ status, pageSize: "50" \}\)/);
  assert.match(refunds, /params\.set\("q", query\.trim\(\)\)/);
  assert.match(refunds, /fetch\(`\/api\/admin\/refunds\/\$\{selected\.id\}`/);
  assert.match(refunds, /method: "PATCH"/);
  assert.match(refunds, /window\.confirm\("确认执行该退款操作/);

  assert.match(users, /fetch\(`\/api\/admin\/users\?\$\{params\.toString\(\)\}`/);
  for (const parameter of ["search", "accountStatus", "riskStatus", "registeredFrom", "registeredTo"]) {
    assert.match(users, new RegExp(`\\b${parameter},`));
  }
  assert.match(users, /fetch\(`\/api\/admin\/users\/\$\{userId\}\/actions`/);
  assert.match(users, /submitAction\("update_account_status"\)/);
  assert.match(users, /submitAction\("update_risk_status"\)/);
  assert.match(users, /submitAction\("adjust_balance"\)/);
  assert.match(users, /window\.confirm\("确认执行该用户管理操作/);

  for (const source of [paymentWorkspace, refunds, users]) {
    assert.doesNotMatch(source, /(?:const|let)\s+(?:mock|fake)[A-Za-z0-9_]*/i);
    assert.doesNotMatch(source, /Math\.random\(\)/);
  }
});
