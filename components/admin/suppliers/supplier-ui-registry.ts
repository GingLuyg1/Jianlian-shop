export type SupplierUiDefinition = {
  code: "daju";
  name: string;
  capabilities: readonly string[];
};

// Display-only registry. Fulfillment routing authority remains in lib/providers/core.
export const supplierUiRegistry: readonly SupplierUiDefinition[] = [
  {
    code: "daju",
    name: "大橘AI",
    capabilities: ["余额读取", "商品目录", "商品详情", "自动采购履约", "商品绑定"],
  },
];
