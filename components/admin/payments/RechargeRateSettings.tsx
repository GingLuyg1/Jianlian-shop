"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Rate = {
  effectiveDate: string;
  marketRate: string;
  settlementRate: string;
  source: string;
};

export default function RechargeRateSettings() {
  const [effectiveDate, setEffectiveDate] = useState("");
  const [marketRate, setMarketRate] = useState("");
  const [source, setSource] = useState("manual_market_reference");
  const [current, setCurrent] = useState<Rate | null>(null);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void fetch("/api/admin/recharge-rates", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json().catch(() => null) as { rate?: Rate | null; effectiveDate?: string; error?: string } | null;
        if (!response.ok) throw new Error(payload?.error ?? "汇率读取失败");
        setCurrent(payload?.rate ?? null);
        setEffectiveDate(payload?.effectiveDate ?? "");
      })
      .catch((error) => setMessage(error instanceof Error ? error.message : "汇率读取失败"));
  }, []);

  async function save() {
    if (saving) return;
    setSaving(true); setMessage("");
    try {
      const response = await fetch("/api/admin/recharge-rates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ effectiveDate, marketRate, source }),
      });
      const payload = await response.json().catch(() => null) as { rate?: Rate; error?: string } | null;
      if (!response.ok || !payload?.rate) throw new Error(payload?.error ?? "汇率保存失败");
      setCurrent(payload.rate);
      setMessage("今日充值汇率已保存；已创建的充值单不会受后续汇率变化影响。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "汇率保存失败");
    } finally { setSaving(false); }
  }

  return (
    <section className="mb-5 rounded-xl border border-sky-200 bg-sky-50/60 p-4">
      <h3 className="font-semibold text-slate-900">每日 USDT/CNY 充值汇率</h3>
      <p className="mt-1 text-xs text-slate-600">每天仅允许保存一次。结算汇率由服务端把市场参考价向下截取到小数点后 1 位。</p>
      {current ? (
        <div className="mt-3 rounded-lg bg-white p-3 text-sm">
          {current.effectiveDate}：市场参考价 {current.marketRate}，充值结算价 1 USDT = ¥{current.settlementRate}（{current.source}）
        </div>
      ) : null}
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <Input type="date" value={effectiveDate} onChange={(event) => setEffectiveDate(event.target.value)} />
        <Input value={marketRate} inputMode="decimal" placeholder="市场参考价，例如 6.74" onChange={(event) => setMarketRate(event.target.value)} />
        <Input value={source} maxLength={120} placeholder="汇率来源说明" onChange={(event) => setSource(event.target.value)} />
      </div>
      {message ? <p className="mt-2 text-xs text-slate-700">{message}</p> : null}
      <Button className="mt-3" disabled={saving || Boolean(current)} onClick={() => void save()}>{saving ? "保存中..." : current ? "今日汇率已锁定" : "保存今日汇率"}</Button>
    </section>
  );
}
