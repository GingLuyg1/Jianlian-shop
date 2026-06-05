"use client";

import { useState } from "react";
import { BadgeDollarSign, CreditCard, type LucideIcon } from "lucide-react";
import PublicLayout from "@/components/layout/PublicLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type RechargeMethodId = "alipay" | "wxpay" | "binance" | "manual";
type RechargeCurrency = "CNY" | "USDT";
type RecordTab = "recharge" | "funds";

type RechargeMethod = {
  id: RechargeMethodId;
  name: string;
  note: string;
  minAmount: number;
  currency: RechargeCurrency;
  feeRate: number;
  icon?: LucideIcon;
  iconSrc?: string;
};

const rechargeMethods: RechargeMethod[] = [
  {
    id: "alipay",
    name: "Alipay",
    note: "最低充值金额：¥20",
    minAmount: 20,
    currency: "CNY",
    feeRate: 0.03,
    iconSrc: "/assets/alipay-icon.jpg",
  },
  {
    id: "wxpay",
    name: "Wxpay",
    note: "最低充值金额：¥20",
    minAmount: 20,
    currency: "CNY",
    feeRate: 0.03,
    iconSrc: "/assets/wechat-pay-icon.jpg",
  },
  {
    id: "binance",
    name: "币安转账",
    note: "最低充值金额：3 USDT",
    minAmount: 3,
    currency: "USDT",
    feeRate: 0,
    iconSrc: "/assets/binance-pay-icon.jpg",
  },
  {
    id: "manual",
    name: "人工充值",
    note: "最低充值金额：¥1000",
    minAmount: 1000,
    currency: "CNY",
    feeRate: 0,
    icon: BadgeDollarSign,
  },
];

export default function AccountRechargeContent() {
  const [selectedMethodId, setSelectedMethodId] = useState<RechargeMethodId>("alipay");
  const [amountText, setAmountText] = useState("");
  const [activeRecordTab, setActiveRecordTab] = useState<RecordTab>("recharge");
  const selectedMethod =
    rechargeMethods.find((method) => method.id === selectedMethodId) ?? rechargeMethods[0];
  const amount = Number(amountText) || 0;
  const fee = amount * selectedMethod.feeRate;
  const total = amount + fee;
  const symbol = selectedMethod.currency === "USDT" ? "USDT" : "¥";
  const reachesMin = amount >= selectedMethod.minAmount;

  return (
    <PublicLayout contentClassName="h-[calc(100vh-86px)] max-w-none overflow-hidden px-4 py-3 md:px-6">
      <div className="grid h-full min-h-0 grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="grid h-full min-h-0 grid-rows-[minmax(0,1fr)_auto] gap-4">
          <Card className="min-h-0 overflow-hidden">
            <CardContent className="h-full min-h-0 p-4">
              <div className="h-full space-y-3 overflow-y-auto pr-2 text-sm leading-6">
                <div className="flex flex-col gap-1 md:flex-row md:items-end md:justify-between">
                  <h1 className="text-xl font-bold text-red-500">
                    充值金额区间20~1000RMB之间
                  </h1>
                  <p className="text-sm font-semibold text-foreground">
                    超出1000元请联系客服进行人工充值
                  </p>
                </div>
                <div className="grid gap-1.5 rounded-xl border border-red-100 bg-red-50/60 p-3 text-sm">
                  <p>请足额支付，否则无法到账</p>
                  <p className="font-semibold text-red-500">
                    充值属于虚拟金额，仅可在本站消费
                  </p>
                  <p className="font-semibold text-red-500">
                    无法提现，充值代表您同意此声明
                  </p>
                </div>

                <div className="rounded-xl border border-border bg-slate-50 p-3 text-sm">
                  <p className="font-semibold text-foreground">付款说明请仔细阅读！</p>
                  <ol className="mt-1.5 space-y-1 text-xs leading-5 text-muted-foreground">
                    <li>1. 如果无法刷出收款页面请关闭代理软件重试下！</li>
                    <li>2. 如果二维码收款上限无法支付，请关闭支付页面重新获取新的二维码！</li>
                    <li>3. 扫码支付成功后，等待1分钟，刷新网站页面，如果没有到账发送付款截图及用户名给在线客服</li>
                    <li className="font-semibold text-red-500">
                      4. 恶意退款者，会导致购买的商品出现问题，微信风控，概不负责
                    </li>
                    <li className="font-semibold text-primary">
                      5. 如遇到充值没到账，失败等情况请联系左下角联系客服
                    </li>
                  </ol>
                </div>

                <div className="rounded-xl border border-primary/15 bg-primary/5 p-3 text-sm">
                  <p className="text-muted-foreground">
                    支持 Alipay、Wxpay、币安转账、人工充值；Alipay / Wxpay 收取 3% 手续费，币安转账和人工充值无手续费。
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="shrink-0">
            <CardContent className="p-4">
              <h2 className="text-lg font-bold">账号充值</h2>
              <div className="mt-3 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
                {rechargeMethods.map((method) => {
                  const Icon = method.icon;
                  const selected = selectedMethod.id === method.id;

                  return (
                    <button
                      key={method.id}
                      type="button"
                      onClick={() => {
                        setSelectedMethodId(method.id);
                        setAmountText("");
                      }}
                      className={cn(
                        "rounded-lg border bg-slate-50 p-2.5 text-left transition-all duration-150 hover:scale-[1.015] hover:border-primary/35 hover:shadow-sm",
                        selected && "scale-[1.015] border-primary bg-primary/5 shadow-sm"
                      )}
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl bg-white p-0.5 shadow-sm ring-1 ring-border">
                          {method.iconSrc ? (
                            <img
                              src={method.iconSrc}
                              alt={method.name}
                              className="h-full w-full rounded-lg object-cover"
                            />
                          ) : Icon ? (
                            <Icon className="h-4 w-4 text-primary" />
                          ) : null}
                        </span>
                        <span className="text-sm font-semibold">{method.name}</span>
                      </div>
                      <p className="mt-3 text-xs text-muted-foreground">{method.note}</p>
                      <p className="mt-1 text-xs font-medium text-primary">
                        手续费：{formatFeeRate(method.feeRate)}
                      </p>
                    </button>
                  );
                })}
              </div>

              <div className="mt-4">
                <label className="mb-1.5 block text-sm font-medium">
                  <span className="text-red-500">*</span>金额
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted-foreground">
                    {symbol}
                  </span>
                  <Input
                    value={amountText}
                    onChange={(event) => setAmountText(event.target.value.replace(/[^\d.]/g, ""))}
                    placeholder={`请输入金额，最低 ${selectedMethod.minAmount} ${selectedMethod.currency}`}
                    className="h-10 pl-14"
                  />
                </div>
                {amount > 0 && !reachesMin ? (
                  <p className="mt-2 text-xs text-red-500">
                    当前方式最低充值金额为 {formatMoney(selectedMethod.minAmount, selectedMethod.currency)}。
                  </p>
                ) : null}
              </div>

              <div className="mt-4 flex flex-col gap-3 rounded-xl bg-slate-50 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-xs text-muted-foreground">
                  <div>充值金额：{formatMoney(amount, selectedMethod.currency)}</div>
                  <div>
                    手续费 {formatFeeRate(selectedMethod.feeRate)}：
                    {formatMoney(fee, selectedMethod.currency)}
                  </div>
                  <div className="mt-1 text-base font-bold text-primary">
                    总金额：{formatMoney(total, selectedMethod.currency)}
                  </div>
                </div>
                <Button className="h-10 min-w-36 rounded-lg text-sm" disabled={!reachesMin}>
                  支付
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="h-full min-h-0 xl:sticky xl:top-[94px]">
          <CardContent className="flex h-full min-h-0 flex-col p-5">
            <div className="flex shrink-0 gap-3">
              <Button
                className="h-11 flex-1 rounded-full px-5"
                variant={activeRecordTab === "recharge" ? "default" : "secondary"}
                onClick={() => setActiveRecordTab("recharge")}
              >
                充值记录
              </Button>
              <Button
                variant={activeRecordTab === "funds" ? "default" : "secondary"}
                className="h-11 flex-1 rounded-full px-5"
                onClick={() => setActiveRecordTab("funds")}
              >
                资金变动记录
              </Button>
            </div>

            <div className="mt-5 flex min-h-0 flex-1 flex-col gap-4">
              {activeRecordTab === "recharge" ? <RechargeRecordExample /> : <FundsRecordExample />}

              <div className="mt-auto rounded-xl bg-primary/5 p-4 text-xs leading-5 text-muted-foreground">
                后续接入登录后，这里的账号、充值订单号、到账状态和余额变动会跟随当前登录账号自动关联。
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </PublicLayout>
  );
}

