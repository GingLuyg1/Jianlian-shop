// Server-only live Bitrefill client: MCP balance/pricing/purchase + REST invoice/order delivery.
import { BITREFILL_API_BASE_URL, buildBitrefillAuthorization } from "./client-core.mjs";

const MCP_ENDPOINT = "https://api.bitrefill.com/mcp";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function extractMcpText(rawBody) {
  const trimmed = String(rawBody ?? "").trim();
  let jsonStr = trimmed;
  if (!trimmed.startsWith("{")) {
    const dataLine = trimmed.split(/\r?\n/).find((line) => line.startsWith("data: "));
    if (!dataLine) throw new Error("BITREFILL_MCP_RESPONSE_INVALID");
    jsonStr = dataLine.slice(6).trim();
  }
  const parsed = JSON.parse(jsonStr);
  if (parsed?.error) {
    throw new Error(`BITREFILL_MCP_RPC_ERROR:${String(parsed.error.code ?? "UNKNOWN")}`);
  }
  const result = parsed?.result;
  const text = result?.content?.[0]?.text;
  if (typeof text !== "string") throw new Error("BITREFILL_MCP_TEXT_MISSING");
  return { text, isError: Boolean(result?.isError) };
}

export function parseBitrefillMcpUsdBalance(text) {
  const lines = String(text ?? "").split(/\r?\n/);
  let inBalances = false;
  let current = null;
  const wallets = [];
  for (const line of lines) {
    if (!inBalances) {
      if (/^balances\[\d+\]:\s*$/.test(line)) inBalances = true;
      continue;
    }
    if (/^\S/.test(line)) break;
    const methodMatch = /^  - payment_method: (balance|cashback)\s*$/.exec(line);
    if (methodMatch) {
      current = { paymentMethod: methodMatch[1] };
      wallets.push(current);
      continue;
    }
    const fieldMatch = /^    (balance_currency|amount|amount_base|decimals): (.+?)\s*$/.exec(line);
    if (current && fieldMatch) {
      let val = fieldMatch[2];
      if (val.startsWith('"')) {
        try { val = JSON.parse(val); } catch {}
      }
      current[fieldMatch[1]] = val;
    }
  }
  const usdWallet = wallets.find(
    (w) => w.paymentMethod === "balance" && w.balance_currency === "USD"
  );
  if (!usdWallet) {
    return { availableUsd: 0, amountText: "0.00", amountBase: 0, decimals: 2 };
  }
  const availableUsd = Number(usdWallet.amount);
  const amountBase = Number(usdWallet.amount_base ?? Math.round(availableUsd * 100));
  if (!Number.isFinite(availableUsd) || availableUsd < 0) {
    throw new Error("BITREFILL_USD_BALANCE_INVALID");
  }
  return {
    availableUsd,
    amountText: String(usdWallet.amount),
    amountBase,
    decimals: Number(usdWallet.decimals ?? 2),
  };
}

