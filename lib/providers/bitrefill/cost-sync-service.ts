import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/email/provider";
import {
  createBitrefillLiveClient,
  resolveBitrefillPackageUsdCost,
} from "./live-client.mjs";
import { loadLatestRechargeDailyRate } from "@/lib/payments/recharge-rate-service";

const ALERT_RECIPIENT =
  process.env.SUPPLIER_BALANCE_ALERT_EMAIL ||
  ["Gac000189", "gmail.com"].join("@");
const ALERT_COOLDOWN_MS = 30 * 60 * 1000;
const lastCostAlertAt = new Map<string, number>();

export type BitrefillCostAnomalyKind =
  | "COST_CAP_EXCEEDED"
  | "GLOBAL_LIMIT_EXCEEDED"
  | "MARGIN_NEGATIVE"
  | "PRICE_DRIFT_CIRCUIT_BREAKER"
  | "UPSTREAM_FETCH_FAILED";

export type BitrefillCostAnomaly = {
  kind: BitrefillCostAnomalyKind;
  skuId: string;
  skuTitle: string;
  supplierProductId: string;
  supplierSku: string;
  currentMaxUnitCostUsd: number | null;
  liveUsdCost: number | null;
  currentRetailCny: number;
  liveCostCny: number | null;
  detail: string;
};

export type BitrefillCostSyncItem = {
  skuId: string;
  productId: string;
  skuTitle: string;
  supplierProductId: string;
  supplierSku: string;
  currentMaxUnitCostUsd: number | null;
  recommendedMaxUnitCostUsd: number | null;
  liveUsdCost: number | null;
  currentRetailCny: number;
  recommendedRetailCny: number | null;
  updated: boolean;
  anomaly: BitrefillCostAnomalyKind | null;
  detail: string;
};

export type BitrefillPriceAdjustment = {
  skuId: string;
  productId: string;
  skuTitle: string;
  previousRetailCny: number;
  nextRetailCny: number;
  liveUsdCost: number;
  driftPercent: number;
};

export type BitrefillCostSyncReport = {
  mode: "dry_run" | "apply";
  updateRetailPrice: boolean;
  usdCnyRate: number;
  rateSource: string;
  capBufferPercent: number;
  markupPercent: number;
  maxPriceDriftPercent: number;
  scannedSkus: number;
  updatedSkus: number;
  retailUpdatedSkus: number;
  anomalyCount: number;
  emailAlertSent: boolean;
  priceReportSent: boolean;
  anomalies: BitrefillCostAnomaly[];
  priceAdjustments: BitrefillPriceAdjustment[];
  items: BitrefillCostSyncItem[];
  checkedAt: string;
};

