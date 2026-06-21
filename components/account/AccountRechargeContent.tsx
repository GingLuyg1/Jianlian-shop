"use client";

import { useState } from "react";
import PublicLayout from "@/components/layout/PublicLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type RechargeMethodId = "alipay" | "wxpay" | "binance";
type RechargeCurrency = "CNY" | "USDT";
type RecordTab = "recharge" | "funds";

type RechargeMethod = {
  id: RechargeMethodId;
  name: string;
  note: string;
  minAmount: number;
  maxAmount?: number;
  currency: RechargeCurrency;
  feeRate: number;
  iconSrc: string;
};

const rechargeMethods: RechargeMethod[] = [
  {
    id: "alipay",
    name: "Alipay",
    note: "最低充值金额：¥10",
    minAmount: 10,
    maxAmount: 1000,
    currency: "CNY",
    feeRate: 0.03,
    iconSrc: "/assets/alipay-icon.jpg",
  },
  {
    id: "wxpay",
    name: "Wxpay",
    note: "最低充值金额：¥10",
    minAmount: 10,
    maxAmount: 1000,
    currency: "CNY",
    feeRate: 0.03,
    iconSrc: "/assets/wechat-pay-icon.jpg",
  },
  {
    id: "binance",
    name: "币安转账",
    note: "最低充值金额：1 USDT",
    minAmount: 1,
    currency: "USDT",
    feeRate: 0,
    iconSrc: "/assets/binance-pay-icon.jpg",
  },
];

const reservedRechargeChannels = ["渠道预留", "渠道预留", "渠道预留"];