export function parseBitrefillMcpProductDetail(productId, text) {
  const raw = String(text ?? "");
  const nameMatch = raw.match(/^name: (.+)$/m);
  const stockMatch = raw.match(/^in_stock: (.+)$/m);
  const recipMatch = raw.match(/^recipient_type: (.+)$/m);
  const currencyMatch = raw.match(/^currency: (.+)$/m);
  const rangeMinMatch = raw.match(/^  min: (.+)$/m);
  const rangeMaxMatch = raw.match(/^  max: (.+)$/m);
  const rangeStepMatch = raw.match(/^  step: (.+)$/m);

  const packages = [];
  let inPackages = false;
  for (const line of raw.split(/\r?\n/)) {
    if (/^packages\[\d+\]\{/.test(line)) {
      inPackages = true;
      continue;
    }
    if (inPackages) {
      if (!line.startsWith("  ")) {
        inPackages = false;
        continue;
      }
      const m = line.trim().match(/^"([^"]+)",([A-Z]+),"([^"]+)",([A-Z]+)$/);
      if (m) {
        packages.push({
          value: m[1],
          currency: m[2],
          usd: Number(m[3]),
          payCurrency: m[4],
        });
      }
    }
  }

  return {
    id: productId,
    name: nameMatch ? nameMatch[1].trim() : productId,
    inStock: stockMatch ? stockMatch[1].trim() === "true" : false,
    recipientType: recipMatch ? recipMatch[1].trim() : "none",
    currency: currencyMatch ? currencyMatch[1].trim() : "",
    range: rangeMinMatch && rangeMaxMatch
      ? {
          min: Number(rangeMinMatch[1].trim()),
          max: Number(rangeMaxMatch[1].trim()),
          step: rangeStepMatch ? Number(rangeStepMatch[1].trim()) : 1,
        }
      : null,
    packages,
  };
}

export function resolveBitrefillPackageUsdCost(detail, packageValue) {
  const target = String(packageValue ?? "").trim();
  if (!target) throw new Error("BITREFILL_PACKAGE_VALUE_REQUIRED");
  if (!detail.inStock) throw new Error("BITREFILL_PRODUCT_OUT_OF_STOCK");

  const exact = detail.packages.find((p) => String(p.value).trim() === target);
  if (exact && Number.isFinite(exact.usd) && exact.usd > 0) {
    return exact.usd;
  }

  // Range product (e.g. itunes-turkey 25 TRY within min=10..max=1500)
  const numTarget = Number(target);
  if (
    detail.range
    && Number.isFinite(numTarget)
    && numTarget >= detail.range.min
    && numTarget <= detail.range.max
  ) {
    const numericPkgs = detail.packages
      .map((p) => ({ num: Number(p.value), usd: p.usd }))
      .filter((p) => Number.isFinite(p.num) && p.num > 0 && Number.isFinite(p.usd) && p.usd > 0)
      .sort((a, b) => Math.abs(a.num - numTarget) - Math.abs(b.num - numTarget));

    if (numericPkgs.length > 0) {
      const ref = numericPkgs[0];
      const estimated = Math.ceil(((ref.usd / ref.num) * numTarget) * 100) / 100;
      if (Number.isFinite(estimated) && estimated > 0) return estimated;
    }
  }

  throw new Error("BITREFILL_PACKAGE_UNAVAILABLE");
}

export function formatBitrefillRedemptionContent(orders) {
  const blocks = [];
  for (let i = 0; i < orders.length; i++) {
    const order = orders[i];
    const info = order?.redemption_info && typeof order.redemption_info === "object"
      ? order.redemption_info
      : null;
    if (!info) continue;

    const lines = [];
    if (orders.length > 1) {
      lines.push(`【第 ${i + 1} 张】`);
    }
    const productName = order?.product?.name;
    const faceValue = order?.product?.value;
    const faceCurrency = order?.product?.currency;
    if (productName) {
      lines.push(`商品: ${productName}${faceValue ? ` (${faceValue} ${faceCurrency || ""})`.trim() : ""}`);
    }
    if (typeof info.code === "string" && info.code.trim()) {
      lines.push(`兑换码 / 卡密: ${info.code.trim()}`);
    }
    if (typeof info.pin === "string" && info.pin.trim()) {
      lines.push(`PIN 码: ${info.pin.trim()}`);
    }
    if (typeof info.link === "string" && info.link.trim()) {
      lines.push(`兑换链接: ${info.link.trim()}`);
    }
    if (info.extra_fields && typeof info.extra_fields === "object") {
      for (const [k, v] of Object.entries(info.extra_fields)) {
        if (typeof v === "string" && v.trim()) {
          lines.push(`${k}: ${v.trim()}`);
        }
      }
    }
    if (lines.length > 0) blocks.push(lines.join("\n"));
  }
  return blocks.join("\n\n").trim();
}

export function createBitrefillLiveClient({ apiKey, fetchImpl = fetch, timeoutMs = 25000 } = {}) {
  if (typeof apiKey !== "string" || !apiKey.trim()) {
    throw new Error("BITREFILL_API_KEY_MISSING");
  }
  const authorization = buildBitrefillAuthorization({ authMode: "personal", apiKey: apiKey.trim() });

  async function callMcpTool(name, args) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(MCP_ENDPOINT, {
        method: "POST",
        redirect: "error",
        cache: "no-store",
        signal: controller.signal,
        headers: {
          Authorization: authorization,
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name, arguments: args },
        }),
      });
      const bodyText = await response.text();
      if (!response.ok) {
        const err = new Error(`BITREFILL_MCP_HTTP_${response.status}`);
        err.status = response.status;
        throw err;
      }
      return extractMcpText(bodyText);
    } finally {
      clearTimeout(timer);
    }
  }

  async function callRestGet(path) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(`${BITREFILL_API_BASE_URL}${path}`, {
        method: "GET",
        redirect: "error",
        cache: "no-store",
        signal: controller.signal,
        headers: {
          Authorization: authorization,
          Accept: "application/json",
        },
      });
      const json = await response.json().catch(() => null);
      if (!response.ok) {
        const err = new Error(`BITREFILL_REST_HTTP_${response.status}`);
        err.status = response.status;
        throw err;
      }
      return json?.data ?? json;
    } finally {
      clearTimeout(timer);
    }
  }

  return Object.freeze({
    async readUsdBalance() {
      const { text, isError } = await callMcpTool("get-balances", {});
      if (isError) throw new Error("BITREFILL_BALANCE_TOOL_ERROR");
      return parseBitrefillMcpUsdBalance(text);
    },

    async getProductDetail(productId) {
      const { text, isError } = await callMcpTool("get-product-details", { product_id: productId });
      if (isError) throw new Error("BITREFILL_PRODUCT_DETAIL_TOOL_ERROR");
      return parseBitrefillMcpProductDetail(productId, text);
    },

    async purchaseWithUsdBalance({ productId, packageValue, quantity = 1 }) {
      const qty = Number(quantity);
      if (!Number.isSafeInteger(qty) || qty < 1 || qty > 5) {
        throw new Error("BITREFILL_QUANTITY_OUT_OF_RANGE");
      }
      const cartItems = Array.from({ length: qty }, () => ({
        product_id: String(productId).trim(),
        package_value: String(packageValue).trim(),
      }));
      const { text, isError } = await callMcpTool("buy-products", {
        cart_items: cartItems,
        payment_method: "balance",
        balance_currency: "USD",
        return_payment_link: false,
      });

      let parsed = null;
      try { parsed = JSON.parse(text); } catch {}
      const invoiceId =
        parsed?.response?.invoice_id
        ?? parsed?.invoice_id
        ?? parsed?.details?.invoice_id
        ?? (text.match(/invoice_id["'\s:=]+([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i)?.[1] ?? null);

      const errorCode = parsed?.code ?? parsed?.response?.code ?? parsed?.error ?? null;
      if (isError && !invoiceId) {
        const codeStr = String(errorCode || "BUY_PRODUCTS_FAILED").toUpperCase().replace(/[^A-Z0-9_]/g, "_").slice(0, 60);
        const err = new Error(`BITREFILL_${codeStr}`);
        err.submitted = false;
        throw err;
      }
      if (!invoiceId || !UUID_RE.test(String(invoiceId))) {
        const err = new Error("BITREFILL_INVOICE_ID_MISSING");
        err.submitted = true;
        throw err;
      }
      return {
        invoiceId: String(invoiceId),
        uncertain: String(errorCode || "").toUpperCase() === "PAYMENT_UNCERTAIN",
      };
    },

    async readInvoice(invoiceId) {
      return callRestGet(`/invoices/${encodeURIComponent(invoiceId)}`);
    },

    async readOrder(orderId) {
      return callRestGet(`/orders/${encodeURIComponent(orderId)}`);
    },

    async fetchDeliverables(invoiceId) {
      const invoice = await callRestGet(`/invoices/${encodeURIComponent(invoiceId)}`);
      const status = String(invoice?.status ?? "").toLowerCase();
      const rawOrders = Array.isArray(invoice?.orders) ? invoice.orders : [];
      const allDelivered =
        status === "all_delivered"
        || (rawOrders.length > 0 && rawOrders.every((o) => String(o?.status ?? "").toLowerCase() === "delivered"));

      if (!allDelivered) {
        const failed = ["blocked", "denied", "payment_error", "expired", "refunded"].includes(status);
        return {
          delivered: false,
          failed,
          status,
          invoiceId,
          actualUsdCost: Number(invoice?.payment?.price_usd ?? invoice?.payment?.price ?? 0) || null,
        };
      }

      // Ensure every order has redemption_info (fetch /v2/orders/:id if inline omitted)
      const enrichedOrders = [];
      for (const ord of rawOrders) {
        if (ord?.redemption_info && (ord.redemption_info.code || ord.redemption_info.pin || ord.redemption_info.link)) {
          enrichedOrders.push(ord);
        } else if (ord?.id) {
          const full = await callRestGet(`/orders/${encodeURIComponent(ord.id)}`);
          enrichedOrders.push(full || ord);
        }
      }

      const content = formatBitrefillRedemptionContent(enrichedOrders);
      if (!content) {
        return {
          delivered: false,
          failed: false,
          status: "empty_redemption",
          invoiceId,
          actualUsdCost: Number(invoice?.payment?.price_usd ?? invoice?.payment?.price ?? 0) || null,
        };
      }

      return {
        delivered: true,
        failed: false,
        status: "all_delivered",
        invoiceId,
        orderIds: enrichedOrders.map((o) => String(o?.id ?? "")).filter(Boolean),
        content,
        actualUsdCost: Number(invoice?.payment?.price_usd ?? invoice?.payment?.price ?? 0) || null,
      };
    },
  });
}