export async function notifyBitrefillCostAnomaly(input: {
  reason: string;
  usdCnyRate?: number;
  anomalies: BitrefillCostAnomaly[];
  orderId?: string | null;
}): Promise<boolean> {
  if (!input.anomalies.length) return false;
  try {
    const key = `bitrefill_cost:${input.orderId ? `order:${input.orderId}` : "sync"}`;
    const now = Date.now();
    const prev = lastCostAlertAt.get(key) ?? 0;
    if (now - prev < ALERT_COOLDOWN_MS) return false;
    lastCostAlertAt.set(key, now);

    const timeDisplay = new Date(now).toLocaleString("zh-CN", {
      timeZone: "Asia/Shanghai",
      hour12: false,
    });
    const rowsHtml = input.anomalies
      .slice(0, 25)
      .map(
        (item) =>
          `<tr>
            <td style="padding:6px 8px;border-bottom:1px solid #f0e4d7;">${escapeHtml(item.skuTitle)}</td>
            <td style="padding:6px 8px;border-bottom:1px solid #f0e4d7;"><code>${escapeHtml(item.kind)}</code></td>
            <td style="padding:6px 8px;border-bottom:1px solid #f0e4d7;">${item.liveUsdCost != null ? `$${item.liveUsdCost.toFixed(2)}` : "—"} / 上限 ${item.currentMaxUnitCostUsd != null ? `$${item.currentMaxUnitCostUsd.toFixed(2)}` : "未设"}</td>
            <td style="padding:6px 8px;border-bottom:1px solid #f0e4d7;">¥${item.currentRetailCny.toFixed(2)}</td>
          </tr>`
      )
      .join("");

    const subject = `【Jianlian Shop 成本风控告警】Bitrefill 发现 ${input.anomalies.length} 项成本/汇率异常`;
    const html = `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:660px;margin:0 auto;padding:24px;border:1px solid #f0e4d7;border-radius:14px;background:#fffcf8;color:#1f2329;">
        <h2 style="margin:0 0 12px;font-size:18px;color:#c2571a;">⚠️ Bitrefill 实时汇率 / 成本风控告警</h2>
        <p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:#4e5969;">
          触发原因：<strong>${escapeHtml(input.reason)}</strong>${input.usdCnyRate ? ` · 参考汇率：1 USD = ¥${input.usdCnyRate.toFixed(2)}` : ""}${input.orderId ? ` · 订单：<code>${escapeHtml(input.orderId)}</code>` : ""}
        </p>
        <table style="width:100%;border-collapse:collapse;background:#fff;border:1px solid #f2e8dc;font-size:12px;">
          <thead>
            <tr style="background:#fff5eb;text-align:left;">
              <th style="padding:8px;">SKU</th>
              <th style="padding:8px;">异常类型</th>
              <th style="padding:8px;">实时成本 / 风控上限</th>
              <th style="padding:8px;">当前售价</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
        <p style="margin:14px 0 0;font-size:12px;color:#86909c;">
          检测时间：${timeDisplay}（北京时间）。可在后台「供应商管理 → Bitrefill」一键同步最新成本上限与售价，防止自动发卡被 <code>supplier_max_unit_cost</code> 拦截。
        </p>
      </div>
    `;
    const text = [
      subject,
      `触发原因：${input.reason}`,
      ...input.anomalies.slice(0, 25).map(
        (item) => `- ${item.skuTitle} [${item.kind}] liveUsd=${item.liveUsdCost ?? "N/A"} capUsd=${item.currentMaxUnitCostUsd ?? "N/A"} retailCny=¥${item.currentRetailCny.toFixed(2)} (${item.detail})`
      ),
      `检测时间：${timeDisplay}`,
    ].join("\n");

    await sendEmail({
      to: ALERT_RECIPIENT,
      subject,
      html,
      text,
      templateCode: "admin_system_alert",
      businessType: "admin",
      businessId: input.orderId ?? null,
      idempotencyKey: `bitrefill-cost-alert:${Math.floor(now / ALERT_COOLDOWN_MS)}:${input.anomalies.length}`,
    });
    return true;
  } catch (err) {
    console.error("[BitrefillCostSync] alert email failed", err);
    return false;
  }
}