export default function AccountRechargeContent() {
  const [selectedMethodId, setSelectedMethodId] =
    useState<RechargeMethodId>("alipay");
  const [amountText, setAmountText] = useState("");
  const [activeRecordTab, setActiveRecordTab] =
    useState<RecordTab>("recharge");

  const selectedMethod =
    rechargeMethods.find((method) => method.id === selectedMethodId) ??
    rechargeMethods[0];
  const amount = Number(amountText) || 0;
  const fee = amount * selectedMethod.feeRate;
  const total = amount + fee;
  const symbol = selectedMethod.currency === "USDT" ? "USDT" : "¥";
  const reachesMin = amount >= selectedMethod.minAmount;
  const withinMax =
    !selectedMethod.maxAmount || amount <= selectedMethod.maxAmount;
  const canPay = amount > 0 && reachesMin && withinMax;

  const updateAmount = (value: string) => {
    const normalized = normalizeAmount(value);
    if (!normalized) {
      setAmountText("");
      return;
    }

    const numeric = Number(normalized);
    if (selectedMethod.maxAmount && numeric > selectedMethod.maxAmount) {
      setAmountText(String(selectedMethod.maxAmount));
      return;
    }

    setAmountText(normalized);
  };

  return (
    <PublicLayout contentClassName="max-w-none overflow-hidden px-4 py-3 md:px-6">
      <div className="mx-auto grid h-[calc(100dvh-87px)] max-w-[1500px] grid-cols-1 gap-4 overflow-hidden xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-4">
          <Card className="shrink-0">
            <CardContent className="grid gap-3 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(360px,0.8fr)]">
              <div className="rounded-xl border border-primary/15 bg-primary/5 p-4">
                <h2 className="text-lg font-bold">付款说明</h2>
                <ol className="mt-2 grid gap-1.5 text-sm leading-6 text-muted-foreground">
                  <li>1. 请足额支付，否则可能无法自动到账。</li>
                  <li>2. 二维码无法支付时，请刷新页面重新获取。</li>
                  <li>3. 支付成功后等待 1 分钟，再刷新页面查看余额。</li>
                  <li className="font-semibold text-primary">
                    4. 未到账、失败或金额异常时，请联系左下角在线客服。
                  </li>
                </ol>
              </div>
              <div className="rounded-xl border border-border bg-slate-50 p-4">
                <h3 className="font-semibold">支持方式</h3>
                <div className="mt-3 grid gap-2 text-sm text-muted-foreground">
                  <p>Alipay / Wxpay 收取 3% 手续费。</p>
                  <p>币安转账最低 1 USDT，免手续费。</p>
                  <p>充值成功后余额可用于站内商品下单。</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="min-h-0 overflow-hidden">
            <CardContent className="flex h-full min-h-0 flex-col p-4">
              <div className="shrink-0">
                <h2 className="text-xl font-bold">账号充值</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  选择充值方式并填写金额，支付后余额自动更新。
                </p>
              </div>

              <div className="mt-3 grid gap-2.5 sm:grid-cols-3">
                {rechargeMethods.map((method) => {
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
                        "rounded-xl border bg-slate-50 p-2.5 text-left transition-all duration-150 hover:scale-[1.01] hover:border-primary/35 hover:shadow-sm",
                        selected &&
                          "scale-[1.01] border-primary bg-primary/5 shadow-sm"
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <span className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl bg-white p-1 shadow-sm ring-1 ring-border">
                          <img
                            src={method.iconSrc}
                            alt={method.name}
                            className="h-full w-full rounded-lg object-cover"
                          />
                        </span>
                        <span className="font-semibold">{method.name}</span>
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {method.note}
                      </p>
                      <p className="mt-1 text-xs font-medium text-primary">
                        手续费：{formatFeeRate(method.feeRate)}
                      </p>
                    </button>
                  );
                })}
                {reservedRechargeChannels.map((label, index) => (
                  <div
                    key={`${label}-${index}`}
                    className="rounded-xl border border-dashed border-primary/20 bg-primary/5 p-2.5 text-left"
                  >
                    <div className="flex items-center gap-3">
                      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-lg font-semibold text-primary/45 shadow-sm ring-1 ring-border">
                        +
                      </span>
                      <span className="font-semibold text-muted-foreground">
                        {label}
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      后续新增支付方式
                    </p>
                    <p className="mt-1 text-xs font-medium text-primary/70">
                      待接入
                    </p>
                  </div>
                ))}
              </div>

              <div className="mt-auto border-t border-border/70 pt-5">
                <label className="mb-1.5 block text-sm font-medium">
                  <span className="text-red-500">*</span>金额
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted-foreground">
                    {symbol}
                  </span>
                  <Input
                    value={amountText}
                    inputMode="decimal"
                    onChange={(event) => updateAmount(event.target.value)}
                    placeholder={`请输入金额，最低 ${selectedMethod.minAmount} ${selectedMethod.currency}`}
                    className="h-11 pl-16"
                  />
                </div>
                {amount > 0 && !reachesMin ? (
                  <p className="mt-2 text-xs text-red-500">
                    当前方式最低充值金额为{" "}
                    {formatMoney(
                      selectedMethod.minAmount,
                      selectedMethod.currency
                    )}
                    。
                  </p>
                ) : null}

                <div className="mt-3 flex flex-col gap-3 rounded-xl bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-sm text-muted-foreground">
                    <div>
                      充值金额：{formatMoney(amount, selectedMethod.currency)}
                    </div>
                    <div>
                      手续费 {formatFeeRate(selectedMethod.feeRate)}：
                      {formatMoney(fee, selectedMethod.currency)}
                    </div>
                    <div className="mt-1 text-lg font-bold text-primary">
                      总金额：{formatMoney(total, selectedMethod.currency)}
                    </div>
                  </div>
                  <Button
                    className="h-11 min-w-40 rounded-lg"
                    disabled={!canPay}
                  >
                    支付
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="h-full min-h-0">
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
          </CardContent>
        </Card>
      </div>
    </PublicLayout>
  );
}

function normalizeAmount(value: string) {
  const cleaned = value.replace(/[^\d.]/g, "");
  const [integerPart, ...decimalParts] = cleaned.split(".");
  const decimal = decimalParts.join("").slice(0, 2);
  if (cleaned.includes(".")) return `${integerPart || "0"}.${decimal}`;
  return integerPart;
}

function formatMoney(value: number, currency: RechargeCurrency) {
  if (currency === "USDT") return `${value.toFixed(2)} USDT`;
  return `¥${value.toFixed(2)}`;
}

function formatFeeRate(feeRate: number) {
  if (feeRate === 0) return "无";
  return `${Math.round(feeRate * 100)}%`;
}