function RechargeRecordExample() {
  return (
    <div className="rounded-xl bg-slate-50 p-4 text-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-semibold text-primary">
            Alipay（人民币自动充值）
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            订单号：RC202605210001
          </div>
        </div>
        <span className="rounded-full bg-green-50 px-2.5 py-1 text-xs font-medium text-green-600">
          已到账
        </span>
      </div>
      <div className="mt-4 grid gap-2 text-muted-foreground">
        <div>充值时间：2026-05-21 16:01:25</div>
        <div>
          充值金额：<span className="font-semibold text-primary">¥20.00</span>
        </div>
        <div>
          手续费：<span className="font-semibold text-primary">¥0.60</span>
        </div>
        <div>
          实付金额：<span className="font-semibold text-primary">¥20.60</span>
        </div>
      </div>
    </div>
  );
}

function FundsRecordExample() {
  return (
    <div className="rounded-xl border border-dashed border-border bg-white p-4 text-sm">
      <div className="font-semibold text-foreground">资金变动示例</div>
      <div className="mt-3 space-y-2 text-muted-foreground">
        <div>类型：账号余额充值</div>
        <div>
          变动：<span className="font-semibold text-green-600">+¥20.00</span>
        </div>
        <div>
          余额：<span className="font-semibold text-primary">¥20.00</span>
        </div>
        <div>记录时间：2026-05-21 16:01:28</div>
      </div>
    </div>
  );
}

function formatMoney(value: number, currency: RechargeCurrency) {
  if (currency === "USDT") return `${value.toFixed(2)} USDT`;
  return `¥${value.toFixed(2)}`;
}

function formatFeeRate(feeRate: number) {
  if (feeRate === 0) return "无";
  return `${Math.round(feeRate * 100)}%`;
}