export async function notifyBitrefillPriceSyncSummary(input: {
  usdCnyRate: number;
  markupPercent: number;
  maxPriceDriftPercent: number;
  adjustments: BitrefillPriceAdjustment[];
  anomalyCount: number;
}): Promise<boolean> {
  if (!input.adjustments.length) return false;
  try {
    const now = Date.now();
    const timeDisplay = new Date(now).toLocaleString("zh-CN", {
      timeZone: "Asia/Shanghai",
      hour12: false,
    });
    const rowsHtml = input.adjustments
      .slice(0, 40)
      .map((item) => {
        const direction = item.nextRetailCny > item.previousRetailCny ? "↑ 上浮" : "↓ 下调";
        const color = item.nextRetailCny > item.previousRetailCny ? "#c2571a" : "#15803d";
        return `<tr>
          <td style="padding:6px 8px;border-bottom:1px solid #f0e4d7;">${escapeHtml(item.skuTitle)}</td>
          <td style="padding:6px 8px;border-bottom:1px solid #f0e4d7;">$${item.liveUsdCost.toFixed(2)}</td>
          <td style="padding:6px 8px;border-bottom:1px solid #f0e4d7;">¥${item.previousRetailCny.toFixed(2)} → <strong style="color:${color};">¥${item.nextRetailCny.toFixed(2)}</strong></td>
          <td style="padding:6px 8px;border-bottom:1px solid #f0e4d7;color:${color};">${direction} ${Math.abs(item.driftPercent).toFixed(1)}%</td>
        </tr>`;
      })
      .join("");

    const subject = `【Jianlian Shop 售价联动简报】Bitrefill 本次自动联动调价 ${input.adjustments.length} 个 SKU`;
    const html = `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:680px;margin:0 auto;padding:24px;border:1px solid #e7edf5;border-radius:14px;background:#fafcff;color:#1f2329;">
        <h2 style="margin:0 0 12px;font-size:18px;color:#0f4c81;">Bitrefill 价格自动联动调价简报</h2>
        <p style="margin:0 0 12px;font-size:13px;line-height:1.6;color:#4e5969;">
          参考汇率：<strong>1 USD = ¥${input.usdCnyRate.toFixed(2)}</strong> · 加价规则：<strong>+${input.markupPercent}%</strong> · 单次熔断阈值：<strong>±${input.maxPriceDriftPercent}%</strong>${input.anomalyCount > 0 ? ` · 另有 <strong>${input.anomalyCount}</strong> 项异常已拦截跳过` : ""}
        </p>
        <table style="width:100%;border-collapse:collapse;background:#fff;border:1px solid #e5ebf3;font-size:12px;">
          <thead>
            <tr style="background:#f3f7fc;text-align:left;">
              <th style="padding:8px;">SKU</th>
              <th style="padding:8px;">实时成本</th>
              <th style="padding:8px;">售价变更</th>
              <th style="padding:8px;">变动幅度</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
        <p style="margin:14px 0 0;font-size:12px;color:#86909c;">执行时间：${timeDisplay}（北京时间）。</p>
      </div>
    `;
    const text = [
      subject,
      `汇率：1 USD = ¥${input.usdCnyRate.toFixed(2)}，加价率：+${input.markupPercent}%，熔断：±${input.maxPriceDriftPercent}%`,
      ...input.adjustments.slice(0, 40).map(
        (item) => `- ${item.skuTitle}: ¥${item.previousRetailCny.toFixed(2)} -> ¥${item.nextRetailCny.toFixed(2)} (${item.driftPercent >= 0 ? "+" : ""}${item.driftPercent.toFixed(1)}%, live $${item.liveUsdCost.toFixed(2)})`
      ),
      `执行时间：${timeDisplay}`,
    ].join("\n");

    await sendEmail({
      to: ALERT_RECIPIENT,
      subject,
      html,
      text,
      templateCode: "admin_system_alert",
      businessType: "admin",
      businessId: null,
      idempotencyKey: `bitrefill-price-sync:${Math.floor(now / (10 * 60 * 1000))}:${input.adjustments.length}`,
    });
    return true;
  } catch (err) {
    console.error("[BitrefillCostSync] price summary email failed", err);
    return false;
  }
}

