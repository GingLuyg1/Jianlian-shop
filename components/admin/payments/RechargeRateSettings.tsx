"use client";

import { useEffect, useState } from "react";
import { ArrowRightLeft, CheckCircle2, Lock, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Rate = {
  effectiveDate: string;
  marketRate: string;
  settlementRate: string;
  source: string;
};

function formatRateSource(raw: string): { label: string; detail: string | null } {
  const value = (raw || "").trim();
  if (!value || value === "manual_market_reference") {
    return { label: "手动录入参考价", detail: null };
  }
  if (value.startsWith("auto-noon-next-day:")) {
    const body = value.slice("auto-noon-next-day:".length);
    const parts = Object.fromEntries(
      body
        .split(";")
        .map((chunk) => chunk.split("="))
        .filter((pair) => pair.length === 2)
        .map(([k, v]) => [k.trim(), v.trim()]),
    );
    const cg = parts.CG ? `CoinGecko ${Number(parts.CG).toFixed(4).replace(/\.?0+$/, "")}` : null;
    const cb = parts.CB ? `Coinbase ${Number(parts.CB).toFixed(4).replace(/\.?0+$/, "")}` : null;
    const lower = parts.lower ? `取低值 ${parts.lower}` : null;
    const diff = parts.diff ? `价差 ${parts.diff}` : null;
    const pieces = [cg, cb].filter(Boolean).join(" · ");
    const meta = [lower, diff].filter(Boolean).join("，");
    const detail = [pieces, meta ? `（${meta}）` : ""].filter(Boolean).join(" ");
    return { label: "系统午间自动同步", detail: detail || body };
  }
  return { label: value, detail: null };
}

export default function RechargeRateSettings() {
  const [effectiveDate, setEffectiveDate] = useState("");
  const [marketRate, setMarketRate] = useState("");
  const [source, setSource] = useState("手动参考市场价");
  const [current, setCurrent] = useState<Rate | null>(null);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void fetch("/api/admin/recharge-rates", { cache: "no-store" })
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as {
          rate?: Rate | null;
          effectiveDate?: string;
          error?: string;
        } | null;
        if (!response.ok) throw new Error(payload?.error ?? "汇率读取失败");
        setCurrent(payload?.rate ?? null);
        setEffectiveDate(payload?.effectiveDate ?? "");
      })
      .catch((error) => setMessage(error instanceof Error ? error.message : "汇率读取失败"));
  }, []);

  async function save() {
    if (saving) return;
    const numericRate = Number(marketRate);
    if (!effectiveDate.trim() || !Number.isFinite(numericRate) || numericRate <= 0) {
      toast.error("请填写有效的生效日期和市场参考汇率");
      return;
    }
    const settlementPreview = (Math.floor(numericRate * 10) / 10).toFixed(1);
    const anomalyWarning =
      numericRate < 5.0 || numericRate > 10.0
        ? "\n\n【高危异常提醒】当前输入汇率偏离常规 USDT/CNY 区间（5.0 ~ 10.0），请务必再次核对是否输错小数点！"
        : "";
    const confirmed = window.confirm(
      `确认锁定 ${effectiveDate} 的每日 USDT/CNY 充值汇率？\n市场参考价：${marketRate}\n预计结算价：1 USDT = ¥${settlementPreview}\n注意：每天仅允许保存一次，锁定后当日不可再次修改。${anomalyWarning}`
    );
    if (!confirmed) return;

    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/recharge-rates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ effectiveDate, marketRate, source }),
      });
      const payload = (await response.json().catch(() => null)) as { rate?: Rate; error?: string } | null;
      if (!response.ok || !payload?.rate) throw new Error(payload?.error ?? "汇率保存失败");
      setCurrent(payload.rate);
      toast.success("今日充值汇率已保存；已创建的充值单不会受后续汇率变化影响。");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "汇率保存失败");
    } finally {
      setSaving(false);
    }
  }

  const parsedSource = current ? formatRateSource(current.source) : null;
  const previewRate = (() => {
    const parsed = Number(marketRate);
    return Number.isFinite(parsed) && parsed > 0 ? (Math.floor(parsed * 10) / 10).toFixed(1) : null;
  })();

  return (
    <section className="mb-5 rounded-xl border border-sky-200/80 bg-gradient-to-br from-sky-50/80 via-white to-blue-50/40 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-100 text-sky-700">
            <ArrowRightLeft className="h-4 w-4" />
          </span>
          <div>
            <h3 className="text-sm font-semibold text-slate-900">每日 USDT / CNY 充值汇率</h3>
            <p className="mt-0.5 text-xs text-slate-500">
              每日仅允许锁定一次，结算价由服务端将市场参考价向下截取至小数点后 1 位。
            </p>
          </div>
        </div>
        {current ? (
          <Badge variant="outline" className="gap-1 border-emerald-200 bg-emerald-50 text-emerald-700">
            <CheckCircle2 className="h-3.5 w-3.5" />
            今日已锁定
          </Badge>
        ) : (
          <Badge variant="outline" className="gap-1 border-amber-200 bg-amber-50 text-amber-700">
            <RefreshCw className="h-3 w-3" />
            待设置今日汇率
          </Badge>
        )}
      </div>

      {current ? (
        <div className="mt-4 grid gap-3 rounded-xl border border-sky-100 bg-white p-4 sm:grid-cols-3">
          <div>
            <div className="text-[11px] font-medium text-slate-500">生效日期 / 结算汇率</div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-lg font-bold tabular-nums text-slate-950">1 USDT = ¥{current.settlementRate}</span>
              <span className="text-xs text-slate-400">{current.effectiveDate}</span>
            </div>
          </div>
          <div>
            <div className="text-[11px] font-medium text-slate-500">原始市场参考价</div>
            <div className="mt-1 text-base font-semibold tabular-nums text-slate-800">{current.marketRate}</div>
          </div>
          <div>
            <div className="text-[11px] font-medium text-slate-500">采集来源</div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <Badge variant="secondary" className="bg-sky-50 text-xs font-medium text-sky-700 hover:bg-sky-50">
                {parsedSource?.label}
              </Badge>
            </div>
            {parsedSource?.detail ? (
              <div className="mt-1 text-[11px] leading-relaxed text-slate-500">{parsedSource.detail}</div>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="mt-4 rounded-xl border border-slate-200/80 bg-white p-4">
          <div className="grid gap-3 md:grid-cols-3">
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-slate-600">生效日期</span>
              <Input type="date" value={effectiveDate} onChange={(event) => setEffectiveDate(event.target.value)} />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-slate-600">市场参考价（CNY）</span>
              <Input
                value={marketRate}
                inputMode="decimal"
                placeholder="例如 6.74"
                onChange={(event) => setMarketRate(event.target.value)}
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-slate-600">来源备注</span>
              <Input
                value={source}
                maxLength={120}
                placeholder="例如 手动参考市场价"
                onChange={(event) => setSource(event.target.value)}
              />
            </label>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs text-slate-500">
              {previewRate ? (
                <>
                  预计锁定结算价：<span className="font-semibold text-slate-900">1 USDT = ¥{previewRate}</span>
                </>
              ) : (
                "输入市场参考价后将自动预览向下截断的结算价。"
              )}
            </div>
            <Button disabled={saving} onClick={() => void save()} size="sm">
              {saving ? "保存中..." : "保存并锁定今日汇率"}
            </Button>
          </div>
        </div>
      )}

      {current ? (
        <div className="mt-3 flex items-center gap-1.5 text-xs text-slate-500">
          <Lock className="h-3.5 w-3.5 text-slate-400" />
          今日汇率已生效并锁定；如需调整仅可在次日生效（已创建的充值单不受后续汇率影响）。
        </div>
      ) : null}

      {message ? <p className="mt-2 text-xs text-amber-700">{message}</p> : null}
    </section>
  );
}
