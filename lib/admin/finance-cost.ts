export type FinanceCostDataPayload = {
  fulfillmentCostByItemId: Record<
    string,
    { unitCostCny: number; totalCostCny: number; supplier: string; status: string }
  >;
  skuCostBySkuId: Record<string, { costCny: number; source: string }>;
  productCostByProductId: Record<string, { costCny: number; source: string }>;
  orderPaymentMethodById: Record<string, string>;
  orderItems: Array<{
    id: string;
    order_id: string;
    product_id: string | null;
    sku_id: string | null;
    product_name: string | null;
    sku_title: string | null;
    quantity: number | string | null;
    unit_price: number | string | null;
    line_total: number | string | null;
    created_at: string;
  }>;
};

export type FinanceProductCostRow = {
  id: string;
  name: string;
  price: number;
  cost: number | null;
  costSource: "supplier_actual" | "sku_metadata" | "product_metadata" | "unconfigured";
  quantity: number;
  salesAmount: number;
  totalCost: number;
  profit: number;
  margin: string;
  marginNumber: number;
};

export type FinanceCostSummary = {
  revenue: number;
  gmv: number;
  recharge: number;
  totalCost: number;
  grossProfit: number;
  grossMargin: string;
  grossMarginNumber: number;
  gatewayEligibleAmount: number;
  balancePaidAmount: number;
  gatewayFee: number;
  netProfit: number;
  unconfiguredCostItemCount: number;
  apiOrdersGmv: number;
  apiOrdersCost: number;
  productCostRows: FinanceProductCostRow[];
};

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function computeFinanceCostSummary({
  gmv,
  recharge,
  paidOrders,
  orderItems,
  products,
  costData,
  gatewayFeeRate = 0.03,
}: {
  gmv: number;
  recharge: number;
  paidOrders: Array<{
    id: string;
    total_amount?: number | string | null;
    payment_method?: string | null;
    source?: string | null;
    channel?: string | null;
    order_source?: string | null;
    app_id?: string | null;
    cost_amount?: number | string | null;
    supplier_cost?: number | string | null;
  }>;
  orderItems: Array<{
    id?: string | null;
    order_id?: string | null;
    product_id?: string | null;
    sku_id?: string | null;
    product_name?: string | null;
    quantity?: number | string | null;
    unit_price?: number | string | null;
    line_total?: number | string | null;
  }>;
  products: Array<{
    id: string;
    name: string;
    price?: number | string | null;
    metadata?: Record<string, unknown> | null;
  }>;
  costData?: FinanceCostDataPayload | null;
  gatewayFeeRate?: number;
}): FinanceCostSummary {
  const revenue = gmv + recharge;
  const productMap = new Map(products.map((p) => [p.id, p]));

  const fulfillmentMap = costData?.fulfillmentCostByItemId ?? {};
  const skuCostMap = costData?.skuCostBySkuId ?? {};
  const prodCostMap = costData?.productCostByProductId ?? {};
  const paymentMethodMap = costData?.orderPaymentMethodById ?? {};

  let totalCost = 0;
  const rowMap = new Map<
    string,
    {
      id: string;
      name: string;
      quantity: number;
      salesAmount: number;
      totalCost: number;
      knownCostQty: number;
      costSource: FinanceProductCostRow["costSource"];
    }
  >();

  for (const item of orderItems) {
    const pid = item.product_id || item.product_name || "unknown";
    const p = item.product_id ? productMap.get(item.product_id) : undefined;
    const qty = Math.max(0, num(item.quantity));
    const lineTotal = num(item.line_total);

    let lineCost = 0;
    let known = false;
    let source: FinanceProductCostRow["costSource"] = "unconfigured";

    const actualFulfillment = item.id ? fulfillmentMap[item.id] : undefined;
    const skuCost = item.sku_id ? skuCostMap[item.sku_id] : undefined;
    const prodCost = item.product_id ? prodCostMap[item.product_id] : undefined;

    if (actualFulfillment && actualFulfillment.totalCostCny > 0) {
      lineCost = actualFulfillment.totalCostCny;
      known = true;
      source = "supplier_actual";
    } else if (skuCost && skuCost.costCny > 0) {
      lineCost = skuCost.costCny * qty;
      known = true;
      source = "sku_metadata";
    } else if (prodCost && prodCost.costCny > 0) {
      lineCost = prodCost.costCny * qty;
      known = true;
      source = "product_metadata";
    }

    totalCost += lineCost;

    const cur = rowMap.get(pid) ?? {
      id: pid,
      name: p?.name ?? item.product_name ?? "未知商品",
      quantity: 0,
      salesAmount: 0,
      totalCost: 0,
      knownCostQty: 0,
      costSource: source,
    };
    cur.quantity += qty;
    cur.salesAmount += lineTotal;
    cur.totalCost += lineCost;
    if (known) {
      cur.knownCostQty += qty;
      if (cur.costSource === "unconfigured" || source === "supplier_actual") {
        cur.costSource = source;
      }
    }
    rowMap.set(pid, cur);
  }

  let apiOrdersGmv = 0;
  let apiOrdersCost = 0;
  let gatewayEligibleAmount = 0;
  let balancePaidAmount = 0;

  for (const ord of paidOrders) {
    const amt = num(ord.total_amount);
    const method = String(ord.payment_method ?? paymentMethodMap[ord.id] ?? "").trim().toLowerCase();
    if (method === "balance") {
      balancePaidAmount += amt;
    } else {
      gatewayEligibleAmount += amt;
    }

    const isApi =
      ord.source === "api" ||
      ord.channel === "api" ||
      ord.order_source === "api" ||
      Boolean(ord.app_id);
    if (isApi) {
      const cost = num(ord.cost_amount ?? ord.supplier_cost ?? amt * 0.72);
      apiOrdersGmv += amt;
      apiOrdersCost += cost;
    }
  }
  totalCost += apiOrdersCost;

  const productCostRows: FinanceProductCostRow[] = Array.from(rowMap.values())
    .map((row) => {
      const avgPrice = row.quantity > 0 ? row.salesAmount / row.quantity : 0;
      const hasKnownCost = row.knownCostQty > 0;
      const avgCost = hasKnownCost && row.quantity > 0 ? row.totalCost / row.quantity : null;
      const profit = row.salesAmount - row.totalCost;
      const marginNumber = row.salesAmount > 0 ? (profit / row.salesAmount) * 100 : 0;
      return {
        id: row.id,
        name: row.name,
        price: avgPrice,
        cost: avgCost,
        costSource: hasKnownCost ? row.costSource : "unconfigured",
        quantity: row.quantity,
        salesAmount: row.salesAmount,
        totalCost: row.totalCost,
        profit,
        margin: row.salesAmount > 0 ? `${marginNumber.toFixed(1)}%` : "—",
        marginNumber,
      };
    })
    .sort((a, b) => b.salesAmount - a.salesAmount);

  const unconfiguredCostItemCount = productCostRows.filter((r) => r.cost === null).length;

  const grossProfit = gmv - totalCost;
  const grossMarginNumber = gmv > 0 ? (grossProfit / gmv) * 100 : 0;
  const grossMargin = gmv > 0 ? `${grossMarginNumber.toFixed(1)}%` : "—";
  // Gateway fee applies only to third-party online payment gateway amounts (orders not paid via balance + recharges)
  const gatewayFee = Number(((gatewayEligibleAmount + recharge) * gatewayFeeRate).toFixed(2));
  const netProfit = grossProfit - gatewayFee;

  return {
    revenue,
    gmv,
    recharge,
    totalCost,
    grossProfit,
    grossMargin,
    grossMarginNumber,
    gatewayEligibleAmount,
    balancePaidAmount,
    gatewayFee,
    netProfit,
    unconfiguredCostItemCount,
    apiOrdersGmv,
    apiOrdersCost,
    productCostRows,
  };
}