export async function syncBitrefillCostsAndRates(
  service: SupabaseClient,
  options: {
    mode?: "dry_run" | "apply";
    updateRetailPrice?: boolean;
    capBufferPercent?: number;
    markupPercent?: number;
    maxPriceDriftPercent?: number;
    notifyOnAnomaly?: boolean;
  } = {},
  env: NodeJS.ProcessEnv = process.env
): Promise<BitrefillCostSyncReport> {
  const mode = options.mode === "apply" ? "apply" : "dry_run";
  const updateRetailPrice = Boolean(options.updateRetailPrice);
  const capBufferPercent = clampNumber(options.capBufferPercent, 5, 0, 30);
  const markupPercent = clampNumber(options.markupPercent, 10, 0, 100);
  const maxPriceDriftPercent = clampNumber(options.maxPriceDriftPercent, 15, 1, 50);
  const notifyOnAnomaly = options.notifyOnAnomaly !== false;

  let usdCnyRate = Number(env.BITREFILL_USD_CNY_RATE ?? env.CNY_USDT_FIXED_RATE ?? 7.0);
  let rateSource = "env_fallback";
  try {
    const dailyRate = await loadLatestRechargeDailyRate(service);
    const parsedMarket = Number(dailyRate?.market_rate ?? 0);
    if (Number.isFinite(parsedMarket) && parsedMarket > 0) {
      usdCnyRate = parsedMarket;
      rateSource = `daily_rate:${dailyRate?.effective_date ?? "latest"}`;
    }
  } catch {
    // Keep env fallback when daily rate table is unavailable
  }
  if (!Number.isFinite(usdCnyRate) || usdCnyRate <= 0) usdCnyRate = 7.0;

  const skus: Array<{
    id: string;
    product_id: string;
    sku_title: string | null;
    sku_code: string | null;
    price: number | string | null;
    status: string | null;
    metadata: Record<string, unknown> | null;
  }> = [];
  for (let offset = 0; offset < 10000; offset += 1000) {
    const { data: batch, error: skuError } = await service
      .from("product_skus")
      .select("id,product_id,sku_title,sku_code,price,status,metadata")
      .eq("status", "active")
      .contains("metadata", { supplier: "bitrefill" })
      .order("id", { ascending: true })
      .range(offset, offset + 999);
    if (skuError) throw new Error(skuError.message || JSON.stringify(skuError));
    const rows = (batch ?? []) as typeof skus;
    skus.push(...rows);
    if (rows.length < 1000) break;
  }

  const bitrefillSkus = (skus ?? []).filter((row) => {
    const meta = row.metadata as Record<string, unknown> | null;
    return meta && String(meta.supplier ?? "").trim() === "bitrefill";
  });

  const apiKey = String(env.BITREFILL_API_KEY ?? "").trim();
  if (!apiKey) {
    throw new Error("BITREFILL_API_KEY_NOT_CONFIGURED");
  }
  const client = createBitrefillLiveClient({ apiKey });
  const detailCache = new Map<string, { detail?: Record<string, unknown>; error?: string }>();
  const items: BitrefillCostSyncItem[] = [];
  const anomalies: BitrefillCostAnomaly[] = [];
  const priceAdjustments: BitrefillPriceAdjustment[] = [];
  const affectedProductIds = new Set<string>();
  let updatedSkus = 0;
  let retailUpdatedSkus = 0;

  for (const row of bitrefillSkus) {
    const meta = (row.metadata && typeof row.metadata === "object" ? row.metadata : {}) as Record<string, unknown>;
    const supplierProductId = String(meta.supplier_product_id ?? "").trim();
    const supplierSku = String(meta.supplier_sku ?? "").trim();
    const skuTitle = String(row.sku_title ?? row.sku_code ?? row.id);
    const currentRetailCny = Number(row.price ?? 0);
    const currentMaxUnitCostUsd =
      meta.supplier_max_unit_cost != null && Number.isFinite(Number(meta.supplier_max_unit_cost))
        ? Number(meta.supplier_max_unit_cost)
        : null;

    if (!supplierProductId || !supplierSku) continue;

    if (!detailCache.has(supplierProductId)) {
      if (detailCache.size > 0) {
        await sleepMs(220);
      }
      let fetchedDetail: Record<string, unknown> | undefined;
      let lastErrMsg: string | undefined;
      for (let attempt = 0; attempt <= 3; attempt += 1) {
        try {
          const detail = await client.getProductDetail(supplierProductId);
          fetchedDetail = detail as Record<string, unknown>;
          lastErrMsg = undefined;
          break;
        } catch (err) {
          lastErrMsg = err instanceof Error ? err.message : String(err);
          const isRateLimited = /429|rate|too many/i.test(lastErrMsg);
          if (!isRateLimited || attempt === 3) break;
          await sleepMs(800 * (attempt + 1) + attempt * 500);
        }
      }
      detailCache.set(
        supplierProductId,
        fetchedDetail ? { detail: fetchedDetail } : { error: lastErrMsg ?? "upstream detail unavailable" }
      );
    }

    const cached = detailCache.get(supplierProductId)!;
    if (!cached.detail || cached.error) {
      const detailText = cached.error ?? "upstream detail unavailable";
      anomalies.push({
        kind: "UPSTREAM_FETCH_FAILED",
        skuId: String(row.id),
        skuTitle,
        supplierProductId,
        supplierSku,
        currentMaxUnitCostUsd,
        liveUsdCost: null,
        currentRetailCny,
        liveCostCny: null,
        detail: detailText,
      });
      items.push({
        skuId: String(row.id),
        productId: String(row.product_id),
        skuTitle,
        supplierProductId,
        supplierSku,
        currentMaxUnitCostUsd,
        recommendedMaxUnitCostUsd: null,
        liveUsdCost: null,
        currentRetailCny,
        recommendedRetailCny: null,
        updated: false,
        anomaly: "UPSTREAM_FETCH_FAILED",
        detail: detailText,
      });
      continue;
    }

    let liveUsdCost: number;
    try {
      liveUsdCost = resolveBitrefillPackageUsdCost(cached.detail, supplierSku);
    } catch (err) {
      const detailText = err instanceof Error ? err.message : String(err);
      anomalies.push({
        kind: "UPSTREAM_FETCH_FAILED",
        skuId: String(row.id),
        skuTitle,
        supplierProductId,
        supplierSku,
        currentMaxUnitCostUsd,
        liveUsdCost: null,
        currentRetailCny,
        liveCostCny: null,
        detail: detailText,
      });
      items.push({
        skuId: String(row.id),
        productId: String(row.product_id),
        skuTitle,
        supplierProductId,
        supplierSku,
        currentMaxUnitCostUsd,
        recommendedMaxUnitCostUsd: null,
        liveUsdCost: null,
        currentRetailCny,
        recommendedRetailCny: null,
        updated: false,
        anomaly: "UPSTREAM_FETCH_FAILED",
        detail: detailText,
      });
      continue;
    }

    const recommendedMaxUnitCostUsd = Math.ceil(liveUsdCost * (1 + capBufferPercent / 100) * 100) / 100;
    const liveCostCny = Math.round(liveUsdCost * usdCnyRate * 100) / 100;
    const recommendedRetailCny = Math.round(liveCostCny * (1 + markupPercent / 100) * 100) / 100;
    const rawDriftPercent =
      currentRetailCny > 0
        ? ((recommendedRetailCny - currentRetailCny) / currentRetailCny) * 100
        : 0;
    const circuitBreakerTriggered =
      updateRetailPrice &&
      currentRetailCny > 0 &&
      Math.abs(rawDriftPercent) > maxPriceDriftPercent;

    let anomaly: BitrefillCostAnomalyKind | null = null;
    let detailText = "ok";
    if (circuitBreakerTriggered) {
      anomaly = "PRICE_DRIFT_CIRCUIT_BREAKER";
      detailText = `建议售价 ¥${recommendedRetailCny.toFixed(2)} 相对现价 ¥${currentRetailCny.toFixed(2)} 变动 ${rawDriftPercent >= 0 ? "+" : ""}${rawDriftPercent.toFixed(1)}%，超过 ±${maxPriceDriftPercent}% 熔断阈值，已跳过自动改价`;
    } else if (currentMaxUnitCostUsd !== null && liveUsdCost > currentMaxUnitCostUsd) {
      anomaly = "COST_CAP_EXCEEDED";
      detailText = `实时成本 $${liveUsdCost.toFixed(2)} 已高于风控上限 $${currentMaxUnitCostUsd.toFixed(2)}`;
    } else if (currentRetailCny > 0 && currentRetailCny < liveCostCny) {
      anomaly = "MARGIN_NEGATIVE";
      detailText = `当前售价 ¥${currentRetailCny.toFixed(2)} 低于折算成本 ¥${liveCostCny.toFixed(2)}`;
    }

    if (anomaly) {
      anomalies.push({
        kind: anomaly,
        skuId: String(row.id),
        skuTitle,
        supplierProductId,
        supplierSku,
        currentMaxUnitCostUsd,
        liveUsdCost,
        currentRetailCny,
        liveCostCny,
        detail: detailText,
      });
    }

    let updated = false;
    const capNeedsUpdate =
      currentMaxUnitCostUsd === null || Math.abs(recommendedMaxUnitCostUsd - currentMaxUnitCostUsd) >= 0.01;
    const retailNeedsUpdate =
      updateRetailPrice &&
      !circuitBreakerTriggered &&
      recommendedRetailCny > 0 &&
      Math.abs(recommendedRetailCny - currentRetailCny) >= 0.01;

    if (mode === "apply" && (capNeedsUpdate || retailNeedsUpdate)) {
      const nextMetadata: Record<string, unknown> = {
        ...meta,
        supplier_max_unit_cost: recommendedMaxUnitCostUsd,
        supplier_last_synced_usd_cost: liveUsdCost,
        supplier_last_synced_cost_cny: liveCostCny,
        supplier_last_synced_rate: usdCnyRate,
        supplier_last_synced_at: new Date().toISOString(),
      };
      const patch: Record<string, unknown> = {
        metadata: nextMetadata,
        updated_at: new Date().toISOString(),
      };
      if (retailNeedsUpdate) {
        nextMetadata.supplier_previous_retail_cny = currentRetailCny;
        nextMetadata.supplier_markup_percent = markupPercent;
        nextMetadata.supplier_retail_synced_at = new Date().toISOString();
        patch.price = recommendedRetailCny;
      }
      const { error: updateErr } = await service.from("product_skus").update(patch).eq("id", row.id);
      if (!updateErr) {
        updated = true;
        updatedSkus += 1;
        if (retailNeedsUpdate) {
          retailUpdatedSkus += 1;
          affectedProductIds.add(String(row.product_id));
          priceAdjustments.push({
            skuId: String(row.id),
            productId: String(row.product_id),
            skuTitle,
            previousRetailCny: currentRetailCny,
            nextRetailCny: recommendedRetailCny,
            liveUsdCost,
            driftPercent: Math.round(rawDriftPercent * 10) / 10,
          });
        }
      }
    }

    items.push({
      skuId: String(row.id),
      productId: String(row.product_id),
      skuTitle,
      supplierProductId,
      supplierSku,
      currentMaxUnitCostUsd,
      recommendedMaxUnitCostUsd,
      liveUsdCost,
      currentRetailCny,
      recommendedRetailCny,
      updated,
      anomaly,
      detail: detailText,
    });
  }

  // Sync parent product display price to minimum active SKU price for affected products
  if (mode === "apply" && affectedProductIds.size > 0) {
    for (const productId of Array.from(affectedProductIds)) {
      try {
        const { data: productSkus } = await service
          .from("product_skus")
          .select("price")
          .eq("product_id", productId)
          .eq("status", "active");
        const prices = (productSkus ?? [])
          .map((s) => Number((s as { price?: unknown }).price ?? 0))
          .filter((p) => Number.isFinite(p) && p > 0);
        if (prices.length > 0) {
          const minPrice = Math.min(...prices);
          await service
            .from("products")
            .update({ price: minPrice, updated_at: new Date().toISOString() })
            .eq("id", productId);
        }
      } catch {
        // Keep SKU updates intact even if parent display price sync fails
      }
    }
  }

  let emailAlertSent = false;
  if (notifyOnAnomaly && anomalies.length > 0) {
    emailAlertSent = await notifyBitrefillCostAnomaly({
      reason: mode === "apply" ? "Bitrefill 成本/售价联动同步发现异常" : "Bitrefill 定时/手动成本巡检发现异常",
      usdCnyRate,
      anomalies,
    });
  }

  let priceReportSent = false;
  if (mode === "apply" && priceAdjustments.length > 0) {
    priceReportSent = await notifyBitrefillPriceSyncSummary({
      usdCnyRate,
      markupPercent,
      maxPriceDriftPercent,
      adjustments: priceAdjustments,
      anomalyCount: anomalies.length,
    });
  }

  return {
    mode,
    updateRetailPrice,
    usdCnyRate,
    rateSource,
    capBufferPercent,
    markupPercent,
    maxPriceDriftPercent,
    scannedSkus: bitrefillSkus.length,
    updatedSkus,
    retailUpdatedSkus,
    anomalyCount: anomalies.length,
    emailAlertSent,
    priceReportSent,
    anomalies,
    priceAdjustments,
    items,
    checkedAt: new Date().toISOString(),
  };
}

function sleepMs(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clampNumber(value: unknown, fallback: number, min: number, max: number) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, num));
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
