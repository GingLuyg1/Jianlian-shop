import assert from "node:assert/strict";
import test from "node:test";
import { loadPureTypeScript } from "../helpers/load-pure-typescript.mjs";
const { membershipProgress } = loadPureTypeScript(new URL("../../lib/account/membership-display.ts", import.meta.url));
const { rechargeDisplayNumber, rechargeCreditedCny, meaningfulBalanceRemark, balanceRechargeChannel } = loadPureTypeScript(new URL("../../lib/account/record-presentation.ts", import.meta.url));

test("membership progress uses actual cumulative spend and approved tier boundaries", () => {
  assert.equal(membershipProgress(1000).current.level, 0);
  assert.equal(membershipProgress(1000).remaining, 2000);
  assert.ok(Math.abs(membershipProgress(1000).percent - 100 / 3) < 1e-9);
  for (const [spend, level, next] of [[0, 0, 3000], [2999.99, 0, 3000], [3000, 1, 10000], [10000, 2, 20000], [20000, 3, undefined], [25000, 3, undefined]]) {
    const progress = membershipProgress(spend);
    assert.equal(progress.current.level, level);
    assert.equal(progress.next?.threshold, next);
    assert.ok(progress.percent >= 0 && progress.percent <= 100);
  }
  for (const input of [null, NaN, Infinity]) assert.equal(membershipProgress(input), null);
});

test("recharge display aliases are six digits and stable without altering source identifiers", () => {
  const source = "RC202611030955503Y3KI6";
  assert.match(rechargeDisplayNumber(source), /^\d{6}$/);
  assert.equal(rechargeDisplayNumber(source), rechargeDisplayNumber(source));
  assert.equal(source, "RC202611030955503Y3KI6");
});

test("RMB receipt display uses posted credit and never converts USDT using today's rate", () => {
  assert.equal(rechargeCreditedCny({ creditedCnyAmount: "100.00", creditedAmount: 15.1687, currency: "USDT" }), "¥100.00");
  assert.equal(rechargeCreditedCny({ creditedCnyAmount: "0", creditedAmount: 100, currency: "CNY" }), "¥0.00");
  assert.equal(rechargeCreditedCny({ creditedCnyAmount: null, creditedAmount: 50, currency: "CNY" }), "¥50.00");
  assert.equal(rechargeCreditedCny({ creditedCnyAmount: null, creditedAmount: 15.1687, currency: "USDT" }), "—");
});

test("balance remarks hide boilerplate while retaining meaningful business explanations", () => {
  assert.equal(meaningfulBalanceRemark("账户充值入账\nUSDT-BEP20 fingerprint recharge credited by exact requested CNY amount\n余额修正原因"), "余额修正原因");
  assert.equal(meaningfulBalanceRemark(null), "");
  assert.equal(balanceRechargeChannel({ remark: "账户充值入账" }), "暂不可用");
  assert.equal(balanceRechargeChannel({ remark: "USDT-BEP20 fingerprint recharge credited by exact requested CNY amount" }), "USDT BEP20");
  assert.equal(balanceRechargeChannel({ remark: null }, "支付宝"), "支付宝");
});
